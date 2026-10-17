import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Pencil, MessageSquarePlus } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { api } from '../../lib/api';
import { Badge, Drawer, Fact, Facts } from '../admin/components';
import { week } from '../request/types';
import { Empty, isStaff, LoadState, PageHeading, portalBase, useAction, useResource } from './Portal';
import { date, documentLabels, fileLabels, projectLabels, time, visitLabels, type ProjectDetail, type ServiceFile, type Visit } from './types';
import { DownloadFile, Photos, UploadFile } from './Files';
import { ProjectAccess } from './ProjectAccess';
import { ContractorPanel } from './ContractorPanel';
import { ComplaintForm } from './Complaints';

export default function ProjectPage() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const resource = useResource<ProjectDetail>(`/projects/${encodeURIComponent(id)}`);
  const [tab, setTab] = useState('visits');
  const [dialog, setDialog] = useState('');
  if (!resource.data) return <LoadState error={resource.error} retry={resource.reload} />;
  const p = resource.data; const staff = isStaff(user?.role); const worker = user?.role === 'worker' || user?.role === 'contractor';
  const saved = () => { setDialog(''); resource.reload(); };
  return <><Link className="portal-back" to={`${portalBase(user?.role)}/projects`}><ArrowLeft size={16} />Все объекты</Link>
    <PageHeading title={p.name} text={`${p.company} · ${p.details.city}, ${p.details.address}`}><Badge tone={p.is_blocked ? 'amber' : p.status === 'active' ? 'green' : 'neutral'}>{p.is_blocked ? 'Заблокирован' : projectLabels[p.status]}</Badge></PageHeading>
    {resource.error && <LoadState error={resource.error} retry={resource.reload} />}
    <section className="portal-key-facts"><div><span>Сейчас на объекте</span><strong>{p.cleaning_now ? 'Идёт уборка' : 'Нет текущей уборки'}</strong></div><div><span>Последняя уборка</span><strong>{time(p.last_cleaning)}</strong></div><div><span>Следующая уборка</span><strong>{p.next_cleaning ? time(p.next_cleaning) : 'Пока не назначена'}</strong></div></section>
    <div className="portal-actions">{staff && <><button className="ad-button" onClick={() => setDialog('edit')}><Pencil size={16} />Изменить условия</button></>}{user?.role === 'client' && <button className="ad-button" onClick={() => setDialog('complaint')}><MessageSquarePlus size={17} />Сообщить о качестве</button>}<button className="ad-button" onClick={resource.reload}>Обновить данные</button></div>
    {(staff || p.is_blocked || p.blocking_history?.length > 0) && <ProjectAccess project={p} reload={resource.reload} />}
    <ContractorPanel project={p} reload={resource.reload} />
    <nav className="portal-tabs" aria-label="Информация об объекте">{[['visits', 'Уборки и фотоотчёты'], ['plan', 'План и условия'], ...(!worker ? [['documents', 'Договоры и АВР']] : [])].map(([key, label]) => <button key={key} aria-current={tab === key ? 'page' : undefined} onClick={() => setTab(key)}>{label}</button>)}</nav>
    {tab === 'visits' && <><p className="portal-muted portal-help">Время начала и завершения фиксирует сервер. Время получения фотографии может отличаться от времени съёмки.</p>{p.visits.length ? <div className="portal-visits">{p.visits.map((v, i) => <details className="portal-visit" key={v.id} open={i === 0}><summary><span><strong>{v.zone ? `${v.zone} · ` : ''}{time(v.planned_start)}</strong><span>{v.worker_name} · до {time(v.planned_end)}</span></span><Badge tone={v.status === 'accepted' ? 'green' : v.status === 'correction' ? 'amber' : 'neutral'}>{visitLabels[v.status]}</Badge></summary><VisitReport key={`${v.id}-${v.status}-${v.history.length}`} visit={v} blocked={p.is_blocked} files={p.files.filter(f => f.visit_id === v.id)} reload={resource.reload} /></details>)}</div> : <Empty title="Уборки ещё не назначены"><p>{staff ? (p.contractor_id ? 'Закреплённый субподрядчик назначит работников и график уборок.' : 'Закрепите субподрядчика за объектом. Он составит график уборок.') : 'Здесь появятся расписание, выполненный чек-лист и фотографии.'}</p></Empty>}</>}
    {tab === 'plan' && <section className="portal-panel portal-reading"><h2>План работ</h2><p className="portal-prewrap">{p.plan || 'План ещё не опубликован. IC Group добавит согласованный состав работ.'}</p><Facts><Fact label="Период оказания услуг">{date(p.service_start)} — {date(p.service_end)}</Fact><Fact label="Площадь">{p.details.area_sqm.toLocaleString('ru-RU')} м²</Fact><Fact label="Запрошенный график">{p.details.base_schedule.days.map(d => week[d - 1]).join(', ')} · с {p.details.base_schedule.start_time}, {p.details.base_schedule.duration_hours} ч</Fact><Fact label="Пожелания клиента">{p.details.notes || 'Не указаны'}</Fact></Facts><p className="portal-muted">Конкретные даты и исполнители указаны в разделе уборок.</p>{!worker && <><h2>Условия договора</h2><Facts><Fact label="Договор">{p.contract_number || 'Ещё не оформлен'}</Fact><Fact label="Срок действия договора">{date(p.contract_start)} — {date(p.contract_end)}</Fact><Fact label="Согласованная цена за месяц с НДС">{p.price != null ? `${Number(p.price).toLocaleString('ru-RU')} ₸` : 'Не установлена'}</Fact><Fact label="Условия оплаты">{p.payment_terms || 'Не указаны'}</Fact></Facts><p className="portal-muted">Подписанные условия и приложения находятся в разделе документов.</p></>}</section>}
    {tab === 'documents' && !worker && <Documents project={p} reload={resource.reload} />}
    {dialog === 'edit' && <Drawer title="Условия обслуживания" eyebrow={p.name} close={() => setDialog('')}><ProjectForm project={p} onSaved={saved} /></Drawer>}
    {dialog === 'complaint' && <Drawer title="Обращение по качеству" eyebrow={p.name} close={() => setDialog('')}><ComplaintForm projectId={p.id} /></Drawer>}
  </>;
}

