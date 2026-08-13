import { ActivityIndicator, View, Text, Pressable } from 'react-native';
import { ReactNode } from 'react';

export function Spinner({ size = 'small' }: { size?: 'small' | 'large' }) {
  return (
    <View className="flex-1 items-center justify-center py-8">
      <ActivityIndicator size={size} color="#0D77F8" />
    </View>
  );
}

export function EmptyState({
  title,
  subtitle,
  icon = '🏠',
  actionLabel,
  onAction,
}: {
  title: string;
  subtitle?: string;
  icon?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View className="flex-1 items-center justify-center px-8 py-16">
      <Text className="text-5xl mb-4 opacity-40">{icon}</Text>
      <Text className="text-base font-semibold text-ink text-center">{title}</Text>
      {subtitle ? <Text className="text-sm text-gray-500 text-center mt-2">{subtitle}</Text> : null}
      {actionLabel && onAction ? (
        <Pressable
          onPress={onAction}
          className="mt-6 bg-brand px-6 py-3 rounded-full active:bg-brand-600"
        >
          <Text className="text-white font-semibold">{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View className="flex-1 items-center justify-center px-8 py-16">
      <Text className="text-4xl mb-4 opacity-40">⚠️</Text>
      <Text className="text-base font-semibold text-ink text-center">{message}</Text>
      {onRetry ? (
        <Pressable
          onPress={onRetry}
          className="mt-6 border border-brand px-6 py-3 rounded-full active:bg-brand-50"
        >
          <Text className="text-brand font-semibold">Try again</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function SectionHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <View className="flex-row items-center justify-between px-4 mb-3 mt-4">
      <Text className="text-lg font-bold text-ink">{title}</Text>
      {action}
    </View>
  );
}
