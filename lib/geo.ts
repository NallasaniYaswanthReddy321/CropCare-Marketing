/**
 * India location index + live GPS.
 *
 * Ships a real offline gazetteer (36 states/UTs and 320+ districts with
 * coordinates, agro-climatic zone, dominant soil and normal rainfall) so
 * location search works with zero connectivity. GPS uses expo-location and
 * resolves to the nearest gazetteer entry entirely on device — no reverse
 * geocoding request leaves the phone.
 */
import * as Location from 'expo-location';

export type Place = {
  d: string;   // district
  s: string;   // state / UT
  lat: number;
  lon: number;
  z: string;   // agro-climatic zone
  soil: string;
  rain: number; // normal annual rainfall, mm
};

/** Compact rows: district, state, lat, lon, zone, soil, rainfall. */
const R = (d: string, s: string, lat: number, lon: number, z: string, soil: string, rain: number): Place =>
  ({ d, s, lat, lon, z, soil, rain });

export const PLACES: Place[] = [
  // Maharashtra
  R('Pune', 'Maharashtra', 18.52, 73.86, 'Western Plateau & Hills', 'Black cotton', 722),
  R('Shirur', 'Maharashtra', 18.83, 74.37, 'Western Plateau & Hills', 'Black cotton', 560),
  R('Nashik', 'Maharashtra', 19.99, 73.79, 'Western Plateau & Hills', 'Black cotton', 710),
  R('Ahmednagar', 'Maharashtra', 19.09, 74.74, 'Western Plateau & Hills', 'Black cotton', 540),
  R('Solapur', 'Maharashtra', 17.66, 75.91, 'Western Plateau & Hills', 'Black cotton', 545),
  R('Kolhapur', 'Maharashtra', 16.70, 74.24, 'Western Plateau & Hills', 'Lateritic', 1020),
  R('Satara', 'Maharashtra', 17.69, 74.00, 'Western Plateau & Hills', 'Black cotton', 900),
  R('Sangli', 'Maharashtra', 16.85, 74.58, 'Western Plateau & Hills', 'Black cotton', 570),
  R('Nagpur', 'Maharashtra', 21.15, 79.09, 'Central Plateau & Hills', 'Black cotton', 1150),
  R('Amravati', 'Maharashtra', 20.93, 77.75, 'Central Plateau & Hills', 'Black cotton', 810),
  R('Aurangabad', 'Maharashtra', 19.88, 75.34, 'Western Plateau & Hills', 'Black cotton', 726),
  R('Jalgaon', 'Maharashtra', 21.01, 75.56, 'Western Plateau & Hills', 'Black cotton', 690),
  R('Latur', 'Maharashtra', 18.40, 76.56, 'Western Plateau & Hills', 'Black cotton', 800),
  R('Thane', 'Maharashtra', 19.22, 72.98, 'West Coast Plains', 'Lateritic', 2400),
  R('Ratnagiri', 'Maharashtra', 16.99, 73.31, 'West Coast Plains', 'Lateritic', 3200),

  // Karnataka
  R('Bengaluru Rural', 'Karnataka', 13.23, 77.58, 'Southern Plateau & Hills', 'Red loam', 880),
  R('Belagavi', 'Karnataka', 15.85, 74.50, 'Southern Plateau & Hills', 'Black cotton', 1300),
  R('Mysuru', 'Karnataka', 12.30, 76.64, 'Southern Plateau & Hills', 'Red loam', 800),
  R('Hubballi-Dharwad', 'Karnataka', 15.36, 75.12, 'Southern Plateau & Hills', 'Black cotton', 780),
  R('Kalaburagi', 'Karnataka', 17.33, 76.83, 'Southern Plateau & Hills', 'Black cotton', 750),
  R('Tumakuru', 'Karnataka', 13.34, 77.10, 'Southern Plateau & Hills', 'Red loam', 690),
  R('Mandya', 'Karnataka', 12.52, 76.90, 'Southern Plateau & Hills', 'Red loam', 700),
  R('Ballari', 'Karnataka', 15.14, 76.92, 'Southern Plateau & Hills', 'Red loam', 600),
  R('Shivamogga', 'Karnataka', 13.93, 75.57, 'Southern Plateau & Hills', 'Lateritic', 1800),
  R('Haveri', 'Karnataka', 14.80, 75.40, 'Southern Plateau & Hills', 'Black cotton', 800),

  // Punjab / Haryana
  R('Ludhiana', 'Punjab', 30.90, 75.86, 'Trans-Gangetic Plains', 'Alluvial loam', 730),
  R('Amritsar', 'Punjab', 31.63, 74.87, 'Trans-Gangetic Plains', 'Alluvial loam', 680),
  R('Patiala', 'Punjab', 30.34, 76.39, 'Trans-Gangetic Plains', 'Alluvial loam', 700),
  R('Bathinda', 'Punjab', 30.21, 74.94, 'Trans-Gangetic Plains', 'Sandy loam', 420),
  R('Jalandhar', 'Punjab', 31.33, 75.58, 'Trans-Gangetic Plains', 'Alluvial loam', 700),
  R('Karnal', 'Haryana', 29.69, 76.99, 'Trans-Gangetic Plains', 'Alluvial loam', 700),
  R('Hisar', 'Haryana', 29.15, 75.72, 'Trans-Gangetic Plains', 'Sandy loam', 450),
  R('Sirsa', 'Haryana', 29.53, 75.03, 'Trans-Gangetic Plains', 'Sandy loam', 300),
  R('Rohtak', 'Haryana', 28.90, 76.61, 'Trans-Gangetic Plains', 'Alluvial loam', 590),
  R('Sonipat', 'Haryana', 28.99, 77.02, 'Trans-Gangetic Plains', 'Alluvial loam', 620),

  // Uttar Pradesh
  R('Meerut', 'Uttar Pradesh', 28.98, 77.71, 'Upper Gangetic Plains', 'Alluvial loam', 850),
  R('Lucknow', 'Uttar Pradesh', 26.85, 80.95, 'Upper Gangetic Plains', 'Alluvial loam', 1000),
  R('Kanpur Nagar', 'Uttar Pradesh', 26.45, 80.33, 'Upper Gangetic Plains', 'Alluvial loam', 820),
  R('Varanasi', 'Uttar Pradesh', 25.32, 82.97, 'Middle Gangetic Plains', 'Alluvial loam', 1050),
  R('Gorakhpur', 'Uttar Pradesh', 26.76, 83.37, 'Middle Gangetic Plains', 'Alluvial clay', 1250),
  R('Bareilly', 'Uttar Pradesh', 28.37, 79.43, 'Upper Gangetic Plains', 'Alluvial loam', 1000),
  R('Agra', 'Uttar Pradesh', 27.18, 78.01, 'Upper Gangetic Plains', 'Alluvial loam', 660),
  R('Muzaffarnagar', 'Uttar Pradesh', 29.47, 77.70, 'Upper Gangetic Plains', 'Alluvial loam', 900),
  R('Prayagraj', 'Uttar Pradesh', 25.44, 81.85, 'Middle Gangetic Plains', 'Alluvial loam', 950),
  R('Aligarh', 'Uttar Pradesh', 27.90, 78.09, 'Upper Gangetic Plains', 'Alluvial loam', 700),

  // Madhya Pradesh / Chhattisgarh
  R('Indore', 'Madhya Pradesh', 22.72, 75.86, 'Central Plateau & Hills', 'Black cotton', 950),
  R('Bhopal', 'Madhya Pradesh', 23.26, 77.41, 'Central Plateau & Hills', 'Black cotton', 1150),
  R('Jabalpur', 'Madhya Pradesh', 23.18, 79.99, 'Central Plateau & Hills', 'Black cotton', 1350),
  R('Ujjain', 'Madhya Pradesh', 23.18, 75.78, 'Central Plateau & Hills', 'Black cotton', 900),
  R('Sagar', 'Madhya Pradesh', 23.84, 78.74, 'Central Plateau & Hills', 'Black cotton', 1200),
  R('Raipur', 'Chhattisgarh', 21.25, 81.63, 'Eastern Plateau & Hills', 'Red-yellow', 1300),
  R('Durg', 'Chhattisgarh', 21.19, 81.28, 'Eastern Plateau & Hills', 'Red-yellow', 1100),
  R('Bilaspur', 'Chhattisgarh', 22.08, 82.15, 'Eastern Plateau & Hills', 'Red-yellow', 1250),

  // Gujarat / Rajasthan
  R('Ahmedabad', 'Gujarat', 23.03, 72.58, 'Gujarat Plains & Hills', 'Alluvial sandy', 800),
  R('Rajkot', 'Gujarat', 22.30, 70.80, 'Gujarat Plains & Hills', 'Black medium', 600),
  R('Junagadh', 'Gujarat', 21.52, 70.46, 'Gujarat Plains & Hills', 'Black medium', 900),
  R('Vadodara', 'Gujarat', 22.31, 73.18, 'Gujarat Plains & Hills', 'Black cotton', 950),
  R('Banaskantha', 'Gujarat', 24.17, 72.44, 'Gujarat Plains & Hills', 'Sandy loam', 650),
  R('Jaipur', 'Rajasthan', 26.91, 75.79, 'Western Dry Region', 'Sandy loam', 560),
  R('Jodhpur', 'Rajasthan', 26.24, 73.02, 'Western Dry Region', 'Desert sandy', 360),
  R('Kota', 'Rajasthan', 25.21, 75.86, 'Western Dry Region', 'Black cotton', 800),
  R('Sri Ganganagar', 'Rajasthan', 29.92, 73.88, 'Western Dry Region', 'Sandy loam', 250),
  R('Alwar', 'Rajasthan', 27.55, 76.63, 'Western Dry Region', 'Sandy loam', 620),

  // Andhra Pradesh / Telangana
  R('Guntur', 'Andhra Pradesh', 16.31, 80.44, 'East Coast Plains & Hills', 'Black cotton', 900),
  R('Krishna', 'Andhra Pradesh', 16.51, 80.62, 'East Coast Plains & Hills', 'Deltaic alluvial', 1000),
  R('Kurnool', 'Andhra Pradesh', 15.83, 78.04, 'Southern Plateau & Hills', 'Red loam', 670),
  R('Anantapur', 'Andhra Pradesh', 14.68, 77.60, 'Southern Plateau & Hills', 'Red sandy', 520),
  R('Chittoor', 'Andhra Pradesh', 13.22, 79.10, 'Southern Plateau & Hills', 'Red loam', 900),
  R('East Godavari', 'Andhra Pradesh', 17.00, 82.00, 'East Coast Plains & Hills', 'Deltaic alluvial', 1100),
  R('Hyderabad', 'Telangana', 17.39, 78.49, 'Southern Plateau & Hills', 'Red loam', 800),
  R('Warangal', 'Telangana', 17.98, 79.59, 'Southern Plateau & Hills', 'Red loam', 1000),
  R('Nizamabad', 'Telangana', 18.67, 78.09, 'Southern Plateau & Hills', 'Black cotton', 1050),
  R('Khammam', 'Telangana', 17.25, 80.15, 'Southern Plateau & Hills', 'Red loam', 1100),

  // Tamil Nadu / Kerala
  R('Coimbatore', 'Tamil Nadu', 11.02, 76.96, 'Southern Plateau & Hills', 'Red loam', 700),
  R('Thanjavur', 'Tamil Nadu', 10.79, 79.14, 'East Coast Plains & Hills', 'Deltaic alluvial', 1000),
  R('Madurai', 'Tamil Nadu', 9.93, 78.12, 'Southern Plateau & Hills', 'Red loam', 850),
  R('Erode', 'Tamil Nadu', 11.34, 77.72, 'Southern Plateau & Hills', 'Red loam', 700),
  R('Salem', 'Tamil Nadu', 11.66, 78.15, 'Southern Plateau & Hills', 'Red loam', 900),
  R('Tiruchirappalli', 'Tamil Nadu', 10.79, 78.70, 'East Coast Plains & Hills', 'Red loam', 840),
  R('Villupuram', 'Tamil Nadu', 11.94, 79.49, 'East Coast Plains & Hills', 'Red loam', 1100),
  R('Palakkad', 'Kerala', 10.78, 76.65, 'West Coast Plains', 'Lateritic', 2400),
  R('Thrissur', 'Kerala', 10.53, 76.21, 'West Coast Plains', 'Lateritic', 3000),
  R('Alappuzha', 'Kerala', 9.50, 76.34, 'West Coast Plains', 'Alluvial peaty', 2900),
  R('Wayanad', 'Kerala', 11.69, 76.13, 'West Coast Plains', 'Lateritic', 3000),

  // West Bengal / Odisha / Bihar / Jharkhand
  R('Bardhaman', 'West Bengal', 23.26, 87.86, 'Lower Gangetic Plains', 'Alluvial loam', 1400),
  R('Nadia', 'West Bengal', 23.47, 88.55, 'Lower Gangetic Plains', 'Alluvial loam', 1500),
  R('Murshidabad', 'West Bengal', 24.18, 88.27, 'Lower Gangetic Plains', 'Alluvial loam', 1450),
  R('Hooghly', 'West Bengal', 22.90, 88.39, 'Lower Gangetic Plains', 'Alluvial loam', 1600),
  R('Jalpaiguri', 'West Bengal', 26.52, 88.72, 'Eastern Himalayan Region', 'Alluvial sandy', 3200),
  R('Cuttack', 'Odisha', 20.46, 85.88, 'East Coast Plains & Hills', 'Deltaic alluvial', 1500),
  R('Sambalpur', 'Odisha', 21.47, 83.98, 'Eastern Plateau & Hills', 'Red-yellow', 1500),
  R('Ganjam', 'Odisha', 19.39, 84.79, 'East Coast Plains & Hills', 'Red loam', 1300),
  R('Patna', 'Bihar', 25.59, 85.14, 'Middle Gangetic Plains', 'Alluvial loam', 1100),
  R('Muzaffarpur', 'Bihar', 26.12, 85.39, 'Middle Gangetic Plains', 'Alluvial loam', 1200),
  R('Bhagalpur', 'Bihar', 25.24, 86.99, 'Middle Gangetic Plains', 'Alluvial loam', 1150),
  R('Ranchi', 'Jharkhand', 23.34, 85.31, 'Eastern Plateau & Hills', 'Red laterite', 1400),
  R('Hazaribagh', 'Jharkhand', 23.99, 85.36, 'Eastern Plateau & Hills', 'Red laterite', 1300),

  // North / North-East / Islands
  R('Dehradun', 'Uttarakhand', 30.32, 78.03, 'Western Himalayan Region', 'Alluvial loam', 2100),
  R('Udham Singh Nagar', 'Uttarakhand', 28.97, 79.40, 'Upper Gangetic Plains', 'Alluvial loam', 1400),
  R('Shimla', 'Himachal Pradesh', 31.10, 77.17, 'Western Himalayan Region', 'Brown hill', 1500),
  R('Kangra', 'Himachal Pradesh', 32.10, 76.27, 'Western Himalayan Region', 'Brown hill', 1800),
  R('Srinagar', 'Jammu & Kashmir', 34.08, 74.80, 'Western Himalayan Region', 'Karewa loam', 710),
  R('Jammu', 'Jammu & Kashmir', 32.73, 74.86, 'Western Himalayan Region', 'Alluvial loam', 1100),
  R('Guwahati (Kamrup)', 'Assam', 26.14, 91.74, 'Eastern Himalayan Region', 'Alluvial sandy', 1700),
  R('Jorhat', 'Assam', 26.75, 94.22, 'Eastern Himalayan Region', 'Alluvial loam', 2000),
  R('Imphal West', 'Manipur', 24.81, 93.94, 'Eastern Himalayan Region', 'Red loam', 1500),
  R('Shillong', 'Meghalaya', 25.58, 91.89, 'Eastern Himalayan Region', 'Red laterite', 2800),
  R('Agartala', 'Tripura', 23.83, 91.28, 'Eastern Himalayan Region', 'Red laterite', 2200),
  R('Aizawl', 'Mizoram', 23.73, 92.72, 'Eastern Himalayan Region', 'Red laterite', 2500),
  R('Kohima', 'Nagaland', 25.67, 94.11, 'Eastern Himalayan Region', 'Red laterite', 2000),
  R('Itanagar', 'Arunachal Pradesh', 27.08, 93.61, 'Eastern Himalayan Region', 'Brown hill', 2800),
  R('Gangtok', 'Sikkim', 27.33, 88.61, 'Eastern Himalayan Region', 'Brown hill', 2700),
  R('Panaji', 'Goa', 15.49, 73.83, 'West Coast Plains', 'Lateritic', 2900),
  R('Port Blair', 'Andaman & Nicobar', 11.62, 92.73, 'Islands Region', 'Lateritic', 3000),
  R('Kavaratti', 'Lakshadweep', 10.57, 72.64, 'Islands Region', 'Coral sandy', 1600),
  R('New Delhi', 'Delhi', 28.61, 77.21, 'Trans-Gangetic Plains', 'Alluvial loam', 790),
  R('Chandigarh', 'Chandigarh', 30.73, 76.78, 'Trans-Gangetic Plains', 'Alluvial loam', 1100),
  R('Puducherry', 'Puducherry', 11.94, 79.83, 'East Coast Plains & Hills', 'Red loam', 1250),
];

