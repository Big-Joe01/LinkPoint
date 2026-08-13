import { Pressable, View, Text } from 'react-native';
import { Image } from 'expo-image';
import { Link } from 'expo-router';
import type { PropertyListItem } from '../api/properties';

const PURPOSE_LABEL: Record<string, string> = {
  SALE: 'For Sale',
  RENT: 'For Rent',
  LEASE: 'For Lease',
  SHORT_LET: 'Short Let',
};

export function PropertyCard({ property }: { property: PropertyListItem }) {
  const cover = property.media?.[0]?.url;
  return (
    <Link href={`/property/${property.id}`} asChild>
      <Pressable className="mx-4 mb-4 bg-white rounded-2xl overflow-hidden active:opacity-90">
        <View className="relative">
          {cover ? (
            <Image
              source={{ uri: cover }}
              className="w-full h-48"
              contentFit="cover"
              transition={150}
              placeholder={undefined}
            />
          ) : (
            <View className="w-full h-48 bg-gray-200 items-center justify-center">
              <Text className="text-gray-400 text-4xl">🏠</Text>
            </View>
          )}
          <View className="absolute top-2 left-2 flex-row gap-1">
            <Badge label={PURPOSE_LABEL[property.purpose] ?? property.purpose} />
            {property.featured ? <Badge label="Featured" highlight /> : null}
          </View>
          {property.verification === 'VERIFIED' ? (
            <View className="absolute bottom-2 right-2 bg-brand px-2 py-0.5 rounded-full">
              <Text className="text-white text-xs font-semibold">✓ Verified</Text>
            </View>
          ) : null}
        </View>
        <View className="p-3">
          <Text className="text-lg font-bold text-brand">
            ₦{property.priceMajor.toLocaleString()}
          </Text>
          <Text className="text-sm font-semibold text-ink mt-0.5" numberOfLines={1}>
            {property.title}
          </Text>
          <Text className="text-xs text-gray-500 mt-0.5" numberOfLines={1}>
            📍 {property.city}, {property.state}
          </Text>
          <View className="flex-row gap-3 mt-2">
            {property.bedrooms ? <Spec icon="🛏️" value={property.bedrooms} /> : null}
            {property.bathrooms ? <Spec icon="🛁" value={property.bathrooms} /> : null}
          </View>
        </View>
      </Pressable>
    </Link>
  );
}

function Spec({ icon, value }: { icon: string; value: number | null }) {
  return (
    <Text className="text-xs text-gray-600">
      {icon} {value}
    </Text>
  );
}

function Badge({ label, highlight }: { label: string; highlight?: boolean }) {
  return (
    <View className={`px-2 py-0.5 rounded-full ${highlight ? 'bg-ink' : 'bg-brand'}`}>
      <Text className="text-white text-xs font-semibold">{label}</Text>
    </View>
  );
}