function ProjectForm({ project: p, onSaved }: { project: ProjectDetail; onSaved: () => void }) {
  const action = useAction();
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const raw = Object.fromEntries(new FormData(e.currentTarget));
    const data = { ...raw, price: raw.price || null, ...Object.fromEntries(['contract_start', 'contract_end', 'service_start', 'service_end'].map(k => [k, raw[k] || null])) };
    if (await action.run(() => api(`/staff/projects/${p.id}`, { method: 'PATCH', body: JSON.stringify(data) }))) onSaved();
  }
  return <form className="portal-form" onSubmit={submit}><label className="field">Статус объекта<select name="status" defaultValue={p.status}>{Object.entries(projectLabels).map(([k, v]) => <option value={k} key={k}>{v}</option>)}</select></label>
    <label className="field">План работ<textarea name="plan" rows={5} maxLength={10000} defaultValue={p.plan} /></label>
    <label className="field">Номер договора<input name="contract_number" maxLength={120} defaultValue={p.contract_number} /></label>
    <fieldset className="portal-fieldset"><legend>Срок действия договора</legend><div className="field-grid"><label className="field">Начало<input type="date" name="contract_start" defaultValue={p.contract_start || ''} /></label><label className="field">Окончание<input type="date" name="contract_end" defaultValue={p.contract_end || ''} /></label></div></fieldset>
    <fieldset className="portal-fieldset"><legend>Период оказания услуг</legend><div className="field-grid"><label className="field">С<input type="date" name="service_start" defaultValue={p.service_start || ''} /></label><label className="field">По<input type="date" name="service_end" defaultValue={p.service_end || ''} /></label></div></fieldset>
    <label className="field">Цена за месяц с НДС, ₸<input type="number" min="0" step="0.01" name="price" defaultValue={p.price || ''} /></label>
    <label className="field">Условия оплаты<textarea name="payment_terms" maxLength={2000} defaultValue={p.payment_terms} /></label>{action.feedback}<button className="ad-button ad-button-primary" disabled={action.busy}>Сохранить условия</button></form>;
}