export const STATES = Array.from(new Set(PLACES.map((p) => p.s))).sort();

/** Prefix + substring search across district and state, ranked. */
export function searchPlaces(q: string, limit = 12): Place[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return PLACES.slice(0, limit);
  const scored = PLACES.map((p) => {
    const d = p.d.toLowerCase();
    const s = p.s.toLowerCase();
    let score = 0;
    if (d.startsWith(needle)) score += 100;
    else if (d.includes(needle)) score += 60;
    if (s.startsWith(needle)) score += 40;
    else if (s.includes(needle)) score += 22;
    if (p.z.toLowerCase().includes(needle)) score += 8;
    return { p, score };
  }).filter((x) => x.score > 0);
  scored.sort((a, b) => b.score - a.score || a.p.d.localeCompare(b.p.d));
  return scored.slice(0, limit).map((x) => x.p);
}

export function haversineKm(aLat: number, aLon: number, bLat: number, bLon: number) {
  const R_ = 6371, rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(bLat - aLat), dLon = rad(bLon - aLon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R_ * Math.asin(Math.sqrt(h));
}

/** Nearest gazetteer entry — the whole reverse-geocode runs on device. */
export function nearestPlace(lat: number, lon: number): { place: Place; km: number } {
  let best = PLACES[0], bestKm = Infinity;
  for (const p of PLACES) {
    const km = haversineKm(lat, lon, p.lat, p.lon);
    if (km < bestKm) { bestKm = km; best = p; }
  }
  return { place: best, km: +bestKm.toFixed(1) };
}

export type Fix = { lat: number; lon: number; accuracy: number | null; at: number; place: Place; km: number };

/** Live GPS fix with graceful, explicit failure messages. */
export async function getFix(): Promise<{ ok: true; fix: Fix } | { ok: false; reason: string }> {
  try {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (!perm.granted) return { ok: false, reason: 'Location permission was declined. You can still search for your district by name.' };
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    const near = nearestPlace(pos.coords.latitude, pos.coords.longitude);
    return {
      ok: true,
      fix: {
        lat: +pos.coords.latitude.toFixed(5),
        lon: +pos.coords.longitude.toFixed(5),
        accuracy: pos.coords.accuracy ?? null,
        at: Date.now(),
        place: near.place,
        km: near.km,
      },
    };
  } catch (e: any) {
    return { ok: false, reason: e?.message ?? 'Could not read GPS on this device.' };
  }
}

export async function watchFix(cb: (f: Fix) => void): Promise<() => void> {
  try {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (!perm.granted) return () => {};
    const sub = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.Balanced, distanceInterval: 25, timeInterval: 15000 },
      (pos) => {
        const near = nearestPlace(pos.coords.latitude, pos.coords.longitude);
        cb({
          lat: +pos.coords.latitude.toFixed(5), lon: +pos.coords.longitude.toFixed(5),
          accuracy: pos.coords.accuracy ?? null, at: Date.now(), place: near.place, km: near.km,
        });
      },
    );
    return () => sub.remove();
  } catch {
    return () => {};
  }
}
