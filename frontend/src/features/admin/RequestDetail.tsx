import { ArrowRight, Check, MapPin, MessageSquare } from 'lucide-react';
import { Fact, Facts, formatDate, money, number, RequestBadge, Section } from './components';
import type { ClientRequest, RequestStatus } from './types';
import { generalOptions, objectTypes, statusLabels } from '../request/types';

export function RequestDetail({ request, onStatus, busy = false }: { request: ClientRequest; onStatus: (status: RequestStatus) => void; busy?: boolean }) {
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
        {request.source && <Facts>
          <Fact label="Тип объекта">{objectTypes.find(type => type.value === request.source!.payload.objects[index].object_type)?.label}</Fact>
          <Fact label="Сегмент бизнеса">{request.source.payload.objects[index].segment}</Fact>
          <Fact label="Гигиенические материалы">{request.source.payload.objects[index].hygiene_materials ? 'Включены' : 'Не требуются'}</Fact>
          <Fact label="Генеральная уборка">{generalOptions.find(option => option.value === request.source!.payload.objects[index].general_cleaning)?.label}</Fact>
          <Fact label="Пожелания по объекту">{request.source.payload.objects[index].notes || 'Не указаны'}</Fact>
        </Facts>}
      </article>)}
    </Section>
    <Section title="Пожелания и состав услуг"><Facts><Fact label="Гигиенические материалы">{request.hygiene ? 'Включены' : 'Не требуются'}</Fact><Fact label="Генеральная уборка">{request.generalCleaning}</Fact><Fact label="Бюджет клиента">{request.budget === null ? 'Не указан' : `${money(request.budget)} / месяц`}</Fact></Facts><div className="ad-quote"><MessageSquare size={17} aria-hidden="true" /><p>{request.wishes}</p></div></Section>
    {request.source && <Section title="Начало обслуживания"><p>{request.source.payload.desired_start || 'Дата не указана'}</p></Section>}
    <Section title="Предварительный расчёт">{request.estimate ? <><div className="ad-estimate"><div><span>Стоимость без НДС</span><strong>{money(request.estimate.net)}</strong></div><div><span>НДС</span><strong>{money(request.estimate.vat)}</strong></div><div className="ad-estimate-total"><span>Итого за {request.estimate.period}</span><strong>{money(request.estimate.total)}</strong></div></div><p className="ad-footnote">Версия {request.estimate.version}. Это пример цены, показанной клиенту. Окончательные условия фиксируются в договоре после связи с менеджером.</p></> : <p>Расчёт ещё не подготовлен. Клиент отправил параметры для оценки менеджером.</p>}</Section>
    {request.source && <Section title="История заявки"><ul className="ad-timeline">{request.source.history.map((event, index) => <li key={index}><strong>{statusLabels[event.status] || event.status}</strong><span>{formatDate(event.at, true)}</span></li>)}</ul></Section>}
    <div className="ad-action-bar">
      {request.status === 'new' && <button className="ad-button ad-button-primary" disabled={busy} onClick={() => onStatus('review')}>Взять в работу <ArrowRight size={16} /></button>}
      {request.status !== 'contacted' && request.status !== 'closed' ? <button className="ad-button" disabled={busy} onClick={() => onStatus('contacted')}>Отметить связь с клиентом <Check size={16} /></button> : <p className="ad-with-icon"><Check size={18} />{request.status === 'closed' ? 'Заявка закрыта' : 'Связь с клиентом зафиксирована'}</p>}
      {request.source && request.status !== 'closed' && <button className="ad-button" disabled={busy} onClick={() => onStatus('closed')}>Закрыть заявку</button>}
      {request.source && request.status === 'closed' && <button className="ad-button" disabled={busy} onClick={() => onStatus('review')}>Вернуть в работу</button>}
      {busy && <span role="status">Сохраняем статус…</span>}
    </div>
    <p className="ad-footnote">Следующий шаг — согласовать объекты, план, сроки и цену, затем оформить договор. Договор ещё не создан.</p>
  </>;
}
