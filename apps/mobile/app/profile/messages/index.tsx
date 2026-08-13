import { FlatList, View, Text, Pressable, RefreshControl } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../../src/lib/api';
import { Spinner, EmptyState } from '../../../src/components/states';

interface Conversation {
  id: string;
  updatedAt: string;
  participants: { userId: string; user: { id: string; name: string; profileImage: string | null } }[];
  messages: { id: string; body: string; createdAt: string }[];
}

export default function MessagesScreen() {
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['conversations'],
    queryFn: () => api.get<{ items: Conversation[] }>('/messages/conversations'),
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
              title="No messages yet."
              subtitle="Start a conversation from a property or inspection."
              icon="💬"
            />
          )
        }
        renderItem={({ item }) => {
          const other = item.participants.find((p: Conversation['participants'][number]) => p.user.id !== '')?.user;
          const last = item.messages?.[0];
          return (
            <Pressable
              onPress={() => router.push(`/profile/messages/${item.id}`)}
              className="mx-4 mb-2 bg-white rounded-xl p-4 active:opacity-90"
            >
              <View className="flex-row items-center">
                <View className="w-10 h-10 rounded-full bg-brand-50 items-center justify-center mr-3">
                  <Text className="text-brand font-bold">{other?.name?.[0]?.toUpperCase() ?? '?'}</Text>
                </View>
                <View className="flex-1">
                  <Text className="text-sm font-semibold text-ink">{other?.name ?? 'LinkPoint user'}</Text>
                  <Text className="text-xs text-gray-400" numberOfLines={1}>
                    {last?.body ?? 'No messages yet'}
                  </Text>
                </View>
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}
