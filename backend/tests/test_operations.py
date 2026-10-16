from datetime import datetime, timedelta, timezone
from io import BytesIO

from PIL import Image
from pydantic import SecretStr
import pytest
from sqlalchemy import select

from app.bootstrap import bootstrap
from app.config import Settings
from app.models import User
from app.operations import VisitInput, validate_schedule
from app.operations_models import Project
from test_requests import account, client, db, headers, submission


def elevate(client, db, email, role):
    auth = headers(client, email)
    user = db.scalar(select(User).where(User.email == email))
    user.role = role
    db.commit()
    return auth, user


@pytest.fixture()
def flow(client, db, submission):
    owner = headers(client)
    other = headers(client, 'other@example.com')
    admin, _ = elevate(client, db, 'manager@example.com', 'manager')
    worker, person = elevate(client, db, 'worker@example.com', 'worker')
    source = client.post('/api/v1/requests', headers=owner, json=submission).json()
    response = client.post(f'/api/v1/staff/requests/{source["id"]}/projects', headers=admin)
    assert response.status_code == 200, response.text
    project = response.json()[0]
    scheduled = client.post(f'/api/v1/staff/projects/{project["id"]}/visits', headers=admin, json={
        'worker_id': person.id, 'planned_start': '2026-11-01T08:00:00+05:00',
        'planned_end': '2026-11-01T10:00:00+05:00', 'checklist': ['Убрать пол', 'Убрать санузлы']})
    assert scheduled.status_code == 201, scheduled.text
    return dict(owner=owner, other=other, admin=admin, worker=worker, worker_id=person.id,
                source=source['id'], project=project['id'], visit=scheduled.json()['id'])


def photo_bytes():
    stream = BytesIO()
    Image.new('RGB', (20, 20), color='white').save(stream, format='PNG')
    return stream.getvalue()


def upload(client, f, kind, auth=None, **params):
    params.update(kind=kind, name='report.png')
    if kind in {'before', 'after'}:
        params['visit_id'] = f['visit']
    return client.post(f'/api/v1/projects/{f["project"]}/files', headers=auth or f['worker'],
                       params=params, content=photo_bytes())


def test_bootstrap_idempotent_rotation_and_no_account_takeover(client, db):
    settings = Settings(superadmin_email='root@example.com', superadmin_password=SecretStr('initial-root-password-123'))
    bootstrap(db, settings)
    bootstrap(db, settings)
    root = db.scalar(select(User).where(User.email == 'root@example.com'))
    assert root.role == 'superadmin'
    login = client.post('/api/v1/auth/login', json={'email': root.email, 'password': 'initial-root-password-123'})
    assert login.status_code == 200
    token = {'Authorization': 'Bearer ' + login.json()['access_token']}
    settings.superadmin_password = SecretStr('rotated-root-password-456')
    bootstrap(db, settings)
    assert client.get('/api/v1/auth/me', headers=token).status_code == 401
    account(client, 'existing@example.com')
    settings.superadmin_email = 'existing@example.com'
    with pytest.raises(RuntimeError):
        bootstrap(db, settings)


def test_only_superadmin_manages_staff_and_disabling_revokes_sessions(client, db):
    root, _ = elevate(client, db, 'root@example.com', 'superadmin')
    manager, _ = elevate(client, db, 'manager@example.com', 'manager')
    payload = dict(email='new-admin@example.com', password='New account password 123', name='Новый администратор',
                   phone='+77001234567', company='IC Group', role='manager')
    assert client.post('/api/v1/staff/accounts', json=payload, headers=manager).status_code == 403
    created = client.post('/api/v1/staff/accounts', json=payload, headers=root)
    assert created.status_code == 201, created.text
    assert 'password' not in created.text
    assert client.post('/api/v1/staff/accounts', json=payload, headers=root).status_code == 409
    assert client.post('/api/v1/staff/accounts', json={**payload, 'role': 'superadmin'}, headers=root).status_code == 422
    login = client.post('/api/v1/auth/login', json={'email': payload['email'], 'password': payload['password']}).json()
    session = {'Authorization': 'Bearer ' + login['access_token']}
    assert client.patch('/api/v1/staff/accounts/' + created.json()['id'], json={'is_active': False}, headers=root).status_code == 200
    assert client.get('/api/v1/staff/requests', headers=session).status_code == 401
    assert client.post('/api/v1/auth/login', json={'email': payload['email'], 'password': payload['password']}).status_code == 401


