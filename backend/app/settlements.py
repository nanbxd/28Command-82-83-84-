from datetime import date, timezone
from decimal import Decimal, ROUND_HALF_UP
from io import BytesIO
from pathlib import Path
from typing import Literal
from uuid import UUID, uuid4
from xml.sax.saxutils import escape

from fastapi import APIRouter, HTTPException, Response
from pydantic import Field, model_validator
from sqlalchemy import delete, select
from .auth import CurrentUser, Db, utcnow
from .models import Organization, User
from .operations import LOCAL, STAFF, event, project_access, writable_project
from .operations_models import CleaningRun, Project, Visit
from .request_schemas import StrictModel
from .settlement_models import ActWork, ServiceAct

router = APIRouter(prefix='/api/v1', tags=['Acts and settlements'])
KINDS = {'client': 'АВР клиенту', 'contractor': 'Акт субподрядчика', 'worker': 'Начисление работнику'}
STATES = {'draft':'Черновик', 'issued':'На приёмке', 'accepted':'Принят', 'rejected':'Отклонён', 'cancelled':'Отменён', 'none':'Не начислено', 'accrued':'Начислено', 'due':'К оплате', 'sent':'Выплата отправлена', 'paid':'Оплачено'}


def money(value):
    return Decimal(value).quantize(Decimal('.01'), rounding=ROUND_HALF_UP)


def visible(user, project, act):
    if user.role in STAFF:
        return True
    if user.role == 'client':
        return act.kind == 'client' and project.organization_id == user.organization_id and act.status != 'draft'
    if user.role == 'contractor':
        return act.kind in {'contractor', 'worker'} and act.contractor_id == user.id
    return user.role == 'worker' and act.kind == 'worker' and act.beneficiary_id == user.id and act.status != 'draft'


def editor(user, act):
    return (user.role in STAFF and act.kind in {'client', 'contractor'}) or (user.role == 'contractor' and act.kind == 'worker' and act.contractor_id == user.id)


def reviewer(user, project, act):
    return ((act.kind == 'client' and user.role == 'client' and project.organization_id == user.organization_id)
        or (act.kind == 'contractor' and user.role == 'contractor' and act.beneficiary_id == user.id)
        or (act.kind == 'worker' and user.role == 'worker' and act.beneficiary_id == user.id))


def output(user, project, act):
    result = {c.name: getattr(act, c.name) for c in ServiceAct.__table__.columns if c.name != 'request_key'}
    for field in ('subtotal', 'vat_rate', 'vat', 'total'):
        result[field] = str(getattr(act, field))
    result['platform'] = {k: v for k, v in (act.platform or {}).items() if k not in {'payload', 'key'}}
    result['can_edit'] = editor(user, act)
    result['can_review'] = reviewer(user, project, act)
    return result


def act_access(db, user, act_id):
    row = db.get(ServiceAct, act_id)
    if not row:
        raise HTTPException(404, 'Акт не найден.')
    project = project_access(db, user, row.project_id)
    if not visible(user, project, row):
        raise HTTPException(404, 'Акт не найден.')
    return project, row


@router.get('/projects/{project_id}/acts')
def list_acts(project_id: str, user: CurrentUser, db: Db):
    project = project_access(db, user, project_id)
    return [output(user, project, row) for row in db.scalars(select(ServiceAct).where(ServiceAct.project_id == project_id).order_by(ServiceAct.created_at.desc())) if visible(user, project, row)]


class ActLine(StrictModel):
    visit_id: str = Field(min_length=1, max_length=80)
    service: str = Field(min_length=1, max_length=300)
    unit: str = Field(min_length=1, max_length=30)
    quantity: Decimal = Field(gt=0, le=1000000, max_digits=12, decimal_places=3)
    unit_price: Decimal = Field(ge=0, le=100000000, max_digits=12, decimal_places=2)
    adjustment: Decimal = Field(default=Decimal('0'), ge=-100000000, le=100000000, max_digits=12, decimal_places=2)
    reason: str = Field(default='', max_length=1000)


class ActInput(StrictModel):
    request_key: UUID
    kind: Literal['client', 'contractor', 'worker']
    beneficiary_id: str | None = Field(default=None, max_length=80)
    period_start: date
    period_end: date
    basis: str = Field(min_length=3, max_length=2000)
    payment_terms: str = Field(min_length=3, max_length=2000)
    vat_rate: Decimal = Field(ge=0, le=100, max_digits=5, decimal_places=2)
    lines: list[ActLine] = Field(min_length=1, max_length=200)

    @model_validator(mode='after')
    def dates(self):
        if self.period_end < self.period_start or (self.period_end - self.period_start).days > 366:
            raise ValueError('Некорректный период')
        if len({x.visit_id for x in self.lines}) != len(self.lines) or len(self.basis.strip()) < 3 or len(self.payment_terms.strip()) < 3:
            raise ValueError('Повтор работ или пустое основание')
        return self


