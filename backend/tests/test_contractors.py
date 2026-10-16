from sqlalchemy import select
from app.models import User
from app.operations_models import CleaningRun, Visit
from test_requests import account, client, db, headers, submission
from test_operations import elevate, photo_bytes


def create(client, auth, role, email):
    payload = dict(role=role, email=email, password='Contractor test password 123', name='Исполнитель', phone='+77001234567', company='Подрядчик')
    result = client.post('/api/v1/staff/accounts', headers=auth, json=payload)
    assert result.status_code == 201, result.text
    login = client.post('/api/v1/auth/login', json={k: payload[k] for k in ('email', 'password')})
    assert login.status_code == 200
    return {'Authorization': 'Bearer ' + login.json()['access_token']}, result.json()['id']


def setup(client, db, submission):
    owner = headers(client)
    admin, _ = elevate(client, db, 'manager@example.com', 'manager')
    contractor, cid = create(client, admin, 'contractor', 'contractor@example.com')
    worker, wid = create(client, contractor, 'worker', 'worker@example.com')
    other, oid = create(client, admin, 'contractor', 'other-contractor@example.com')
    source = client.post('/api/v1/requests', headers=owner, json=submission).json()
    project = client.post(f'/api/v1/staff/requests/{source["id"]}/projects', headers=admin).json()[0]['id']
    assert client.put(f'/api/v1/staff/projects/{project}/contractor', headers=admin, json={'contractor_id': cid}).status_code == 200
    return owner, admin, contractor, cid, worker, wid, other, oid, project


def test_hierarchy_and_disabled_parent(client, db, submission):
    owner, admin, contractor, cid, worker, wid, other, oid, project = setup(client, db, submission)
    payload = dict(role='manager', email='illegal@example.com', password='Strong password 123', name='Invalid', phone='+77001234567', company='Test')
    for auth, role in ((admin, 'manager'), (admin, 'worker'), (contractor, 'manager'), (contractor, 'contractor'), (worker, 'worker'), (owner, 'contractor')):
        assert client.post('/api/v1/staff/accounts', headers=auth, json={**payload, 'role': role}).status_code == 403
    assert [u['id'] for u in client.get('/api/v1/staff/accounts', headers=contractor).json()] == [wid]
    assert client.patch(f'/api/v1/staff/accounts/{wid}', headers=other, json={'is_active': False}).status_code == 404
    assert client.get(f'/api/v1/projects/{project}', headers=other).status_code == 404
    assert client.get('/api/v1/projects', headers=other).json() == []
    assert client.patch(f'/api/v1/staff/accounts/{cid}', headers=admin, json={'is_active': False}).status_code == 200
    assert client.get('/api/v1/auth/me', headers=worker).status_code == 401


def test_zones_photos_completion_and_client_visibility(client, db, submission):
    owner, admin, contractor, cid, worker, wid, other, oid, project = setup(client, db, submission)
    worker2, wid2 = create(client, contractor, 'worker', 'worker2@example.com')
    assignments = [dict(worker_id=w, zone=z, planned_start='2026-11-01T09:00:00+05:00', planned_end='2026-11-01T11:00:00+05:00', checklist=['Вымыть пол']) for w,z in ((wid, 'Первый этаж'), (wid2, 'Санузел второго этажа'))]
    response = client.post(f'/api/v1/projects/{project}/runs', headers=contractor, json={'name': 'Утренняя уборка', 'assignments': assignments})
    assert response.status_code == 201, response.text
    rid = response.json()['id']
    complete = f'/api/v1/runs/{rid}/complete'
    assert client.post(complete, headers=admin).status_code == 403
    assert client.post(complete, headers=contractor).status_code == 409
    details = client.get(f'/api/v1/projects/{project}', headers=contractor).json()
    assert 'price' not in details
    assert len(details['visits']) == 2
    own = client.get(f'/api/v1/projects/{project}', headers=worker).json()
    assert len(own['visits']) == 1
    for i, (auth, worker_id) in enumerate(((worker, wid), (worker2, wid2))):
        visit = next(v for v in details['visits'] if v['worker_id'] == worker_id)
        action = f'/api/v1/visits/{visit["id"]}/actions'
        assert client.post(action, headers=contractor, json={'action': 'start'}).status_code == 403
        for kind in ('before', 'after'):
            upload = client.post(f'/api/v1/projects/{project}/files', headers=auth, params={'visit_id': visit['id'], 'kind': kind, 'name': 'zone.png'}, content=photo_bytes())
            assert upload.status_code == 201, upload.text
            if kind == 'before':
                assert client.post(action, headers=auth, json={'action': 'start'}).status_code == 200
                # The other worker cannot read this zone's photograph.
                other_worker = worker2 if worker_id == wid else worker
                assert client.get(f'/api/v1/files/{upload.json()["id"]}', headers=other_worker).status_code == 404
        assert client.post(action, headers=auth, json={'action': 'submit', 'checked': [0]}).status_code == 200
        if i == 0:
            assert client.post(complete, headers=contractor).status_code == 409
            assert client.get(f'/api/v1/projects/{project}', headers=owner).json()['last_cleaning'] is None
    assert client.put(f'/api/v1/staff/projects/{project}/contractor', headers=admin, json={'contractor_id': oid}).status_code == 409
    response = client.post(complete, headers=contractor)
    assert response.status_code == 200, response.text
    assert client.post(complete, headers=contractor).json() == response.json()
    result = client.get(f'/api/v1/projects/{project}', headers=owner).json()
    assert result['last_cleaning'] == response.json()['completed_at']
    assert len(result['files']) == 4
    assert all(v['status'] == 'accepted' for v in result['visits'])
    assert client.post(action, headers=auth, json={'action': 'save'}).status_code == 409


