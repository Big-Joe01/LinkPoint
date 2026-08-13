import { router } from 'expo-router';
import { useState } from 'react';
import { View, Text, TextInput, Pressable, Alert, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { useAuthStore } from '../../src/store/auth';
import { ApiError } from '../../src/lib/api';

const ROLES = [
  { value: 'CUSTOMER', label: 'Customer — buy, rent, inspect' },
  { value: 'REALTOR', label: 'Realtor / Property Owner' },
  { value: 'INSPECTION_AGENT', label: 'Inspection Agent' },
  { value: 'AFFILIATE', label: 'Affiliate' },
];

export default function RegisterScreen() {
  const register = useAuthStore((s) => s.register);
  const verifyEmail = useAuthStore((s) => s.verifyEmail);
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', role: 'CUSTOMER' });
  const [loading, setLoading] = useState(false);

  function update(key: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit() {
    if (!form.name || !form.email || !form.phone || !form.password) {
      Alert.alert('Missing fields', 'Please fill in all fields.');
      return;
    }
    setLoading(true);
    try {
      const { emailVerifyToken } = await register(form);
      await verifyEmail(emailVerifyToken);
      Alert.alert('Welcome to LinkPoint', 'Your email has been verified. Please sign in.');
      router.replace('/auth/login');
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Registration failed. Try again.';
      Alert.alert('Registration failed', msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1 bg-white">
      <ScrollView contentContainerClassName="flex-1 px-6 py-10">
        <Text className="text-3xl font-bold text-brand text-center">Create account</Text>
        <Text className="text-sm text-gray-500 text-center mt-1 mb-8">Join LinkPoint in seconds.</Text>

        <Field label="Full name">
          <Input value={form.name} onChangeText={(v) => update('name', v)} placeholder="Jane Doe" />
        </Field>
        <Field label="Email">
          <Input value={form.email} onChangeText={(v) => update('email', v)} placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none" />
        </Field>
        <Field label="Phone">
          <Input value={form.phone} onChangeText={(v) => update('phone', v)} placeholder="0803 000 0000" keyboardType="phone-pad" />
        </Field>
        <Field label="Password">
          <Input value={form.password} onChangeText={(v) => update('password', v)} placeholder="••••••••" secureTextEntry />
        </Field>

        <Field label="I am a">
          <View className="flex-row flex-wrap gap-2">
            {ROLES.map((r) => (
              <Pressable
                key={r.value}
                onPress={() => update('role', r.value)}
                className={`px-3 py-2 rounded-full border ${form.role === r.value ? 'bg-brand border-brand' : 'border-gray-200'}`}
              >
                <Text className={form.role === r.value ? 'text-white text-xs' : 'text-gray-600 text-xs'}>{r.label}</Text>
              </Pressable>
            ))}
          </View>
        </Field>

        <Pressable
          onPress={handleSubmit}
          disabled={loading}
          className="bg-brand py-3.5 rounded-xl mt-4 active:bg-brand-600 disabled:opacity-50"
        >
          <Text className="text-white text-center font-semibold">{loading ? 'Creating…' : 'Create account'}</Text>
        </Pressable>

        <Text className="text-xs text-gray-400 text-center mt-4">
          By signing up you agree that LinkPoint protects users by keeping communication, inspections and
          transactions within the platform. LinkPoint is not responsible for losses from off-platform deals.
        </Text>
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

function Input(props: React.ComponentProps<typeof TextInput>) {
  return <TextInput {...props} className="border border-gray-200 rounded-xl px-4 py-3 text-ink" />;
}
