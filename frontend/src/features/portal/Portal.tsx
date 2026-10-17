import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Building2, Inbox, MessageSquareText, UsersRound, LogOut, ArrowUpRight, Coins } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { AuthDialog } from '../auth/AuthDialog';
import { BrandFooter, BrandHeader } from '../../components/BrandHeader';
import { api, ApiError } from '../../lib/api';
import './portal.css';
import '../admin/admin.css';

export const isStaff = (role?: string) => role === 'manager' || role === 'superadmin';
export const portalBase = (role?: string) => isStaff(role) ? '/admin' : role === 'contractor' ? '/contractor' : role === 'worker' ? '/work' : '/cabinet';

export function useResource<T>(path: string) {
  const auth = useAuth();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  const previousPath = useRef('');
  useEffect(() => {
    const controller = new AbortController();
    if (previousPath.current !== path) setData(null);
    previousPath.current = path; setError('');
    api<T>(path, { signal: controller.signal }).then(value => { if (!controller.signal.aborted) setData(value); }).catch(e => {
      if (!controller.signal.aborted) { setError(e.message); if (e instanceof ApiError && e.status === 401) auth.expire(); }
    });
    return () => controller.abort();
  }, [path, version, auth.user?.id]);
  return { data, setData, error, reload: () => setVersion(v => v + 1) };
}

export function useAction() {
  const auth = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  async function run(action: () => Promise<unknown>, success = 'Изменения сохранены.') {
    if (busy) return false;
    setBusy(true); setError(''); setNotice('');
    try { await action(); setNotice(success); return true; }
    catch (e) { setError((e as Error).message); if (e instanceof ApiError && e.status === 401) auth.expire(); return false; }
    finally { setBusy(false); }
  }
  return { busy, error, notice, run, feedback: <><p className="form-error" role={error ? 'alert' : undefined}>{error}</p><p className="portal-notice" role="status">{notice}</p></> };
}
export function LoadState({ error, retry }: { error: string; retry: () => void }) {
  return <section className="portal-empty">{error ? <><h2>Не удалось загрузить данные</h2><p role="alert">{error}</p><button className="ad-button" onClick={retry}>Повторить</button></> : <p role="status">Загружаем данные…</p>}</section>;
}
export function PageHeading({ title, text, children }: { title: string; text: string; children?: ReactNode }) {
  return <div className="portal-heading"><div><h1>{title}<span>.</span></h1><p>{text}</p></div>{children}</div>;
}
export function Empty({ title, children }: { title: string; children: ReactNode }) {
  return <section className="portal-empty"><Building2 size={30} aria-hidden="true" /><h2>{title}</h2>{children}</section>;
}

function WorkerInvitationsNotice() {
  const resource = useResource<{ id: string }[]>('/invitations');
  useEffect(() => { const timer = window.setInterval(resource.reload, 30000); return () => window.clearInterval(timer); }, []);
  if (!resource.data?.length) return null;
  return <p className="portal-notice" role="status"><Link to="/work/invitations">Приглашения на смены: {resource.data.length}. Посмотреть и ответить →</Link></p>;
}

