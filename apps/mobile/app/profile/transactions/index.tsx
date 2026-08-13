import { FlatList, View, Text, RefreshControl } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../../src/lib/api';
import { Spinner, EmptyState } from '../../../src/components/states';

interface Transaction {
  id: string;
  status: string;
  amountMajor: number;
  currency: string;
  createdAt: string;
  property: { title: string };
}

const STATUS_COLOR: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-700',
  IN_ESCROW: 'bg-blue-100 text-blue-700',
  COMPLETED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-red-100 text-red-700',
};

export default function TransactionsScreen() {
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['transactions'],
    queryFn: () => api.get<{ items: Transaction[] }>('/transactions'),
  });

  return (
    <View className="flex-1 bg-[#F4F6FA]">
      <FlatList
        data={data?.items ?? []}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor="#0D77F8" />}
        ListEmptyComponent={
          isLoading ? <Spinner /> : (
            <EmptyState
              title="No transactions yet."
              subtitle="Your property transactions will appear here once you start a deal."
              icon="📊"
            />
          )
        }
        renderItem={({ item }) => (
          <View className="mx-4 mb-3 bg-white rounded-2xl p-4">
            <View className="flex-row items-center justify-between">
              <Text className="text-sm font-semibold text-ink flex-1" numberOfLines={1}>
                {item.property?.title ?? 'Transaction'}
              </Text>
              <View className={`px-2 py-0.5 rounded-full ${STATUS_COLOR[item.status] ?? 'bg-gray-100 text-gray-700'}`}>
                <Text className="text-xs font-semibold">{item.status}</Text>
              </View>
            </View>
            <View className="flex-row justify-between items-center mt-2">
              <Text className="text-lg font-bold text-brand">₦{item.amountMajor.toLocaleString()}</Text>
              <Text className="text-xs text-gray-400">{new Date(item.createdAt).toLocaleDateString()}</Text>
            </View>
          </View>
        )}
      />
    </View>
  );
}
