export type AdminTab = 'requests' | 'projects' | 'complaints';
import type { RequestRecord } from '../request/types';

export type RequestStatus = 'new' | 'review' | 'contacted' | 'closed';
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
  estimate: { net: number; vat: number; total: number; version: string; period: string } | null;
  source?: RequestRecord;
}
