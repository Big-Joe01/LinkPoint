import { api } from '../lib/api';

export interface PropertyMedia {
  id: string;
  url: string;
  type: string;
}

export interface PropertyListItem {
  id: string;
  title: string;
  priceMajor: number;
  currency: string;
  city: string;
  state: string;
  propertyType: string;
  purpose: string;
  bedrooms: number | null;
  bathrooms: number | null;
  media: PropertyMedia[];
  featured: boolean;
  verification: string;
  approximateLatitude: number | null;
  approximateLongitude: number | null;
  completedInspectionCount: number;
}

export interface PropertyDetail extends PropertyListItem {
  description: string;
  country: string;
  area: string | null;
  landSize: number | null;
  buildingSize: number | null;
  amenities: string[];
  ownerName: string;
  status: string;
  videos: PropertyMedia[];
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasNext: boolean;
}

export interface SearchParams {
  city?: string;
  state?: string;
  propertyType?: string;
  purpose?: string;
  minPrice?: number;
  maxPrice?: number;
  bedrooms?: number;
  bathrooms?: number;
  verified?: boolean;
  featured?: boolean;
  page?: number;
  pageSize?: number;
}

export const propertiesApi = {
  list: (params: SearchParams = {}) =>
    api.get<Paginated<PropertyListItem>>('/properties', params as never),
  featured: () => api.get<Paginated<PropertyListItem>>('/properties', { featured: true, pageSize: 10 }),
  get: (id: string) => api.get<PropertyDetail>(`/properties/${id}`),
  toggleFavorite: (id: string) => api.post<{ saved: boolean }>(`/favorites/${id}/toggle`),
  myFavorites: () => api.get<Paginated<PropertyListItem>>('/favorites'),
  bookInspection: (input: { propertyId: string; preferredDate: string; preferredTime: string; notes?: string }) =>
    api.post<{ inspectionId: string; feeMajor: number; currency: string; status: string; breakdown: Record<string, number | string> }>(
      '/inspections/book',
      input,
    ),
};
