import { useEffect, useState } from 'react';
import { NavLink, Navigate, useParams } from 'react-router-dom';
import { ArrowDownToLine, ArrowRight, ArrowUpRight, Bell, Building2, CalendarDays, ChevronRight, CircleHelp, ClipboardCheck, Clock3, ExternalLink, Inbox, Leaf, ListFilter, MapPin, MessageSquareText, Search, ShieldCheck, X } from 'lucide-react';
import '@fontsource-variable/montserrat';
import './admin.css';
import checklist from './checklist.json';
import { Avatar, Badge, ComplaintBadge, Drawer, EmptyState, formatDate, number, OpenButton, RequestBadge, requestLabels, SavedNotice } from './components';
import { ComplaintDetail } from './ComplaintDetail';
import { ProjectDetail } from './ProjectDetail';
import { RequestDetail } from './RequestDetail';
import { downloadCsv, loadAdminDemo, saveAdminDemo } from './service';
import type { AdminData, AdminTab, Complaint, RequestStatus } from './types';

const navigation = [
  { id: 'requests', label: 'Входящие заявки', short: 'Заявки', icon: Inbox },
  { id: 'projects', label: 'Активные проекты', short: 'Проекты', icon: Building2 },
  { id: 'complaints', label: 'Возражения', short: 'Возражения', icon: MessageSquareText },
] as const;
const descriptions: Record<AdminTab, string> = {
  requests: 'Знакомьтесь с клиентами и помогайте им сделать первый шаг.',
  projects: 'Выполнение работ, условия субподряда и документы по объектам.',
  complaints: 'Обратная связь клиентов, которая сначала поступает в IC Group.',
};
type Selection = { kind: AdminTab; id: string } | null;

