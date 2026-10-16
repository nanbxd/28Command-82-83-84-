import { demoData } from './demo';
import type { AdminData, Complaint, ComplaintStatus, RequestStatus } from './types';

const STORAGE_KEY = 'ic-group.admin-demo.v1';
const requestStatuses: RequestStatus[] = ['new', 'review', 'contacted'];
const complaintStatuses: ComplaintStatus[] = ['open', 'review', 'correction', 'closed'];

/** Temporary local adapter. Replace with authenticated FastAPI calls when
 * intake and role-based sessions are connected; never store real client data here. */
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
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      version: 1,
      requests: Object.fromEntries(data.requests.map(request => [request.id, request.status])),
      complaints: Object.fromEntries(data.complaints.map(complaint => [complaint.id, { status: complaint.status, forwardedTo: complaint.forwardedTo, events: complaint.events }])),
    }));
    return true;
  } catch { return false; }
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
