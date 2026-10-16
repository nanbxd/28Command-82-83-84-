import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, MapPin } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { Badge } from '../admin/components';
import { Empty, LoadState, PageHeading, portalBase, useResource } from './Portal';
import { projectLabels, time, type Project } from './types';

export default function Projects() {
  const { user } = useAuth();
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const resource = useResource<Project[]>(`/projects?offset=${page * 50}`);
  const projects = resource.data?.filter(p => `${p.name} ${p.company} ${p.details.city}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  return <><PageHeading title={user?.role === 'client' ? 'Мои объекты' : 'Объекты'} text="План работ, ближайшая уборка и результаты обслуживания." ><button className="ad-button" onClick={resource.reload}>Обновить</button></PageHeading>
    <div className="portal-toolbar"><label className="field">Поиск по загруженным объектам<input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Название, город или компания" /></label><span>{resource.data ? `На странице: ${resource.data.length}` : ''}</span></div>
    {resource.error && resource.data && <LoadState error={resource.error} retry={resource.reload} />}
    {!resource.data ? <LoadState error={resource.error} retry={resource.reload} /> : !projects?.length ? <Empty title={search ? 'Объекты не найдены' : 'Объектов пока нет'}><p>{search ? 'Попробуйте другое название.' : user?.role === 'client' ? 'Объект появится здесь, когда IC Group начнёт работу по вашей заявке.' : 'Создайте объекты из заявки клиента. Работнику объект доступен после назначения уборки.'}</p><Link className="ad-button" to={user?.role === 'client' ? '/requests' : user?.role === 'worker' ? '/work/complaints' : '/admin/requests'}>{user?.role === 'worker' ? 'Обращения' : 'Открыть заявки'}</Link></Empty> : <div className="portal-projects">{projects.map(p => <article className="portal-project" key={p.id}>
      <h2><Link to={`${portalBase(user?.role)}/projects/${p.id}`}>{p.name}<ArrowUpRight size={19} /></Link></h2>
      <div className="portal-row portal-project-context"><p className="portal-muted">{p.company}</p><Badge tone={p.cleaning_now || p.status === 'active' ? 'green' : 'neutral'}>{p.cleaning_now ? 'Идёт уборка' : projectLabels[p.status]}</Badge></div>
      <p className="portal-location"><MapPin size={16} />{p.details.city}, {p.details.address}</p>
      <dl className="portal-summary"><div><dt>Последняя уборка</dt><dd>{time(p.last_cleaning)}</dd></div><div><dt>Следующая уборка</dt><dd>{p.next_cleaning ? time(p.next_cleaning) : 'Пока не назначена'}</dd></div></dl>
      <Link className="portal-card-link" to={`${portalBase(user?.role)}/projects/${p.id}`}>Открыть объект и отчёты <ArrowUpRight size={16} /></Link>
    </article>)}</div>}
    <div className="portal-pagination"><button className="ad-button" disabled={!page} onClick={() => setPage(p => p - 1)}>Назад</button><span>Страница {page + 1}</span><button className="ad-button" disabled={resource.data?.length !== 50} onClick={() => setPage(p => p + 1)}>Далее</button></div>
  </>;
}
