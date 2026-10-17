from datetime import datetime, timezone
from decimal import Decimal
from uuid import uuid4
import pytest
from sqlalchemy import select
from app.operations_models import CleaningRun, Project, Visit
from app.settlement_models import ServiceAct
from test_requests import client, db, submission
from test_operations import flow, elevate


@pytest.fixture()
def settled(db, flow):
    f = flow
    p = db.get(Project, f['project'])
    p.contract_number = 'IC-2026-01'
    p.payment_terms = 'PRIVATE CLIENT TERMS'
    v = db.get(Visit, f['visit'])
    v.status = 'accepted'
    v.actual_end = datetime(2026, 11, 1, 20, 30, tzinfo=timezone.utc)
    v.zone = 'Второй этаж'
    v.checklist = [{'text':'Пол', 'done':True}]
    db.commit()
    return f


def payload(f, **changes):
    return dict(request_key=str(uuid4()), kind='client', period_start='2026-11-02', period_end='2026-11-30',
        basis='Договор IC-2026-01, приложение 2', payment_terms='Пять дней после приёмки', vat_rate='12',
        lines=[dict(visit_id=f['visit'], service='Уборка этажа', unit='м²', quantity='2.125', unit_price='100.50', adjustment='-3.56', reason='Согласованная скидка')], **changes)


def create(client, f, data, auth=None):
    return client.post(f'/api/v1/projects/{f["project"]}/acts', headers=auth or f['admin'], json=data)


def act(client, f, aid, action, auth=None, **extra):
    return client.post(f'/api/v1/acts/{aid}/actions', headers=auth or f['admin'], json=dict(request_key=str(uuid4()), action=action, **extra))


def test_full_client_act_payment_and_private_pdf(client, db, settled):
    f = settled
    data = payload(f)
    response = create(client, f, data)
    assert response.status_code == 201, response.text
    row = response.json(); aid = row['id']
    assert Decimal(row['subtotal']) == Decimal('210.00')
    assert Decimal(row['vat']) == Decimal('25.20')
    assert Decimal(row['total']) == Decimal('235.20')
    assert row['payment_state'] == 'none'
    assert create(client, f, data).json()['id'] == aid
    path = f'/api/v1/projects/{f["project"]}/acts'
    assert client.get(path, headers=f['owner']).json() == []
    assert act(client, f, aid, 'accept', f['owner']).status_code == 404
    assert act(client, f, aid, 'issue').status_code == 200
    assert act(client, f, aid, 'accept').status_code == 403
    assert act(client, f, aid, 'accept', f['other']).status_code == 404
    result = act(client, f, aid, 'accept', f['owner'])
    assert result.status_code == 200
    assert result.json()['payment_state'] == 'accrued'
    assert act(client, f, aid, 'paid', note='Оплата', reference='txn-001').status_code == 409
    assert act(client, f, aid, 'due', note='Срок наступил').status_code == 200
    assert act(client, f, aid, 'sent', note='Отправлено').status_code == 422
    assert act(client, f, aid, 'sent', note='Платёжное поручение', reference='txn-001').status_code == 200
    assert act(client, f, aid, 'failed', note='Банк отклонил', reference='txn-001').json()['payment_state'] == 'due'
    assert act(client, f, aid, 'sent', note='Новая отправка', reference='txn-002').status_code == 200
    pay = dict(request_key=str(uuid4()), action='paid', note='Подтверждено выпиской', reference='txn-002')
    endpoint = f'/api/v1/acts/{aid}/actions'
    first = client.post(endpoint, headers=f['admin'], json=pay).json()
    second = client.post(endpoint, headers=f['admin'], json=pay).json()
    assert first == second and first['payment_state'] == 'paid'
    assert act(client, f, aid, 'cancel', note='Отмена').status_code == 409
    pdf = client.get(f'/api/v1/acts/{aid}/pdf', headers=f['owner'])
    assert pdf.status_code == 200 and pdf.content.startswith(b'%PDF-') and len(pdf.content) > 10000
    assert client.get(f'/api/v1/acts/{aid}/pdf', headers=f['other']).status_code == 404
    assert client.get(f'/api/v1/acts/{aid}/pdf', headers=f['worker']).status_code == 404


