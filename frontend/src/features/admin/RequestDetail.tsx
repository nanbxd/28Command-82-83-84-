import { ArrowRight, Check, MapPin, MessageSquare } from 'lucide-react';
import { Fact, Facts, formatDate, money, number, RequestBadge, Section } from './components';
import type { ClientRequest, RequestStatus } from './types';

export function RequestDetail({ request, onStatus }: { request: ClientRequest; onStatus: (status: RequestStatus) => void }) {
  return <>
    <div className="ad-detail-meta"><RequestBadge status={request.status} /><span>Получена {formatDate(request.createdAt, true)}</span></div>
    <Section title="Контактные данные"><Facts>
      <Fact label="Организация">{request.company}</Fact><Fact label="Контактное лицо">{request.contact}</Fact>
      <Fact label="Телефон">{request.phone}</Fact><Fact label="Email">{request.email}</Fact>
      <Fact label="Город">{request.city}</Fact><Fact label="Сегмент">{request.segment}</Fact>
    </Facts></Section>
    <Section title={`Объекты клиента · ${request.objects.length}`}>
      {request.objects.map((object, index) => <article className="ad-object" key={index}>
        <div className="ad-object-heading"><span className="ad-small-number">0{index + 1}</span><h4>{object.name}</h4><strong>{number.format(object.area)} м²</strong></div>
        <p className="ad-muted ad-with-icon"><MapPin size={14} aria-hidden="true" />{object.address}</p>
        <Facts><Fact label="Дни уборки">{object.days}</Fact><Fact label="Время и длительность">{object.hours}</Fact><Fact label="Санузлы">{object.bathrooms}</Fact><Fact label="Поддерживающая уборка">{object.supporting}</Fact></Facts>
      </article>)}
    </Section>
    <Section title="Пожелания и состав услуг"><Facts><Fact label="Гигиенические материалы">{request.hygiene ? 'Включены' : 'Не требуются'}</Fact><Fact label="Генеральная уборка">{request.generalCleaning}</Fact><Fact label="Бюджет клиента">{request.budget === null ? 'Не указан' : `${money(request.budget)} / месяц`}</Fact></Facts><div className="ad-quote"><MessageSquare size={17} aria-hidden="true" /><p>{request.wishes}</p></div></Section>
    <Section title="Предварительный расчёт"><div className="ad-estimate"><div><span>Стоимость без НДС</span><strong>{money(request.estimate.net)}</strong></div><div><span>НДС</span><strong>{money(request.estimate.vat)}</strong></div><div className="ad-estimate-total"><span>Итого за {request.estimate.period}</span><strong>{money(request.estimate.total)}</strong></div></div><p className="ad-footnote">Версия {request.estimate.version}. Это пример цены, показанной клиенту. Окончательные условия фиксируются в договоре после связи с менеджером.</p></Section>
    <div className="ad-action-bar">
      {request.status === 'new' && <button className="ad-button ad-button-primary" onClick={() => onStatus('review')}>Взять в работу <ArrowRight size={16} /></button>}
      {request.status !== 'contacted' ? <button className="ad-button" onClick={() => onStatus('contacted')}>Отметить связь с клиентом <Check size={16} /></button> : <p className="ad-with-icon"><Check size={18} />Связь с клиентом зафиксирована</p>}
    </div>
    <p className="ad-footnote">Следующий шаг — согласовать объекты, план, сроки и цену, затем оформить договор. Договор ещё не создан.</p>
  </>;
}