def test_real_report_and_private_files_complete_chain(client, db, flow):
    f = flow
    assert client.get('/api/v1/projects', headers=f['other']).json() == []
    assert client.get(f'/api/v1/projects/{f["project"]}', headers=f['other']).status_code == 404
    retry = client.post(f'/api/v1/staff/requests/{f["source"]}/projects', headers=f['admin'])
    assert retry.json()[0]['id'] == f['project']
    assert len(list(db.scalars(select(Project)))) == 1
    actions = f'/api/v1/visits/{f["visit"]}/actions'
    assert client.post(actions, headers=f['owner'], json={'action': 'start'}).status_code == 403
    assert client.post(actions, headers=f['worker'], json={'action': 'start'}).status_code == 422
    before = upload(client, f, 'before')
    assert before.status_code == 201, before.text
    assert client.get('/api/v1/files/' + before.json()['id'], headers=f['other']).status_code == 404
    assert client.get('/api/v1/files/' + before.json()['id']).status_code == 401
    assert client.get('/api/v1/files/' + before.json()['id'], headers=f['owner']).headers['content-type'] == 'image/jpeg'
    assert client.post(actions, headers=f['worker'], json={'action': 'start'}).status_code == 200
    assert client.post(actions, headers=f['worker'], json={'action': 'submit', 'checked': [0, 1]}).status_code == 422
    assert upload(client, f, 'after').status_code == 201
    submitted = client.post(actions, headers=f['worker'], json={'action': 'submit', 'checked': [0, 1], 'notes': 'Выполнено'})
    assert submitted.status_code == 200, submitted.text
    assert submitted.json()['actual_start'] and submitted.json()['actual_end']
    assert upload(client, f, 'after').status_code == 409
    assert client.post(actions, headers=f['worker'], json={'action': 'accept'}).status_code == 403
    assert client.post(actions, headers=f['admin'], json={'action': 'accept'}).status_code == 200
    own = client.get(f'/api/v1/projects/{f["project"]}', headers=f['owner']).json()
    assert own['last_cleaning'] and own['visits'][0]['status'] == 'accepted'
    assert len(own['files']) == 2
    assert client.get('/api/v1/demo/overview').status_code == 404


def test_complaint_private_until_forwarded_and_documents_hidden_from_worker(client, flow):
    f = flow
    complaint = client.post(f'/api/v1/projects/{f["project"]}/complaints', headers=f['owner'],
        json={'subject': 'Уборка санузла', 'message': 'Просьба повторно убрать санузел'}).json()
    path = '/api/v1/complaints/' + complaint['id']
    picture = upload(client, f, 'complaint', auth=f['owner'], complaint_id=complaint['id'])
    assert picture.status_code == 201, picture.text
    file_path = '/api/v1/files/' + picture.json()['id']
    assert client.get(path, headers=f['worker']).status_code == 404
    assert client.get(file_path, headers=f['worker']).status_code == 404
    assert client.get('/api/v1/complaints', headers=f['worker']).json() == []
    assert client.post(path + '/reply', headers=f['owner'], json={'text': 'Закрыть', 'status': 'closed'}).status_code == 403
    sent = client.post(path + '/reply', headers=f['admin'], json={'text': 'Проверьте, пожалуйста', 'status': 'correction', 'forwarded_to': f['worker_id']})
    assert sent.status_code == 200, sent.text
    assert client.get(path, headers=f['worker']).status_code == 200
    assert client.get(file_path, headers=f['worker']).status_code == 200
    assert client.post(path + '/reply', headers=f['worker'], json={'text': 'Исправлено'}).status_code == 200
    assert client.post(path + '/reply', headers=f['admin'], json={'text': 'Проверено', 'status': 'closed', 'forwarded_to': None}).status_code == 200
    assert client.get(file_path, headers=f['worker']).status_code == 404
    document = client.post(f'/api/v1/projects/{f["project"]}/files', params={'kind': 'contract', 'name': 'contract.pdf'}, content=b'%PDF-1.7\nTest fixture', headers=f['admin'])
    assert document.status_code == 201
    doc = document.json()
    assert doc['state'] == 'uploaded'
    assert client.get('/api/v1/files/' + doc['id'], headers=f['worker']).status_code == 404
    assert client.get('/api/v1/files/' + doc['id'], headers=f['owner']).status_code == 200
    worker_project = client.get(f'/api/v1/projects/{f["project"]}', headers=f['worker']).json()
    assert 'price' not in worker_project and not worker_project['files']
    marked = client.patch('/api/v1/staff/files/' + doc['id'], headers=f['admin'], json={'state': 'signed', 'note': 'Получен подписанный оригинал'})
    assert marked.status_code == 200 and len(marked.json()['history']) == 2


