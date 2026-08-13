import { FlatList, View, Text, Pressable, RefreshControl } from 'react-native';
import { router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { inspectionsApi } from '../../src/api/inspections';
import { Spinner, EmptyState, ErrorState } from '../../src/components/states';

const STATUS_COLOR: Record<string, string> = {
  SEARCHING: 'bg-amber-100 text-amber-700',
  ASSIGNED: 'bg-blue-100 text-blue-700',
  ACCEPTED: 'bg-indigo-100 text-indigo-700',
  SCHEDULED: 'bg-purple-100 text-purple-700',
  COMPLETED: 'bg-green-100 text-green-700',
};

export default function InspectionsScreen() {
  const qc = useQueryClient();
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['inspections'],
    queryFn: () => inspectionsApi.mine(),
  });

  return (
    <View className="flex-1 bg-[#F4F6FA]">
      <FlatList
        data={data?.items ?? []}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor="#0D77F8" />}
        ListEmptyComponent={
          isLoading ? (
            <Spinner />
          ) : isError ? (
            <ErrorState message="Couldn't load inspections" onRetry={refetch} />
          ) : (
            <EmptyState
              title="You don't have any upcoming inspections."
              subtitle="Browse properties and book an inspection to get started."
              icon="🔑"
              actionLabel="Browse properties"
              onAction={() => router.push('/(tabs)/explore')}
            />
          )
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push(`/inspections/${item.id}`)}
            className="mx-4 mb-3 bg-white rounded-2xl p-4 active:opacity-90"
          >
            <View className="flex-row items-center justify-between">
              <Text className="text-sm font-semibold text-ink flex-1" numberOfLines={1}>
                {item.property.title}
              </Text>
              <View className={`px-2 py-0.5 rounded-full ${STATUS_COLOR[item.status] ?? 'bg-gray-100 text-gray-700'}`}>
                <Text className="text-xs font-semibold">{item.status}</Text>
              </View>
            </View>
            <Text className="text-xs text-gray-500 mt-1">
              📍 {item.property.city}, {item.property.state}
            </Text>
            <View className="flex-row justify-between items-center mt-2">
              <Text className="text-sm font-bold text-brand">₦{item.feeMajor.toLocaleString()}</Text>
              <Text className="text-xs text-gray-400">
                {new Date(item.preferredDate).toLocaleDateString()} · {item.preferredTime}
              </Text>
            </View>
            {item.agent ? (
              <Text className="text-xs text-gray-500 mt-1">Agent: {item.agent.user.name}</Text>
            ) : (
              <Text className="text-xs text-amber-600 mt-1">Searching for an agent…</Text>
            )}
          </Pressable>
        )}
      />
    </View>
  );
}