def test_duplicate_work_cancel_and_rejection(client, db, settled):
    f = settled
    aid = create(client, f, payload(f)).json()['id']
    assert create(client, f, payload(f)).status_code == 409
    assert act(client, f, aid, 'issue').status_code == 200
    assert act(client, f, aid, 'reject', f['owner']).status_code == 422
    assert act(client, f, aid, 'reject', f['owner'], note='Не согласен с объёмом').json()['payment_state'] == 'none'
    assert act(client, f, aid, 'issue').status_code == 409
    assert act(client, f, aid, 'cancel', note='Уточнение объёмов').status_code == 200
    assert create(client, f, payload(f)).status_code == 201


def test_contractors_workers_and_financial_isolation(client, db, settled):
    f = settled
    contractor, user = elevate(client, db, 'supplier@example.com', 'contractor')
    p = db.get(Project, f['project']); p.contractor_id = user.id
    run = CleaningRun(id='act-run', project_id=p.id, contractor_id=user.id, name='Клининг', created_at=datetime.now(timezone.utc), completed_at=datetime.now(timezone.utc))
    db.add(run); db.flush()
    db.get(Visit, f['visit']).run_id = run.id; db.commit()
    data = payload(f); data.update(kind='contractor', beneficiary_id=user.id)
    assert create(client, f, data, contractor).status_code == 403
    aid = create(client, f, data).json()['id']
    assert act(client, f, aid, 'issue').status_code == 200
    assert act(client, f, aid, 'accept', contractor).status_code == 200
    path = f'/api/v1/projects/{p.id}/acts'
    assert client.get(path, headers=f['owner']).json() == []
    rows = client.get(path, headers=contractor).json()
    assert len(rows) == 1 and 'PRIVATE CLIENT TERMS' not in str(rows)
    worker_data = payload(f); worker_data.update(kind='worker', beneficiary_id=f['worker_id'])
    assert create(client, f, worker_data).status_code == 403
    worker_act = create(client, f, worker_data, contractor)
    assert worker_act.status_code == 201, worker_act.text
    wid = worker_act.json()['id']
    assert act(client, f, wid, 'issue', contractor).status_code == 200
    assert act(client, f, wid, 'accept', f['worker']).status_code == 200
    assert act(client, f, wid, 'due', note='Срок оплаты').status_code == 403
    assert act(client, f, wid, 'due', contractor, note='Срок оплаты').status_code == 200
    assert len(client.get(path, headers=f['worker']).json()) == 1
    assert client.get(f'/api/v1/acts/{aid}/pdf', headers=f['worker']).status_code == 404


def test_unconfirmed_outside_period_blocked_and_adjustments(client, db, settled):
    f = settled; data = payload(f)
    data['period_end'] = '2026-11-01'; data['period_start'] = '2026-11-01'
    assert create(client, f, data).status_code == 422  # UTC+5 boundary
    data = payload(f); data['lines'][0]['reason'] = ''
    assert create(client, f, data).status_code == 422
    data = payload(f); data['lines'][0]['adjustment'] = '-999'
    assert create(client, f, data).status_code == 422
    data = payload(f); data['lines'].append(data['lines'][0].copy())
    assert create(client, f, data).status_code == 422
    v = db.get(Visit, f['visit']); v.status = 'submitted'; db.commit()
    assert create(client, f, payload(f)).status_code == 409
    v.status = 'accepted'; p = db.get(Project, f['project']); p.is_blocked = True; db.commit()
    assert create(client, f, payload(f)).status_code == 409
    assert create(client, f, payload(f), f['owner']).status_code in {403,409}
