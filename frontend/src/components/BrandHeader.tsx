import { ArrowUpRight, LogOut, UserRound } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from '../features/auth/AuthProvider';

export function BrandHeader({ onLogin }: { onLogin: () => void }) {
  const { user, loading, logout } = useAuth();
  const [error, setError] = useState('');
  const [leaving, setLeaving] = useState(false);
  return <>
    <a className="skip-link" href="#request-main">Перейти к содержимому</a>
    <header className="brand-header">
      <NavLink to="/" className="official-logo" aria-label="IC Group — новая заявка"><img src="/brand/ic-group.png" alt="IC Group" /></NavLink>
      <nav aria-label="Клиентский сервис" className="brand-navigation"><NavLink to="/" end>Новая заявка</NavLink>{['manager', 'superadmin'].includes(user?.role || '') ? <NavLink to="/admin/requests">Кабинет IC Group</NavLink> : user?.role === 'contractor' ? <NavLink to="/contractor">Кабинет субподрядчика</NavLink> : user?.role === 'worker' ? <NavLink to="/work">Мои уборки</NavLink> : <><NavLink to="/cabinet">Личный кабинет</NavLink><NavLink to="/requests">Мои заявки</NavLink></>}</nav>
      <div className="brand-account">{loading ? <span>Вход…</span> : user ? <><span className="user-first-name"><UserRound size={16} />{user.name}</span><button className="quiet-icon" type="button" disabled={leaving} aria-label="Выйти из аккаунта" onClick={async () => { setLeaving(true); setError(''); try { await logout(); } catch (e) { setError((e as Error).message); } finally { setLeaving(false); } }}><LogOut size={18} /></button></> : <button type="button" className="action-button compact" onClick={onLogin}><UserRound size={16} />Войти</button>}</div>
    </header>
    {error && <p className="header-error form-error" role="alert">{error}</p>}
  </>;
}
export function BrandFooter() {
  return <footer className="brand-footer"><span>IC GROUP · Клиентский сервис</span><a href="https://www.ic-group.kz/" target="_blank" rel="noreferrer">Основной сайт <ArrowUpRight size={14} /></a><NavLink to="/admin">Администраторам</NavLink><NavLink to="/work">Работникам</NavLink></footer>;
}
