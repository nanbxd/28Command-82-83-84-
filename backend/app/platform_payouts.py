"""Documented sandbox only: no real money or arbitrary payment hosts."""
import httpx
import re
from fastapi import APIRouter, HTTPException
from pydantic import Field
from sqlalchemy import select
from .auth import CurrentUser, Db
from .config import get_settings
from .operations import event
from .operations_models import Project
from .request_schemas import StrictModel
from .settlement_models import ServiceAct
from .settlements import act_access, editor, output

router = APIRouter(prefix='/api/v1/acts', tags=['Sandbox payouts'])
BASE = 'https://hack.ic-group.kz/platform/v1'


def platform_request(method, path, **kwargs):
    key = get_settings().platform_api_key.get_secret_value()
    if not key:
        raise HTTPException(503, 'Учебная платформа не подключена: добавьте PLATFORM_API_KEY в окружение backend.')
    headers = {'Authorization': 'Bearer ' + key, **kwargs.pop('headers', {})}
    try:
        response = httpx.request(method, BASE + path, headers=headers, timeout=20, **kwargs)
        response.raise_for_status()
        return response.json()
    except (httpx.HTTPError, ValueError):
        raise HTTPException(503, 'Не удалось подтвердить результат платформы. Повторите проверку или отправку с теми же данными; новый платёж не создаётся.') from None


class PayoutInput(StrictModel):
    iin: str = Field(pattern=r'^\d{12}$')
    retry_failed: bool = False


def validate_result(result, amount):
    if not isinstance(result, dict) or result.get('status') not in {'processing', 'paid', 'failed'}:
        raise HTTPException(502, 'Неожиданный ответ платформы. Повторите проверку.')
    if result.get('amount_tiyn') != amount or not isinstance(result.get('id'), str) or not re.fullmatch(r'po_[A-Za-z0-9_-]{1,96}', result['id']):
        raise HTTPException(502, 'Параметры выплаты не совпали. Требуется проверка.')
    for name in ('fee_tiyn', 'total_debit_tiyn'):
        if not isinstance(result.get(name), int) or result[name] < 0:
            raise HTTPException(502, 'Платформа не подтвердила суммы комиссии.')
    if result['total_debit_tiyn'] != amount + result['fee_tiyn']:
        raise HTTPException(502, 'Платформа вернула несогласованные суммы.')


def save_result(db, user, project, act_id, result, expected_key):
    db.scalar(select(Project).where(Project.id == project.id).with_for_update())
    row = db.scalar(select(ServiceAct).where(ServiceAct.id == act_id).with_for_update().execution_options(populate_existing=True))
    if row.platform.get('key') != expected_key:
        return output(user, project, row)
    validate_result(result, row.platform['payload']['amount_tiyn'])
    if row.platform.get('id') and row.platform['id'] != result['id']:
        raise HTTPException(409, 'Платформа вернула другой идентификатор выплаты.')
    # Never regress a final result on a delayed concurrent response.
    if row.platform.get('status') in {'paid', 'failed'}:
        if row.platform['status'] != result['status']:
            return output(user, project, row)
    previous = row.platform.get('status')
    row.platform = {**row.platform, **{k: result[k] for k in ('id','status','fee_tiyn','total_debit_tiyn')}, 'error':''}
    row.payment_state = 'paid' if result['status'] == 'paid' else 'sent' if result['status'] == 'processing' else 'due'
    if previous != result['status']:
        row.history = [*row.history, event(user, 'platform_' + result['status'], 'Подтверждено ответом учебной платформы: ' + result['id'])]
    db.commit()
    return output(user, project, row)


@router.post('/{act_id}/payout')
def send_payout(act_id: str, data: PayoutInput, user: CurrentUser, db: Db):
    project, row = act_access(db, user, act_id)
    if row.kind != 'worker' or not editor(user, row):
        raise HTTPException(403, 'Выплату работнику отправляет субподрядчик этого начисления.')
    if not get_settings().platform_api_key.get_secret_value():
        raise HTTPException(503, 'Добавьте PLATFORM_API_KEY в окружение backend.')
    db.scalar(select(Project).where(Project.id == project.id).with_for_update())
    row = db.scalar(select(ServiceAct).where(ServiceAct.id == act_id).with_for_update().execution_options(populate_existing=True))
    if row.status != 'accepted' or row.payment_state not in {'due', 'sent', 'paid'} or row.total <= 0:
        raise HTTPException(409, 'Сначала подтвердите начисление и переведите его к оплате; сумма должна быть положительной.')
    if row.period_start.strftime('%Y-%m') != row.period_end.strftime('%Y-%m'):
        raise HTTPException(409, 'Для платформы начисление должно относиться к одному календарному месяцу.')
    if row.platform:
        if row.platform['payload']['iin'] != data.iin:
            raise HTTPException(409, 'Получатель уже зафиксирован для этой выплаты; менять его после отправки нельзя.')
        if row.platform.get('status') == 'failed' and data.retry_failed:
            attempt = row.platform.get('attempt', 1) + 1
            row.platform = {'key':f'ic-act-{row.id}-{attempt}', 'attempt':attempt, 'status':'prepared', 'payload':row.platform['payload']}
            row.history = [*row.history, event(user, 'platform_prepared', 'Новая попытка после подтверждённого отказа платформы')]
        elif row.platform.get('status') in {'paid','failed'}:
            return output(user, project, row)
    else:
        row.platform = {'key':'ic-act-' + row.id, 'status':'prepared', 'payload':{
            'iin':data.iin, 'amount_tiyn':int(row.total * 100), 'period':row.period_end.strftime('%Y-%m'), 'purpose':'Начисление за клининг по акту ' + row.id}}
        row.history = [*row.history, event(user, 'platform_prepared', 'Подготовлена учебная выплата; повтор использует тот же ключ')]
    stored = dict(row.platform)
    db.commit()  # Persist exact recipient/body/key BEFORE any external request.
    result = platform_request('GET', '/payouts/' + stored['id']) if stored.get('id') else platform_request('POST', '/payouts', headers={'Idempotency-Key':stored['key']}, json=stored['payload'])
    return save_result(db, user, project, act_id, result, stored['key'])


@router.post('/{act_id}/payout/refresh')
def refresh_payout(act_id: str, user: CurrentUser, db: Db):
    project, row = act_access(db, user, act_id)
    if row.kind != 'worker' or not row.platform.get('id'):
        raise HTTPException(409, 'Нет подтверждённого идентификатора. Повторите отправку с тем же ИИН.')
    if row.platform.get('status') in {'paid','failed'}:
        return output(user, project, row)
    expected_key = row.platform['key']
    result = platform_request('GET', '/payouts/' + row.platform['id'])
    return save_result(db, user, project, act_id, result, expected_key)
