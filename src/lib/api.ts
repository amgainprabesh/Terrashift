import type {
  FarmerPriorities,
  FarmParcelProfile,
  NasaPowerSummary,
  RotationSimulationResult,
} from './agronomy';
import { getFirebaseIdToken } from './firebase';
import type { RawExternalTelemetryInput } from './nasaResources';

export interface WeatherForecastDay {
  displayDate?: { year: number; month: number; day: number };
  daytimeForecast?: {
    weatherCondition?: { description?: { text?: string }; type?: string };
    relativeHumidity?: number;
    precipitation?: { probability?: { percent?: number } };
  };
  maxTemperature?: { degrees?: number; unit?: string };
  minTemperature?: { degrees?: number; unit?: string };
}

export interface MapsWeatherResponse {
  available: boolean;
  quotaExceeded?: boolean;
  reason?: string;
  current?: {
    temperature?: { degrees?: number; unit?: string };
    relativeHumidity?: number;
    weatherCondition?: { description?: { text?: string } };
    wind?: { speed?: { value?: number; unit?: string } };
    precipitation?: { probability?: { percent?: number } };
  };
  forecastDays?: WeatherForecastDay[];
}

export interface SavedRotationPlanRecord {
  id: number;
  parcelId: number;
  planName: string;
  horizonYears: number;
  waterPriority: number;
  soilCarbonPriority: number;
  yieldPriority: number;
  sequenceJson: string;
  waterSavingsPct: number;
  carbonDeltaTonPerHa: number;
  nitrogenBalanceKgHa: number;
  resilienceScore: number;
  aiBriefMarkdown: string | null;
  sheetUrl: string | null;
  docUrl: string | null;
  formUrl: string | null;
  createdAt: string;
}

export interface SavedFarmRecord {
  id: number;
  name: string;
  region: string;
  lat: number;
  lng: number;
  areaHectares: number;
  soilType: string;
  soilPh: number;
  baselineOrganicCarbon: number;
  irrigationAccess: string;
  currentCrop: string;
  createdAt: string;
  latestSnapshot: {
    meanTempC: number;
    annualPrecipMm: number;
    meanRootMoisture: number;
    meanSurfaceMoisture: number;
    solarIrradiance: number;
    elevationM: number;
    climateRiskIndex: number;
    payloadJson: string;
  } | null;
  rotationPlans: SavedRotationPlanRecord[];
}

export async function fetchGoogleMapsClientKey(): Promise<string> {
  const envKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  if (envKey) return envKey;
  try {
    const res = await fetch('/api/maps/client-config');
    if (!res.ok) return '';
    const data = await res.json();
    return data.googleMapsApiKey ?? '';
  } catch {
    return '';
  }
}

export async function fetchNasaPowerTelemetry(
  lat: number,
  lng: number
): Promise<NasaPowerSummary> {
  const res = await fetch(
    `/api/nasa/power?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}`
  );
  if (!res.ok) {
    throw new Error(`NASA POWER fetch failed (${res.status})`);
  }
  return res.json();
}

export async function fetchMultiSourceTelemetry(
  lat: number,
  lng: number
): Promise<RawExternalTelemetryInput> {
  try {
    const res = await fetch(
      `/api/nasa/multi-source?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}`
    );
    if (!res.ok) return {};
    return await res.json();
  } catch {
    return {};
  }
}

export async function fetchMapsWeather(
  lat: number,
  lng: number
): Promise<MapsWeatherResponse> {
  const res = await fetch(
    `/api/maps/weather?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}`
  );
  if (res.status === 429) {
    window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
    return { available: false, quotaExceeded: true };
  }
  const data = (await res.json()) as MapsWeatherResponse & {
    error?: { status?: string };
  };
  if (data?.error?.status === 'RESOURCE_EXHAUSTED' || data?.quotaExceeded) {
    window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
  }
  return data;
}

export async function requestAiQuickCheck(payload: {
  parcelName: string;
  region: string;
  currentCrop: string;
  nasa: NasaPowerSummary;
  nextYearCrop?: string;
}): Promise<{ text: string; model: string; latencyMs: number }> {
  const res = await fetch('/api/ai/quick-check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Quick check failed');
  return data;
}

export async function requestAiDeepStrategy(payload: {
  parcel: FarmParcelProfile;
  nasa: NasaPowerSummary;
  simulation: RotationSimulationResult;
  priorities: FarmerPriorities;
}): Promise<{ markdown: string; model: string; thinkingLevel: string; latencyMs: number }> {
  const res = await fetch('/api/ai/deep-strategy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Deep strategy failed');
  return data;
}

