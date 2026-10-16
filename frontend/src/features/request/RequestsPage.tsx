import { useEffect, useState } from 'react';
import { ArrowRight, Check, ClipboardList, Plus } from 'lucide-react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { BrandFooter, BrandHeader } from '../../components/BrandHeader';
import { AuthDialog } from '../auth/AuthDialog';
import { useAuth } from '../auth/AuthProvider';
import { api, ApiError } from '../../lib/api';
import { ObjectReview } from './RequestPage';
import { statusLabels, type RequestRecord } from './types';

export function RequestsPage() {
  const { id } = useParams();
  const { state } = useLocation();
  const { user, loading: accountLoading, error: accountError, refresh, expire } = useAuth();
  const [authMode, setAuthMode] = useState<'login' | 'register' | null>(null);
  const [records, setRecords] = useState<RequestRecord[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [retry, setRetry] = useState(0);
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    let active = true;
    setRecords([]); setError('');
    if (user) {
      setLoading(true);
      api<RequestRecord | RequestRecord[]>(id ? `/requests/${encodeURIComponent(id)}` : `/requests?offset=${offset}`).then(data => { if (active) setRecords(Array.isArray(data) ? data : [data]); }).catch(e => { if (active) { setError(e.message); if (e instanceof ApiError && e.status === 401) expire(); } }).finally(() => { if (active) setLoading(false); });
    } else setLoading(false);
    return () => { active = false; };
  }, [user?.id, id, retry, offset]);
  return <div className="request-shell"><BrandHeader onLogin={() => setAuthMode('login')} /><main id="request-main" className="requests-main">
    <div className="requests-title"><div>{state?.justSent && id ? <><span className="receipt-check"><Check size={24} /></span><h1>Заявка отправлена</h1><p>IC Group получил параметры и ваши контакты. Менеджер сможет связаться с вами для подготовки предложения.</p></> : <><h1>{id ? 'Ваша заявка' : 'Мои заявки'}</h1><p>Параметры объектов, контакты и состояние обращения.</p></>}</div><Link className="action-button" to="/"><Plus size={18} />Новая заявка</Link></div>
    {(accountLoading || loading) && <div className="request-loading" role="status">Загружаем заявки…<div /><div /></div>}
    {accountError && <div className="form-error" role="alert">{accountError}<button className="text-action" onClick={() => void refresh()}>Повторить</button></div>}
    {!user && !accountLoading && !accountError && <section className="request-empty"><ClipboardList size={35} /><h2>Войдите, чтобы увидеть заявки</h2><p>Здесь будут только обращения, отправленные из вашего аккаунта.</p><button className="action-button" onClick={() => setAuthMode('login')}>Войти<ArrowRight size={18} /></button></section>}
    {error && user && <div className="form-error" role="alert">{error}<button className="text-action" onClick={() => setRetry(r => r + 1)}>Повторить</button></div>}
    {user && !loading && !error && records.length === 0 && <section className="request-empty"><ClipboardList size={35} /><h2>{offset ? 'Больше заявок нет' : 'Отправленных заявок пока нет'}</h2><p>Заполните параметры объекта — IC Group получит их после отправки.</p><Link className="action-button" to="/">Заполнить заявку<ArrowRight size={18} /></Link></section>}
    {user && !loading && records.map(record => <article className="submitted-request" key={record.id}><div className="receipt-header"><div><span className="request-status">{statusLabels[record.status] || record.status}</span><h2>{record.payload.objects.map(o => o.name).join(', ')}</h2><p className="request-reference">{record.id}</p><p>Отправлена {new Date(record.created_at).toLocaleString('ru-RU', { timeZone: 'Asia/Almaty' })}</p></div>{!id && <Link className="outline-button" to={`/requests/${record.id}`}>Подробнее<ArrowRight size={16} /></Link>}</div>{id && <><div className="review-list">{record.payload.objects.map((o, i) => <ObjectReview key={i} object={o} />)}</div><div className="receipt-contact"><h3>Контакты в заявке</h3><p>{record.contact.name} · {record.contact.company}</p><p>{record.contact.email} · {record.contact.phone}</p><p>Бюджет в месяц: {record.payload.monthly_budget ? `${new Intl.NumberFormat('ru-RU').format(record.payload.monthly_budget)} ₸` : 'не указан'}</p><p>Желаемое начало: {record.payload.desired_start || 'обсудить с менеджером'}</p></div><Link to="/requests" className="text-action">Все мои заявки <ArrowRight size={16} /></Link></>}</article>)}
    {!id && user && (offset > 0 || records.length === 50) && <nav className="request-pagination" aria-label="Страницы заявок"><button className="outline-button" disabled={offset === 0 || loading} onClick={() => setOffset(o => Math.max(0, o - 50))}>Назад</button><button className="outline-button" disabled={records.length < 50 || loading} onClick={() => setOffset(o => o + 50)}>Далее</button></nav>}
  </main><BrandFooter /><AuthDialog mode={authMode} onClose={() => setAuthMode(null)} /></div>;
}
