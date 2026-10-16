import type { AdminData, ClientRequest, Project } from './types';

// Fictional intake, agreements and progress. Only the separately imported
// checklist structure comes from the participant workbook.
const request = (input: Pick<ClientRequest, 'id' | 'company' | 'contact' | 'city' | 'segment' | 'initials' | 'tone' | 'status' | 'createdAt'> & Partial<ClientRequest>): ClientRequest => ({
  phone: '+7 (000) 000-00-00',
  email: 'client@example.com',
  objects: [{ name: 'Главный офис', address: 'Демонстрационный адрес, 12', area: 1200, days: 'Пн–пт, 5 дней в неделю', hours: '07:00–10:00 · 3 часа', bathrooms: 4, supporting: '1 позиция · 12:00–16:00, пн–пт' }],
  hygiene: true,
  generalCleaning: '1 раз в месяц, дата по согласованию',
  budget: 650000,
  wishes: 'Основную уборку завершать до начала рабочего дня. Особое внимание входной группе и переговорным.',
  estimate: { net: 500000, vat: 80000, total: 580000, version: 'DEMO-01', period: '1 месяц' },
  ...input,
});

const project = (input: Pick<Project, 'id' | 'name' | 'company' | 'initials' | 'tone'> & Partial<Project>): Project => ({
  city: 'Алматы', address: 'Демонстрационный адрес, 24', area: 1420, segment: 'Ретейл',
  status: 'active', contract: 'DEMO-2026/018', period: '01.10.2026 — 31.12.2026',
  schedule: '08:00–11:00 · 2 работника · 5/2, выходные вт и чт',
  subcontractor: 'ТОО «Сервис Партнёр» (демо)', estimateVersion: 'СМ-DEMO-018 · версия 1 от 01.10.2026',
  estimateAmount: 420000, paymentTerms: 'Демонстрационное условие: в течение 10 рабочих дней после согласования акта.',
  supplies: [
    { name: 'Профессиональный пылесос', quantity: '1 шт.', owner: 'Субподрядчик' },
    { name: 'Уборочная тележка и инвентарь', quantity: '2 комплекта', owner: 'Субподрядчик' },
    { name: 'Моющие средства', quantity: '10 л / месяц', owner: 'IC Line' },
    { name: 'Гигиенические расходники', quantity: 'По согласованной потребности', owner: 'IC Line' },
  ],
  report: { date: '2026-10-16', start: '08:02', end: '11:04', checked: [5, 6, 7, 8, 9, 10, 11, 12, 13], note: 'Пример отчёта: базовая уборка завершена. Фото ещё не загружены; отчёт требует проверки менеджером.' },
  ...input,
});

