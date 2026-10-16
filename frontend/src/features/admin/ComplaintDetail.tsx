import { useState } from 'react';
import { ArrowRight, CornerUpRight, LockKeyhole, MessageSquare, Send } from 'lucide-react';
import { ComplaintBadge, formatDate, Section } from './components';
import type { Complaint, Project } from './types';

export function ComplaintDetail({ complaint, project, onUpdate }: { complaint: Complaint; project: Project; onUpdate: (update: Complaint) => void }) {
  const [reply, setReply] = useState('');
  const [forwarding, setForwarding] = useState(false);
  const [recipient, setRecipient] = useState('subcontractor');
  const addEvent = (kind: Complaint['events'][number]['kind'], text: string, changes: Partial<Complaint> = {}) => onUpdate({ ...complaint, ...changes, events: [...complaint.events, { at: new Date().toISOString(), kind, text }] });
  return <>
    <div className="ad-detail-meta"><ComplaintBadge status={complaint.status} /><span>{formatDate(complaint.createdAt, true)}</span></div>
    <Section title="Обращение клиента"><div className="ad-complaint-author"><span className="ad-small-number"><MessageSquare size={18} /></span><div><strong>{complaint.company}</strong><p>{project.name} · {project.city}</p></div></div><blockquote className="ad-client-message">{complaint.message}</blockquote><p className="ad-footnote">Вложения к обращению отсутствуют.</p></Section>
    <div className={`ad-visibility ${complaint.forwardedTo ? 'ad-visibility-forwarded' : ''}`}><LockKeyhole size={19} aria-hidden="true" /><div><strong>{complaint.forwardedTo ? 'Передано исполнителям' : 'Обращение поступило только в IC Group'}</strong><p>{complaint.forwardedTo ?? 'Клиент и IC Group видят обращение. Субподрядчику и работникам оно пока недоступно.'}</p></div></div>
    <div className="ad-action-bar">
      {complaint.status === 'open' && <button className="ad-button ad-button-primary" onClick={() => addEvent('status', 'Менеджер IC Group взял обращение на рассмотрение.', { status: 'review' })}>Взять на рассмотрение <ArrowRight size={16} /></button>}
      {!complaint.forwardedTo && complaint.status !== 'closed' && <button className="ad-button" aria-expanded={forwarding} onClick={() => setForwarding(!forwarding)}><CornerUpRight size={17} />Передать исполнителю</button>}
    </div>
    {forwarding && !complaint.forwardedTo && <form className="ad-forward-form" onSubmit={event => {
      event.preventDefault();
      const target = recipient === 'subcontractor' ? project.subcontractor : `${project.subcontractor} и назначенные работники объекта`;
      addEvent('forwarded', `IC Group передала обращение: ${target}.`, { forwardedTo: target, status: 'review' });
      setForwarding(false);
    }}><label htmlFor="ad-recipient">Кому передать по объекту «{project.name}»</label><select id="ad-recipient" value={recipient} onChange={event => setRecipient(event.target.value)}><option value="subcontractor">{project.subcontractor}</option><option value="team">Субподрядчик и назначенные работники</option></select><p>Передача будет записана в историю. В демо уведомления не отправляются.</p><button className="ad-button ad-button-primary" type="submit">Подтвердить передачу</button></form>}
    <Section title="История обращения"><ol className="ad-timeline">{complaint.events.map((event, index) => <li key={index}><span className={`ad-timeline-dot ${event.kind === 'reply' ? 'ad-timeline-reply' : ''}`} /><div><span>{formatDate(event.at, true)} · {event.kind === 'received' ? 'Клиент' : 'IC Group'}</span><p>{event.text}</p></div></li>)}</ol></Section>
    {complaint.status !== 'closed' && <Section title="Ответ клиенту"><form className="ad-reply-form" onSubmit={event => { event.preventDefault(); if (!reply.trim()) return; addEvent('reply', reply.trim(), { status: complaint.status === 'open' ? 'review' : complaint.status }); setReply(''); }}><label htmlFor="ad-reply" className="ad-muted">Сообщите, как решается вопрос</label><textarea id="ad-reply" value={reply} onChange={event => setReply(event.target.value)} placeholder="Здравствуйте! Мы получили ваше обращение…" maxLength={2000} rows={4} required /><div><span>{reply.length}/2000 · сохранится в демо-истории</span><button className="ad-button ad-button-primary" type="submit" disabled={!reply.trim()}><Send size={16} />Сохранить ответ</button></div></form></Section>}
  </>;
}
