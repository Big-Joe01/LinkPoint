import { useState } from 'react';
import { View, Text, ScrollView, Pressable, TextInput } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useProperties } from '../../src/hooks/useProperties';
import { PropertyCard } from '../../src/components/PropertyCard';
import { Spinner, EmptyState } from '../../src/components/states';

const TYPES = ['', 'HOUSE', 'APARTMENT', 'LAND', 'COMMERCIAL', 'LUXURY'];
const PURPOSES = ['', 'SALE', 'RENT', 'LEASE', 'SHORT_LET'];

export default function ExploreScreen() {
  const params = useLocalSearchParams<{ purpose?: string; propertyType?: string }>();
  const [search, setSearch] = useState('');
  const [city, setCity] = useState('');
  const [propertyType, setPropertyType] = useState(params.propertyType ?? '');
  const [purpose, setPurpose] = useState(params.purpose ?? '');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [bedrooms, setBedrooms] = useState('');
  const [verifiedOnly, setVerifiedOnly] = useState(false);

  const { data, isLoading, refetch } = useProperties({
    city: city || undefined,
    propertyType: propertyType || undefined,
    purpose: purpose || undefined,
    minPrice: minPrice ? Number(minPrice) : undefined,
    maxPrice: maxPrice ? Number(maxPrice) : undefined,
    bedrooms: bedrooms ? Number(bedrooms) : undefined,
    verified: verifiedOnly || undefined,
  });

  return (
    <ScrollView className="flex-1 bg-[#F4F6FA]">
      <View className="bg-white p-4">
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search by city or state…"
          className="border border-gray-200 rounded-xl px-4 py-3 text-ink mb-3"
          onSubmitEditing={() => setCity(search)}
        />
        <View className="flex-row flex-wrap gap-2 mb-3">
          {PURPOSES.map((p) => (
            <Chip key={p || 'all'} label={p || 'All'} active={purpose === p} onPress={() => setPurpose(p)} />
          ))}
        </View>
        <View className="flex-row flex-wrap gap-2 mb-3">
          {TYPES.map((t) => (
            <Chip key={t || 'all'} label={t || 'All'} active={propertyType === t} onPress={() => setPropertyType(t)} />
          ))}
        </View>
        <View className="flex-row gap-2 mb-3">
          <SmallInput value={minPrice} onChangeText={setMinPrice} placeholder="Min ₦" keyboardType="numeric" />
          <SmallInput value={maxPrice} onChangeText={setMaxPrice} placeholder="Max ₦" keyboardType="numeric" />
          <SmallInput value={bedrooms} onChangeText={setBedrooms} placeholder="Beds" keyboardType="numeric" />
        </View>
        <Pressable
          onPress={() => setVerifiedOnly((v) => !v)}
          className="flex-row items-center mb-3"
        >
          <View className={`w-5 h-5 rounded border mr-2 items-center justify-center ${verifiedOnly ? 'bg-brand border-brand' : 'border-gray-300'}`}>
            {verifiedOnly ? <Text className="text-white text-xs">✓</Text> : null}
          </View>
          <Text className="text-sm text-ink">Verified properties only</Text>
        </Pressable>
        <Pressable onPress={() => refetch()} className="bg-brand py-2.5 rounded-xl active:bg-brand-600">
          <Text className="text-white text-center font-semibold">Apply filters</Text>
        </Pressable>
      </View>

      {isLoading ? (
        <Spinner />
      ) : data && data.items.length > 0 ? (
        <View className="mt-2">
          {data.items.map((p: import('../../src/api/properties').PropertyListItem) => (
            <PropertyCard key={p.id} property={p} />
          ))}
        </View>
      ) : (
        <EmptyState
          title="No properties found."
          subtitle="Try adjusting your filters or check back later."
          icon="🔍"
        />
      )}
    </ScrollView>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      className={`px-3 py-1.5 rounded-full border ${active ? 'bg-brand border-brand' : 'border-gray-200 bg-white'}`}
    >
      <Text className={`text-xs font-semibold ${active ? 'text-white' : 'text-gray-600'}`}>{label}</Text>
    </Pressable>
  );
}

function SmallInput(props: React.ComponentProps<typeof TextInput>) {
  return <TextInput {...props} className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-ink text-sm" />;
}
