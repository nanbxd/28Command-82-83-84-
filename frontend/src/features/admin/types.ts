export type AdminTab = 'requests' | 'projects' | 'complaints';
export type RequestStatus = 'new' | 'review' | 'contacted';
export type ComplaintStatus = 'open' | 'review' | 'correction' | 'closed';

export interface RequestObject {
  name: string;
  address: string;
  area: number;
  days: string;
  hours: string;
  bathrooms: number;
  supporting: string;
}

export interface ClientRequest {
  id: string;
  company: string;
  contact: string;
  phone: string;
  email: string;
  city: string;
  segment: string;
  createdAt: string;
  status: RequestStatus;
  initials: string;
  tone: 'green' | 'blue' | 'sand' | 'purple';
  objects: RequestObject[];
  hygiene: boolean;
  generalCleaning: string;
  budget: number | null;
  wishes: string;
  estimate: { net: number; vat: number; total: number; version: string; period: string };
}

export interface ChecklistRow {
  zone: string;
  kind: string;
  workers: number;
  minutes: number;
  tasks: string[];
  frequency: string;
  personMinutes: number;
  sourceRow: number;
}

export interface Project {
  id: string;
  name: string;
  company: string;
  city: string;
  address: string;
  area: number;
  segment: string;
  initials: string;
  tone: ClientRequest['tone'];
  status: 'active' | 'attention';
  contract: string;
  period: string;
  schedule: string;
  subcontractor: string;
  estimateVersion: string;
  estimateAmount: number;
  paymentTerms: string;
  supplies: { name: string; quantity: string; owner: string }[];
  report: { date: string; start: string; end: string | null; checked: number[]; note: string };
}

export interface ComplaintEvent {
  at: string;
  text: string;
  kind: 'received' | 'status' | 'forwarded' | 'reply';
}

export interface Complaint {
  id: string;
  projectId: string;
  company: string;
  subject: string;
  message: string;
  createdAt: string;
  priority: 'normal' | 'high';
  status: ComplaintStatus;
  forwardedTo: string | null;
  events: ComplaintEvent[];
}

export interface AdminData {
  requests: ClientRequest[];
  projects: Project[];
  complaints: Complaint[];
}