export default function AdminPage() {
  const { section = 'requests' } = useParams();
  const tab: AdminTab = ['requests', 'projects', 'complaints'].includes(section) ? section as AdminTab : 'requests';
  const [data, setData] = useState<AdminData | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [city, setCity] = useState('all');
  const [selection, setSelection] = useState<Selection>(null);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    setError(false);
    loadAdminDemo(controller.signal).then(result => { if (!controller.signal.aborted) setData(result); }).catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [attempt]);
  useEffect(() => {
    setSearch(''); setFilter('all'); setCity('all'); setSelection(null); setNotice('');
    const previousTitle = document.title;
    document.title = `${navigation.find(item => item.id === tab)!.label} · IC Group`;
    return () => { document.title = previousTitle; };
  }, [tab]);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 6500); return () => clearTimeout(timer); }, [notice]);

  if (section !== tab) return <Navigate to="/admin/requests" replace />;
  const counts = {
    requests: data?.requests.filter(request => request.status === 'new').length ?? 0,
    projects: data?.projects.length ?? 0,
    complaints: data?.complaints.filter(complaint => complaint.status === 'open').length ?? 0,
  };
  const persist = (next: AdminData, message: string) => {
    const saved = saveAdminDemo(next);
    setData(next);
    setNotice(saved ? `${message} Изменения сохранены в этом браузере.` : `${message} Хранилище недоступно: изменения сохранятся только до обновления страницы.`);
  };
  const updateRequest = (id: string, status: RequestStatus) => {
    if (!data) return;
    persist({ ...data, requests: data.requests.map(request => request.id === id ? { ...request, status } : request) }, 'Статус заявки обновлён.');
  };
  const updateComplaint = (updated: Complaint) => {
    if (!data) return;
    persist({ ...data, complaints: data.complaints.map(complaint => complaint.id === updated.id ? updated : complaint) }, 'История обращения обновлена.');
  };
  const matches = (...values: string[]) => values.join(' ').toLocaleLowerCase('ru').includes(search.trim().toLocaleLowerCase('ru'));
  const requests = data?.requests.filter(request => matches(request.company, request.contact, request.id, ...request.objects.map(object => object.name)) && (filter === 'all' || request.status === filter) && (city === 'all' || request.city === city)) ?? [];
  const projects = data?.projects.filter(project => matches(project.name, project.company, project.id, project.subcontractor) && (filter === 'all' || project.status === filter) && (city === 'all' || project.city === city)) ?? [];
  const complaints = data?.complaints.filter(complaint => {
    const project = data.projects.find(item => item.id === complaint.projectId)!;
    return matches(complaint.subject, complaint.company, complaint.id, project.name) && (filter === 'all' || (filter === 'forwarded' ? !!complaint.forwardedTo : complaint.status === filter)) && (city === 'all' || project.city === city);
  }) ?? [];
  const displayed = tab === 'requests' ? requests.length : tab === 'projects' ? projects.length : complaints.length;
  const total = data?.[tab].length ?? 0;
  const selectedRequest = selection?.kind === 'requests' ? data?.requests.find(item => item.id === selection.id) : null;
  const selectedProject = selection?.kind === 'projects' ? data?.projects.find(item => item.id === selection.id) : null;
  const selectedComplaint = selection?.kind === 'complaints' ? data?.complaints.find(item => item.id === selection.id) : null;
  const complaintProject = selectedComplaint ? data?.projects.find(item => item.id === selectedComplaint.projectId) : null;
  const reset = () => { setSearch(''); setFilter('all'); setCity('all'); };
  const exportRequests = () => downloadCsv('ic-group-demo-requests.csv', [
    ['Демонстрационные заявки IC Group'],
    ['Номер', 'Организация', 'Контакт', 'Телефон', 'Email', 'Город', 'Сегмент', 'Объекты', 'Площадь, м²', 'Статус', 'Цена с НДС, ₸', 'Версия расчёта'],
    ...requests.map(request => [request.id, request.company, request.contact, request.phone, request.email, request.city, request.segment, request.objects.map(object => object.name).join('; '), request.objects.reduce((sum, object) => sum + object.area, 0), requestLabels[request.status], request.estimate.total, request.estimate.version]),
  ]);

  return <div className="ic-admin">
    <a className="ad-skip" href="#admin-content">К содержимому кабинета</a>
    <aside className="ad-sidebar">
      <NavLink to="/admin/requests" className="ad-brand" aria-label="IC Group — входящие заявки"><img src="/brand/ic-group.png" alt="IC Group" /><span>Сервис.<br />Люди. Качество.</span></NavLink>
      <div className="ad-sidebar-label">Рабочее пространство</div>
      <nav className="ad-navigation" aria-label="Разделы кабинета IC Group">{navigation.map(({ id, label, icon: Icon }) => <NavLink key={id} to={`/admin/${id}`} className={({ isActive }) => `ad-nav-link ${isActive ? 'is-active' : ''}`}><Icon size={19} aria-hidden="true" /><span>{label}</span><b>{counts[id]}</b></NavLink>)}</nav>
      <div className="ad-sidebar-bottom"><div className="ad-service-note"><Leaf size={23} aria-hidden="true" /><h3>Чистота в деталях.</h3><p>Заботимся об объектах.<br />Слышим каждого клиента.</p></div><a href="https://www.ic-group.kz/" target="_blank" rel="noreferrer">Основной сайт <ExternalLink size={14} aria-hidden="true" /></a><div className="ad-sidebar-copyright">© 2026 IC Group</div></div>
    </aside>
    <div className="ad-workspace">
      <header className="ad-topbar"><div className="ad-breadcrumb"><span>IC Group</span><ChevronRight size={14} /><strong>Кабинет администратора</strong></div><div className="ad-topbar-right"><span className="ad-demo-tag"><span />Демо-кабинет</span><NavLink to="/admin/complaints" className="ad-bell" aria-label={`Возражения: ${counts.complaints} новых`}><Bell size={20} />{counts.complaints > 0 && <i />}</NavLink><div className="ad-account"><span className="ad-account-avatar">IC</span><div><strong>Администратор</strong><span>IC Group / IC Line</span></div></div></div></header>
      <main id="admin-content" className="ad-main" tabIndex={-1}>
        <div className="ad-page-heading"><div><span className="ad-eyebrow">Управление сервисом</span><h1>Рабочий кабинет<span>.</span></h1><p>Все клиенты, объекты и обращения — в одном месте.</p></div><div className="ad-demo-date"><CalendarDays size={17} /><div>17 октября 2026<span>Дата демонстрационных данных</span></div></div></div>
        <section className="ad-metrics" aria-label="Сводка кабинета">
          <NavLink to="/admin/requests" className={`ad-metric ${tab === 'requests' ? 'is-selected' : ''}`}><div className="ad-metric-top"><span>Новые заявки</span><Inbox size={20} /></div><div className="ad-metric-value">{data ? String(counts.requests).padStart(2, '0') : '—'}<span>ждут первого контакта</span><ArrowUpRight size={20} /></div></NavLink>
          <NavLink to="/admin/projects" className={`ad-metric ${tab === 'projects' ? 'is-selected' : ''}`}><div className="ad-metric-top"><span>Активные проекты</span><Building2 size={20} /></div><div className="ad-metric-value">{data ? String(counts.projects).padStart(2, '0') : '—'}<span>под контролем IC Group</span><ArrowUpRight size={20} /></div></NavLink>
          <NavLink to="/admin/complaints" className={`ad-metric ${tab === 'complaints' ? 'is-selected' : ''}`}><div className="ad-metric-top"><span>Новые возражения</span><MessageSquareText size={20} /></div><div className="ad-metric-value">{data ? String(counts.complaints).padStart(2, '0') : '—'}<span><i className="ad-attention-dot" />требуют вашего внимания</span><ArrowUpRight size={20} /></div></NavLink>
        </section>
        <section className="ad-content-section" aria-labelledby="ad-section-heading">
          <div className="ad-section-heading"><div><h2 id="ad-section-heading">{navigation.find(item => item.id === tab)!.label}<span>{total}</span></h2><p>{descriptions[tab]}</p></div>{tab === 'requests' && <button className="ad-button ad-export" disabled={!requests.length} onClick={exportRequests}><ArrowDownToLine size={16} />Экспорт CSV</button>}</div>
          <div className="ad-content-panel">
            <div className="ad-toolbar"><div className="ad-search"><Search size={18} aria-hidden="true" /><input aria-label="Поиск по текущему разделу" placeholder={tab === 'requests' ? 'Найти клиента или заявку' : tab === 'projects' ? 'Найти объект или клиента' : 'Найти обращение или клиента'} value={search} onChange={event => setSearch(event.target.value)} />{search && <button aria-label="Очистить поиск" onClick={() => setSearch('')}><X size={15} /></button>}</div><div className="ad-filters"><label><MapPin size={15} aria-hidden="true" /><select aria-label="Город" value={city} onChange={event => setCity(event.target.value)}><option value="all">Все города</option>{[...new Set(data ? [...data.requests.map(item => item.city), ...data.projects.map(item => item.city)] : [])].sort().map(value => <option key={value}>{value}</option>)}</select></label><label><ListFilter size={16} aria-hidden="true" /><select aria-label="Статус" value={filter} onChange={event => setFilter(event.target.value)}><option value="all">Все статусы</option>{tab === 'requests' ? <><option value="new">Новые</option><option value="review">В работе</option><option value="contacted">Связь установлена</option></> : tab === 'projects' ? <><option value="active">В работе</option><option value="attention">Есть замечания</option></> : <><option value="open">Новые</option><option value="review">На рассмотрении</option><option value="forwarded">Переданные исполнителям</option><option value="closed">Закрытые</option></>}</select></label></div></div>
            {error ? <div className="ad-empty" role="alert"><h3>Не удалось открыть кабинет</h3><p>Попробуйте загрузить данные ещё раз.</p><button className="ad-button" onClick={() => setAttempt(value => value + 1)}>Повторить</button></div> : !data ? <div className="ad-loading" role="status">Загружаем кабинет…</div> : !displayed ? <EmptyState onReset={reset} /> : <>
              {tab === 'requests' && <div className="ad-table-wrap"><table className="ad-requests-table"><thead><tr><th>Клиент / заявка</th><th>Объект</th><th>Город</th><th>Получена</th><th>Статус</th><th><span className="sr-only">Открыть</span></th></tr></thead><tbody>{requests.map(request => <tr key={request.id}><td><div className="ad-client-cell"><Avatar {...request} /><div><button className="ad-text-button" onClick={() => setSelection({ kind: 'requests', id: request.id })}>{request.company}</button><span>{request.id} · {request.contact}</span></div></div></td><td><strong>{request.segment}</strong><span>{number.format(request.objects.reduce((sum, object) => sum + object.area, 0))} м² · объектов: {request.objects.length}</span></td><td>{request.city}</td><td className="ad-date-cell">{formatDate(request.createdAt)}<span>{new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Qyzylorda' }).format(new Date(request.createdAt))}</span></td><td><RequestBadge status={request.status} /></td><td><OpenButton label={`Открыть заявку ${request.id}`} onClick={() => setSelection({ kind: 'requests', id: request.id })} /></td></tr>)}</tbody></table></div>}
              {tab === 'projects' && <div className="ad-project-grid">{projects.map(project => {
                const basicRows = checklist.rows.filter(row => row.kind === 'базовая');
                const checked = basicRows.filter(row => project.report.checked.includes(row.sourceRow)).length;
                return <article className="ad-project-card" key={project.id}><div className="ad-project-top"><Avatar {...project} /><Badge tone={project.status === 'attention' ? 'amber' : 'green'}>{project.status === 'attention' ? 'Есть замечания' : 'В работе'}</Badge></div><span className="ad-project-company">{project.company}</span><h3><button className="ad-text-button" onClick={() => setSelection({ kind: 'projects', id: project.id })}>{project.name}</button></h3><p className="ad-with-icon"><MapPin size={14} />{project.city} · {number.format(project.area)} м²</p><div className="ad-project-progress"><div><span>Чек-лист · {formatDate(project.report.date)}</span><strong>{checked}/{basicRows.length}</strong></div><progress max={basicRows.length} value={checked} aria-label={`Отмечено участков: ${checked} из ${basicRows.length}`} /><span>Отметки исполнителя · приёмка не подтверждена</span></div><div className="ad-project-facts"><span><Clock3 size={15} />{project.report.start} — {project.report.end ?? 'нет отметки'}</span><span><ClipboardCheck size={15} />{project.subcontractor}</span></div><button className="ad-project-open" onClick={() => setSelection({ kind: 'projects', id: project.id })}>Открыть проект <ArrowRight size={17} /></button></article>;
              })}</div>}
              {tab === 'complaints' && <div className="ad-complaint-list">{complaints.map(complaint => {
                const project = data.projects.find(item => item.id === complaint.projectId)!;
                return <article className="ad-complaint-row" key={complaint.id}><span className={`ad-complaint-icon ${complaint.priority === 'high' ? 'is-urgent' : ''}`}><MessageSquareText size={21} /></span><div className="ad-complaint-content"><div className="ad-complaint-overline"><span>{complaint.id} · {complaint.company}</span>{complaint.priority === 'high' && <span className="ad-priority">Высокий приоритет</span>}</div><h3><button className="ad-text-button" onClick={() => setSelection({ kind: 'complaints', id: complaint.id })}>{complaint.subject}</button></h3><p>{complaint.message}</p><span className="ad-complaint-location">{project.name} · {project.city}</span></div><div className="ad-complaint-state"><ComplaintBadge status={complaint.status} /><span>{formatDate(complaint.createdAt, true)}</span><small>{complaint.forwardedTo ? 'Передано исполнителям' : 'Только клиент и IC Group'}</small></div><OpenButton label={`Открыть возражение ${complaint.id}`} onClick={() => setSelection({ kind: 'complaints', id: complaint.id })} /></article>;
              })}</div>}
            </>}
            {data && <div className="ad-list-footer"><span>Показано {displayed} из {total}</span><span><span className="ad-small-dot" />Демонстрационные данные</span></div>}
          </div>
        </section>
        <div className="ad-bottom-grid"><section className="ad-intake-note"><div className="ad-note-icon">{tab === 'complaints' ? <ShieldCheck size={24} /> : tab === 'projects' ? <ClipboardCheck size={24} /> : <Inbox size={24} />}</div><div><h3>{tab === 'complaints' ? 'Сначала — решение IC Group' : tab === 'projects' ? 'Отчёт, смета и документы рядом' : 'Ни одна заявка не потеряется'}</h3><p>{tab === 'complaints' ? 'Обращение становится доступно исполнителям только после передачи менеджером. Все действия остаются в истории.' : tab === 'projects' ? 'Откройте проект, чтобы сверить чек-лист, рабочие часы, оборудование и условия расчётов с субподрядчиком.' : 'Здесь будут появляться анкеты с сайта: контакты, объекты и параметры уборки. Пока приём заявок работает на примерах.'}</p></div></section><section className="ad-next-step"><span className="ad-eyebrow">В фокусе</span><h3>{counts.complaints ? `${counts.complaints} обращения ждут ответа` : 'Все новые обращения разобраны'}</h3><NavLink to="/admin/complaints">Перейти к возражениям <ArrowRight size={17} /></NavLink></section></div>
        <footer className="ad-page-footer"><span><CircleHelp size={15} />Тестовые заявки, условия и статусы. Изменения хранятся в этом браузере.</span><span>IC Group · Управление качеством</span></footer>
      </main>
    </div>
    {notice && <div className={`ad-toast ${selection ? 'ad-toast-with-drawer' : ''}`}><SavedNotice>{notice}</SavedNotice></div>}
    {selectedRequest && <Drawer title={selectedRequest.company} eyebrow={`Анкета клиента · ${selectedRequest.id}`} close={() => setSelection(null)}><RequestDetail request={selectedRequest} onStatus={status => updateRequest(selectedRequest.id, status)} />{notice && <SavedNotice>{notice}</SavedNotice>}</Drawer>}
    {selectedProject && <Drawer title={selectedProject.name} eyebrow={`Активный проект · ${selectedProject.id}`} close={() => setSelection(null)}><ProjectDetail project={selectedProject} /></Drawer>}
    {selectedComplaint && complaintProject && <Drawer title={selectedComplaint.subject} eyebrow={`Возражение · ${selectedComplaint.id}`} close={() => setSelection(null)}><ComplaintDetail complaint={selectedComplaint} project={complaintProject} onUpdate={updateComplaint} />{notice && <SavedNotice>{notice}</SavedNotice>}</Drawer>}
  </div>;
}
