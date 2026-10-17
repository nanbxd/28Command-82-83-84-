import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { api } from '../../lib/api';
import { LoadState, PageHeading, useResource } from './Portal';
import { time } from './types';
import './support.css';

type Turn = { id: string; request_key: string; question: string; answer: string; status: 'pending' | 'failed' | 'completed'; error: string; can_retry: boolean; created_at: string };
type History = { items: Turn[]; has_more: boolean };
function Answer({ text }: { text: string }) {
  return <p>{text.split(/(\*\*[^*\n]+\*\*)/g).map((part, i) => part.startsWith('**') && part.endsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : part)}</p>;
}
const roles: Record<string,string> = { client: 'Клиент', manager: 'Администратор', superadmin: 'Суперадминистратор', contractor: 'Субподрядчик', worker: 'Работник' };
const suggestions: Record<string,string[]> = {
  client: ['Как подать заявку на уборку?', 'Где посмотреть фотоотчёт?', 'Как сообщить о плохой уборке?'],
  worker: ['Как принять приглашение на смену?', 'Как загрузить фото до и после?', 'Почему нельзя начать уборку?'],
  contractor: ['Как пригласить свободного работника?', 'Как подтвердить завершение клининга?', 'Что делать, если работник отклонил смену?'],
  manager: ['Как создать объект из заявки?', 'Как закрепить субподрядчика?', 'Как заблокировать объект?'],
  superadmin: ['Как создать администратора?', 'Как заблокировать аккаунт?', 'Кто подтверждает завершение уборки?'],
};

export default function SupportChat() {
  const { user } = useAuth();
  const history = useResource<History>('/support/messages');
  const [older, setOlder] = useState<Turn[]>([]);
  const [more, setMore] = useState<boolean | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [message, setMessage] = useState('');
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const input = useRef<HTMLTextAreaElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const pending = history.data?.items.some(item => item.status === 'pending');
  const turns = Array.from(new Map([...older, ...(history.data?.items || [])].map(item => [item.id, item])).values());
  useEffect(() => {
    if (!pending) return;
    const timer = window.setInterval(history.reload, 4000);
    return () => window.clearInterval(timer);
  }, [pending]);
  async function send(event?: FormEvent, retry?: Turn) {
    event?.preventDefault();
    if (busy || pending || (!retry && !message.trim())) return;
    setBusy(true); setError('');
    try {
      const result = await api<Turn>('/support/messages', { method: 'POST', body: JSON.stringify({ request_key: retry?.request_key || requestKey, message: retry?.question || message.trim() }) });
      history.setData(old => ({ has_more: old?.has_more || false, items: [...(old?.items || []).filter(item => item.id !== result.id), result].sort((a,b) => a.created_at.localeCompare(b.created_at)) }));
      if (!retry) { setMessage(''); setRequestKey(crypto.randomUUID()); }
      requestAnimationFrame(() => end.current?.scrollIntoView({ block: 'nearest', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }));
    } catch (e) { setError((e as Error).message); history.reload(); }
    finally { setBusy(false); }
  }
  async function loadOlder() {
    if (!turns.length || loadingOlder) return;
    setLoadingOlder(true); setError('');
    try { const result = await api<History>(`/support/messages?before=${encodeURIComponent(turns[0].id)}`); setOlder(old => [...result.items, ...old]); setMore(result.has_more); }
    catch (e) { setError((e as Error).message); }
    finally { setLoadingOlder(false); }
  }
  return <><PageHeading title="ИИ-поддержка" text={`Помощь по вашему кабинету · ${roles[user?.role || ''] || 'Пользователь'}`}><button className="ad-button" disabled={busy} onClick={history.reload}>Обновить историю</button></PageHeading>
    <section className="portal-panel support-chat" aria-label="Чат поддержки">
      <p className="portal-muted">Помощник объясняет действия в кабинете. Для проверки конкретной заявки или объекта откройте его карточку. Переписка сохраняется в вашем аккаунте; сообщения обрабатывает Groq. Не отправляйте пароли и ключи доступа.</p>
      {!history.data ? <LoadState error={history.error} retry={history.reload} /> : <>
        {history.error && <LoadState error={history.error} retry={history.reload} />}
        {(more ?? history.data.has_more) && <button className="ad-button" disabled={loadingOlder} onClick={() => void loadOlder()}>{loadingOlder ? 'Загружаем…' : 'Показать предыдущие сообщения'}</button>}
        <div className="support-messages" role="log" aria-label="Переписка с ИИ" aria-live="polite" aria-relevant="additions text">
          {!turns.length && <div className="support-empty"><h2>Чем помочь?</h2><p>Расскажу, где найти нужный раздел и что доступно вашей роли.</p><div className="portal-actions">{(suggestions[user?.role || ''] || []).map(text => <button className="ad-button" key={text} onClick={() => { setMessage(text); setRequestKey(crypto.randomUUID()); input.current?.focus(); }}>{text}</button>)}</div></div>}
          {turns.map(turn => <article className="support-turn" key={turn.id}><div className="support-question"><div className="support-message-label">Вы <time>{time(turn.created_at)}</time></div><p>{turn.question}</p></div>
            <div className="support-answer"><strong>ИИ-помощник IC Group</strong>{turn.status === 'completed' ? <Answer text={turn.answer} /> : turn.status === 'pending' ? <p>Готовим ответ…</p> : <><p>{turn.error}</p>{turn.can_retry && <button className="ad-button" disabled={busy || pending} onClick={() => void send(undefined, turn)}>Повторить ответ</button>}</>}</div></article>)}
          {busy && <p role="status">Помощник готовит ответ…</p>}<div ref={end} />
        </div>
        <form className="portal-form support-compose" onSubmit={e => void send(e)}>
          <label className="field">Ваш вопрос<textarea ref={input} value={message} disabled={busy} maxLength={4000} rows={3} required placeholder="Опишите, что хотите сделать или на каком шаге возникла ошибка" onChange={e => { setMessage(e.target.value); setRequestKey(crypto.randomUUID()); }} /></label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="portal-row"><span className="portal-muted">{message.length} / 4000</span><button className="ad-button ad-button-primary" disabled={busy || pending || !message.trim()}>{busy || pending ? 'Ожидаем ответ…' : 'Отправить сообщение'}</button></div>
        </form>
      </>}
    </section></>;
}
