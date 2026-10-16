import { demoData } from './demo';
import { api } from '../../lib/api';
import { generalOptions, week, type RequestRecord } from '../request/types';
import type { AdminData, ClientRequest, Complaint, ComplaintStatus, RequestStatus } from './types';

const STORAGE_KEY = 'ic-group.admin-demo.v1';
const requestStatuses: RequestStatus[] = ['new', 'review', 'contacted', 'closed'];
const complaintStatuses: ComplaintStatus[] = ['open', 'review', 'correction', 'closed'];

/** Isolated fictional demo. Never persist real client data in this adapter. */
export async function loadAdminDemo(signal: AbortSignal): Promise<AdminData> {
  const data: AdminData = structuredClone(demoData);
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (stored?.version !== 1) return data;
    data.requests.forEach(request => {
      const status = stored.requests?.[request.id];
      if (requestStatuses.includes(status)) request.status = status;
    });
    data.complaints.forEach(complaint => {
      const saved = stored.complaints?.[complaint.id];
      if (!saved || !complaintStatuses.includes(saved.status) || !Array.isArray(saved.events)) return;
      if (saved.forwardedTo !== null && typeof saved.forwardedTo !== 'string') return;
      if (!saved.events.every((event: Complaint['events'][number]) => event && typeof event.text === 'string' && typeof event.at === 'string' && !Number.isNaN(Date.parse(event.at)) && ['received', 'status', 'forwarded', 'reply'].includes(event.kind))) return;
      complaint.status = saved.status;
      complaint.forwardedTo = saved.forwardedTo;
      complaint.events = saved.events;
    });
  } catch { /* Missing, unavailable or malformed storage starts a fresh demo. */ }
  return data;
}

export function saveAdminDemo(data: AdminData): boolean {
  if (data.requests.some(request => request.source)) throw new Error('Live requests cannot be written to demo storage');
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      version: 1,
      requests: Object.fromEntries(data.requests.map(request => [request.id, request.status])),
      complaints: Object.fromEntries(data.complaints.map(complaint => [complaint.id, { status: complaint.status, forwardedTo: complaint.forwardedTo, events: complaint.events }])),
    }));
    return true;
  } catch { return false; }
}

function fromServer(record: RequestRecord): ClientRequest {
  const statuses: Record<string, RequestStatus> = { new: 'new', in_review: 'review', contacted: 'contacted', closed: 'closed' };
  if (!statuses[record.status]) throw new Error('Неизвестный статус заявки');
  const { payload, contact } = record;
  const days = (values: number[]) => values.map(day => week[day - 1]).join(', ');
  return {
    id: record.id, company: contact.company, contact: contact.name, email: contact.email, phone: contact.phone,
    city: [...new Set(payload.objects.map(object => object.city))].join(', '),
    segment: [...new Set(payload.objects.map(object => object.segment))].join(', '),
    createdAt: record.created_at, status: statuses[record.status],
    initials: contact.company.split(/\s+/).map(word => Array.from(word)[0]).slice(0, 2).join('').toUpperCase(), tone: 'green',
    objects: payload.objects.map(object => ({
      name: object.name, address: `${object.city}, ${object.address}`, area: object.area_sqm,
      days: days(object.base_schedule.days), hours: `С ${object.base_schedule.start_time}, ${object.base_schedule.duration_hours} ч`,
      bathrooms: object.bathrooms,
      supporting: object.support_positions.map(position => `${position.role} × ${position.count} · ${days(position.schedule.days)} · с ${position.schedule.start_time}, ${position.schedule.duration_hours} ч`).join('; ') || 'Не требуется',
    })),
    hygiene: payload.objects.some(object => object.hygiene_materials),
    generalCleaning: payload.objects.map(object => `${object.name}: ${generalOptions.find(option => option.value === object.general_cleaning)?.label || object.general_cleaning}`).join('; '),
    budget: payload.monthly_budget, wishes: payload.objects.filter(object => object.notes).map(object => `${object.name}: ${object.notes}`).join('\n') || 'Не указаны',
    estimate: null, source: record,
  };
}

export async function loadStaffRequests(offset = 0, signal?: AbortSignal) {
  const records = await api<RequestRecord[]>(`/staff/requests?offset=${offset}`, { signal });
  return { requests: records.map(fromServer), more: records.length === 50 };
}

export async function saveRequestStatus(id: string, status: RequestStatus) {
  const record = await api<RequestRecord>(`/staff/requests/${encodeURIComponent(id)}`, {
    method: 'PATCH', body: JSON.stringify({ status: status === 'review' ? 'in_review' : status }),
  });
  return fromServer(record);
}

export function downloadCsv(name: string, rows: (string | number)[][]) {
  const csv = rows.map(row => row.map(cell => {
    const text = String(cell);
    const safe = /^[=+@\-\t\r]/.test(text) ? `'${text}` : text;
    return `"${safe.replaceAll('"', '""')}"`;
  }).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8;' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
