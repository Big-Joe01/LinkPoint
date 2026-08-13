import { FlatList, View, Text, TextInput, Pressable, KeyboardAvoidingView, Platform } from 'react-native';
import { useState, useEffect, useCallback } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../src/lib/api';
import { Spinner, ErrorState } from '../../../src/components/states';

interface Message {
  id: string;
  body: string;
  senderId: string;
  createdAt: string;
  blocked: boolean;
}

export default function ConversationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const [text, setText] = useState('');

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['conversation', id],
    queryFn: () => api.get<{ items: Message[] }>('/messages/conversations/' + id),
    enabled: !!id,
  });

  const sendMutation = useMutation({
    mutationFn: (body: string) => api.post('/messages', { conversationId: id, content: body, type: 'TEXT' }),
    onSuccess: () => {
      setText('');
      qc.invalidateQueries({ queryKey: ['conversation', id] });
    },
  });

  const handleSend = useCallback(() => {
    if (!text.trim()) return;
    sendMutation.mutate(text.trim());
  }, [text, sendMutation]);

  useEffect(() => {
    const interval = setInterval(() => qc.invalidateQueries({ queryKey: ['conversation', id] }), 10000);
    return () => clearInterval(interval);
  }, [id, qc]);

  if (isLoading) return <Spinner size="large" />;
  if (isError) return <ErrorState message="Couldn't load messages" onRetry={refetch} />;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className="flex-1 bg-[#F4F6FA]"
      keyboardVerticalOffset={90}
    >
      <View className="bg-brand-50 px-4 py-2 mx-4 mt-2 rounded-xl">
        <Text className="text-xs text-brand">
          🔒 For your protection, LinkPoint keeps all communication and transactions on the platform. Sharing
          external contact information is not permitted.
        </Text>
      </View>
      <FlatList
        data={data?.items ?? []}
        keyExtractor={(item) => item.id}
        className="flex-1 px-4 mt-2"
        inverted={false}
        renderItem={({ item }) => (
          <View className={`max-w-[75%] mb-2 ${item.senderId === 'me' ? 'self-end' : 'self-start'}`}>
            <View className={`px-3 py-2 rounded-xl ${item.blocked ? 'bg-amber-50 border border-amber-200' : item.senderId === 'me' ? 'bg-brand' : 'bg-white'}`}>
              <Text className={item.blocked ? 'text-amber-700 text-sm' : item.senderId === 'me' ? 'text-white text-sm' : 'text-ink text-sm'}>
                {item.body}
              </Text>
            </View>
            <Text className="text-xs text-gray-300 mt-0.5">{new Date(item.createdAt).toLocaleTimeString()}</Text>
          </View>
        )}
      />
      <View className="flex-row items-center px-4 py-3 bg-white border-t border-gray-100">
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Type a message…"
          className="flex-1 border border-gray-200 rounded-full px-4 py-2.5 text-ink mr-2"
          onSubmitEditing={handleSend}
        />
        <Pressable
          onPress={handleSend}
          disabled={sendMutation.isPending || !text.trim()}
          className="bg-brand w-10 h-10 rounded-full items-center justify-center active:bg-brand-600 disabled:opacity-50"
        >
          <Text className="text-white text-lg">↑</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
