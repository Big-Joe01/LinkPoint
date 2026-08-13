import { useState } from 'react';
import {
  View, Text, ScrollView, Pressable, Alert, Modal, TextInput, ActivityIndicator, Share,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Image } from 'expo-image';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useProperty, useToggleFavorite } from '../../src/hooks/useProperties';
import { propertiesApi } from '../../src/api/properties';
import { Spinner, ErrorState } from '../../src/components/states';
import { ApiError } from '../../src/lib/api';

const PURPOSE_LABEL: Record<string, string> = {
  SALE: 'For Sale',
  RENT: 'For Rent',
  LEASE: 'For Lease',
  SHORT_LET: 'Short Let',
};

export default function PropertyDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: property, isLoading, isError, refetch } = useProperty(id);
  const toggleFav = useToggleFavorite();
  const qc = useQueryClient();
  const [bookOpen, setBookOpen] = useState(false);

  async function handleShare() {
    if (!property) return;
    try {
      await Share.share({ message: `Check out ${property.title} on LinkPoint — ${property.city}, ${property.state}. ₦${property.priceMajor.toLocaleString()}` });
    } catch {}
  }

  if (isLoading) return <Spinner size="large" />;
  if (isError || !property) return <ErrorState message="Couldn't load property" onRetry={refetch} />;

  const media = property.media ?? [];
  const videos = property.videos ?? [];
  const isSaved = (property as { saved?: boolean }).saved === true;

  return (
    <ScrollView className="flex-1 bg-white">
      <View className="relative">
        {media[0] ? (
          <Image source={{ uri: media[0].url }} className="w-full h-72" contentFit="cover" transition={150} placeholder={undefined} />
        ) : (
          <View className="w-full h-72 bg-gray-200 items-center justify-center">
            <Text className="text-gray-400 text-6xl">🏠</Text>
          </View>
        )}
        <View className="absolute top-3 left-3 flex-row gap-2">
          <View className="bg-brand px-3 py-1 rounded-full">
            <Text className="text-white text-xs font-semibold">{PURPOSE_LABEL[property.purpose] ?? property.purpose}</Text>
          </View>
          {property.verification === 'VERIFIED' ? (
            <View className="bg-green-600 px-3 py-1 rounded-full">
              <Text className="text-white text-xs font-semibold">✓ Verified</Text>
            </View>
          ) : null}
        </View>
      </View>

      <View className="p-4">
        <Text className="text-3xl font-bold text-brand">₦{property.priceMajor.toLocaleString()}</Text>
        <Text className="text-lg font-bold text-ink mt-1">{property.title}</Text>
        <Text className="text-sm text-gray-500 mt-1">📍 {property.city}, {property.state}, {property.country}</Text>

        <View className="flex-row justify-around bg-gray-50 rounded-2xl py-4 mt-4">
          {property.bedrooms ? <Spec icon="🛏️" label="Beds" value={property.bedrooms} /> : null}
          {property.bathrooms ? <Spec icon="🛁" label="Baths" value={property.bathrooms} /> : null}
          {property.landSize ? <Spec icon="📐" label="Land" value={`${property.landSize}m²`} /> : null}
          {property.buildingSize ? <Spec icon="🏠" label="Build" value={`${property.buildingSize}m²`} /> : null}
        </View>

        <Text className="text-sm font-bold text-ink mt-4">Description</Text>
        <Text className="text-sm text-gray-600 mt-1 leading-5">{property.description}</Text>

        {property.amenities?.length ? (
          <>
            <Text className="text-sm font-bold text-ink mt-4">Amenities</Text>
            <View className="flex-row flex-wrap mt-2">
              {property.amenities.map((a: string) => (
                <View key={a} className="bg-gray-100 px-3 py-1.5 rounded-full mr-2 mb-2">
                  <Text className="text-xs text-gray-700">{a}</Text>
                </View>
              ))}
            </View>
          </>
        ) : null}

        {videos.length ? (
          <>
            <Text className="text-sm font-bold text-ink mt-4">Videos</Text>
            {videos.map((v: { id: string; url: string; type: string }) => (
              <View key={v.id} className="bg-gray-100 rounded-xl p-4 mt-2">
                <Text className="text-xs text-gray-600">📹 Video available</Text>
              </View>
            ))}
          </>
        ) : null}

        <View className="bg-brand-50 rounded-xl p-4 mt-4">
          <Text className="text-sm font-semibold text-brand">Listed by</Text>
          <Text className="text-ink font-bold mt-0.5">{property.ownerName}</Text>
          <Text className="text-xs text-gray-500 mt-1">
            For your protection, contact details are kept within LinkPoint. Communicate through the platform.
          </Text>
        </View>

        <View className="flex-row gap-3 mt-4">
          <Pressable
            onPress={() => toggleFav.mutate(property.id)}
            className={`flex-1 border py-3 rounded-xl items-center ${isSaved ? 'bg-red-50 border-red-200' : 'border-gray-200'}`}
          >
            <Text className={isSaved ? 'text-red-600 font-semibold' : 'text-gray-600 font-semibold'}>
              {isSaved ? '♥ Saved' : '♡ Save'}
            </Text>
          </Pressable>
          <Pressable onPress={handleShare} className="flex-1 border border-gray-200 py-3 rounded-xl items-center">
            <Text className="text-gray-600 font-semibold">↗ Share</Text>
          </Pressable>
          <Pressable
            onPress={() => Alert.alert('Report', 'Report this property to LinkPoint admins.', [{ text: 'OK' }])}
            className="flex-1 border border-gray-200 py-3 rounded-xl items-center"
          >
            <Text className="text-gray-600 font-semibold">⚑ Report</Text>
          </Pressable>
        </View>

        <Pressable
          onPress={() => setBookOpen(true)}
          className="bg-brand py-4 rounded-xl mt-4 active:bg-brand-600"
        >
          <Text className="text-white text-center font-bold text-lg">Book Inspection</Text>
        </Pressable>
        <Text className="text-xs text-gray-400 text-center mt-2">
          Inspection fee is calculated dynamically based on property location and category.
        </Text>
      </View>

      <BookInspectionModal
        visible={bookOpen}
        propertyId={property.id}
        onClose={() => setBookOpen(false)}
      />
    </ScrollView>
  );
}

