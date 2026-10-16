import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { useAuth } from '../auth/AuthProvider';
import { Avatar, Drawer, EmptyState, formatDate, OpenButton, RequestBadge, requestLabels } from './components';
import { RequestDetail } from './RequestDetail';
import { downloadCsv, loadStaffRequests, saveRequestStatus } from './service';
import type { ClientRequest, RequestStatus } from './types';
import { LoadState, PageHeading, useAction } from '../portal/Portal';
import type { Project } from '../portal/types';

export default function AdminPage() {
  const auth = useAuth(); const action = useAction();
  const [data, setData] = useState<ClientRequest[] | null>(null); const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0); const [search, setSearch] = useState(''); const [city, setCity] = useState('all'); const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState<string | null>(null); const [more, setMore] = useState(false); const [offset, setOffset] = useState(0);
  const [projects, setProjects] = useState<Project[] | null>(null);
  useEffect(() => {
    const controller = new AbortController(); setData(null); setError('');
    loadStaffRequests(0, controller.signal).then(r => { if (!controller.signal.aborted) { setData(r.requests); setMore(r.more); setOffset(r.requests.length); } }).catch(e => { if (!controller.signal.aborted) { setError(e.message); if (e.status === 401) auth.expire(); } });
    return () => controller.abort();
  }, [attempt]);
  async function update(id: string, status: RequestStatus) {
    await action.run(async () => { const saved = await saveRequestStatus(id, status); setData(old => old?.map(r => r.id === id ? saved : r) || []); }, 'Статус сохранён. Клиент увидит его в своих заявках.');
  }
  const requests = data?.filter(r => `${r.id} ${r.company} ${r.contact} ${r.objects.map(o => o.name).join(' ')}`.toLowerCase().includes(search.toLowerCase()) && (filter === 'all' || r.status === filter) && (city === 'all' || r.source?.payload.objects.some(o => o.city === city))) || [];
  const current = data?.find(r => r.id === selected);
  return <><PageHeading title="Заявки клиентов" text="Контакты, параметры объектов и история работы с каждым обращением."><button className="ad-button" onClick={() => setAttempt(a => a + 1)}>Обновить заявки</button></PageHeading>
    <div className="portal-toolbar"><label className="field">Поиск по текущему разделу<input type="search" value={search} placeholder="Компания, объект или номер заявки" onChange={e => setSearch(e.target.value)} /></label><label className="field">Город<select value={city} onChange={e => setCity(e.target.value)}><option value="all">Все города</option>{[...new Set(data?.flatMap(r => r.source?.payload.objects.map(o => o.city) || []) || [])].sort().map(c => <option key={c}>{c}</option>)}</select></label><label className="field">Статус<select value={filter} onChange={e => setFilter(e.target.value)}><option value="all">Все статусы</option>{Object.entries(requestLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label><button className="ad-button" disabled={!requests.length} onClick={() => downloadCsv('ic-group-requests.csv', [['Номер', 'Компания', 'Контакт', 'Email', 'Телефон', 'Город', 'Статус'], ...requests.map(r => [r.id, r.company, r.contact, r.email, r.phone, r.city, requestLabels[r.status]])])}>Экспорт CSV</button></div>
    <p className="portal-muted portal-help">Поиск и экспорт учитывают загруженные заявки. Загружено: {data?.length ?? 0}.</p>
    {!selected && action.feedback}
    {!data ? <LoadState error={error} retry={() => setAttempt(a => a + 1)} /> : !requests.length ? <EmptyState onReset={() => { setSearch(''); setFilter('all'); setCity('all'); }} /> : <div className="portal-panel ad-table-wrap"><table className="ad-requests-table"><thead><tr><th>Клиент / заявка</th><th>Объекты</th><th>Город</th><th>Получена</th><th>Статус</th><th><span className="sr-only">Открыть</span></th></tr></thead><tbody>{requests.map(r => <tr key={r.id}><td><div className="ad-client-cell"><Avatar {...r} /><div><button className="ad-text-button" onClick={() => { setSelected(r.id); setProjects(null); }}>{r.company}</button><span>{r.id} · {r.contact}</span></div></div></td><td>{r.objects.length} · {r.objects.reduce((sum, o) => sum + o.area, 0).toLocaleString('ru-RU')} м²</td><td>{r.city}</td><td>{formatDate(r.createdAt)}</td><td><RequestBadge status={r.status} /></td><td><OpenButton label={`Открыть заявку ${r.id}`} onClick={() => { setSelected(r.id); setProjects(null); }} /></td></tr>)}</tbody></table></div>}
    {more && <div className="portal-pagination"><button className="ad-button" disabled={action.busy} onClick={() => void action.run(async () => { const result = await loadStaffRequests(offset); setData(old => [...(old || []), ...result.requests.filter(r => !old?.some(o => o.id === r.id))]); setMore(result.more); setOffset(o => o + result.requests.length); }, '')}>Загрузить ещё заявки</button></div>}
    {current && <Drawer title={current.company} eyebrow={`Анкета клиента · ${current.id}`} close={() => setSelected(null)}><RequestDetail request={current} busy={action.busy} onStatus={s => void update(current.id, s)} />{action.feedback}<section className="ad-detail-section"><h3>Обслуживание объектов</h3><p>Создайте карточки объектов из этой заявки, затем добавьте согласованные условия и назначения.</p><button className="ad-button ad-button-primary" disabled={action.busy} onClick={() => void action.run(async () => setProjects(await api(`/staff/requests/${current.id}/projects`, { method: 'POST' })), 'Объекты готовы. Повторное нажатие не создаёт копии.')}>Создать / открыть объекты</button>{projects && <ul className="portal-links">{projects.map(p => <li key={p.id}><Link to={`/admin/projects/${p.id}`}>{p.name} →</Link></li>)}</ul>}</section></Drawer>}
  </>;
}
