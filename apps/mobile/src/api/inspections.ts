import { api } from '../lib/api';
import type { Paginated } from './wallet';

export interface Inspection {
  id: string;
  status: string;
  feeMajor: number;
  currency: string;
  preferredDate: string;
  preferredTime: string;
  property: { title: string; city: string; state: string; status: string };
  agent: { user: { name: string } } | null;
}

export const inspectionsApi = {
  mine: (page = 1) => api.get<Paginated<Inspection>>('/inspections', { page, pageSize: 20 }),
  get: (id: string) => api.get<Inspection>(`/inspections/${id}`),
  confirm: (id: string) => api.post<{ message: string }>(`/inspections/${id}/confirm`),
};
