import { useEffect, useRef, type ReactNode } from 'react';
import { ArrowUpRight, Check, Inbox, X } from 'lucide-react';
import type { ClientRequest, ComplaintStatus, RequestStatus } from './types';

export const requestLabels: Record<RequestStatus, string> = { new: 'Новая', review: 'В работе', contacted: 'Связь установлена', closed: 'Закрыта' };
export const complaintLabels: Record<ComplaintStatus, string> = { open: 'Новое', review: 'На рассмотрении', correction: 'Исправление предъявлено', closed: 'Закрыто' };
export const number = new Intl.NumberFormat('ru-RU');
export const money = (value: number) => `${number.format(value)} ₸`;
export const formatDate = (value: string, time = false) => new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', ...(time ? { hour: '2-digit', minute: '2-digit' } : {}), timeZone: 'Asia/Qyzylorda' }).format(new Date(value));

export function Avatar({ initials, tone }: Pick<ClientRequest, 'initials' | 'tone'>) {
  return <span className={`ad-avatar ad-avatar-${tone}`} aria-hidden="true">{initials}</span>;
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: string }) {
  return <span className={`ad-badge ad-badge-${tone}`}><span aria-hidden="true" />{children}</span>;
}

export function RequestBadge({ status }: { status: RequestStatus }) {
  return <Badge tone={status === 'new' ? 'green' : status === 'review' ? 'amber' : 'neutral'}>{requestLabels[status]}</Badge>;
}

export function ComplaintBadge({ status }: { status: ComplaintStatus }) {
  return <Badge tone={status === 'open' ? 'orange' : status === 'closed' ? 'green' : 'amber'}>{complaintLabels[status]}</Badge>;
}

export function EmptyState({ onReset }: { onReset: () => void }) {
  return <div className="ad-empty"><Inbox size={32} aria-hidden="true" /><h3>Ничего не найдено</h3><p>Попробуйте другое название или измените фильтры.</p><button className="ad-button" onClick={onReset}>Сбросить фильтры</button></div>;
}

export function Facts({ children }: { children: ReactNode }) { return <dl className="ad-facts">{children}</dl>; }
export function Fact({ label, children }: { label: string; children: ReactNode }) { return <div><dt>{label}</dt><dd>{children}</dd></div>; }
export function Section({ title, children }: { title: string; children: ReactNode }) { return <section className="ad-detail-section"><h3>{title}</h3>{children}</section>; }

export function Drawer({ title, eyebrow, children, close }: { title: string; eyebrow: string; children: ReactNode; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const returnFocus = useRef(document.activeElement as HTMLElement | null);
  useEffect(() => {
    const dialog = ref.current!;
    const previousOverflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = 'hidden';
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      if (returnFocus.current?.isConnected) returnFocus.current.focus({ preventScroll: true });
    };
  }, []);
  return <dialog ref={ref} className="ad-drawer" aria-labelledby="ad-detail-title" onCancel={event => { event.preventDefault(); close(); }} onClick={event => { if (event.target === event.currentTarget) { const bounds = event.currentTarget.getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right) close(); } }}>
    <header className="ad-drawer-header"><div><h2 id="ad-detail-title">{title}</h2><p className="ad-drawer-context">{eyebrow}</p></div><button autoFocus className="ad-icon-button" aria-label="Закрыть карточку" onClick={close}><X size={21} /></button></header>
    <div className="ad-drawer-body">{children}</div>
  </dialog>;
}

export function OpenButton({ label, onClick }: { label: string; onClick: () => void }) {
  return <button className="ad-open-button" aria-label={label} onClick={onClick}><ArrowUpRight size={18} aria-hidden="true" /></button>;
}

export function SavedNotice({ children }: { children: ReactNode }) {
  return <div className="ad-notice" role="status"><Check size={17} aria-hidden="true" />{children}</div>;
}
