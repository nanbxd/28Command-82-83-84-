import { useState } from 'react';
import { ArrowDown, ArrowRight, Building2, CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, ClipboardList, Clock3, FileText, Info, MapPin, RefreshCw } from 'lucide-react';
import { CabinetLayout } from '../../components/CabinetLayout';
import { useOverview, type Overview, type WorkGroup } from './api';

const number = new Intl.NumberFormat('ru-RU');
const asDate = (value: string) => new Date(`${value}T12:00:00`);
const asString = (value: Date) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
const displayDate = (value: string, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('ru-RU', options).format(asDate(value));
const roleNames: Record<string, string> = {
  'ОПУ МОП (места общего пользования)': 'Уборка общих зон',
  'ОПУ санузлы': 'Уборка санузлов',
  'ОПУ прилегающая территория': 'Уборка территории',
  'ОПУ фуд-корт': 'Уборка фуд-корта',
  'ОПУ ночная смена': 'Ночная уборка',
  'ОПУ полотёр (поломоечная машина)': 'Механизированная уборка пола',
  'ОПУ прилегающая территория (ночь)': 'Ночная уборка территории',
  'ОПУ офис администрации, инженерной службы и СБ': 'Уборка служебных помещений',
};

function Loading() {
  return <div className="loading-layout" role="status" aria-label="Загрузка обзора"><div className="skeleton skeleton-title" /><div className="skeleton skeleton-subtitle" /><div className="skeleton skeleton-summary" /><div className="skeleton-columns"><div className="skeleton skeleton-panel" /><div className="skeleton skeleton-panel" /></div><span className="sr-only">Загружаем данные кабинета…</span></div>;
}

function ErrorMessage({ message, retry }: { message: string; retry: () => void }) {
  return <div className="error-state" role="alert"><Info size={28} aria-hidden="true" /><h2>Данные недоступны</h2><p>{message}</p><button type="button" className="button primary" onClick={retry}><RefreshCw size={16} />Попробовать ещё раз</button></div>;
}

function WeekPicker({ data, day, onChange, disabled }: { data: Overview; day: string; onChange: (day: string) => void; disabled: boolean }) {
  const start = asDate(day);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  const days = Array.from({ length: 7 }, (_, index) => { const date = new Date(start); date.setDate(date.getDate() + index); return asString(date); });
  const move = (amount: number) => {
    const next = asDate(day); next.setDate(next.getDate() + amount);
    const clamped = [data.period_start, asString(next), data.period_end].sort()[1];
    onChange(clamped);
  };
  return <div className="week-picker" aria-label="Выбор дня работ">
    <button className="icon-button week-arrow" type="button" aria-label="Предыдущая неделя" disabled={disabled || days[0] <= data.period_start} onClick={() => move(-7)}><ChevronLeft size={18} /></button>
    <div className="week-days">{days.map(value => {
      const available = value >= data.period_start && value <= data.period_end;
      const planned = data.days.find(item => item.date === value)?.planned ?? 0;
      return <button type="button" className={`day-button ${value === day ? 'selected' : ''}`} key={value} disabled={!available || disabled} aria-pressed={value === day} aria-label={displayDate(value, { day: 'numeric', month: 'long', weekday: 'long' })} onClick={() => onChange(value)}><span>{displayDate(value, { weekday: 'short' })}</span><strong>{asDate(value).getDate()}</strong><span className={`day-dot ${planned ? 'has-work' : ''}`} aria-hidden="true" /></button>;
    })}</div>
    <button className="icon-button week-arrow" type="button" aria-label="Следующая неделя" disabled={disabled || days[6] >= data.period_end} onClick={() => move(7)}><ChevronRight size={18} /></button>
  </div>;
}

function WorkRow({ group }: { group: WorkGroup }) {
  const allMarks = group.with_marks === group.planned;
  return <li className="work-row">
    <div className="work-time"><time>{group.start}</time><span>{group.end}{group.ends_next_day && <small title="Следующий день"> +1 день</small>}</span></div>
    <div className="work-description"><h3>{roleNames[group.role] ?? group.role}</h3><p>{group.planned} {group.planned === 1 ? 'смена в плане' : group.planned < 5 ? 'смены в плане' : 'смен в плане'}</p></div>
    <div className={`work-status ${allMarks ? 'complete' : 'incomplete'}`}>{allMarks ? <Check size={15} aria-hidden="true" /> : <Clock3 size={15} aria-hidden="true" />}<span>Отметки {group.with_marks}/{group.planned}</span></div>
  </li>;
}

export function OverviewPage() {
  const [day, setDay] = useState<string>();
  const [expanded, setExpanded] = useState(false);
  const { data, loading, error, retry } = useOverview(day);
  const selectedDay = day ?? data?.selected_date ?? '';
  const selectDay = (value: string) => { setDay(value); setExpanded(false); };
  const currentDay = data?.days.find(item => item.date === selectedDay);
  const missing = data ? data.planned_shifts - data.shifts_with_marks : 0;

  return <CabinetLayout organization={data?.organization}>
    {!data ? (error ? <ErrorMessage message={error} retry={retry} /> : <Loading />) : <>
      <section className="page-heading" id="overview" tabIndex={-1} aria-labelledby="page-title">
        <div><h1 id="page-title">Обзор кабинета</h1><p className="organization-mobile">{data.organization}</p><p>Объекты, планы и результаты работ — в одном месте.</p></div>
        <div className="period-label"><CalendarDays size={18} aria-hidden="true" /><span>{displayDate(data.period_start, { month: 'long', year: 'numeric' }).replace(' г.', '')}<small>Архивный период</small></span></div>
      </section>

      <section className="summary-strip" aria-label="Сводка за месяц">
        <div className="summary-item"><span>Объект на обслуживании</span><strong>{data.objects.length}</strong><a href="#objects">Посмотреть объект <ArrowRight size={14} aria-hidden="true" /></a></div>
        <div className="summary-item"><span>Общая площадь</span><strong>{number.format(data.total_area_sqm)} <small>м²</small></strong><span className="summary-note">По данным портфеля</span></div>
        <div className="summary-item"><span>Смены за месяц</span><strong>{number.format(data.planned_shifts)}</strong><span className="summary-note">По плану работ</span></div>
        <div className="summary-item"><span>Есть отметки прихода и ухода</span><strong>{number.format(data.shifts_with_marks)} <small>/ {data.planned_shifts}</small></strong><span className="summary-note amber-text">{missing} смены требуют сверки</span></div>
      </section>

      <div className="content-grid">
        <section className="panel schedule-panel" id="schedule" tabIndex={-1} aria-labelledby="schedule-title">
          <div className="panel-heading"><div><h2 id="schedule-title">План работ</h2><p>{data.objects.map(object => `${object.name} · ${object.city}`).join('; ')}</p></div><label className="date-control"><span className="sr-only">Дата работ</span><input aria-label="Дата работ" type="date" value={selectedDay} min={data.period_start} max={data.period_end} disabled={loading} onChange={event => { if (event.target.value && event.target.validity.valid) selectDay(event.target.value); }} /></label></div>
          <WeekPicker data={data} day={selectedDay} onChange={selectDay} disabled={loading} />
          <div className="daily-heading"><h3>{displayDate(selectedDay, { day: 'numeric', month: 'long', weekday: 'long' })}</h3><span>{loading ? 'Загрузка…' : `${currentDay?.planned ?? 0} смен в плане`}</span></div>
          <div aria-busy={loading} aria-live="polite">
            {error ? <ErrorMessage message={error} retry={retry} /> : loading ? <div className="schedule-loading" role="status"><div className="skeleton" /><div className="skeleton" /><div className="skeleton" /><span className="sr-only">Загружаем план на выбранный день</span></div> : data.work_groups.length ? <>
              <ul className="work-list">{(expanded ? data.work_groups : data.work_groups.slice(0, 5)).map((group, index) => <WorkRow key={`${group.role}-${group.start}-${index}`} group={group} />)}</ul>
              {data.work_groups.length > 5 && <button className="expand-button" type="button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? 'Свернуть список' : `Показать все работы (${data.work_groups.length})`}<ChevronDown size={16} className={expanded ? 'rotate' : ''} aria-hidden="true" /></button>}
            </> : <div className="empty-state"><CalendarDays size={28} aria-hidden="true" /><h3>На этот день работ нет</h3><p>Выберите другую дату в плане.</p></div>}
          </div>
          <div className="schedule-note"><Info size={16} aria-hidden="true" /><p>Отметки показывают зафиксированные приход и уход. Приёмка работ и фотоотчёты учитываются отдельно.</p></div>
        </section>

        <div className="right-column">
          <section className="panel object-panel" id="objects" tabIndex={-1} aria-labelledby="objects-title">
            <div className="panel-heading"><h2 id="objects-title">Мой объект</h2><Building2 size={20} aria-hidden="true" /></div>
            {data.objects.map(object => <div className="object-content" key={object.id}>
              <div className="object-location"><MapPin size={14} aria-hidden="true" />{object.city}</div>
              <h3>{object.name}</h3><p>{object.scope}</p>
              <dl className="object-facts"><div><dt>Площадь</dt><dd>{number.format(object.area_sqm)} м²</dd></div><div><dt>Договор</dt><dd>{object.contract_number}</dd></div><div><dt>Статус в портфеле</dt><dd><span className="status-badge"><span aria-hidden="true" />{object.contract_status}</span></dd></div></dl>
              <a className="object-link" href="#schedule">Перейти к плану работ <ArrowRight size={16} aria-hidden="true" /></a>
            </div>)}
          </section>
          <section className="upcoming-panel" aria-labelledby="upcoming-title"><div className="section-icon"><CalendarDays size={20} aria-hidden="true" /></div><h2 id="upcoming-title">Ближайшие работы</h2><p>В кабинете доступен архив за сентябрь. Новый план появится после публикации менеджером.</p><a href="#schedule">Посмотреть архив <ArrowDown size={14} aria-hidden="true" /></a></section>
        </div>
      </div>

      <section className="documents-section" id="documents" tabIndex={-1} aria-labelledby="documents-title">
        <div className="documents-intro"><FileText size={23} aria-hidden="true" /><div><h2 id="documents-title">Документы и фотоотчёты</h2><p>Здесь будут документы по вашему договору.</p></div></div>
        <div className="document-state"><span className="document-icon"><FileText size={20} aria-hidden="true" /></span><div><h3>Договор и приложения</h3><p>Оформленный документ ещё не опубликован в кабинете.</p></div></div>
        <div className="document-state"><span className="document-icon"><ClipboardList size={20} aria-hidden="true" /></span><div><h3>Акты и фотоотчёты</h3><p>В исходных таблицах нет файлов АВР и фотографий.</p></div></div>
      </section>

      <details className="data-details"><summary><CircleHelp size={16} aria-hidden="true" />О данных демонстрации<ChevronDown size={15} className="details-chevron" aria-hidden="true" /></summary><div className="data-details-content"><p>Показаны данные клиента ТОО «Медеу Девелопмент» из пакета хакатона за сентябрь 2026 года. Это архив, а не текущий ход уборки. Статус договора взят из портфеля и сам по себе не подтверждает подписание.</p><p>В таблице факта есть отметка о фото чек-листа, но самих снимков нет. Отсутствующая отметка времени требует сверки и не означает доказанный невыход.</p><ul>{data.sources.map(source => <li key={`${source.file}-${source.sheet}`}><strong>{source.purpose}</strong><span>{source.file} · {source.sheet}, строки: {source.rows}</span></li>)}</ul></div></details>
    </>}
  </CabinetLayout>;
}
