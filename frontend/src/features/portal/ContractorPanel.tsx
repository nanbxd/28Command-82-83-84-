import { useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { api } from '../../lib/api';
import { Drawer } from '../admin/components';
import { isStaff, LoadState, useAction, useResource } from './Portal';
import { time, visitLabels, type Account, type ProjectDetail } from './types';

export function ContractorPanel({ project: p, reload }: { project: ProjectDetail; reload: () => void }) {
  const { user } = useAuth(); const action = useAction(); const [dialog, setDialog] = useState('');
  const contractor = user?.role === 'contractor';
  return <section className="portal-panel contractor-panel"><div className="portal-row"><div><h2>{contractor ? 'График и зоны уборки' : 'Организация клининга'}</h2><p>Субподрядчик: {p.contractor_name || 'Ещё не закреплён'}</p></div><div className="portal-actions">
    {isStaff(user?.role) && <button className="ad-button" onClick={() => setDialog('assign')}>Закрепить субподрядчика</button>}
    {contractor && <button className="ad-button ad-button-primary" disabled={p.is_blocked} onClick={() => setDialog('plan')}>Запланировать клининг</button>}</div></div>
    {p.runs.length ? <div className="cleaning-runs">{p.runs.filter(r => user?.role !== 'worker' || p.visits.some(v => v.run_id === r.id)).map(r => {
      const tasks = p.visits.filter(v => v.run_id === r.id && v.status !== 'cancelled');
      const done = tasks.filter(v => ['submitted', 'accepted'].includes(v.status)).length;
      return <article className="cleaning-run" key={r.id}><h3>{r.name}</h3><p>{r.cancelled_at ? 'Клининг отменён' : r.completed_at ? `Клининг полностью проведён · ${time(r.completed_at)}` : `${user?.role === 'worker' ? 'Мои зоны' : 'Выполнено зон'}: ${done} из ${tasks.length}`}</p>
        <ul>{tasks.map(v => <li key={v.id}>{v.zone} · {v.worker_name} · {time(v.planned_start)} — {time(v.planned_end)} · {visitLabels[v.status]}</li>)}</ul>
        {contractor && !r.completed_at && !r.cancelled_at && <><button className="ad-button ad-button-primary" disabled={p.is_blocked || action.busy || !tasks.length || done !== tasks.length} onClick={() => void action.run(async () => { await api(`/runs/${r.id}/complete`, { method: 'POST' }); reload(); }, 'Клининг подтверждён. Клиент видит результат.')}>Подтвердить завершение клининга</button>{done !== tasks.length && <p className="portal-muted">Подтверждение станет доступно после отчётов по всем зонам.</p>}</>}
      </article>;
    })}</div> : <p className="portal-muted">{contractor ? 'Создайте уборку, укажите зоны, работников и время выполнения.' : 'Запланированные уборки и подтверждение завершения появятся здесь.'}</p>}
    {action.feedback}
    {dialog && <Drawer title={dialog === 'assign' ? 'Субподрядчик объекта' : 'Планирование клининга'} eyebrow={p.name} close={() => setDialog('')}>
      {dialog === 'assign' ? <Assign project={p} saved={() => { setDialog(''); reload(); }} /> : <Plan project={p} saved={() => { setDialog(''); reload(); }} />}
    </Drawer>}
  </section>;
}
function Assign({ project, saved }: { project: ProjectDetail; saved: () => void }) {
  const accounts = useResource<Account[]>('/staff/accounts'); const action = useAction();
  if (!accounts.data) return <LoadState error={accounts.error} retry={accounts.reload} />;
  const options = accounts.data.filter(a => a.role === 'contractor' && a.is_active);
  if (!options.length) return <p>Сначала создайте субподрядчика в разделе «Аккаунты сотрудников».</p>;
  return <form className="portal-form" onSubmit={async e => { e.preventDefault(); const contractor_id = new FormData(e.currentTarget).get('contractor_id'); if (await action.run(() => api(`/staff/projects/${project.id}/contractor`, { method: 'PUT', body: JSON.stringify({ contractor_id }) }))) saved(); }}>
    <p>Субподрядчик получит доступ к объекту и сможет приглашать свободных работников. Замена возможна после завершения текущих уборок.</p>
    <label className="field">Субподрядчик<select aria-label="Субподрядчик" name="contractor_id" defaultValue={project.contractor_id || ''} required><option value="" disabled>Выберите аккаунт</option>{options.map(a => <option key={a.id} value={a.id}>{a.company} · {a.name}</option>)}</select></label>
    {action.feedback}<button className="ad-button ad-button-primary" disabled={action.busy}>Сохранить назначение</button></form>;
}
const newZone = () => ({ key: crypto.randomUUID(), zone: '', worker_id: '', start: '', end: '', checklist: '' });
function Plan({ project, saved }: { project: ProjectDetail; saved: () => void }) {
  const action = useAction();
  const [zones, setZones] = useState([newZone()]); const [name, setName] = useState('');
  return <form className="portal-form" onSubmit={async e => { e.preventDefault(); const assignments = zones.map(z => ({ zone: z.zone, worker_id: z.worker_id, planned_start: `${z.start}:00+05:00`, planned_end: `${z.end}:00+05:00`, checklist: z.checklist.split('\n').map(s => s.trim()).filter(Boolean) })); if (await action.run(() => api(`/projects/${project.id}/runs`, { method: 'POST', body: JSON.stringify({ name, assignments }) }))) saved(); }}>
    <label className="field">Название уборки<input value={name} onChange={e => setName(e.target.value)} required minLength={2} maxLength={200} placeholder="Например, утренняя уборка 18 октября" /></label>
    <p className="portal-muted">Время Казахстана, UTC+5. Сначала укажите время, затем выберите свободного работника из общей базы. Он получит приглашение и должен подтвердить смену. До ответа время не резервируется.</p>
    {zones.map((z, i) => <fieldset className="portal-fieldset" key={z.key}><legend>Задание {i + 1}</legend>
      <label className="field">Зона<input required minLength={2} maxLength={200} value={z.zone} onChange={e => setZones(old => old.map(a => a.key === z.key ? { ...a, zone: e.target.value } : a))} placeholder="Например, уборная на 2 этаже" /></label>
      <div className="field-grid">{(['start', 'end'] as const).map(key => <label key={key} className="field">{key === 'start' ? 'Начало' : 'Окончание'}<input type="datetime-local" required value={z[key]} onChange={e => setZones(old => old.map(a => a.key === z.key ? { ...a, [key]: e.target.value, worker_id: '' } : a))} /></label>)}</div>
      {z.start && z.end && z.end > z.start ? <AvailableWorker key={`${z.start}-${z.end}`} projectId={project.id} start={z.start} end={z.end} value={z.worker_id} onChange={worker_id => setZones(old => old.map(a => a.key === z.key ? { ...a, worker_id } : a))} /> : <p className="portal-muted">Укажите начало и окончание, чтобы найти свободных работников.</p>}
      <label className="field">Обязанности · каждый пункт с новой строки<textarea required maxLength={30000} value={z.checklist} onChange={e => setZones(old => old.map(a => a.key === z.key ? { ...a, checklist: e.target.value } : a))} /></label>
      {zones.length > 1 && <button type="button" className="ad-button" onClick={() => setZones(old => old.filter(a => a.key !== z.key))}>Удалить задание {i + 1}</button>}
    </fieldset>)}
    <button type="button" className="ad-button" disabled={zones.length >= 100} onClick={() => setZones(old => [...old, newZone()])}>Добавить зону</button>
    {action.feedback}<button className="ad-button ad-button-primary" disabled={action.busy || zones.some(z => !z.worker_id)}>Отправить приглашения</button>
  </form>;
}

function AvailableWorker({ projectId, start, end, value, onChange }: { projectId: string; start: string; end: string; value: string; onChange: (id: string) => void }) {
  const query = new URLSearchParams({ planned_start: `${start}:00+05:00`, planned_end: `${end}:00+05:00` });
  const workers = useResource<Pick<Account, 'id' | 'name' | 'company'>[]>(`/projects/${projectId}/available-workers?${query}`);
  if (!workers.data || workers.error) return <LoadState error={workers.error} retry={workers.reload} />;
  return <><label className="field">Свободный работник<select aria-label="Работник" required value={value} onChange={e => onChange(e.target.value)}><option value="" disabled>Выберите работника</option>{workers.data.map(w => <option key={w.id} value={w.id}>{w.name} · {w.company}</option>)}</select></label>{!workers.data.length && <p role="status">Свободных работников на это время нет. Измените время или создайте аккаунт работника.</p>}</>;
}
