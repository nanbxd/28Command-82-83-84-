from datetime import timedelta
from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path

import pytest
from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import create_engine, func, inspect, select

from app.auth import utcnow
from app.coins_models import BonusRequest, CoinTransaction
from app.models import User
from test_requests import account, client, db, headers
from test_operations import elevate
from test_contractors import create


@pytest.fixture()
def team(client, db):
    admin, _ = elevate(client, db, 'coins-admin@example.com', 'manager')
    contractor, cid = create(client, admin, 'contractor', 'coins-contractor@example.com')
    worker, wid = create(client, contractor, 'worker', 'coins-worker@example.com')
    other, oid = create(client, admin, 'contractor', 'coins-other@example.com')
    return dict(admin=admin, contractor=contractor, cid=cid, worker=worker, wid=wid, other=other, oid=oid)


def wallet(client, auth):
    response = client.get('/api/v1/coins/wallet', headers=auth)
    assert response.status_code == 200, response.text
    return response.json()


def request(client, auth, **changes):
    data = dict(way='arrival', date='2026-01-01', reference='Офис, смена 08:00–16:00', note='')
    data.update(changes)
    return client.post('/api/v1/coins/requests', headers=auth, json=data)


def review(client, auth, rid, **changes):
    return client.post(f'/api/v1/coins/requests/{rid}/review', headers=auth, json=dict(decision='approved', **changes))


def test_welcome_only_once_at_account_creation(client, db, team):
    for _ in range(3):
        result = wallet(client, team['worker'])
        assert result['balance'] == result['welcome'] == 1000
        assert len(result['transactions']) == 1
    assert db.scalar(select(func.count()).select_from(CoinTransaction)) == 1
    duplicate = client.post('/api/v1/staff/accounts', headers=team['contractor'], json=dict(role='worker', email='coins-worker@example.com', password='Duplicate password 123', name='Worker', phone='+77001234567', company='Team'))
    assert duplicate.status_code == 409
    assert wallet(client, team['worker'])['balance'] == 1000
    old, _ = elevate(client, db, 'old-worker@example.com', 'worker')
    assert wallet(client, old)['balance'] == 0  # No retroactive grant on login/GET.
    assert request(client, old).status_code == 409


@pytest.mark.parametrize('way,amount', [('arrival', 50), ('cleaning', 100), ('training', 100), ('extra', 125)])
def test_owner_approval_credits_once(client, db, team, way, amount):
    response = request(client, team['worker'], way=way)
    assert response.status_code == 201, response.text
    rid = response.json()['id']
    assert wallet(client, team['worker'])['balance'] == 1000
    assert wallet(client, team['worker'])['pending'] == 1
    assert client.get('/api/v1/coins/review', headers=team['other']).json()['requests'] == []
    assert review(client, team['other'], rid).status_code == 404
    assert review(client, team['worker'], rid).status_code == 403
    assert review(client, team['admin'], rid).status_code == 403
    args = {'amount': amount} if way == 'extra' else {}
    for _ in range(2):
        approved = review(client, team['contractor'], rid, **args)
        assert approved.status_code == 200, approved.text
        assert approved.json()['amount'] == amount
    result = wallet(client, team['worker'])
    assert result['balance'] == 1000 + amount and result['pending'] == 0
    assert result['earned'] == amount and result['requests'][0]['status'] == 'approved'
    assert db.scalar(select(func.count()).select_from(CoinTransaction).where(CoinTransaction.request_id == rid)) == 1
    assert client.get('/api/v1/coins/review', headers=team['contractor']).json()['requests'] == []
    assert len(client.get('/api/v1/coins/review?status=approved', headers=team['contractor']).json()['requests']) == 1


def test_rejection_requires_reason_and_never_credits(client, db, team):
    rid = request(client, team['worker']).json()['id']
    url = f'/api/v1/coins/requests/{rid}/review'
    assert client.post(url, headers=team['contractor'], json={'decision': 'rejected', 'note': '  '}).status_code == 422
    assert client.post(url, headers=team['contractor'], json={'decision': 'rejected', 'note': 'Не подтверждено', 'amount': 50}).status_code == 422
    response = client.post(url, headers=team['contractor'], json={'decision': 'rejected', 'note': 'Не подтверждено'})
    assert response.status_code == 200
    result = wallet(client, team['worker'])
    assert result['balance'] == 1000
    assert result['requests'][0]['decision_note'] == 'Не подтверждено'
    assert review(client, team['contractor'], rid).status_code == 409


