import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { propertiesApi, type SearchParams, type PropertyListItem } from '../api/properties';
import type { Paginated } from '../api/properties';

export function useProperties(params: SearchParams = {}) {
  return useQuery<Paginated<PropertyListItem>>({
    queryKey: ['properties', params],
    queryFn: () => propertiesApi.list(params),
  });
}

export function useProperty(id: string) {
  return useQuery({
    queryKey: ['property', id],
    queryFn: () => propertiesApi.get(id),
    enabled: !!id,
  });
}

export function useToggleFavorite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => propertiesApi.toggleFavorite(id),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: ['property', id] });
      qc.invalidateQueries({ queryKey: ['favorites'] });
    },
  });
}

export function useFavorites() {
  return useQuery<Paginated<PropertyListItem>>({
    queryKey: ['favorites'],
    queryFn: () => propertiesApi.myFavorites(),
  });
}