export default function Portal({ audience }: { audience: 'staff' | 'client' | 'worker' | 'contractor' }) {
  const auth = useAuth();
  const location = useLocation();
  const [login, setLogin] = useState(false);
  const action = useAction();
  const allowed = audience === 'staff' ? isStaff(auth.user?.role) : auth.user?.role === audience;
  useEffect(() => { document.title = `${audience === 'staff' ? 'Кабинет IC Group' : audience === 'worker' ? 'Мои уборки' : 'Личный кабинет'} · IC Group`; }, [audience, location.pathname]);
  if (auth.loading || auth.error || !allowed) return <div className="request-shell"><BrandHeader onLogin={() => setLogin(true)} /><main id="request-main" className="requests-main"><section className="request-empty">
    <h1>{auth.loading ? 'Проверяем доступ…' : auth.error ? 'Не удалось проверить доступ' : auth.user ? 'Этот кабинет недоступен для вашей роли' : audience === 'staff' ? 'Вход для сотрудников IC Group' : 'Войдите в личный кабинет'}</h1>
    {auth.loading ? <p role="status">Загружаем профиль.</p> : auth.error ? <><p role="alert">{auth.error}</p><button className="action-button" onClick={() => void auth.refresh()}>Повторить</button></> : auth.user ? <Link className="action-button" to={portalBase(auth.user.role)}>В свой кабинет</Link> : <><p>Войдите, чтобы увидеть свои объекты, документы и обращения.</p><button className="action-button" onClick={() => setLogin(true)}>Войти</button></>}
    </section></main><BrandFooter /><AuthDialog mode={login ? 'login' : null} onClose={() => setLogin(false)} /></div>;
  const base = portalBase(auth.user?.role);
  const navigation = [
    ...(audience === 'staff' ? [{ href: '/admin/requests', label: 'Заявки клиентов', icon: Inbox }] : []),
    { href: `${base}/projects`, label: audience === 'worker' ? 'Мои объекты и уборки' : 'Объекты', icon: Building2 },
    ...(audience === 'worker' ? [{ href: '/work/ic-coins', label: 'IC-coins', icon: Coins }] : []),
    ...(audience === 'worker' ? [{ href: '/work/invitations', label: 'Приглашения на смены', icon: Inbox }] : []),
    ...(audience === 'contractor' ? [{ href: '/contractor/ic-coins', label: 'Бонусы команды', icon: Coins }] : []),
    ...(audience === 'client' ? [{ href: '/requests', label: 'Мои заявки', icon: Inbox }] : []),
    { href: `${base}/complaints`, label: 'Обращения по качеству', icon: MessageSquareText },
    ...(['superadmin', 'manager', 'contractor'].includes(auth.user?.role || '') ? [{ href: `${base}/accounts`, label: audience === 'contractor' ? 'Моя команда' : 'Аккаунты сотрудников', icon: UsersRound }] : []),
  ];
  return <div className="ic-admin portal"><a className="ad-skip" href="#portal-content">К содержимому кабинета</a>
    <aside className="ad-sidebar"><Link to={base} className="ad-brand" aria-label="IC Group — кабинет"><img src="/brand/ic-group.png" alt="IC Group" /><span>Сервис.<br />Люди. Качество.</span></Link>
      <div className="ad-sidebar-label">{audience === 'staff' ? 'Управление сервисом' : audience === 'worker' ? 'Рабочее пространство' : 'Личный кабинет'}</div>
      <nav className="ad-navigation" aria-label="Разделы кабинета">{navigation.map(({ href, label, icon: Icon }) => <NavLink key={href} to={href} className={({ isActive }) => `ad-nav-link ${isActive ? 'is-active' : ''}`}><Icon size={19} /><span>{label}</span></NavLink>)}</nav>
      <div className="ad-sidebar-bottom">{auth.user?.role === 'client' && <Link to="/">Новая заявка <ArrowUpRight size={15} /></Link>}<a href="https://www.ic-group.kz/" target="_blank" rel="noreferrer">Основной сайт <ArrowUpRight size={15} /></a></div>
    </aside><div className="ad-workspace"><header className="ad-topbar"><strong>{audience === 'staff' ? 'Кабинет IC Group' : audience === 'worker' ? 'Кабинет работника' : auth.user?.company}</strong><div className="portal-account"><span>{auth.user?.name}<small>{auth.user?.role === 'superadmin' ? 'Суперадминистратор' : audience === 'staff' ? 'Администратор' : audience === 'worker' ? 'Работник' : audience === 'contractor' ? 'Субподрядчик' : 'Клиент'}</small></span><button className="ad-button" aria-label="Выйти из аккаунта" disabled={action.busy} onClick={() => void action.run(auth.logout, '')}><LogOut size={17} /></button></div></header>
      <main id="portal-content" className="ad-main" tabIndex={-1}>{action.feedback}{audience === 'worker' && <WorkerInvitationsNotice />}<Outlet key={auth.user?.id} /></main>
      <footer className="portal-footer">IC Group · Управление качеством <span>Время: Казахстан, UTC+5</span></footer></div>
  </div>;
}
