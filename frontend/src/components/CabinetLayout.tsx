import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Building2, CalendarDays, ChevronRight, FileText, LayoutDashboard, Menu, ShieldCheck, X } from 'lucide-react';

const navigation = [
  { href: '#overview', label: 'Обзор', icon: LayoutDashboard },
  { href: '#objects', label: 'Мои объекты', icon: Building2 },
  { href: '#schedule', label: 'План работ', icon: CalendarDays },
  { href: '#documents', label: 'Документы', icon: FileText },
];

export function CabinetLayout({ children, organization }: { children: ReactNode; organization?: string }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [active, setActive] = useState('#overview');
  const menuButton = useRef<HTMLButtonElement>(null);
  const firstMenuLink = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    if (menuOpen) firstMenuLink.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && menuOpen) {
        setMenuOpen(false);
        menuButton.current?.focus();
      }
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [menuOpen]);
  return <div className="app-shell">
    <a className="skip-link" href="#main">Перейти к содержимому</a>
    <aside className={`sidebar ${menuOpen ? 'is-open' : ''}`}>
      <a className="brand" href="/" aria-label="IC Group — новая заявка"><img src="/brand/ic-group.png" alt="IC Group" /><span>Клиентский сервис</span></a>
      <div className="sidebar-label">Клиентский кабинет</div>
      <nav id="cabinet-navigation" aria-label="Разделы обзора">
        {navigation.map(({ href, label, icon: Icon }, index) => <a ref={index === 0 ? firstMenuLink : undefined} key={href} href={href} className={`nav-link ${active === href ? 'active' : ''}`} aria-current={active === href ? 'location' : undefined} onClick={() => { setActive(href); setMenuOpen(false); document.getElementById(href.slice(1))?.focus({ preventScroll: true }); }}><Icon size={19} aria-hidden="true" /><span>{label}</span>{active === href && <ChevronRight size={15} aria-hidden="true" />}</a>)}
      </nav>
      <div className="sidebar-bottom"><ShieldCheck size={20} aria-hidden="true" /><p>Ваши объекты.<br /><strong>Всё под рукой.</strong></p><span>Клиентский сервис IC Line</span></div>
    </aside>
    <div className="workspace">
      <header className="topbar">
        <button ref={menuButton} className="icon-button mobile-menu" type="button" aria-label={menuOpen ? 'Закрыть меню' : 'Открыть меню'} aria-controls="cabinet-navigation" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X size={21} /> : <Menu size={21} />}</button>
        <a className="topbar-title" href="/">Новая заявка →</a>
        <div className="account"><span className="demo-label">Демо</span><span className="account-avatar" aria-hidden="true">МД</span><span className="account-name">{organization ?? 'Медеу Девелопмент'}<span>Организация клиента</span></span></div>
      </header>
      <main id="main" tabIndex={-1}>{children}</main>
      <footer className="page-footer"><span>IC Group · Клиентский сервис</span><span>Демонстрационные данные из пакета хакатона</span></footer>
    </div>
  </div>;
}