def test_foreign_worker_and_overlap_rejected(client, db, submission):
    owner, admin, contractor, cid, worker, wid, other, oid, project = setup(client, db, submission)
    _, foreign_id = create(client, other, 'worker', 'foreign-worker@example.com')
    item = dict(worker_id=foreign_id, zone='Первый этаж', planned_start='2026-11-01T09:00:00+05:00', planned_end='2026-11-01T11:00:00+05:00', checklist=['Вымыть пол'])
    assert client.post(f'/api/v1/projects/{project}/runs', headers=contractor, json={'name':'Уборка', 'assignments':[item]}).status_code == 422
    db.rollback()
    assert list(db.scalars(select(CleaningRun))) == []
    item['worker_id'] = wid
    assert client.post(f'/api/v1/projects/{project}/runs', headers=contractor, json={'name':'Уборка', 'assignments':[item, {**item, 'zone':'Второй этаж'}]}).status_code == 409
    db.rollback()
    assert list(db.scalars(select(Visit))) == []


def test_cancelled_plan_and_explicit_complaint_forwarding(client, db, submission):
    owner, admin, contractor, cid, worker, wid, other, oid, project = setup(client, db, submission)
    item = dict(worker_id=wid, zone='Первый этаж', planned_start='2026-11-01T09:00:00+05:00', planned_end='2026-11-01T11:00:00+05:00', checklist=['Вымыть пол'])
    result = client.post(f'/api/v1/projects/{project}/runs', headers=contractor, json={'name':'Уборка', 'assignments':[item]})
    rid = result.json()['id']
    visit = db.scalar(select(Visit).where(Visit.run_id == rid))
    assert client.post(f'/api/v1/visits/{visit.id}/actions', headers=contractor, json={'action':'cancel'}).status_code == 200
    assert db.get(CleaningRun, rid).cancelled_at
    assert client.post(f'/api/v1/runs/{rid}/complete', headers=contractor).status_code == 409
    complaint = client.post(f'/api/v1/projects/{project}/complaints', headers=owner, json={'subject':'Замечание по уборке', 'message':'Просьба проверить качество уборки'}).json()
    url = f'/api/v1/complaints/{complaint["id"]}'
    assert client.get(url, headers=contractor).status_code == 404
    assert client.get('/api/v1/complaints', headers=contractor).json() == []
    assert client.post(url + '/reply', headers=admin, json={'text':'Проверьте качество', 'forwarded_to':cid}).status_code == 200
    assert client.get(url, headers=contractor).status_code == 200
    assert client.get(url, headers=worker).status_code == 404
    assert client.post(url + '/reply', headers=contractor, json={'text':'Проверено', 'status':'closed'}).status_code == 403
    assert client.put(f'/api/v1/staff/projects/{project}/contractor', headers=admin, json={'contractor_id':oid}).status_code == 200
    assert client.get('/api/v1/complaints', headers=contractor).json() == []
    assert client.get(url, headers=other).status_code == 404
