import { useState, type FormEvent } from 'react';
import { api } from '../../lib/api';
import { LoadState, PageHeading, useAction } from '../portal/Portal';
import { displayDate, statusLabels, useCoinsResource, ways, type BonusRequest } from './shared';
import './coins.css';

function ReviewCard({ request: r, done }: { request: BonusRequest; done: () => void }) {
  const action = useAction();
  const [amount, setAmount] = useState('100');
  const [note, setNote] = useState('');
  const [decision, setDecision] = useState<'approved' | 'rejected'>('approved');
  async function submit(e: FormEvent) {
    e.preventDefault();
    await action.run(async () => {
      await api(`/coins/requests/${r.id}/review`, { method: 'POST', body: JSON.stringify({ decision, note, ...(decision === 'approved' && r.way === 'extra' ? { amount: Number(amount) } : {}) }) });
      done();
    }, decision === 'approved' ? 'Бонусы начислены работнику.' : 'Запрос отклонён. Работник увидит причину.');
  }
  return <article className="coins-review-card" aria-label={`${r.worker_name}: ${r.reference}`}>
    <div className="coins-review-title"><div><h2>{r.worker_name}</h2><p>{ways.find(w => w.id === r.way)?.title}</p></div><span className="coins-status" data-status={r.status}>{statusLabels[r.status]}</span></div>
    <p className="coins-review-reference">{r.reference}</p><p className="coins-muted">Выполнено: {displayDate(r.date)} · Запрос: {displayDate(r.created_at)}</p>
    {r.note && <p className="coins-review-note">{r.note}</p>}
    {r.status === 'pending' ? <form className="coins-review-form" onSubmit={submit}>
      <label className="field">Решение<select value={decision} disabled={action.busy} onChange={e => setDecision(e.target.value as 'approved' | 'rejected')}><option value="approved">Подтвердить бонусы</option><option value="rejected">Отклонить запрос</option></select></label>
      {decision === 'approved' && (r.way === 'extra' ? <label className="field">Сумма IC-coins · от 50 до 150<input type="number" min={50} max={150} step={1} required value={amount} disabled={action.busy} onChange={e => setAmount(e.target.value)} /></label> : <p className="coins-review-amount">К начислению: <strong>{r.amount} IC-coins</strong></p>)}
      <label className="field coins-note">{decision === 'rejected' ? 'Причина отказа' : 'Комментарий · необязательно'}<textarea rows={2} maxLength={500} required={decision === 'rejected'} value={note} disabled={action.busy} onChange={e => setNote(e.target.value)} /></label>
      <button className="ad-button ad-button-primary" disabled={action.busy} type="submit">{action.busy ? 'Сохраняем…' : decision === 'approved' ? 'Подтвердить и начислить' : 'Отклонить запрос'}</button>
      <div className="coins-note">{action.feedback}</div>
    </form> : <div className="coins-review-result">{r.status === 'approved' && <strong>+{r.amount} IC-coins начислено</strong>}{r.decision_note && <p>{r.decision_note}</p>}<p className="coins-muted">Решение принято {r.reviewed_at ? displayDate(r.reviewed_at) : ''}</p></div>}
  </article>;
}

export default function CoinsReviewPage() {
  const [filter, setFilter] = useState('pending');
  const [offset, setOffset] = useState(0);
  const resource = useCoinsResource<{ requests: BonusRequest[]; more: boolean }>(`/coins/review?status=${filter}&offset=${offset}`);
  const [notice, setNotice] = useState('');
  return <div className="coins-page">
    <PageHeading title="Бонусы команды" text="Проверяйте запросы работников, аккаунты которых вы создали. После подтверждения IC-coins поступят на их баланс."><button className="ad-button" onClick={resource.reload}>Обновить запросы</button></PageHeading>
    <div className="portal-toolbar"><label className="field">Статус запроса<select value={filter} onChange={e => { setFilter(e.target.value); setOffset(0); setNotice(''); }}><option value="pending">Ожидают проверки</option><option value="approved">Начислены</option><option value="rejected">Отклонены</option><option value="all">Все запросы</option></select></label><p className="coins-muted">Приход вовремя: 50 · Уборка: 100 · Обучение: 100 · Дополнительное задание: 50–150 IC-coins</p></div>
    <p role="status" className="portal-notice">{notice}</p>
    {resource.error && resource.data && <LoadState error={resource.error} retry={resource.reload} />}
    {!resource.data ? <LoadState error={resource.error} retry={resource.reload} /> : !resource.data.requests.length ? <section className="coins-empty"><h2>Запросов пока нет</h2><p>Здесь появятся обращения вашей команды с выбранным статусом.</p></section> : <div className="coins-review-list">{resource.data.requests.map(r => <ReviewCard key={`${r.id}:${r.status}`} request={r} done={() => { setNotice('Решение сохранено. Баланс и история работника обновлены.'); resource.reload(); }} />)}</div>}
    <div className="portal-pagination"><button className="ad-button" disabled={!offset} onClick={() => setOffset(n => Math.max(0, n - 50))}>Назад</button><span>Страница {offset / 50 + 1}</span><button className="ad-button" disabled={!resource.data?.more} onClick={() => setOffset(n => n + 50)}>Далее</button></div>
  </div>;
}