function VisitReport({ visit: v, blocked, files, reload }: { visit: Visit; blocked: boolean; files: ServiceFile[]; reload: () => void }) {
  const { user } = useAuth(); const staff = !blocked && Boolean(v.run_id) && user?.role === 'contractor'; const canWork = !blocked && user?.role === 'worker';
  const action = useAction(); const [checked, setChecked] = useState(v.checklist.flatMap((item, i) => item.done ? [i] : []));
  const [notes, setNotes] = useState(v.notes); const [reason, setReason] = useState('');
  const editable = canWork && ['in_progress', 'correction'].includes(v.status);
  const hasBefore = files.some(file => file.kind === 'before');
  const hasAfter = files.some(file => file.kind === 'after');
  const readyToSubmit = hasBefore && hasAfter && checked.length === v.checklist.length;
  async function act(name: string) {
    if (await action.run(() => api(`/visits/${v.id}/actions`, { method: 'POST', body: JSON.stringify({ action: name, checked, notes: name === 'return' ? reason : notes }) }))) reload();
  }
  return <div className="portal-report"><Facts><Fact label="Фактическое начало">{time(v.actual_start)}</Fact><Fact label="Отчёт отправлен">{time(v.actual_end)}</Fact></Facts>
    <fieldset className="portal-checklist" disabled={!editable || action.busy}><legend>Выполненные работы · {checked.length}/{v.checklist.length}</legend>{v.checklist.map((item, i) => <label key={i}><input type="checkbox" checked={checked.includes(i)} onChange={e => setChecked(old => e.target.checked ? [...old, i] : old.filter(n => n !== i))} /><span>{item.text}</span></label>)}</fieldset>
    {editable ? <label className="field">Комментарий к отчёту<textarea value={notes} maxLength={5000} onChange={e => setNotes(e.target.value)} /></label> : v.notes && <p className="portal-prewrap">{v.notes}</p>}
    <h3>Фотоотчёт</h3><Photos files={files} />
    {canWork && v.status === 'planned' && <p role="status">{hasBefore ? 'Фото «до» сохранено. Теперь можно начать уборку.' : 'Выберите фото «до» и нажмите «Загрузить файл». Начать уборку можно после сохранения фотографии.'}</p>}
    {editable && !readyToSubmit && <p role="status">Для завершения: {!hasBefore && 'загрузите фото «до»; '}{!hasAfter && 'загрузите фото «после»; '}{checked.length !== v.checklist.length && 'отметьте все выполненные работы.'}</p>}
    {canWork && ['planned', 'in_progress', 'correction'].includes(v.status) && <div className="portal-photo-uploads"><UploadFile projectId={v.project_id} visitId={v.id} kind="before" onSaved={reload} />{v.status !== 'planned' && <UploadFile projectId={v.project_id} visitId={v.id} kind="after" onSaved={reload} />}</div>}
    {action.feedback}<div className="portal-actions">{canWork && v.status === 'planned' && <button className="ad-button ad-button-primary" disabled={action.busy || !hasBefore} onClick={() => void act('start')}>Начать уборку</button>}{editable && <><button className="ad-button" disabled={action.busy} onClick={() => void act('save')}>Сохранить чек-лист</button><button className="ad-button ad-button-primary" disabled={action.busy || !readyToSubmit} onClick={() => void act('submit')}>Завершить и отправить отчёт</button></>}{staff && v.status === 'planned' && <button className="ad-button" disabled={action.busy} onClick={() => void act('cancel')}>Отменить назначение</button>}{staff && !v.run_id && v.status === 'submitted' && <button className="ad-button ad-button-primary" disabled={action.busy} onClick={() => void act('accept')}>Принять отчёт</button>}</div>
    {staff && v.status === 'submitted' && <div className="portal-return"><label className="field">Причина возврата<textarea value={reason} maxLength={5000} onChange={e => setReason(e.target.value)} /></label><button className="ad-button" disabled={action.busy || !reason.trim()} onClick={() => void act('return')}>Вернуть на исправление</button></div>}
    <details className="portal-history"><summary>История уборки</summary><ul>{v.history.map((h, i) => <li key={i}><strong>{({ planned: 'Назначена', start: 'Начата', save: 'Чек-лист сохранён', submit: 'Отчёт отправлен', accept: 'Отчёт принят', return: 'Возвращён на исправление', cancel: 'Отменена' } as Record<string, string>)[h.action] || h.action}</strong><span>{h.actor} · {time(h.at)}</span>{h.text && <p>{h.text}</p>}</li>)}</ul></details>
  </div>;
}

