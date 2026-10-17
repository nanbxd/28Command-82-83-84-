import type { RequestRecord } from '../request/types';
export type HistoryEvent = { at: string; actor: string; action: string; text: string; status?: string; forwarded_to?: string | null };
export type Project = {
  is_blocked: boolean; blocking_history: HistoryEvent[];
  contractor_id: string | null; contractor_name: string | null;
  id: string; request_id: string; name: string; company: string;
  details: RequestRecord['payload']['objects'][number]; status: string; plan: string;
  contract_number?: string; contract_start?: string | null; contract_end?: string | null;
  service_start: string | null; service_end: string | null; price?: string | null; payment_terms?: string;
  last_cleaning: string | null; next_cleaning: string | null; cleaning_now: boolean;
};
export type Visit = {
  run_id: string | null; zone: string;
  id: string; project_id: string; worker_id: string; worker_name: string;
  planned_start: string; planned_end: string; actual_start: string | null; actual_end: string | null;
  status: string; checklist: { text: string; done: boolean }[]; notes: string; history: HistoryEvent[];
};
export type ServiceFile = { id: string; project_id: string; visit_id: string | null; complaint_id: string | null;
  kind: string; name: string; size: number; uploaded_at: string; content_type: string; period: string; state: string; history: HistoryEvent[] };
export type ProjectDetail = Project & { runs: { id: string; name: string; completed_at: string | null; cancelled_at: string | null }[]; visits: Visit[]; files: ServiceFile[] };
export type Account = { id: string; name: string; email: string; phone: string; company: string; role: string; is_active: boolean };
export type Complaint = { id: string; project_id: string; project_name: string; company: string; subject: string; message: string;
  status: string; forwarded_to: string | null; history: HistoryEvent[]; created_at: string };
export const projectLabels: Record<string, string> = { preparation: 'Подготовка', active: 'Обслуживается', paused: 'Приостановлен', completed: 'Завершён' };
export const visitLabels: Record<string, string> = { planned: 'Запланирована', in_progress: 'Идёт уборка', submitted: 'Отчёт на проверке', accepted: 'Отчёт принят', correction: 'Нужны исправления', cancelled: 'Отменена' };
export const complaintLabels: Record<string, string> = { open: 'Новое', review: 'На рассмотрении', correction: 'Устраняем замечания', closed: 'Закрыто' };
export const fileLabels: Record<string, string> = { before: 'До уборки', after: 'После уборки', contract: 'Договор', attachment: 'Приложение', avr: 'АВР', complaint: 'Фото к обращению' };
export const documentLabels: Record<string, string> = { uploaded: 'Загружен', signed: 'Подписание подтверждено', accepted: 'Принят', rejected: 'Отклонён' };
export function time(value: string | null | undefined) {
  return value ? new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Qyzylorda' }).format(new Date(value)) : 'Ещё нет';
}
export function date(value: string | null | undefined) { return value ? new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium' }).format(new Date(`${value}T12:00:00`)) : 'Не указан'; }
