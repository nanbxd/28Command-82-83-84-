import { useAuth } from '../auth/AuthProvider';
import { api } from '../../lib/api';
import { isStaff, useAction } from './Portal';
import { time, type ProjectDetail } from './types';

export function ProjectAccess({ project, reload }: { project: ProjectDetail; reload: () => void }) {
  const { user } = useAuth(); const action = useAction();
  return <section className="portal-panel contractor-panel" aria-label="Доступ к объекту">
    {project.is_blocked && <p role="status"><strong>Объект заблокирован.</strong> Назначение работ, фотоконтроль и подтверждение уборки приостановлены. История доступна для просмотра.</p>}
    {isStaff(user?.role) && <><p>{project.is_blocked ? 'Разблокируйте объект, чтобы исполнители могли продолжить работу.' : 'Блокировка остановит работу всех субподрядчиков и работников на этом объекте.'}</p><button className="ad-button" disabled={action.busy} onClick={() => void action.run(async () => { await api(`/staff/projects/${project.id}/access`, { method: 'PATCH', body: JSON.stringify({ is_blocked: !project.is_blocked }) }); reload(); }, project.is_blocked ? 'Объект разблокирован.' : 'Объект заблокирован.')}>{project.is_blocked ? 'Разблокировать объект' : 'Заблокировать объект'}</button></>}
    {action.feedback}
    {!!project.blocking_history?.length && <details className="portal-history"><summary>История блокировок</summary><ul>{project.blocking_history.map((h, i) => <li key={i}><strong>{h.action === 'blocked' ? 'Объект заблокирован' : 'Объект разблокирован'}</strong><span>{h.actor} · {time(h.at)}</span></li>)}</ul></details>}
  </section>;
}