@router.post('/projects/{project_id}/acts', status_code=201)
def create_act(project_id: str, data: ActInput, user: CurrentUser, db: Db):
    project = writable_project(db, user, project_id)
    if not ((user.role in STAFF and data.kind in {'client', 'contractor'}) or (user.role == 'contractor' and data.kind == 'worker')):
        raise HTTPException(403, 'Нет права формировать этот вид расчёта.')
    prior = db.scalar(select(ServiceAct).where(ServiceAct.project_id == project_id, ServiceAct.request_key == str(data.request_key)))
    if prior:
        if not visible(user, project, prior):
            raise HTTPException(409, 'Ключ операции уже использован.')
        return output(user, project, prior)
    if not project.contract_number.strip():
        raise HTTPException(409, 'Сначала укажите номер договора в условиях объекта.')
    target = db.get(User, data.beneficiary_id) if data.beneficiary_id else None
    if data.kind == 'contractor' and (not target or target.id != project.contractor_id or target.role != 'contractor'):
        raise HTTPException(422, 'Выберите закреплённого субподрядчика.')
    if data.kind == 'worker' and (not target or target.role != 'worker'):
        raise HTTPException(422, 'Выберите работника.')
    if data.kind == 'client' and data.beneficiary_id:
        raise HTTPException(422, 'Получатель клиентского акта определяется объектом.')
    if target and not target.is_active:
        raise HTTPException(409, 'Аккаунт получателя заблокирован.')
    lines, subtotal = [], Decimal(0)
    for item in data.lines:
        if not item.service.strip() or not item.unit.strip():
            raise HTTPException(422, 'Заполните наименование услуги и единицу измерения.')
        visit = db.get(Visit, item.visit_id)
        if not visit or visit.project_id != project_id or visit.status != 'accepted' or not visit.actual_end:
            raise HTTPException(409, 'В акт можно включить только принятые выполненные работы этого объекта.')
        finished = visit.actual_end.replace(tzinfo=timezone.utc) if visit.actual_end.tzinfo is None else visit.actual_end
        if not data.period_start <= finished.astimezone(LOCAL).date() <= data.period_end:
            raise HTTPException(422, 'Работа не входит в выбранный период.')
        run = db.get(CleaningRun, visit.run_id) if visit.run_id else None
        if visit.run_id and (not run or not run.completed_at or run.cancelled_at):
            raise HTTPException(409, 'Субподрядчик ещё не подтвердил клининг.')
        if data.kind != 'client' and (not run or run.contractor_id != project.contractor_id):
            raise HTTPException(409, 'Работа должна относиться к закреплённому субподрядчику.')
        if data.kind == 'worker' and visit.worker_id != target.id:
            raise HTTPException(422, 'Работа относится к другому работнику.')
        if db.get(ActWork, (data.kind, visit.id)):
            raise HTTPException(409, 'Эта работа уже включена в действующий акт данного вида.')
        if item.adjustment and len(item.reason.strip()) < 3:
            raise HTTPException(422, 'Укажите договорное основание корректировки.')
        amount = money(item.quantity * item.unit_price) + item.adjustment
        if amount < 0 or amount > Decimal('1000000000000'):
            raise HTTPException(422, 'Сумма строки вне допустимого диапазона.')
        subtotal += amount
        lines.append({**item.model_dump(mode='json'), 'amount': str(amount), 'zone': visit.zone,
            'completed_at': visit.actual_end.isoformat(), 'checklist': visit.checklist})
    vat = money(subtotal * data.vat_rate / 100)
    act = ServiceAct(id=str(uuid4()), project_id=project_id, request_key=str(data.request_key), kind=data.kind,
        beneficiary_id=target.id if target else None, contractor_id=project.contractor_id,
        period_start=data.period_start, period_end=data.period_end, lines=lines, subtotal=subtotal,
        vat_rate=data.vat_rate, vat=vat, total=subtotal + vat, created_at=utcnow(), status='draft', payment_state='none',
        snapshot={'project': project.name, 'client': db.get(Organization, project.organization_id).name,
            'contract': project.contract_number, 'basis': data.basis.strip(), 'payment_terms': data.payment_terms.strip(),
            'beneficiary': target.name if target else db.get(Organization, project.organization_id).name,
            'currency': 'KZT'}, history=[event(user, 'draft', 'Подтверждены объёмы и тарифы по указанному основанию')])
    db.add(act)
    db.flush()
    for line in lines:
        db.add(ActWork(kind=act.kind, visit_id=line['visit_id'], act_id=act.id))
    db.commit()
    return output(user, project, act)


class ActAction(StrictModel):
    request_key: UUID
    action: Literal['issue', 'accept', 'reject', 'cancel', 'due', 'sent', 'paid', 'failed']
    note: str = Field(default='', max_length=2000)
    reference: str = Field(default='', max_length=200)


