import { Tabs, Redirect } from 'expo-router';
import { useAuthStore } from '../../src/store/auth';
import { View, ActivityIndicator } from 'react-native';

export default function TabsLayout() {
  const { user, hydrated } = useAuthStore();

  if (!hydrated) {
    return (
      <View className="flex-1 items-center justify-center bg-brand">
        <ActivityIndicator size="large" color="#FFFFFF" />
      </View>
    );
  }
  if (!user) return <Redirect href="/auth/login" />;

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: '#0D77F8' },
        headerTintColor: '#FFFFFF',
        headerTitleStyle: { fontWeight: 'bold' },
        tabBarActiveTintColor: '#0D77F8',
        tabBarInactiveTintColor: '#9CA3AF',
        tabBarStyle: { backgroundColor: '#FFFFFF', borderTopColor: '#F1F5F9' },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{ title: 'Home', tabBarIcon: ({ color }) => <TabIcon emoji="🏠" color={color} /> }}
      />
      <Tabs.Screen
        name="explore"
        options={{ title: 'Explore', tabBarIcon: ({ color }) => <TabIcon emoji="🧭" color={color} /> }}
      />
      <Tabs.Screen
        name="inspections"
        options={{ title: 'Inspections', tabBarIcon: ({ color }) => <TabIcon emoji="🔑" color={color} /> }}
      />
      <Tabs.Screen
        name="wallet"
        options={{ title: 'Wallet', tabBarIcon: ({ color }) => <TabIcon emoji="💳" color={color} /> }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: 'Profile', tabBarIcon: ({ color }) => <TabIcon emoji="👤" color={color} /> }}
      />
    </Tabs>
  );
}

function TabIcon({ emoji }: { emoji: string; color: string }) {
  return <>{emoji}</>;
}
