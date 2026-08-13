import { View, Text, Pressable, Alert, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { useAuthStore } from '../../src/store/auth';

export default function ProfileScreen() {
  const { user, logout } = useAuthStore();

  function handleLogout() {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => logout() },
    ]);
  }

  return (
    <ScrollView className="flex-1 bg-[#F4F6FA]">
      <View className="bg-brand px-4 py-8 items-center">
        <View className="w-20 h-20 rounded-full bg-white/20 items-center justify-center mb-3">
          <Text className="text-white text-3xl font-bold">{user?.name?.[0]?.toUpperCase() ?? '?'}</Text>
        </View>
        <Text className="text-white text-xl font-bold">{user?.name}</Text>
        <Text className="text-brand-50">{user?.email}</Text>
        <View className="flex-row gap-2 mt-3">
          {(user?.roles ?? []).map((r) => (
            <View key={r} className="bg-white/20 px-3 py-1 rounded-full">
              <Text className="text-white text-xs font-semibold">{r}</Text>
            </View>
          ))}
        </View>
      </View>

      <View className="mx-4 mt-4 bg-white rounded-2xl overflow-hidden">
        <Row label="Saved Properties" icon="❤️" onPress={() => router.push('/profile/favorites')} />
        <Row label="My Inspections" icon="🔑" onPress={() => router.push('/(tabs)/inspections')} />
        <Row label="Messages" icon="💬" onPress={() => router.push('/profile/messages')} />
        <Row label="Transaction History" icon="📊" onPress={() => router.push('/profile/transactions')} />
        <Row label="Settings" icon="⚙️" onPress={() => Alert.alert('Settings', 'Coming soon')} />
      </View>

      <View className="mx-4 mt-4 bg-white rounded-2xl overflow-hidden">
        <Row label="Help & Support" icon="🛟" onPress={() => Alert.alert('Support', 'Coming soon')} />
        <Row label="Terms & Privacy" icon="📜" onPress={() => Alert.alert('Terms', 'Coming soon')} />
      </View>

      <Pressable
        onPress={handleLogout}
        className="mx-4 mt-4 mb-8 bg-white py-4 rounded-2xl items-center active:bg-red-50"
      >
        <Text className="text-red-600 font-semibold">Sign Out</Text>
      </Pressable>
    </ScrollView>
  );
}

function Row({ label, icon, onPress }: { label: string; icon: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} className="flex-row items-center px-4 py-4 border-b border-gray-50 active:bg-gray-50">
      <Text className="text-xl mr-3">{icon}</Text>
      <Text className="text-ink flex-1">{label}</Text>
      <Text className="text-gray-300">›</Text>
    </Pressable>
  );
}