export async function requestSearchGrounding(payload: {
  region: string;
  cropName: string;
  soilType: string;
  climateRiskIndex: number;
}): Promise<{ markdown: string; sources: Array<{ uri: string; title?: string }> }> {
  const res = await fetch('/api/ai/grounding-search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Search grounding failed');
  return data;
}

export async function requestMapsGrounding(payload: {
  lat: number;
  lng: number;
  region: string;
}): Promise<{ markdown: string; places: Array<{ uri: string; title?: string }> }> {
  const res = await fetch('/api/ai/grounding-maps', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Maps grounding failed');
  return data;
}

async function authedFetch(url: string, init: RequestInit = {}) {
  const idToken = await getFirebaseIdToken();
  if (!idToken) {
    throw new Error('Please sign in with Google to save or load Cloud SQL records.');
  }
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export async function fetchSavedFarms(): Promise<SavedFarmRecord[]> {
  const data = await authedFetch('/api/farms');
  return data.farms ?? [];
}

export async function saveFarmParcelToSql(
  parcel: FarmParcelProfile,
  nasa: NasaPowerSummary
): Promise<SavedFarmRecord> {
  const data = await authedFetch('/api/farms', {
    method: 'POST',
    body: JSON.stringify({
      name: parcel.name,
      region: parcel.region,
      lat: parcel.lat,
      lng: parcel.lng,
      areaHectares: parcel.areaHectares,
      soilType: parcel.soilType,
      soilPh: parcel.soilPh,
      baselineOrganicCarbon: parcel.baselineOrganicCarbon,
      irrigationAccess: parcel.irrigationAccess,
      currentCrop: parcel.currentCropId,
      snapshot: {
        meanTempC: nasa.meanTempC,
        annualPrecipMm: nasa.annualPrecipMm,
        meanRootMoisture: nasa.meanRootMoisture,
        meanSurfaceMoisture: nasa.meanSurfaceMoisture,
        solarIrradiance: nasa.meanSolarIrradiance,
        elevationM: nasa.elevationM,
        climateRiskIndex: nasa.climateRiskIndex,
        payloadJson: JSON.stringify(nasa),
      },
    }),
  });
  return data.farm;
}

export async function deleteFarmParcelFromSql(parcelId: number): Promise<void> {
  await authedFetch(`/api/farms/${parcelId}`, { method: 'DELETE' });
}

export async function saveRotationPlanToSql(payload: {
  parcelId: number;
  simulation: RotationSimulationResult;
  priorities: FarmerPriorities;
  aiBriefMarkdown?: string | null;
  sheetUrl?: string | null;
  docUrl?: string | null;
  formUrl?: string | null;
}): Promise<SavedRotationPlanRecord> {
  const data = await authedFetch('/api/rotations', {
    method: 'POST',
    body: JSON.stringify({
      parcelId: payload.parcelId,
      planName: payload.simulation.planName,
      horizonYears: payload.priorities.horizonYears,
      waterPriority: payload.priorities.waterEfficiency,
      soilCarbonPriority: payload.priorities.soilHealth,
      yieldPriority: payload.priorities.yieldStability,
      sequenceJson: JSON.stringify(payload.simulation.steps),
      waterSavingsPct: payload.simulation.adaptedTotals.waterSavingsPct,
      carbonDeltaTonPerHa: payload.simulation.adaptedTotals.cumulativeCarbonDeltaTonHa,
      nitrogenBalanceKgHa: payload.simulation.adaptedTotals.cumulativeNitrogenKgHa,
      resilienceScore: payload.simulation.adaptedTotals.resilienceScore,
      aiBriefMarkdown: payload.aiBriefMarkdown ?? null,
      sheetUrl: payload.sheetUrl ?? null,
      docUrl: payload.docUrl ?? null,
      formUrl: payload.formUrl ?? null,
    }),
  });
  return data.plan;
}

export async function updateRotationPlanExportsSql(
  planId: number,
  exports: { sheetUrl?: string; docUrl?: string; formUrl?: string }
): Promise<SavedRotationPlanRecord> {
  const data = await authedFetch(`/api/rotations/${planId}/exports`, {
    method: 'PATCH',
    body: JSON.stringify(exports),
  });
  return data.plan;
}
