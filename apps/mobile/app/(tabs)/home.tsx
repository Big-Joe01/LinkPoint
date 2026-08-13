import { View, Text, ScrollView, Pressable } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useProperties } from '../../src/hooks/useProperties';
import { propertiesApi, type PropertyListItem } from '../../src/api/properties';
import { PropertyCard } from '../../src/components/PropertyCard';
import { Spinner, EmptyState, SectionHeader } from '../../src/components/states';

const CATEGORIES = [
  { label: 'Buy', purpose: 'SALE', icon: '🏷️' },
  { label: 'Rent', purpose: 'RENT', icon: '🔑' },
  { label: 'Lease', purpose: 'LEASE', icon: '📄' },
  { label: 'Land', type: 'LAND', icon: '🌍' },
  { label: 'Luxury', type: 'LUXURY', icon: '✨' },
  { label: 'Short Let', purpose: 'SHORT_LET', icon: '⚡' },
];

export default function HomeScreen() {
  const { data, isLoading, isError, refetch } = useProperties({ pageSize: 10 });
  const featured = useQuery({
    queryKey: ['properties', 'featured'],
    queryFn: () => propertiesApi.featured(),
  });

  return (
    <ScrollView className="flex-1 bg-[#F4F6FA]" showsVerticalScrollIndicator={false}>
      <View className="bg-brand px-4 pb-6 pt-4">
        <Text className="text-white text-2xl font-bold">LinkPoint</Text>
        <Text className="text-brand-50 text-sm">Your next property is just a tap away.</Text>
        <Pressable
          onPress={() => router.push('/explore')}
          className="bg-white rounded-xl px-4 py-3 mt-4 flex-row items-center"
        >
          <Text className="text-gray-400 text-sm">🔍 Search properties, locations…</Text>
        </Pressable>
      </View>

      <View className="flex-row flex-wrap px-4 mt-4 gap-2">
        {CATEGORIES.map((c) => (
          <Pressable
            key={c.label}
            onPress={() =>
              router.push({ pathname: '/explore', params: { purpose: c.purpose ?? '', propertyType: c.type ?? '' } })
            }
            className="bg-white rounded-2xl px-4 py-3 items-center mr-2 mb-2"
          >
            <Text className="text-xl">{c.icon}</Text>
            <Text className="text-xs font-semibold text-ink mt-1">{c.label}</Text>
          </Pressable>
        ))}
      </View>

      {featured.data && featured.data.items.length > 0 ? (
        <>
          <SectionHeader title="Featured Listings" />
          {featured.data.items.slice(0, 3).map((p: PropertyListItem) => (
            <PropertyCard key={p.id} property={p} />
          ))}
        </>
      ) : null}

      <SectionHeader title="Latest Properties" />
      {isLoading ? (
        <Spinner />
      ) : isError ? (
        <EmptyState title="Couldn't load properties" subtitle="Check your connection and try again." onAction={refetch} actionLabel="Retry" />
      ) : data && data.items.length > 0 ? (
        data.items.map((p: PropertyListItem) => <PropertyCard key={p.id} property={p} />)
      ) : (
        <EmptyState
          title="No properties available yet."
          subtitle="Be the first to list when properties go live on LinkPoint."
          icon="🏘️"
        />
      )}
    </ScrollView>
  );
}
