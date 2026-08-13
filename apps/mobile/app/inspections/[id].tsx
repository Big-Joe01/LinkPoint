import { View, Text, Pressable, Alert } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { inspectionsApi } from '../../src/api/inspections';
import { Spinner, ErrorState, EmptyState } from '../../src/components/states';

export default function InspectionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const { data: inspection, isLoading, isError, refetch } = useQuery({
    queryKey: ['inspection', id],
    queryFn: () => inspectionsApi.get(id),
    enabled: !!id,
  });

  const confirmMutation = useMutation({
    mutationFn: () => inspectionsApi.confirm(id),
    onSuccess: (res) => {
      Alert.alert('Inspection confirmed', res.message);
      qc.invalidateQueries({ queryKey: ['inspection', id] });
      qc.invalidateQueries({ queryKey: ['inspections'] });
    },
    onError: (err) => Alert.alert('Failed', err instanceof Error ? err.message : 'Try again.'),
  });

  if (isLoading) return <Spinner size="large" />;
  if (isError) return <ErrorState message="Couldn't load inspection" onRetry={refetch} />;
  if (!inspection) return <EmptyState title="Inspection not found." icon="🔑" />;

  const awaitingConfirm = inspection.status === 'COMPLETED';

  return (
    <View className="flex-1 bg-[#F4F6FA] p-4">
      <View className="bg-white rounded-2xl p-4">
        <View className="flex-row items-center justify-between">
          <Text className="text-lg font-bold text-ink flex-1">{inspection.property.title}</Text>
          <View className="bg-brand-50 px-3 py-1 rounded-full">
            <Text className="text-brand text-xs font-semibold">{inspection.status}</Text>
          </View>
        </View>
        <Text className="text-sm text-gray-500 mt-1">
          📍 {inspection.property.city}, {inspection.property.state}
        </Text>

        <View className="flex-row justify-between mt-4 pt-4 border-t border-gray-50">
          <View>
            <Text className="text-xs text-gray-400">Inspection fee</Text>
            <Text className="text-lg font-bold text-brand">₦{inspection.feeMajor.toLocaleString()}</Text>
          </View>
          <View>
            <Text className="text-xs text-gray-400">Date & Time</Text>
            <Text className="text-sm font-semibold text-ink mt-1">
              {new Date(inspection.preferredDate).toLocaleDateString()} · {inspection.preferredTime}
            </Text>
          </View>
        </View>

        {inspection.agent ? (
          <View className="mt-4 pt-4 border-t border-gray-50">
            <Text className="text-xs text-gray-400">Assigned Agent</Text>
            <Text className="text-sm font-semibold text-ink mt-0.5">{inspection.agent.user.name}</Text>
            <Text className="text-xs text-gray-500 mt-1">
              For your security, all communication stays within LinkPoint messaging.
            </Text>
          </View>
        ) : (
          <View className="mt-4 pt-4 border-t border-gray-50">
            <Text className="text-sm text-amber-600">Searching for the nearest available agent…</Text>
          </View>
        )}
      </View>

      {awaitingConfirm ? (
        <View className="mt-4">
          <Text className="text-sm text-gray-600 text-center px-4 mb-3">
            Once your inspection is complete, confirm below to release the agent's commission.
          </Text>
          <Pressable
            onPress={() => confirmMutation.mutate()}
            disabled={confirmMutation.isPending}
            className="bg-green-600 py-4 rounded-xl active:bg-green-700 disabled:opacity-50"
          >
            <Text className="text-white text-center font-bold">
              {confirmMutation.isPending ? 'Confirming…' : '✓ Confirm Inspection Completed'}
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}
