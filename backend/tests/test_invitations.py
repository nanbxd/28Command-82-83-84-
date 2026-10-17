from sqlalchemy import select
from app.models import User
from app.operations_models import Visit, Project
from test_requests import client, db, submission
from test_contractors import setup, create
from test_operations import photo_bytes


def zone(worker):
    return dict(worker_id=worker, zone='First floor', planned_start='2026-11-01T09:00:00+05:00', planned_end='2026-11-01T11:00:00+05:00', checklist=['Clean floor'])


def invite(client, contractor, project, worker):
    result = client.post(f'/api/v1/projects/{project}/runs', headers=contractor, json={'name':'Morning shift', 'assignments':[zone(worker)]})
    assert result.status_code == 201, result.text
    return result.json()['id']


def respond(client, worker, run, decision='accept'):
    return client.post(f'/api/v1/invitations/{run}/respond', headers=worker, json={'decision':decision})


def test_admin_workers_global_pool_and_confirmed_time_only(client, db, submission):
    owner, admin, contractor, cid, worker, wid, other, oid, project = setup(client, db, submission)
    shared, sid = create(client, admin, 'worker', 'shared@example.com')
    assert db.get(User, sid).contractor_id is None
    assert client.patch(f'/api/v1/staff/accounts/{sid}', headers=contractor, json={'is_active':False}).status_code == 404
    second = Project(id='second-object', request_id=db.get(Project, project).request_id, object_index=1,
        organization_id=db.get(Project, project).organization_id, contractor_id=oid, name='Other object', details=db.get(Project, project).details, created_at=db.get(Project, project).created_at)
    db.add(second); db.commit()
    available = f'/api/v1/projects/{project}/available-workers'
    query = {k:v for k,v in zone(sid).items() if k in ('planned_start','planned_end')}
    assert sid in [w['id'] for w in client.get(available, headers=contractor, params=query).json()]
    first = invite(client, contractor, project, sid)
    competing = invite(client, other, second.id, sid)
    assert sid in [w['id'] for w in client.get(available, headers=contractor, params=query).json()]
    assert len(client.get('/api/v1/invitations', headers=shared).json()) == 2
    assert client.get('/api/v1/invitations', headers=contractor).status_code == 403
    assert respond(client, worker, first).status_code == 404
    assert respond(client, admin, first).status_code == 403
    v = db.scalar(select(Visit).where(Visit.run_id == first))
    assert client.post(f'/api/v1/projects/{project}/files', headers=shared, params={'visit_id':v.id,'kind':'before','name':'before.jpg'}, content=photo_bytes()).status_code == 409
    assert client.post(f'/api/v1/visits/{v.id}/actions', headers=shared, json={'action':'start'}).status_code == 409
    assert respond(client, shared, first).status_code == 200
    assert respond(client, shared, first).status_code == 200
    assert respond(client, shared, competing).status_code == 409
    assert sid not in [w['id'] for w in client.get(available, headers=contractor, params=query).json()]
    assert respond(client, shared, competing, 'decline').status_code == 200
    assert respond(client, shared, competing, 'decline').status_code == 200
    assert respond(client, shared, competing).status_code == 409
    assert db.get(User, sid).contractor_id is None  # Accepting never transfers account control.
    states = {v.run_id:v.status for v in db.scalars(select(Visit).where(Visit.worker_id == sid))}
    assert states == {first:'planned', competing:'declined'}
    visible = client.get(f'/api/v1/projects/{project}', headers=owner).json()
    assert visible['visits'][0]['status'] == 'planned'


def test_invitation_block_cancel_and_expiry(client, db, submission):
    owner, admin, contractor, cid, worker, wid, other, oid, project = setup(client, db, submission)
    run = invite(client, contractor, project, wid)
    url = f'/api/v1/staff/projects/{project}/access'
    client.patch(url, headers=admin, json={'is_blocked':True})
    assert respond(client, worker, run).status_code == 409

    assert client.get('/api/v1/invitations', headers=worker).json()[0]['blocked']
    assert respond(client, worker, run, 'decline').status_code == 200
    client.patch(url, headers=admin, json={'is_blocked':False})
    run = invite(client, contractor, project, wid)
    visit = db.scalar(select(Visit).where(Visit.run_id == run))
    assert client.post(f'/api/v1/visits/{visit.id}/actions', headers=contractor, json={'action':'cancel'}).status_code == 200
    assert respond(client, worker, run).status_code == 409
    assert client.get('/api/v1/invitations', headers=worker).json() == []
    run = invite(client, contractor, project, wid)
    visit = db.scalar(select(Visit).where(Visit.run_id == run))
    from datetime import timedelta
    from app.auth import utcnow
    visit.planned_start = utcnow() - timedelta(hours=3)
    visit.planned_end = utcnow() - timedelta(hours=1)
    db.commit()
    assert client.get('/api/v1/invitations', headers=worker).json()[0]['expired']
    assert respond(client, worker, run).status_code == 409


def test_multiple_zones_acceptance_is_atomic(client, db, submission):
    owner, admin, contractor, cid, worker, wid, other, oid, project = setup(client, db, submission)
    first = {**zone(wid), 'planned_end':'2026-11-01T10:00:00+05:00'}
    second = {**zone(wid), 'zone':'Second floor', 'planned_start':'2026-11-01T11:00:00+05:00', 'planned_end':'2026-11-01T12:00:00+05:00'}
    pending = client.post(f'/api/v1/projects/{project}/runs', headers=contractor, json={'name':'Two zones', 'assignments':[first, second]}).json()['id']
    competitor = client.post(f'/api/v1/projects/{project}/runs', headers=contractor, json={'name':'Other shift', 'assignments':[second]}).json()['id']
    assert respond(client, worker, competitor).status_code == 200
    assert respond(client, worker, pending).status_code == 409
    assert all(v.status == 'invited' for v in db.scalars(select(Visit).where(Visit.run_id == pending)))
    assert respond(client, worker, pending, 'decline').status_code == 200
    assert all(v.status == 'declined' for v in db.scalars(select(Visit).where(Visit.run_id == pending)))