def test_file_validation_schedule_conflicts_and_role_boundaries(client, flow):
    f = flow
    endpoint = f'/api/v1/projects/{f["project"]}/files'
    assert client.post(endpoint, params={'kind': 'before', 'visit_id': f['visit'], 'name': 'fake.png'}, content=b'<svg></svg>', headers=f['worker']).status_code == 422
    assert client.post(endpoint, params={'kind': 'contract', 'name': 'fake.pdf'}, content=b'%PDF-1.7', headers=f['owner']).status_code == 403
    assert client.post(endpoint, params={'kind': 'avr', 'name': 'act.pdf'}, content=b'%PDF-1.7', headers=f['admin']).status_code == 422
    schedule = dict(worker_id=f['worker_id'], planned_start='2026-11-01T09:00:00+05:00', planned_end='2026-11-01T11:00:00+05:00', checklist=['Уборка'])
    assert client.post(f'/api/v1/staff/projects/{f["project"]}/visits', headers=f['admin'], json=schedule).status_code == 409
    schedule['planned_start'] = '2026-11-01T09:00:00'
    assert client.post(f'/api/v1/staff/projects/{f["project"]}/visits', headers=f['admin'], json=schedule).status_code == 422


def test_phone_photo_orientation_is_preserved_and_metadata_removed(client, flow):
    picture = Image.new('RGB', (60, 30), color='white')
    exif = Image.Exif()
    exif[274] = 6
    exif[270] = 'Private test metadata'
    stream = BytesIO()
    picture.save(stream, format='JPEG', exif=exif)
    response = client.post(f'/api/v1/projects/{flow["project"]}/files',
        params={'kind': 'before', 'visit_id': flow['visit'], 'name': 'phone.jpg'},
        headers=flow['worker'], content=stream.getvalue())
    assert response.status_code == 201
    downloaded = client.get('/api/v1/files/' + response.json()['id'], headers=flow['owner'])
    with Image.open(BytesIO(downloaded.content)) as result:
        assert result.size == (30, 60)
        assert not result.getexif()


def test_schedule_limits_from_normative_package():
    from types import SimpleNamespace
    from fastapi import HTTPException
    start = datetime(2026, 11, 1, 8, tzinfo=timezone(timedelta(hours=5)))
    prior = [SimpleNamespace(planned_start=start, planned_end=start + timedelta(hours=8), project_id='one')]
    data = VisitInput(worker_id='w', planned_start=start + timedelta(hours=8, minutes=30), planned_end=start + timedelta(hours=10), checklist=['Уборка'])
    with pytest.raises(HTTPException) as transition:
        validate_schedule(prior, data, 'two')
    assert transition.value.status_code == 409
    data.planned_start = start + timedelta(hours=9)
    data.planned_end = start + timedelta(hours=16)
    with pytest.raises(HTTPException) as total:
        validate_schedule(prior, data, 'one')
    assert '14' in total.value.detail
