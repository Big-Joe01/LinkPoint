import { useState } from 'react';
import { View, Text, Pressable, Modal, TextInput, Alert, FlatList, RefreshControl } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { walletApi } from '../../src/api/wallet';
import { Spinner, EmptyState, ErrorState } from '../../src/components/states';

export default function WalletScreen() {
  const qc = useQueryClient();
  const [fundOpen, setFundOpen] = useState(false);
  const [amount, setAmount] = useState('');

  const { data: wallet, isLoading, isError, refetch } = useQuery({ queryKey: ['wallet'], queryFn: walletApi.get });
  const txns = useQuery({ queryKey: ['wallet-txns'], queryFn: () => walletApi.transactions() });

  const fundMutation = useMutation({
    mutationFn: (amt: number) => walletApi.fund(amt),
    onSuccess: (res) => {
      Alert.alert(
        'Payment initialised',
        res.accountNumber
          ? `Transfer to ${res.bankName ?? 'bank'}\nAccount: ${res.accountNumber}\nName: ${res.accountName ?? '-'}\n\nYour wallet will be credited automatically after Flutterwave confirms the transfer.`
          : 'Complete the payment to fund your wallet.',
        [{ text: 'OK', onPress: () => { setFundOpen(false); setAmount(''); } }],
      );
      qc.invalidateQueries({ queryKey: ['wallet'] });
      qc.invalidateQueries({ queryKey: ['wallet-txns'] });
    },
    onError: (err) => {
      Alert.alert('Funding failed', err instanceof Error ? err.message : 'Try again.');
    },
  });

  function handleFund() {
    const amt = Number(amount);
    if (!amt || amt <= 0) return Alert.alert('Invalid amount', 'Enter a valid amount.');
    fundMutation.mutate(amt);
  }

  return (
    <View className="flex-1 bg-[#F4F6FA]">
      <View className="bg-ink px-4 py-6">
        <Text className="text-gray-300 text-sm">Available Balance</Text>
        <Text className="text-white text-3xl font-bold mt-1">
          ₦{wallet ? wallet.availableMajor.toLocaleString() : '0'}
          <Text className="text-gray-400 text-base"> .00</Text>
        </Text>
        <Text className="text-gray-400 text-xs mt-1">
          Pending: ₦{wallet ? wallet.pendingMajor.toLocaleString() : '0'}.00
        </Text>
        <View className="flex-row gap-3 mt-4">
          <Pressable
            onPress={() => setFundOpen(true)}
            className="flex-1 bg-brand py-3 rounded-xl active:bg-brand-600"
          >
            <Text className="text-white text-center font-semibold">+ Fund Wallet</Text>
          </Pressable>
          <Pressable className="flex-1 bg-ink-soft py-3 rounded-xl active:opacity-80">
            <Text className="text-white text-center font-semibold">Withdraw</Text>
          </Pressable>
        </View>
      </View>

      <Text className="text-sm font-bold text-ink px-4 mt-4 mb-2">Transaction History</Text>
      <FlatList
        data={txns.data?.items ?? []}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={txns.isFetching} onRefresh={txns.refetch} tintColor="#0D77F8" />}
        ListEmptyComponent={
          isLoading ? <Spinner /> : isError ? <ErrorState message="Couldn't load wallet" onRetry={refetch} /> : (
            <EmptyState title="Your wallet is empty." subtitle="Fund your wallet to book inspections and make payments." icon="💳" />
          )
        }
        renderItem={({ item }) => {
          const credit = ['DEPOSIT', 'COMMISSION', 'REFUND'].includes(item.type);
          return (
            <View className="mx-4 mb-2 bg-white rounded-xl p-4 flex-row items-center justify-between">
              <View>
                <Text className="text-sm font-semibold text-ink">{item.type}</Text>
                <Text className="text-xs text-gray-400">{new Date(item.createdAt).toLocaleString()}</Text>
                <Text className="text-xs text-gray-400">{item.status}</Text>
              </View>
              <Text className={`text-sm font-bold ${credit ? 'text-green-600' : 'text-ink'}`}>
                {credit ? '+' : '-'}₦{(Number(item.amountMinor) / 100).toLocaleString()}
              </Text>
            </View>
          );
        }}
      />

      <Modal visible={fundOpen} transparent animationType="slide" onRequestClose={() => setFundOpen(false)}>
        <View className="flex-1 justify-end bg-black/40">
          <View className="bg-white rounded-t-3xl p-6">
            <Text className="text-lg font-bold text-ink mb-4">Fund Wallet</Text>
            <Text className="text-sm text-gray-500 mb-2">Amount (₦)</Text>
            <TextInput
              value={amount}
              onChangeText={setAmount}
              keyboardType="numeric"
              placeholder="5000"
              className="border border-gray-200 rounded-xl px-4 py-3 text-ink text-lg mb-4"
            />
            <Pressable
              onPress={handleFund}
              disabled={fundMutation.isPending}
              className="bg-brand py-3.5 rounded-xl active:bg-brand-600 disabled:opacity-50"
            >
              <Text className="text-white text-center font-semibold">
                {fundMutation.isPending ? 'Initialising payment…' : 'Continue to payment'}
              </Text>
            </Pressable>
            <Pressable onPress={() => setFundOpen(false)} className="mt-3">
              <Text className="text-center text-gray-500">Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}
