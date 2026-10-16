import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { useAuth } from '../auth/AuthProvider';
import { Badge, Drawer } from '../admin/components';
import { Empty, isStaff, LoadState, PageHeading, portalBase, useAction, useResource } from './Portal';
import { complaintLabels, time, type Complaint, type ProjectDetail } from './types';
import { Photos, UploadFile } from './Files';

export default function Complaints() {
  const [page, setPage] = useState(0); const [selected, setSelected] = useState<Complaint | null>(null);
  const resource = useResource<Complaint[]>(`/complaints?offset=${page * 50}`);
  const { user } = useAuth();
  return <><PageHeading title="Обращения по качеству" text={user?.role === 'worker' ? 'Обращения, переданные вам сотрудником IC Group.' : 'Замечания, ответы и история решения по вашим объектам.'}><button className="ad-button" onClick={resource.reload}>Обновить</button></PageHeading>
    {resource.error && resource.data && <LoadState error={resource.error} retry={resource.reload} />}
    {!resource.data ? <LoadState error={resource.error} retry={resource.reload} /> : !resource.data.length ? <Empty title="Обращений пока нет"><p>Новое обращение можно отправить из карточки объекта. Оно поступит в IC Group.</p><Link className="ad-button" to={`${portalBase(user?.role)}/projects`}>Перейти к объектам</Link></Empty> : <div className="portal-panel"><ul className="portal-complaints">{resource.data.map(c => <li key={c.id}><button onClick={() => setSelected(c)}><span><strong>{c.subject}</strong><span>{c.company} · {c.project_name}</span><small>{time(c.created_at)}</small></span><Badge tone={c.status === 'closed' ? 'green' : 'amber'}>{complaintLabels[c.status]}</Badge></button></li>)}</ul></div>}
    <div className="portal-pagination"><button className="ad-button" disabled={!page} onClick={() => setPage(p => p - 1)}>Назад</button><span>Страница {page + 1}</span><button className="ad-button" disabled={resource.data?.length !== 50} onClick={() => setPage(p => p + 1)}>Далее</button></div>
    {selected && <Drawer title={selected.subject} eyebrow={selected.project_name} close={() => setSelected(null)}><ComplaintThread key={selected.id} id={selected.id} onUpdated={resource.reload} /></Drawer>}
  </>;
}
export function ComplaintForm({ projectId }: { projectId: string }) {
  const action = useAction(); const [created, setCreated] = useState<Complaint | null>(null);
  if (created) return <div className="portal-form"><h3 role="status">Обращение отправлено в IC Group</h3><p>При необходимости приложите фотографии. Статус и ответы доступны в разделе обращений.</p><UploadFile projectId={projectId} complaintId={created.id} kind="complaint" onSaved={() => {}} /><Link className="ad-button ad-button-primary" to="/cabinet/complaints">Мои обращения</Link></div>;
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const data = Object.fromEntries(new FormData(e.currentTarget));
    await action.run(async () => setCreated(await api(`/projects/${projectId}/complaints`, { method: 'POST', body: JSON.stringify(data) })));
  }
  return <form className="portal-form" onSubmit={submit}><p>Сообщение увидит IC Group. Исполнитель получит доступ только после передачи обращения администратором.</p><label className="field">Тема<input required minLength={3} maxLength={200} name="subject" /></label><label className="field">Что нужно исправить<textarea name="message" rows={6} required minLength={5} maxLength={5000} /></label>{action.feedback}<button className="ad-button ad-button-primary" disabled={action.busy}>Отправить обращение</button></form>;
}
function ComplaintThread({ id, onUpdated }: { id: string; onUpdated: () => void }) {
  const resource = useResource<Complaint>(`/complaints/${id}`);
  if (!resource.data) return <LoadState error={resource.error} retry={resource.reload} />;
  return <ThreadBody key={`${id}-${resource.data.history.length}`} complaint={resource.data} reload={() => { resource.reload(); onUpdated(); }} />;
}
function ThreadBody({ complaint: c, reload }: { complaint: Complaint; reload: () => void }) {
  const { user } = useAuth(); const staff = isStaff(user?.role); const action = useAction();
  const project = useResource<ProjectDetail>(`/projects/${c.project_id}`);
  const [status, setStatus] = useState(c.status); const [forward, setForward] = useState(c.forwarded_to || ''); const [text, setText] = useState('');
  const workers = Array.from(new Map(project.data?.visits.map(v => [v.worker_id, v.worker_name])).entries());
  return <div className="portal-form"><Badge tone={c.status === 'closed' ? 'green' : 'amber'}>{complaintLabels[c.status]}</Badge><p className="portal-prewrap">{c.message}</p><p className="portal-muted">Получено {time(c.created_at)} · {c.forwarded_to ? 'Передано назначенному исполнителю' : 'Рассматривает IC Group'}</p>
    {project.data ? <Photos files={project.data.files.filter(f => f.complaint_id === c.id)} /> : <LoadState error={project.error} retry={project.reload} />}
    <ul className="portal-thread">{c.history.filter(h => h.action === 'reply').map((h, i) => <li key={i}><div><strong>{h.actor}</strong><time>{time(h.at)}</time></div><p>{h.text}</p>{h.status && <small>{complaintLabels[h.status]}</small>}</li>)}</ul>
    <form className="portal-form" onSubmit={async e => { e.preventDefault(); if (await action.run(() => api(`/complaints/${c.id}/reply`, { method: 'POST', body: JSON.stringify({ text, ...(staff ? { status, forwarded_to: forward || null } : {}) }) }))) reload(); }}>
      {staff && <><label className="field">Статус обращения<select value={status} onChange={e => setStatus(e.target.value)}>{Object.entries(complaintLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label><label className="field">Передать исполнителю<select value={forward} onChange={e => setForward(e.target.value)}><option value="">Только IC Group и клиент</option>{workers.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label></>}
      <label className="field">Сообщение<textarea value={text} required maxLength={5000} rows={4} onChange={e => setText(e.target.value)} /></label>{action.feedback}<button className="ad-button ad-button-primary" disabled={action.busy}>Отправить ответ</button></form>
    <UploadFile projectId={c.project_id} complaintId={c.id} kind="complaint" onSaved={project.reload} />
  </div>;
}
