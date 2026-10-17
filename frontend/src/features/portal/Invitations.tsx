import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { Badge } from '../admin/components';
import { Empty, LoadState, PageHeading, useAction, useResource } from './Portal';
import { time, type Visit } from './types';

type Invitation = { id: string; name: string; project_id: string; project_name: string; address: string; contractor_name: string; company: string; blocked: boolean; expired: boolean; visits: Visit[] };

export default function Invitations() {
  const resource = useResource<Invitation[]>('/invitations');
  const action = useAction();
  return <><PageHeading title="Приглашения на смены" text="Проверьте объект, время и обязанности. До вашего согласия время остаётся свободным."><button className="ad-button" onClick={resource.reload}>Обновить</button></PageHeading>
    {action.feedback}
    {resource.error && <LoadState error={resource.error} retry={resource.reload} />}
    {!resource.data && !resource.error && <LoadState error="" retry={resource.reload} />}
    {resource.data?.length === 0 && <Empty title="Новых приглашений нет"><p>Здесь появятся предложения от субподрядчиков. Принятые смены доступны в разделе «Мои объекты и уборки».</p><Link className="ad-button" to="/work/projects">Мои объекты и уборки</Link></Empty>}
    <div className="portal-visits">{resource.data?.map(invitation => <section className="portal-panel portal-reading" key={invitation.id}>
      <div className="portal-row"><h2>{invitation.name}</h2><Badge tone="amber">{invitation.expired ? 'Время смены прошло' : invitation.blocked ? 'Приём приостановлен' : 'Ожидает вашего ответа'}</Badge></div>
      <h3>{invitation.project_name}</h3><p>{invitation.address}</p><p>Приглашает: {invitation.contractor_name} · {invitation.company}</p>
      {invitation.visits.map(v => <div key={v.id}><h3>{v.zone}</h3><p>{time(v.planned_start)} — {time(v.planned_end)} · Казахстан, UTC+5</p><ul>{v.checklist.map((item, i) => <li key={i}>{item.text}</li>)}</ul></div>)}
      {(invitation.blocked || invitation.expired) && <p>Принять эту смену сейчас нельзя. Можно отклонить приглашение.</p>}
      <div className="portal-actions"><button className="ad-button ad-button-primary" disabled={action.busy || invitation.blocked || invitation.expired} onClick={() => void action.run(async () => { await api(`/invitations/${invitation.id}/respond`, { method: 'POST', body: JSON.stringify({ decision: 'accept' }) }); resource.reload(); }, 'Смена принята. Задания доступны в разделе «Мои объекты и уборки».')}>Принять смену</button>
        <button className="ad-button" disabled={action.busy} onClick={() => void action.run(async () => { await api(`/invitations/${invitation.id}/respond`, { method: 'POST', body: JSON.stringify({ decision: 'decline' }) }); resource.reload(); }, 'Приглашение отклонено. Субподрядчик увидит ваш ответ.')}>Отклонить</button>
        <Link className="ad-button" to={`/work/projects/${invitation.project_id}`}>Объект и задания</Link></div>
    </section>)}</div>
  </>;
}