export const demoData: AdminData = {
  requests: [
    request({ id: 'З-0008', company: 'ТОО «Орбита Бизнес»', contact: 'Менеджер объекта', city: 'Алматы', segment: 'Бизнес-центр', initials: 'ОБ', tone: 'green', status: 'new', createdAt: '2026-10-16T18:42:00+05:00' }),
    request({ id: 'З-0007', company: 'ТОО «Aspan Retail»', contact: 'Администратор магазина', city: 'Астана', segment: 'Ретейл', initials: 'AR', tone: 'blue', status: 'new', createdAt: '2026-10-16T18:18:00+05:00', objects: [
      { name: 'Магазин · первый этаж', address: 'Демонстрационный адрес, 8', area: 850, days: 'Ежедневно', hours: '08:00–10:00 · 2 часа', bathrooms: 2, supporting: 'Не требуется' },
      { name: 'Магазин · второй этаж', address: 'Демонстрационный адрес, 8', area: 420, days: 'Ежедневно', hours: '08:00–10:00 · 2 часа', bathrooms: 1, supporting: '1 позиция · 14:00–16:00' },
    ] }),
    request({ id: 'З-0006', company: 'БЦ «Альтаир»', contact: 'Управляющий БЦ', city: 'Алматы', segment: 'Бизнес-центр', initials: 'АЛ', tone: 'sand', status: 'review', createdAt: '2026-10-16T16:35:00+05:00', budget: null, objects: [{ name: 'БЦ «Альтаир»', address: 'Демонстрационный адрес, 32', area: 3600, days: 'Пн–сб', hours: '06:00–09:00 · 3 часа', bathrooms: 8, supporting: '2 позиции · 09:00–18:00' }] }),
    request({ id: 'З-0005', company: 'ТОО «Север Логистик»', contact: 'Руководитель площадки', city: 'Шымкент', segment: 'Склад', initials: 'СЛ', tone: 'purple', status: 'new', createdAt: '2026-10-16T14:10:00+05:00', hygiene: false, wishes: 'Нужна уборка административной зоны. Доступ на склад согласовать отдельно.', objects: [{ name: 'Складской комплекс', address: 'Демонстрационный адрес, 6', area: 4800, days: 'Пн–пт', hours: '18:00–22:00 · 4 часа', bathrooms: 3, supporting: 'Не требуется' }] }),
    request({ id: 'З-0004', company: 'ТОО «Меридиан»', contact: 'Офис-менеджер', city: 'Астана', segment: 'Офис', initials: 'МЕ', tone: 'blue', status: 'contacted', createdAt: '2026-10-16T11:25:00+05:00', objects: [{ name: 'Офис компании', address: 'Демонстрационный адрес, 19', area: 650, days: 'Пн–пт', hours: '07:00–09:00 · 2 часа', bathrooms: 2, supporting: 'Не требуется' }] }),
  ],
  projects: [
    project({ id: 'П-001', name: 'Магазин «Вента» · ТРЦ «Норд»', company: 'ТОО «Вента»', initials: 'ВЕ', tone: 'green', status: 'attention' }),
    project({ id: 'П-002', name: 'Магазин «Орбита»', company: 'ТОО «Орбита Ретейл»', initials: 'ОР', tone: 'blue', city: 'Астана', contract: 'DEMO-2026/019', report: { date: '2026-10-16', start: '08:00', end: '11:00', checked: [5, 6, 7, 8, 9, 10, 11, 12, 13], note: 'Демонстрационный отчёт отправлен менеджеру. Приёмка ещё не подтверждена.' } }),
    project({ id: 'П-003', name: 'Магазин «Меридиан»', company: 'ТОО «Меридиан Ретейл»', initials: 'МР', tone: 'sand', contract: 'DEMO-2026/020', report: { date: '2026-10-16', start: '08:05', end: null, checked: [5, 6, 7, 8, 9, 10], note: 'Пример неполного отчёта: не все участки отмечены, время окончания и фотографии отсутствуют.' } }),
  ],
  complaints: [
    { id: 'В-0004', projectId: 'П-001', company: 'ТОО «Вента»', subject: 'Разводы на стекле входной группы', message: 'После утренней уборки на входных дверях остались разводы. Просим повторно протереть стеклянные поверхности и проверить результат.', createdAt: '2026-10-16T16:15:00+05:00', priority: 'high', status: 'open', forwardedTo: null, events: [{ at: '2026-10-16T16:15:00+05:00', text: 'Обращение клиента поступило в IC Group.', kind: 'received' }] },
    { id: 'В-0003', projectId: 'П-003', company: 'ТОО «Меридиан Ретейл»', subject: 'Не пополнены расходные материалы', message: 'В санузле для персонала закончились мыло и бумажные полотенца. Просим проверить пополнение расходников по чек-листу.', createdAt: '2026-10-16T15:30:00+05:00', priority: 'normal', status: 'open', forwardedTo: null, events: [{ at: '2026-10-16T15:30:00+05:00', text: 'Обращение клиента поступило в IC Group.', kind: 'received' }] },
    { id: 'В-0002', projectId: 'П-002', company: 'ТОО «Орбита Ретейл»', subject: 'Уточнение времени уборки', message: 'Команда начала работу позже согласованного времени. Просим уточнить график на следующую неделю.', createdAt: '2026-10-16T15:20:00+05:00', priority: 'normal', status: 'review', forwardedTo: null, events: [{ at: '2026-10-16T15:20:00+05:00', text: 'Обращение клиента поступило в IC Group.', kind: 'received' }, { at: '2026-10-16T15:40:00+05:00', text: 'Менеджер взял обращение на рассмотрение.', kind: 'status' }] },
  ],
};
