import { useState } from 'react';
import { Camera, Check, ChevronDown, Clock3, Download, FileText, Minus } from 'lucide-react';
import checklist from './checklist.json';
import { Badge, Fact, Facts, formatDate, money, number, Section } from './components';
import { downloadCsv } from './service';
import type { Project } from './types';

export function ProjectDetail({ project }: { project: Project }) {
  const [section, setSection] = useState<'report' | 'agreement' | 'documents'>('report');
  const basicRows = checklist.rows.filter(row => row.kind === 'базовая');
  const checked = basicRows.filter(row => project.report.checked.includes(row.sourceRow)).length;
  const exportReport = () => downloadCsv(`${project.id}-report.csv`, [
    ['ДЕМОНСТРАЦИОННЫЙ ОТЧЁТ', project.name, project.report.date],
    ['Участок', 'Вид уборки', 'Работников', 'Норма, мин', 'Человеко-минут', 'Состав работ', 'Отметка', 'Строка источника'],
    ...checklist.rows.map(row => [row.zone, row.kind, row.workers, row.minutes, row.personMinutes, row.tasks.join('; '), row.kind !== 'базовая' ? 'По отдельному графику' : project.report.checked.includes(row.sourceRow) ? 'Отмечено исполнителем (демо)' : 'Нет отметки', row.sourceRow]),
    ['Источник структуры', checklist.source, checklist.sheet],
    ['Фото до/после', 'Не загружены'], ['Приёмка', 'Не подтверждена'],
  ]);
  return <>
    <div className="ad-detail-meta"><Badge tone={project.status === 'attention' ? 'amber' : 'green'}>{project.status === 'attention' ? 'Есть замечания' : 'В работе'}</Badge><span>{project.city} · {number.format(project.area)} м²</span></div>
    <nav className="ad-detail-nav" aria-label="Разделы проекта">{([['report', 'Отчёт о работах'], ['agreement', 'Смета и условия'], ['documents', 'Документы']] as const).map(([id, label]) => <button key={id} aria-pressed={section === id} onClick={() => setSection(id)}>{label}</button>)}</nav>
    {section === 'report' && <>
      <Section title="Отчёт за смену"><div className="ad-report-summary"><div><span>Дата работ</span><strong>{formatDate(project.report.date)}</strong></div><div><span>Начало / окончание</span><strong>{project.report.start} — {project.report.end ?? 'нет отметки'}</strong></div><div><span>Участков отмечено</span><strong>{checked}<small> / {basicRows.length}</small></strong></div></div><p className="ad-footnote">{project.report.note}</p></Section>
      <Section title="Чек-лист уборки"><p className="ad-muted ad-section-note">Отметки исполнителя показывают ход работ. Приёмка менеджером учитывается отдельно.</p>
        <div className="ad-checklist">{checklist.rows.map(row => {
          const completed = project.report.checked.includes(row.sourceRow) && row.kind === 'базовая';
          return <details key={row.sourceRow} className={completed ? 'ad-check-done' : ''}><summary><span className="ad-check-icon">{completed ? <Check size={14} /> : <Minus size={14} />}</span><span><strong>{row.zone}</strong><small>{row.kind === 'генеральная' ? 'По отдельному графику · ' : ''}{row.workers} работн. · {row.minutes} мин · {row.personMinutes} чел.-мин</small></span><ChevronDown size={16} aria-hidden="true" /></summary><div className="ad-check-content"><ul>{row.tasks.map(task => <li key={task}>{task}</li>)}</ul><p>Частота: {row.frequency}. Строка {row.sourceRow} источника.</p><p>{completed ? 'Отмечено исполнителем (демо)' : row.kind === 'генеральная' ? 'Не входит в текущую базовую смену' : 'Отметка ещё не получена'}</p></div></details>;
        })}</div>
        <div className="ad-checklist-total"><span>Базовые работы: <strong>{checklist.basicPersonMinutes} чел.-мин</strong></span><span>Доступно в примере: <strong>{checklist.availablePersonMinutes} чел.-мин</strong></span></div>
      </Section>
      <Section title="Фотоотчёт"><div className="ad-photo-grid">{['До уборки', 'После уборки'].map(label => <div key={label}><Camera size={25} aria-hidden="true" /><strong>{label}</strong><span>Фото ещё не загружено</span></div>)}</div></Section>
      <button className="ad-button" onClick={exportReport}><Download size={17} />Скачать отчёт CSV</button>
      <details className="ad-source"><summary>Источник чек-листа <ChevronDown size={14} /></summary><p>{checklist.source}, лист «{checklist.sheet}», строки 5–14. Состав работ перенесён из файла. Для остальных демонстрационных объектов использован тот же пример; фактический чек-лист согласуется по каждому договору. Статусы выполнения — тестовые.</p></details>
    </>}
    {section === 'agreement' && <>
      <div className="ad-info-note">Демонстрационные условия. Они показывают состав будущей сметы и не являются согласованными обязательствами.</div>
      <Section title="Смета IC Line — субподрядчик"><Facts><Fact label="Субподрядчик">{project.subcontractor}</Fact><Fact label="Смета и версия">{project.estimateVersion}</Fact><Fact label="Клиентский договор">{project.contract}</Fact><Fact label="Период услуг">{project.period}</Fact><Fact label="Объект">{project.name}</Fact><Fact label="Площадь">{number.format(project.area)} м²</Fact></Facts></Section>
      <Section title="Время и объём работ"><Facts><Fact label="График">{project.schedule}</Fact><Fact label="Объём за базовую смену">2 × 3 часа = 6 человеко-часов</Fact><Fact label="Состав работ">Базовая уборка по чек-листу; генеральная — 1 раз в месяц по согласованию</Fact><Fact label="Требования к качеству">Чек-лист по участкам, фото до/после, устранение замечаний по решению IC Group</Fact></Facts></Section>
      <Section title="Оборудование и материалы"><div className="ad-supplies">{project.supplies.map(item => <div key={item.name}><span><strong>{item.name}</strong><small>{item.quantity}</small></span><span>{item.owner}</span></div>)}</div></Section>
      <Section title="Расчёты с субподрядчиком"><Facts><Fact label="Стоимость в месяц">{money(project.estimateAmount)}</Fact><Fact label="НДС в примере">Без НДС; применимость уточняется в смете</Fact><Fact label="Условия оплаты">{project.paymentTerms}</Fact></Facts></Section>
      <Section title="История версий"><div className="ad-document-row"><Clock3 size={20} /><div><strong>Версия 1 · 01 октября 2026</strong><p>Черновик демонстрационной сметы. Согласование сторон не зафиксировано.</p></div></div></Section>
    </>}
    {section === 'documents' && <>
      <Section title="Клиентский договор"><Facts><Fact label="Номер">{project.contract}</Fact><Fact label="Клиент">{project.company}</Fact><Fact label="Период услуг">{project.period}</Fact><Fact label="План работ">{project.schedule}</Fact></Facts><div className="ad-document-row"><FileText size={22} /><div><strong>Файл договора не опубликован</strong><p>После оформления менеджером здесь появятся договор и приложения. Подписание учитывается отдельно.</p></div></div></Section>
      <Section title="Закрытие месяца и выплаты"><div className="ad-document-row"><FileText size={22} /><div><strong>АВР за октябрь ещё не сформирован</strong><p>Акт составляется по подтверждённым объёмам и условиям договора.</p></div></div><Facts><Fact label="Акт субподрядчика">Не подготовлен</Fact><Fact label="Начисления">Не рассчитаны</Fact><Fact label="Выплата">Не отправлена</Fact></Facts><p className="ad-footnote">Формирование акта само по себе не подтверждает оплату.</p></Section>
    </>}
  </>;
}
