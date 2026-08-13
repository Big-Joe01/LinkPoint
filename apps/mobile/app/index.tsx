import { Redirect } from 'expo-router';
import { useAuthStore } from '../src/store/auth';
import { View, ActivityIndicator } from 'react-native';

export default function Index() {
  const { user, hydrated } = useAuthStore();

  if (!hydrated) {
    return (
      <View className="flex-1 items-center justify-center bg-brand">
        <ActivityIndicator size="large" color="#FFFFFF" />
      </View>
    );
  }

  if (!user) return <Redirect href="/auth/login" />;
  return <Redirect href="/(tabs)/home" />;
}
