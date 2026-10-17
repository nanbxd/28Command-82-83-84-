from datetime import timedelta, timezone
from uuid import UUID, uuid4
import httpx
from fastapi import APIRouter, HTTPException
from pydantic import Field
from sqlalchemy import func, select
from .auth import CurrentUser, Db, utcnow
from .config import get_settings
from .models import User
from .request_schemas import StrictModel
from .support_knowledge import system_prompt
from .support_models import SupportTurn

router = APIRouter(prefix='/api/v1/support', tags=['AI support'])
FAILURE = 'Помощник временно недоступен. Сообщение сохранено — попробуйте повторить позже.'


def aware(value):
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value


def output(row):
    stale = row.status == 'pending' and aware(row.updated_at) < utcnow() - timedelta(seconds=90)
    return {**{key: getattr(row, key) for key in ('id', 'request_key', 'question', 'answer', 'created_at')},
        'status': 'failed' if stale else row.status, 'error': FAILURE if stale else row.error,
        'can_retry': row.attempts < 3 and (row.status == 'failed' or stale)}


def ask_groq(messages):
    settings = get_settings()
    payload = {'model': settings.groq_model, 'messages': messages, 'temperature': 0.1, 'max_completion_tokens': 2500}
    if settings.groq_model.startswith('openai/gpt-oss'):
        payload.update(reasoning_effort='medium', reasoning_format='hidden')
    try:
        with httpx.Client(timeout=httpx.Timeout(35, connect=10)) as client:
            response = client.post('https://api.groq.com/openai/v1/chat/completions',
                headers={'Authorization': 'Bearer ' + settings.groq_api_key.get_secret_value()},
                json=payload)
            response.raise_for_status()
            answer = response.json()['choices'][0]['message']['content']
            if not isinstance(answer, str) or not answer.strip():
                raise ValueError('Empty answer')
            return answer.strip()[:16000]
    except (httpx.HTTPError, ValueError, KeyError, IndexError, TypeError):
        # Never forward upstream bodies or exceptions: they can contain secrets.
        raise HTTPException(503, FAILURE) from None


@router.get('/messages')
def history(user: CurrentUser, db: Db, before: str | None = None):
    query = select(SupportTurn).where(SupportTurn.user_id == user.id)
    if before:
        cursor = db.scalar(select(SupportTurn).where(SupportTurn.id == before, SupportTurn.user_id == user.id))
        if not cursor:
            raise HTTPException(404, 'Сообщение не найдено.')
        query = query.where((SupportTurn.created_at < cursor.created_at) | ((SupportTurn.created_at == cursor.created_at) & (SupportTurn.id < cursor.id)))
    rows = list(db.scalars(query.order_by(SupportTurn.created_at.desc(), SupportTurn.id.desc()).limit(31)))
    return {'items': [output(row) for row in reversed(rows[:30])], 'has_more': len(rows) > 30}


class Question(StrictModel):
    request_key: UUID
    message: str = Field(min_length=1, max_length=4000)


@router.post('/messages')
def send(data: Question, user: CurrentUser, db: Db):
    question = data.message.strip()
    if not question:
        raise HTTPException(422, 'Введите сообщение.')
    if not get_settings().groq_api_key.get_secret_value():
        raise HTTPException(503, 'ИИ-поддержка ещё не подключена. Обратитесь к администратору IC Group.')
    # Serialize admission only; do not hold database locks during provider calls.
    db.scalar(select(User).where(User.id == user.id).with_for_update())
    row = db.scalar(select(SupportTurn).where(SupportTurn.user_id == user.id, SupportTurn.request_key == str(data.request_key)).execution_options(populate_existing=True))
    if row and row.question != question:
        raise HTTPException(409, 'Это сообщение уже отправлено с другим текстом.')
    if row and row.status == 'completed':
        return output(row)
    now = utcnow()
    if db.scalar(select(SupportTurn.id).where(SupportTurn.user_id == user.id, SupportTurn.status == 'pending', SupportTurn.updated_at > now - timedelta(seconds=90))):
        raise HTTPException(409, 'Помощник уже готовит ответ. Дождитесь его или обновите историю.')
    if row and row.attempts >= 3:
        raise HTTPException(429, 'Попытки для этого сообщения исчерпаны. Попробуйте отправить новый вопрос позже.')
    attempts = db.scalar(select(func.coalesce(func.sum(SupportTurn.attempts), 0)).where(SupportTurn.user_id == user.id, SupportTurn.updated_at > now - timedelta(hours=1)))
    if attempts >= 30:
        raise HTTPException(429, 'Лимит — 30 обращений в час. Попробуйте позже.', headers={'Retry-After': '3600'})
    attempt_id = str(uuid4())
    if row:
        row.attempts += 1
        row.user_role = user.role
    else:
        row = SupportTurn(id=str(uuid4()), user_id=user.id, request_key=str(data.request_key), user_role=user.role,
            question=question, answer='', attempts=1, created_at=now)
        db.add(row)
    row.status, row.error, row.updated_at, row.attempt_id = 'pending', '', now, attempt_id
    prior = list(db.scalars(select(SupportTurn).where(SupportTurn.user_id == user.id, SupportTurn.user_role == user.role,
        SupportTurn.status == 'completed', SupportTurn.id != row.id).order_by(SupportTurn.created_at.desc()).limit(12)))
    recent, remaining = [], 16000
    for turn in prior:
        if len(turn.question) + len(turn.answer) > remaining:
            break
        recent.append(turn)
        remaining -= len(turn.question) + len(turn.answer)
    messages = [{'role': 'system', 'content': system_prompt(user)}]
    for turn in reversed(recent):
        messages.extend([{'role':'user', 'content':turn.question}, {'role':'assistant', 'content':turn.answer}])
    messages.append({'role':'user', 'content':question})
    row_id = row.id
    db.commit()
    try:
        answer, error = ask_groq(messages), ''
    except HTTPException:
        answer, error = '', FAILURE
    row = db.scalar(select(SupportTurn).where(SupportTurn.id == row_id).with_for_update().execution_options(populate_existing=True))
    if row.attempt_id == attempt_id:
        row.answer, row.error = answer, error
        row.status = 'failed' if error else 'completed'
        row.updated_at = utcnow()
        db.commit()
    return output(row)