function Spec({ icon, label, value }: { icon: string; label: string; value: string | number }) {
  return (
    <View className="items-center">
      <Text className="text-2xl">{icon}</Text>
      <Text className="text-sm font-bold text-ink mt-1">{value}</Text>
      <Text className="text-xs text-gray-400">{label}</Text>
    </View>
  );
}

function BookInspectionModal({
  visible, propertyId, onClose,
}: { visible: boolean; propertyId: string; onClose: () => void }) {
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [notes, setNotes] = useState('');
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: () =>
      propertiesApi.bookInspection({ propertyId, preferredDate: date, preferredTime: time, notes }),
    onSuccess: (res) => {
      Alert.alert(
        'Inspection booked',
        `Fee: ₦${res.feeMajor.toLocaleString()}\nStatus: ${res.status}\n\nWe're matching you with the nearest available inspection agent.`,
        [{ text: 'OK', onPress: () => { qc.invalidateQueries({ queryKey: ['inspections'] }); onClose(); router.push('/(tabs)/inspections'); } }],
      );
    },
    onError: (err) => {
      const msg = err instanceof ApiError ? err.message : 'Booking failed.';
      Alert.alert('Booking failed', msg);
    },
  });

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-black/40">
        <View className="bg-white rounded-t-3xl p-6">
          <Text className="text-lg font-bold text-ink mb-4">Book Inspection</Text>
          <Text className="text-sm text-gray-500 mb-1">Preferred date (YYYY-MM-DD)</Text>
          <TextInput
            value={date}
            onChangeText={setDate}
            placeholder="2025-01-15"
            className="border border-gray-200 rounded-xl px-4 py-3 text-ink mb-3"
          />
          <Text className="text-sm text-gray-500 mb-1">Preferred time</Text>
          <TextInput
            value={time}
            onChangeText={setTime}
            placeholder="10:00"
            className="border border-gray-200 rounded-xl px-4 py-3 text-ink mb-3"
          />
          <Text className="text-sm text-gray-500 mb-1">Notes (optional)</Text>
          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder="Any special requests…"
            multiline
            className="border border-gray-200 rounded-xl px-4 py-3 text-ink mb-4 h-20"
          />
          <Pressable
            onPress={() => mutation.mutate()}
            disabled={mutation.isPending || !date || !time}
            className="bg-brand py-3.5 rounded-xl active:bg-brand-600 disabled:opacity-50"
          >
            {mutation.isPending ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text className="text-white text-center font-semibold">Pay & Book Inspection</Text>
            )}
          </Pressable>
          <Pressable onPress={onClose} className="mt-3">
            <Text className="text-center text-gray-500">Cancel</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
