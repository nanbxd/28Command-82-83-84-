export const objectTypes = [
  { value: 'office', label: 'Офис' }, { value: 'retail', label: 'Торговый объект' },
  { value: 'warehouse', label: 'Склад' }, { value: 'production', label: 'Производство' },
  { value: 'medical', label: 'Медицинский объект' }, { value: 'other', label: 'Другой объект' },
] as const;
export const generalOptions = [{ value: 'none', label: 'Не нужна' }, { value: 'once', label: 'Однократно' }, { value: 'monthly', label: 'Раз в месяц' }, { value: 'quarterly', label: 'Раз в квартал' }, { value: 'discuss', label: 'Обсудить с менеджером' }];
export const week = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
export type Schedule = { days: number[]; start_time: string; duration_hours: string };
export type FormObject = {
  key: string; object_type: string; segment: string; name: string; city: string; address: string; area_sqm: string;
  base_schedule: Schedule; support_positions: { key: string; role: string; count: string; schedule: Schedule }[];
  bathrooms: string; hygiene_materials: boolean; general_cleaning: string; notes: string;
};
export type Draft = { version: 1; key: string; step: number; objects: FormObject[]; monthly_budget: string; desired_start: string };
export const newSchedule = (): Schedule => ({ days: [], start_time: '', duration_hours: '' });
export const newObject = (): FormObject => ({ key: crypto.randomUUID(), object_type: '', segment: '', name: '', city: '', address: '', area_sqm: '', base_schedule: newSchedule(), support_positions: [], bathrooms: '', hygiene_materials: false, general_cleaning: 'none', notes: '' });
export const newDraft = (): Draft => ({ version: 1, key: crypto.randomUUID(), step: 0, objects: [newObject()], monthly_budget: '', desired_start: '' });
export const draftStorageKey = 'ic-request-draft-v1';
function validSchedule(s: Schedule) { return s && Array.isArray(s.days) && s.days.every(d => Number.isInteger(d) && d > 0 && d < 8) && typeof s.start_time === 'string' && typeof s.duration_hours === 'string'; }
export function readDraft(): Draft {
  try {
    const d = JSON.parse(localStorage.getItem(draftStorageKey) || 'null');
    if (d?.version === 1 && typeof d.key === 'string' && [0, 1, 2].includes(d.step) && typeof d.monthly_budget === 'string' && typeof d.desired_start === 'string' && Array.isArray(d.objects) && d.objects.length > 0 && d.objects.length <= 20 && d.objects.every((o: FormObject) => o && ['key', 'object_type', 'segment', 'name', 'city', 'address', 'area_sqm', 'bathrooms', 'general_cleaning', 'notes'].every(k => typeof o[k as keyof FormObject] === 'string') && typeof o.hygiene_materials === 'boolean' && validSchedule(o.base_schedule) && Array.isArray(o.support_positions) && o.support_positions.every(p => typeof p.role === 'string' && typeof p.count === 'string' && typeof p.key === 'string' && validSchedule(p.schedule)))) return d;
  } catch { /* Invalid or unavailable storage starts a clean form. */ }
  return newDraft();
}
export function payload(draft: Draft) {
  const schedule = (s: Schedule) => ({ ...s, duration_hours: Number(s.duration_hours) });
  return { objects: draft.objects.map(({ key: _key, ...o }) => ({ ...o, area_sqm: Number(o.area_sqm), bathrooms: Number(o.bathrooms), base_schedule: schedule(o.base_schedule), support_positions: o.support_positions.map(({ key: _k, ...p }) => ({ ...p, count: Number(p.count), schedule: schedule(p.schedule) })) })), monthly_budget: draft.monthly_budget ? Number(draft.monthly_budget) : null, desired_start: draft.desired_start || null };
}
export type RequestRecord = { id: string; status: string; created_at: string; payload: ReturnType<typeof payload>; contact: { name: string; company: string; phone: string; email: string }; history: { status: string; at: string }[] };
export const statusLabels: Record<string, string> = { new: 'Новая заявка', in_review: 'На рассмотрении', contacted: 'Менеджер связался', closed: 'Закрыта' };
