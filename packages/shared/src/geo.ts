// Cross-cutting utilities shared by backend and mobile.

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

const EARTH_RADIUS_KM = 6371;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Haversine distance in kilometers between two geographic points.
 * Used to rank inspection agents by proximity to the PROPERTY (not the customer).
 */
export function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/** Distance-based pricing zone label derived from km distance. */
export function distanceZone(km: number): 'LOCAL' | 'REGIONAL' | 'REMOTE' {
  if (km <= 15) return 'LOCAL';
  if (km <= 80) return 'REGIONAL';
  return 'REMOTE';
}