function Documents({ project, reload }: { project: ProjectDetail; reload: () => void }) {
  const { user } = useAuth(); const staff = isStaff(user?.role);
  const [kind, setKind] = useState('contract'); const [period, setPeriod] = useState('');
  const files = project.files.filter(f => ['contract', 'attachment', 'avr'].includes(f.kind));
  return <div className="portal-documents"><section className="portal-panel portal-reading"><h2>Документы по объекту</h2><p>Загрузка договора не подтверждает подписание. Статус АВР не означает оплату.</p>
    {files.length ? files.map(f => <Document key={f.id} file={f} staff={staff} reload={reload} />) : <p className="portal-muted">IC Group ещё не добавил документы.</p>}</section>
    {staff && <section className="portal-panel portal-reading"><h2>Добавить документ</h2><p>Загрузите оформленный PDF. Предыдущие версии сохраняются в списке.</p><label className="field">Вид документа<select value={kind} onChange={e => setKind(e.target.value)}><option value="contract">Договор</option><option value="attachment">Приложение / допсоглашение</option><option value="avr">АВР</option></select></label>{kind === 'avr' && <label className="field">Период акта<input value={period} maxLength={120} onChange={e => setPeriod(e.target.value)} placeholder="Например, октябрь 2026" required /></label>}<UploadFile key={kind} projectId={project.id} kind={kind} period={period} onSaved={reload} /></section>}
  </div>;
}
function Document({ file, staff, reload }: { file: ServiceFile; staff: boolean; reload: () => void }) {
  const action = useAction(); const [state, setState] = useState(file.state); const [note, setNote] = useState('');
  return <article className="portal-document"><div className="portal-row"><div><h3>{file.name}</h3><p>{fileLabels[file.kind]}{file.period && ` · ${file.period}`}</p><p>{time(file.uploaded_at)} · {Math.ceil(file.size / 1024)} КБ</p></div><Badge tone={['signed', 'accepted'].includes(file.state) ? 'green' : 'neutral'}>{documentLabels[file.state]}</Badge></div><DownloadFile file={file} />
    {staff && <details><summary>Подтвердить состояние документа</summary><form className="portal-form" onSubmit={async e => { e.preventDefault(); if (await action.run(() => api(`/staff/files/${file.id}`, { method: 'PATCH', body: JSON.stringify({ state, note }) }))) reload(); }}><label className="field">Статус<select value={state} onChange={e => setState(e.target.value)}><option value="uploaded">Загружен</option>{file.kind === 'avr' ? <><option value="accepted">Принят</option><option value="rejected">Отклонён</option></> : <option value="signed">Подписание подтверждено</option>}</select></label><label className="field">Основание подтверждения<textarea required minLength={3} maxLength={2000} value={note} onChange={e => setNote(e.target.value)} /></label>{action.feedback}<button className="ad-button" disabled={action.busy}>Сохранить статус документа</button></form></details>}
    {file.history.length > 1 && <details className="portal-history"><summary>История документа</summary><ul>{file.history.map((h, i) => <li key={i}><strong>{documentLabels[h.action] || 'Загружен'}</strong><span>{time(h.at)} · {h.actor}</span><p>{h.text}</p></li>)}</ul></details>}
  </article>;
}