@router.post('/acts/{act_id}/actions')
def act_action(act_id: str, data: ActAction, user: CurrentUser, db: Db):
    project, row = act_access(db, user, act_id)
    # Same lock order as creation: project, then act. No transfer is performed here.
    db.scalar(select(Project).where(Project.id == project.id).with_for_update())
    row = db.scalar(select(ServiceAct).where(ServiceAct.id == act_id).with_for_update().execution_options(populate_existing=True))
    key = str(data.request_key)
    previous = next((e for e in row.history if e.get('request_key') == key), None)
    if previous:
        if previous['action'] != data.action or previous['actor_id'] != user.id or previous['text'] != data.note.strip() or previous.get('reference', '') != data.reference.strip():
            raise HTTPException(409, 'Ключ операции уже использован.')
        return output(user, project, row)
    if data.action in {'accept', 'reject'}:
        if not reviewer(user, project, row):
            raise HTTPException(403, 'Приёмку выполняет получатель документа.')
        if row.status != 'issued':
            raise HTTPException(409, 'Документ не ожидает приёмки.')
        if data.action == 'reject' and len(data.note.strip()) < 3:
            raise HTTPException(422, 'Укажите причину отклонения.')
        row.status = 'accepted' if data.action == 'accept' else 'rejected'
        if data.action == 'accept':
            row.payment_state = 'accrued'
    else:
        if not editor(user, row):
            raise HTTPException(403, 'Нет права изменять этот расчёт.')
        if data.action == 'issue':
            if row.status != 'draft':
                raise HTTPException(409, 'Отправить можно только черновик.')
            row.status = 'issued'
        elif data.action == 'cancel':
            if row.status not in {'draft', 'issued', 'rejected'} or len(data.note.strip()) < 3:
                raise HTTPException(409, 'Укажите причину; принятый акт отменить нельзя.')
            row.status = 'cancelled'
            db.execute(delete(ActWork).where(ActWork.act_id == row.id))
        else:
            if row.kind == 'worker' and data.action in {'sent', 'paid', 'failed'}:
                raise HTTPException(409, 'Выплаты работникам подтверждает учебная платформа, используйте отправку и проверку выплаты.')
            allowed = {'due': {'accrued'}, 'sent': {'due'}, 'paid': {'sent'}, 'failed': {'sent'}}
            if row.status != 'accepted' or row.payment_state not in allowed[data.action]:
                raise HTTPException(409, 'Недопустимый переход оплаты.')
            if len(data.note.strip()) < 3 or (data.action in {'sent', 'paid', 'failed'} and len(data.reference.strip()) < 3):
                raise HTTPException(422, 'Укажите основание и номер платёжного подтверждения.')
            row.payment_state = 'due' if data.action == 'failed' else data.action
    record = event(user, data.action, data.note.strip())
    record.update(request_key=key, reference=data.reference.strip(), confirmation='account' if data.action in {'accept', 'reject'} else 'manual')
    row.history = [*row.history, record]
    db.commit()
    return output(user, project, row)


@router.get('/acts/{act_id}/pdf')
def act_pdf(act_id: str, user: CurrentUser, db: Db):
    _, row = act_access(db, user, act_id)
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
    if 'ICNoto' not in pdfmetrics.getRegisteredFontNames():
        pdfmetrics.registerFont(TTFont('ICNoto', str(Path(__file__).parent / 'assets' / 'NotoSans-Regular.ttf')))
    style = ParagraphStyle('act', fontName='ICNoto', fontSize=10, leading=15, spaceAfter=8)
    heading = ParagraphStyle('title', parent=style, fontSize=17, leading=22)
    def para(value, title=False):
        return Paragraph(escape(str(value)).replace('\n', '<br/>'), heading if title else style)
    s = row.snapshot
    story = [para(KINDS[row.kind], True), para('№ ' + row.id), para(f"Клиент: {s['client']} · Объект: {s['project']}"),
        para(f"Договор: {s['contract']} · Получатель: {s['beneficiary']}"),
        para(f'Период: {row.period_start} — {row.period_end}'), para('Основание тарифов: ' + s['basis']),
        para('Условия оплаты: ' + (s['payment_terms'] or 'Не указаны')), Spacer(1, 10)]
    for i, line in enumerate(row.lines, 1):
        story.extend([para(f"{i}. {line['service']} · {line['zone']}"), para(f"{line['quantity']} {line['unit']} × {line['unit_price']} KZT; корректировка {line['adjustment']} KZT; сумма {line['amount']} KZT"),
            para('Основание корректировки: ' + line['reason']) if line['reason'] else Spacer(1, 1),
            para(f"Подтверждённая работа: {line['visit_id']} · Завершена: {line['completed_at']}")])
    story.extend([para(f'Без НДС: {row.subtotal} KZT'), para(f'НДС {row.vat_rate}%: {row.vat} KZT'), para(f'Итого: {row.total} KZT', True),
        para(f'Акт: {STATES[row.status]}. Расчёты: {STATES[row.payment_state]}.'),
        para('Подтверждение в кабинете не является ЭЦП. Платежи фиксируются вручную по внешнему подтверждению; документ не отправляет деньги.')])
    for item in row.history:
        story.append(para(f"{item['at']} · {item['actor']} · {item['action']} · {item['text']} · {item.get('reference', '')}"))
    buffer = BytesIO()
    SimpleDocTemplate(buffer, title=KINDS[row.kind], author='IC Group', leftMargin=40, rightMargin=40).build(story)
    return Response(buffer.getvalue(), media_type='application/pdf', headers={'Content-Disposition': f'attachment; filename="act-{row.id}.pdf"', 'Cache-Control':'private, no-store'})
