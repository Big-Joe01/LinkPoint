import { Link, router } from 'expo-router';
import { useState } from 'react';
import { View, Text, TextInput, Pressable, Alert, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { useAuthStore } from '../../src/store/auth';
import { ApiError } from '../../src/lib/api';

export default function LoginScreen() {
  const login = useAuthStore((s) => s.login);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    if (!email || !password) return;
    setLoading(true);
    try {
      await login(email, password);
      router.replace('/(tabs)/home');
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Login failed. Try again.';
      Alert.alert('Login failed', msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1 bg-white">
      <ScrollView contentContainerClassName="flex-1 items-center justify-center px-6 py-10">
        <View className="w-full max-w-sm">
          <Text className="text-3xl font-bold text-brand text-center">LinkPoint</Text>
          <Text className="text-sm text-gray-500 text-center mt-1 mb-8">
            Your next property is just a tap away.
          </Text>

          <Field label="Email">
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              className="border border-gray-200 rounded-xl px-4 py-3 text-ink"
            />
          </Field>

          <Field label="Password">
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              secureTextEntry
              className="border border-gray-200 rounded-xl px-4 py-3 text-ink"
            />
          </Field>

          <Pressable
            onPress={handleSubmit}
            disabled={loading}
            className="bg-brand py-3.5 rounded-xl mt-4 active:bg-brand-600 disabled:opacity-50"
          >
            <Text className="text-white text-center font-semibold">
              {loading ? 'Signing in…' : 'Sign in'}
            </Text>
          </Pressable>

          <View className="flex-row justify-center mt-6">
            <Text className="text-gray-500">Don't have an account? </Text>
            <Link href="/auth/register">
              <Text className="text-brand font-semibold">Sign up</Text>
            </Link>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View className="mb-4">
      <Text className="text-sm font-medium text-ink mb-1.5">{label}</Text>
      {children}
    </View>
  );
}
