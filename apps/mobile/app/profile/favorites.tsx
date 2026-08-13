import { FlatList, RefreshControl } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useFavorites } from '../../src/hooks/useProperties';
import { PropertyCard } from '../../src/components/PropertyCard';
import { Spinner, EmptyState } from '../../src/components/states';
import { router } from 'expo-router';
import { View } from 'react-native';

export default function FavoritesScreen() {
  const { data, isLoading, isFetching, refetch } = useFavorites();

  return (
    <View className="flex-1 bg-[#F4F6FA]">
      <FlatList
        data={data?.items ?? []}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor="#0D77F8" />}
        ListEmptyComponent={
          isLoading ? <Spinner /> : (
            <EmptyState
              title="No saved properties."
              subtitle="Tap the heart on any property to save it here."
              icon="❤️"
              actionLabel="Browse properties"
              onAction={() => router.push('/(tabs)/explore')}
            />
          )
        }
        renderItem={({ item }: { item: import('../../src/api/properties').PropertyListItem }) => (
          <PropertyCard property={item} />
        )}
      />
    </View>
  );
}