def test_server_validates_amount_dates_and_duplicate_work(client, db, team):
    assert request(client, team['worker'], amount=10000).status_code == 422
    assert request(client, team['worker'], reference='   ').status_code == 422
    assert request(client, team['worker'], date=(utcnow() + timedelta(days=2)).date().isoformat()).status_code == 422
    rid = request(client, team['worker'], reference='Office SHIFT').json()['id']
    assert request(client, team['worker'], reference='  office   shift ').status_code == 409
    assert review(client, team['contractor'], rid, amount=150).status_code == 422
    training = request(client, team['worker'], way='training', reference='Course')
    assert training.status_code == 201
    assert request(client, team['worker'], way='training', reference='course', date='2026-01-02').status_code == 409
    extra = request(client, team['worker'], way='extra').json()['id']
    for invalid in (None, 49, 151, 75.5, '100'):
        assert review(client, team['contractor'], extra, amount=invalid).status_code == 422
    assert wallet(client, team['worker'])['balance'] == 1000


def test_shop_uses_server_price_and_idempotency(client, db, team):
    data = {'product_id': 'juice', 'idempotency_key': 'purchase-request-0001'}
    url = '/api/v1/coins/purchases'
    assert client.post(url, headers=team['worker'], json={**data, 'cost': 1}).status_code == 422
    first = client.post(url, headers=team['worker'], json=data)
    assert first.status_code == 201, first.text
    assert client.post(url, headers=team['worker'], json=data).json()['id'] == first.json()['id']
    assert wallet(client, team['worker'])['balance'] == 700
    assert client.post(url, headers=team['worker'], json={**data, 'product_id': 'phone'}).status_code == 409
    assert client.post(url, headers=team['worker'], json={'product_id': 'phone', 'idempotency_key': 'purchase-request-0002'}).status_code == 409
    assert wallet(client, team['worker'])['spent'] == 300
    assert client.post(url, headers=team['contractor'], json=data).status_code == 403


def test_rejected_training_can_be_completed_and_resubmitted_once(client, db, team):
    old_id = request(client, team['worker'], way='training', reference='Cleaning course').json()['id']
    assert client.post(f'/api/v1/coins/requests/{old_id}/review', headers=team['contractor'], json={'decision': 'rejected', 'note': 'Обучение ещё не завершено'}).status_code == 200
    retry = request(client, team['worker'], way='training', reference='Cleaning course', date='2026-01-02', note='Курс завершён')
    assert retry.status_code == 201, retry.text
    new_id = retry.json()['id']
    assert new_id != old_id
    assert request(client, team['worker'], way='training', reference='Cleaning course', date='2026-01-03').status_code == 409
    assert review(client, team['contractor'], old_id).status_code == 409
    for _ in range(2):
        assert review(client, team['contractor'], new_id).status_code == 200
    result = wallet(client, team['worker'])
    assert result['balance'] == 1100
    assert result['earned'] == 100
    assert {r['status'] for r in result['requests']} == {'approved', 'rejected'}
    assert next(r for r in result['requests'] if r['id'] == old_id)['decision_note'] == 'Обучение ещё не завершено'
    assert request(client, team['worker'], way='training', reference='Cleaning course', date='2026-01-04').status_code == 409


def test_team_isolation_and_disabled_worker(client, db, team):
    foreign, fid = create(client, team['other'], 'worker', 'foreign-coins@example.com')
    rid = request(client, team['worker']).json()['id']
    assert wallet(client, foreign)['requests'] == []
    assert wallet(client, foreign)['balance'] == 1000
    assert client.get('/api/v1/coins/wallet').status_code == 401
    assert client.get('/api/v1/coins/review', headers=team['worker']).status_code == 403
    assert client.patch('/api/v1/staff/accounts/' + team['wid'], headers=team['contractor'], json={'is_active': False}).status_code == 200
    assert review(client, team['contractor'], rid).status_code == 409
    assert client.get('/api/v1/coins/wallet', headers=team['worker']).status_code == 401
    assert db.scalar(select(func.sum(CoinTransaction.amount)).where(CoinTransaction.worker_id == team['wid'])) == 1000


def test_migration_adds_and_removes_only_coin_tables():
    engine = create_engine('sqlite://')
    migration_path = Path(__file__).parents[1] / 'migrations/versions/c28a14f03004_ic_coins.py'
    spec = spec_from_file_location('coin_migration', migration_path)
    migration = module_from_spec(spec)
    spec.loader.exec_module(migration)
    with engine.begin() as connection:
        connection.exec_driver_sql('CREATE TABLE users (id VARCHAR(80) PRIMARY KEY)')
        connection.exec_driver_sql('CREATE TABLE projects (id VARCHAR(80) PRIMARY KEY, is_blocked BOOLEAN NOT NULL DEFAULT false, blocking_history JSON NOT NULL DEFAULT \'[]\')')
        with Operations.context(MigrationContext.configure(connection)):
            migration.upgrade()
            assert set(inspect(connection).get_table_names()) == {'users', 'projects', 'coin_requests', 'coin_transactions'}
            assert any(i['name'] == 'uq_coin_request_active_work' and i['unique'] for i in inspect(connection).get_indexes('coin_requests'))
            migration.downgrade()
            assert set(inspect(connection).get_table_names()) == {'users', 'projects'}
    engine.dispose()
