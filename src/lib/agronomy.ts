export type IrrigationAccess = 'rainfed' | 'deficit_drip' | 'full_pivot';

export type BotanicalFamily =
  | 'Poaceae'
  | 'Fabaceae'
  | 'Asteraceae'
  | 'Brassicaceae';

export type CropCategory = 'cash_grain' | 'legume_oilseed' | 'cover_forage';

export type CropVisualArchetype =
  | 'maize'
  | 'soybean'
  | 'wheat_rye'
  | 'sorghum_millet'
  | 'clover_alfalfa'
  | 'sunflower';

export interface CropProfile {
  id: string;
  name: string;
  family: BotanicalFamily;
  category: CropCategory;
  archetype: CropVisualArchetype;
  seasonWindow: string;
  waterDemandMm: number;
  rootDepthM: number;
  droughtTolerance: number; // 0..1
  heatStressThresholdC: number;
  nitrogenDeltaKgHa: number; // negative = uptake, positive = biological fixation
  organicCarbonDeltaTonHa: number; // soil organic carbon change per year
  baseYieldValueIndex: number; // 0..100 economic / caloric stability score
  frostHardiness: number; // 0..1
  colorHex: string;
  agronomicRole: string;
}

export interface FarmParcelProfile {
  id: string;
  name: string;
  region: string;
  lat: number;
  lng: number;
  areaHectares: number;
  soilType: string;
  soilPh: number;
  baselineOrganicCarbon: number; // % SOC in top 30cm
  irrigationAccess: IrrigationAccess;
  currentCropId: string;
  climateZoneNote: string;
}

export interface MonthlyTelemetryPoint {
  monthKey: string; // e.g., "2024-07"
  label: string; // e.g., "Jul 24"
  monthIndex: number; // 1..12
  tempC: number;
  precipMmDay: number;
  rootMoisture: number; // 0..1 GWETROOT
  surfaceMoisture: number; // 0..1 GWETTOP
  solarIrradiance: number; // MJ/m^2/day
  relHumidity: number; // %
}

export interface ClimatologyMonthAvg {
  month: number; // 1..12
  label: string;
  tempC: number;
  precipMmMonth: number;
  rootMoisture: number;
  solarIrradiance: number;
}

export interface NasaPowerSummary {
  source: 'NASA_POWER_LIVE' | 'CLIMATOLOGY_FALLBACK';
  lat: number;
  lng: number;
  elevationM: number;
  periodLabel: string;
  meanTempC: number;
  peakSummerTempC: number;
  annualPrecipMm: number;
  precipVariabilityPct: number;
  meanRootMoisture: number;
  minRootMoisture: number;
  meanSurfaceMoisture: number;
  meanSolarIrradiance: number;
  dryStressMonths: number;
  tempAnomalyC: number;
  climateRiskIndex: number; // 0..100
  estimatedNdvi: number; // 0.15..0.88 derived from water/solar balance
  monthlySeries: MonthlyTelemetryPoint[];
  climatology: ClimatologyMonthAvg[];
}

export interface FarmerPriorities {
  waterEfficiency: number; // 0..100
  soilHealth: number; // 0..100
  yieldStability: number; // 0..100
  horizonYears: 3 | 4;
  irrigationAccess: IrrigationAccess;
  includeCoverCrops: boolean;
}

export interface RotationYearStep {
  year: number;
  primaryCrop: CropProfile;
  coverCrop: CropProfile | null;
  waterUsedMm: number;
  waterDeficitMm: number;
  projectedRootMoisture: number;
  nitrogenBalanceKgHa: number;
  carbonDeltaTonHa: number;
  yieldResilienceScore: number;
  rationale: string;
}

export interface AgronomicRadarMetrics {
  waterEfficiency: number; // 0..100
  soilOrganicCarbon: number; // 0..100
  nitrogenSelfSufficiency: number; // 0..100
  heatDroughtResilience: number; // 0..100
  pestDiseaseBreak: number; // 0..100
  yieldStability: number; // 0..100
}

export interface RotationSimulationResult {
  planName: string;
  steps: RotationYearStep[];
  baselineMonoculture: {
    crop: CropProfile;
    annualWaterMm: number;
    cumulativeCarbonDeltaTonHa: number;
    cumulativeNitrogenKgHa: number;
    resilienceScore: number;
    radar: AgronomicRadarMetrics;
  };
  adaptedTotals: {
    avgAnnualWaterMm: number;
    waterSavingsPct: number;
    cumulativeCarbonDeltaTonHa: number;
    cumulativeNitrogenKgHa: number;
    resilienceScore: number;
    finalSoilOrganicCarbonPct: number;
    radar: AgronomicRadarMetrics;
  };
  monthlyMoistureProjection: Array<{
    monthLabel: string;
    baselineMoisturePct: number;
    adaptedMoisturePct: number;
  }>;
}

export const CROP_CATALOG: CropProfile[] = [
  {
    id: 'maize',
    name: 'Dent Maize (Corn)',
    family: 'Poaceae',
    category: 'cash_grain',
    archetype: 'maize',
    seasonWindow: 'Apr – Sep',
    waterDemandMm: 580,
    rootDepthM: 1.2,
    droughtTolerance: 0.42,
    heatStressThresholdC: 31,
    nitrogenDeltaKgHa: -145,
    organicCarbonDeltaTonHa: 0.12,
    baseYieldValueIndex: 92,
    frostHardiness: 0.15,
    colorHex: '#ca8a04',
    agronomicRole: 'High-biomass C4 grain anchor; high nitrogen and peak-summer water demand.',
  },
  {
    id: 'soybean',
    name: 'Soybean',
    family: 'Fabaceae',
    category: 'legume_oilseed',
    archetype: 'soybean',
    seasonWindow: 'May – Sep',
    waterDemandMm: 440,
    rootDepthM: 1.0,
    droughtTolerance: 0.56,
    heatStressThresholdC: 32,
    nitrogenDeltaKgHa: 58,
    organicCarbonDeltaTonHa: 0.18,
    baseYieldValueIndex: 86,
    frostHardiness: 0.2,
    colorHex: '#16a34a',
    agronomicRole: 'Symbiotic nitrogen fixer that breaks grassy pest cycles and lowers synthetic N need.',
  },
  {
    id: 'sorghum',
    name: 'Grain Sorghum',
    family: 'Poaceae',
    category: 'cash_grain',
    archetype: 'sorghum_millet',
    seasonWindow: 'May – Sep',
    waterDemandMm: 360,
    rootDepthM: 1.55,
    droughtTolerance: 0.86,
    heatStressThresholdC: 36,
    nitrogenDeltaKgHa: -90,
    organicCarbonDeltaTonHa: 0.24,
    baseYieldValueIndex: 78,
    frostHardiness: 0.15,
    colorHex: '#d97706',
    agronomicRole: 'Deep-rooted drought-resilient cereal adapted to heat spikes and low root-zone moisture.',
  },
  {
    id: 'pearl_millet',
    name: 'Pearl Millet',
    family: 'Poaceae',
    category: 'cash_grain',
    archetype: 'sorghum_millet',
    seasonWindow: 'Jun – Sep',
    waterDemandMm: 310,
    rootDepthM: 1.45,
    droughtTolerance: 0.91,
    heatStressThresholdC: 38,
    nitrogenDeltaKgHa: -65,
    organicCarbonDeltaTonHa: 0.22,
    baseYieldValueIndex: 72,
    frostHardiness: 0.1,
    colorHex: '#b45309',
    agronomicRole: 'Ultra-low-water C4 cereal sustaining grain yield under acute rainfall deficits.',
  },
  {
    id: 'winter_wheat',
    name: 'Winter Wheat',
    family: 'Poaceae',
    category: 'cash_grain',
    archetype: 'wheat_rye',
    seasonWindow: 'Oct – Jun',
    waterDemandMm: 390,
    rootDepthM: 1.3,
    droughtTolerance: 0.68,
    heatStressThresholdC: 29,
    nitrogenDeltaKgHa: -95,
    organicCarbonDeltaTonHa: 0.28,
    baseYieldValueIndex: 82,
    frostHardiness: 0.85,
    colorHex: '#eab308',
    agronomicRole: 'Cool-season cereal capturing winter-spring moisture before peak summer heat.',
  },
  {
    id: 'chickpea',
    name: 'Chickpea / Lentil Pulse',
    family: 'Fabaceae',
    category: 'legume_oilseed',
    archetype: 'soybean',
    seasonWindow: 'Mar – Jul',
    waterDemandMm: 290,
    rootDepthM: 0.95,
    droughtTolerance: 0.82,
    heatStressThresholdC: 33,
    nitrogenDeltaKgHa: 48,
    organicCarbonDeltaTonHa: 0.2,
    baseYieldValueIndex: 76,
    frostHardiness: 0.45,
    colorHex: '#15803d',
    agronomicRole: 'Water-thrifty cool-season pulse adding biological nitrogen with minimal soil moisture draw.',
  },
  {
    id: 'sunflower',
    name: 'Oilseed Sunflower',
    family: 'Asteraceae',
    category: 'legume_oilseed',
    archetype: 'sunflower',
    seasonWindow: 'May – Sep',
    waterDemandMm: 380,
    rootDepthM: 1.85,
    droughtTolerance: 0.78,
    heatStressThresholdC: 34,
    nitrogenDeltaKgHa: -75,
    organicCarbonDeltaTonHa: 0.21,
    baseYieldValueIndex: 79,
    frostHardiness: 0.25,
    colorHex: '#f59e0b',
    agronomicRole: 'Deep taproot scavenges leached subsoil nutrients and breaks broadleaf/cereal disease cycles.',
  },
  {
    id: 'alfalfa',
    name: 'Alfalfa (Lucerne)',
    family: 'Fabaceae',
    category: 'cover_forage',
    archetype: 'clover_alfalfa',
    seasonWindow: 'Apr – Oct',
    waterDemandMm: 470,
    rootDepthM: 2.1,
    droughtTolerance: 0.74,
    heatStressThresholdC: 33,
    nitrogenDeltaKgHa: 115,
    organicCarbonDeltaTonHa: 0.58,
    baseYieldValueIndex: 74,
    frostHardiness: 0.8,
    colorHex: '#059669',
    agronomicRole: 'Deep-rooted perennial legume rebuilding soil structure, infiltration, and organic carbon.',
  },
  {
    id: 'cereal_rye_cover',
    name: 'Winter Cereal Rye (Cover)',
    family: 'Poaceae',
    category: 'cover_forage',
    archetype: 'wheat_rye',
    seasonWindow: 'Oct – Apr',
    waterDemandMm: 140,
    rootDepthM: 1.1,
    droughtTolerance: 0.84,
    heatStressThresholdC: 28,
    nitrogenDeltaKgHa: 12,
    organicCarbonDeltaTonHa: 0.46,
    baseYieldValueIndex: 45,
    frostHardiness: 0.95,
    colorHex: '#65a30d',
    agronomicRole: 'Overwinter living armor halting wind/water erosion and sequestering surface carbon.',
  },
  {
    id: 'crimson_clover_cover',
    name: 'Crimson Clover + Radish Mix',
    family: 'Brassicaceae',
    category: 'cover_forage',
    archetype: 'clover_alfalfa',
    seasonWindow: 'Sep – Apr',
    waterDemandMm: 130,
    rootDepthM: 1.25,
    droughtTolerance: 0.72,
    heatStressThresholdC: 29,
    nitrogenDeltaKgHa: 64,
    organicCarbonDeltaTonHa: 0.42,
    baseYieldValueIndex: 48,
    frostHardiness: 0.72,
    colorHex: '#10b981',
    agronomicRole: 'Bio-drilling taproot & legume cover relieving compaction and fixing spring nitrogen.',
  },
];

export const CURATED_PARCELS: FarmParcelProfile[] = [
  {
    id: 'iowa-story',
    name: 'Story County Corn-Belt Parcel',
    region: 'Iowa, United States',
    lat: 42.0308,
    lng: -93.6319,
    areaHectares: 64,
    soilType: 'Clarion-Nicollet Mollisol (Loam)',
    soilPh: 6.4,
    baselineOrganicCarbon: 3.4,
    irrigationAccess: 'rainfed',
    currentCropId: 'maize',
    climateZoneNote: 'Humid continental; intensifying July-August heat & flash-drought variability.',
  },
  {
    id: 'california-salinas',
    name: 'San Joaquin & Salinas Corridor',
    region: 'California, United States',
    lat: 36.6777,
    lng: -121.6555,
    areaHectares: 48,
    soilType: 'Chualar Sandy Loam (Alluvial)',
    soilPh: 7.1,
    baselineOrganicCarbon: 1.6,
    irrigationAccess: 'deficit_drip',
    currentCropId: 'maize',
    climateZoneNote: 'Mediterranean semi-arid; strict groundwater allocation and dry summer evapotranspiration.',
  },
  {
    id: 'punjab-ludhiana',
    name: 'Sutlej Basin Transition Plot',
    region: 'Punjab, India',
    lat: 30.901,
    lng: 75.8573,
    areaHectares: 28,
    soilType: 'Indo-Gangetic Silty Clay Loam',
    soilPh: 7.6,
    baselineOrganicCarbon: 0.9,
    irrigationAccess: 'deficit_drip',
    currentCropId: 'winter_wheat',
    climateZoneNote: 'Subtropical monsoon; groundwater depletion and pre-monsoon heatwaves above 38°C.',
  },
  {
    id: 'brazil-cerrado',
    name: 'Sorriso Cerrado Plateau',
    region: 'Mato Grosso, Brazil',
    lat: -12.5425,
    lng: -55.7211,
    areaHectares: 120,
    soilType: 'Ferralsol Oxisol (Deep Clay)',
    soilPh: 5.5,
    baselineOrganicCarbon: 2.1,
    irrigationAccess: 'rainfed',
    currentCropId: 'soybean',
    climateZoneNote: 'Tropical savanna; bimodal wet/dry seasons requiring rapid double-crop cover.',
  },
  {
    id: 'kenya-rift',
    name: 'Nakuru Highland Smallholder Grid',
    region: 'Rift Valley, Kenya',
    lat: -0.3031,
    lng: 36.08,
    areaHectares: 16,
    soilType: 'Andosol Volcanic Loam',
    soilPh: 6.1,
    baselineOrganicCarbon: 2.5,
    irrigationAccess: 'rainfed',
    currentCropId: 'maize',
    climateZoneNote: 'Equatorial highland; bimodal rains with erratic onset and rising dry-spell risk.',
  },
];

const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

export function getCropById(id: string): CropProfile {
  return CROP_CATALOG.find((c) => c.id === id) ?? CROP_CATALOG[0];
}

export function analyzeNasaPowerPayload(
  raw: Record<string, unknown>,
  lat: number,
  lng: number,
  source: 'NASA_POWER_LIVE' | 'CLIMATOLOGY_FALLBACK' = 'NASA_POWER_LIVE'
): NasaPowerSummary {
  const geometry = raw.geometry as { coordinates?: number[] } | undefined;
  const elevationM =
    Array.isArray(geometry?.coordinates) &&
    typeof geometry.coordinates[2] === 'number'
      ? Math.round(geometry.coordinates[2])
      : 220;

  const props = raw.properties as
    | { parameter?: Record<string, Record<string, number>> }
    | undefined;
  const params = props?.parameter ?? {};

  const t2m = params.T2M ?? {};
  const precip = params.PRECTOTCORR ?? {};
  const gwetRoot = params.GWETROOT ?? {};
  const gwetTop = params.GWETTOP ?? {};
  const solar = params.ALLSKY_SFC_SW_DWN ?? {};
  const rh2m = params.RH2M ?? {};

  const validKeys = Object.keys(t2m)
    .filter((k) => /^\d{6}$/.test(k) && !k.endsWith('13'))
    .filter((k) => t2m[k] > -90 && (precip[k] ?? 0) >= 0)
    .sort();

  const monthlySeries: MonthlyTelemetryPoint[] = validKeys.map((key) => {
    const year = key.slice(2, 4);
    const monthNum = parseInt(key.slice(4, 6), 10);
    const label = `${MONTH_NAMES[monthNum - 1] ?? 'M'} ${year}`;
    return {
      monthKey: `${key.slice(0, 4)}-${key.slice(4, 6)}`,
      label,
      monthIndex: monthNum,
      tempC: Number((t2m[key] ?? 15).toFixed(2)),
      precipMmDay: Number((precip[key] ?? 2).toFixed(2)),
      rootMoisture: Number(Math.max(0.05, Math.min(0.99, gwetRoot[key] ?? 0.5)).toFixed(3)),
      surfaceMoisture: Number(Math.max(0.05, Math.min(0.99, gwetTop[key] ?? 0.48)).toFixed(3)),
      solarIrradiance: Number(Math.max(2, solar[key] ?? 15).toFixed(2)),
      relHumidity: Number(Math.max(10, Math.min(100, rh2m[key] ?? 60)).toFixed(1)),
    };
  });

  // Group into 12-month climatology averages
  const climatology: ClimatologyMonthAvg[] = MONTH_NAMES.map((label, idx) => {
    const m = idx + 1;
    const pts = monthlySeries.filter((p) => p.monthIndex === m);
    const count = pts.length || 1;
    const avgTemp = pts.reduce((s, p) => s + p.tempC, 0) / count;
    const avgPrecipDay = pts.reduce((s, p) => s + p.precipMmDay, 0) / count;
    const avgRoot = pts.reduce((s, p) => s + p.rootMoisture, 0) / count;
    const avgSolar = pts.reduce((s, p) => s + p.solarIrradiance, 0) / count;
    return {
      month: m,
      label,
      tempC: Number(avgTemp.toFixed(1)),
      precipMmMonth: Number((avgPrecipDay * 30.4).toFixed(1)),
      rootMoisture: Number(avgRoot.toFixed(3)),
      solarIrradiance: Number(avgSolar.toFixed(1)),
    };
  });

  const n = monthlySeries.length || 1;
  const meanTempC = Number(
    (monthlySeries.reduce((s, p) => s + p.tempC, 0) / n).toFixed(1)
  );
  const peakSummerTempC = Number(
    Math.max(...climatology.map((c) => c.tempC), meanTempC).toFixed(1)
  );
  const annualPrecipMm = Math.round(
    climatology.reduce((s, c) => s + c.precipMmMonth, 0)
  );

  // Annual precipitation variability (coefficient of variation across years)
  const yearsMap: Record<string, number> = {};
  for (const pt of monthlySeries) {
    const yr = pt.monthKey.slice(0, 4);
    yearsMap[yr] = (yearsMap[yr] ?? 0) + pt.precipMmDay * 30.4;
  }
  const annualTotals = Object.values(yearsMap);
  const meanYrPrecip =
    annualTotals.reduce((a, b) => a + b, 0) / (annualTotals.length || 1);
  const variance =
    annualTotals.reduce((a, v) => a + (v - meanYrPrecip) ** 2, 0) /
    (annualTotals.length || 1);
  const precipVariabilityPct = Math.round(
    meanYrPrecip > 0 ? (Math.sqrt(variance) / meanYrPrecip) * 100 : 18
  );

  const meanRootMoisture = Number(
    (monthlySeries.reduce((s, p) => s + p.rootMoisture, 0) / n).toFixed(3)
  );
  const minRootMoisture = Number(
    Math.min(...monthlySeries.map((p) => p.rootMoisture), meanRootMoisture).toFixed(3)
  );
  const meanSurfaceMoisture = Number(
    (monthlySeries.reduce((s, p) => s + p.surfaceMoisture, 0) / n).toFixed(3)
  );
  const meanSolarIrradiance = Number(
    (monthlySeries.reduce((s, p) => s + p.solarIrradiance, 0) / n).toFixed(1)
  );

  // Recent 12 months vs earlier baseline temperature shift
  const recent12 = monthlySeries.slice(-12);
  const earlier = monthlySeries.slice(0, Math.max(1, monthlySeries.length - 12));
  const recentAvgT =
    recent12.reduce((s, p) => s + p.tempC, 0) / (recent12.length || 1);
  const earlierAvgT =
    earlier.reduce((s, p) => s + p.tempC, 0) / (earlier.length || 1);
  const tempAnomalyC = Number((recentAvgT - earlierAvgT).toFixed(2));

  const dryStressMonths = climatology.filter(
    (c) => c.rootMoisture < 0.46 || c.precipMmMonth < 35
  ).length;

  // Composite Climate Risk Index (0..100)
  const moistureRisk = Math.max(0, (0.58 - meanRootMoisture) * 140);
  const precipRisk = Math.max(0, (850 - annualPrecipMm) / 14);
  const heatRisk = Math.max(0, (peakSummerTempC - 26) * 3.2);
  const variabilityRisk = Math.min(25, precipVariabilityPct * 0.7);
  const climateRiskIndex = Math.round(
    Math.max(12, Math.min(96, moistureRisk + precipRisk * 0.5 + heatRisk + variabilityRisk))
  );

  // Estimated NDVI proxy derived from root-zone moisture + temperature suitability
  const thermalFactor = peakSummerTempC > 35 ? 0.84 : 1.0;
  const estimatedNdvi = Number(
    Math.max(
      0.18,
      Math.min(0.86, (0.24 + meanRootMoisture * 0.82) * thermalFactor)
    ).toFixed(2)
  );

  const firstKey = monthlySeries[0]?.monthKey ?? '2021-01';
  const lastKey = monthlySeries[monthlySeries.length - 1]?.monthKey ?? '2025-12';

  return {
    source,
    lat,
    lng,
    elevationM,
    periodLabel: `${firstKey} to ${lastKey}`,
    meanTempC,
    peakSummerTempC,
    annualPrecipMm,
    precipVariabilityPct,
    meanRootMoisture,
    minRootMoisture,
    meanSurfaceMoisture,
    meanSolarIrradiance,
    dryStressMonths,
    tempAnomalyC,
    climateRiskIndex,
    estimatedNdvi,
    monthlySeries,
    climatology,
  };
}

export function buildDeterministicFallbackPower(
  lat: number,
  lng: number
): NasaPowerSummary {
  const absLat = Math.abs(lat);
  const isArid =
    (lng < -114 && lat > 28 && lat < 41) ||
    (lng > 65 && lng < 80 && lat > 22 && lat < 33);
  const baseTemp = Math.max(6, 28 - absLat * 0.42);
  const amp = absLat * 0.28 + (isArid ? 4 : 2);
  const basePrecip = isArid ? 1.15 : Math.max(1.5, 4.4 - absLat * 0.045);

  const t2m: Record<string, number> = {};
  const precip: Record<string, number> = {};
  const gwetRoot: Record<string, number> = {};
  const gwetTop: Record<string, number> = {};
  const solar: Record<string, number> = {};
  const rh2m: Record<string, number> = {};

  for (let yr = 2021; yr <= 2025; yr++) {
    const yrShift = (yr - 2021) * 0.14;
    for (let m = 1; m <= 12; m++) {
      const key = `${yr}${String(m).padStart(2, '0')}`;
      const phase = lat >= 0 ? ((m - 7) / 12) * Math.PI * 2 : ((m - 1) / 12) * Math.PI * 2;
      const t = baseTemp + Math.cos(phase) * amp + yrShift;
      const rainWave = Math.max(
        0.2,
        basePrecip * (1 + 0.55 * Math.cos(phase - 0.6)) * (yr === 2023 ? 0.82 : 1)
      );
      const moisture = Math.max(
        0.28,
        Math.min(0.76, (isArid ? 0.37 : 0.54) + 0.09 * Math.sin(phase + 0.9))
      );
      t2m[key] = Number(t.toFixed(2));
      precip[key] = Number(rainWave.toFixed(2));
      gwetRoot[key] = Number(moisture.toFixed(3));
      gwetTop[key] = Number(Math.max(0.22, moisture - 0.04).toFixed(3));
      solar[key] = Number((14 + 6 * Math.cos(phase)).toFixed(2));
      rh2m[key] = Number((isArid ? 44 : 68).toFixed(1));
    }
  }

  return analyzeNasaPowerPayload(
    {
      geometry: { coordinates: [lng, lat, 240] },
      properties: {
        parameter: {
          T2M: t2m,
          PRECTOTCORR: precip,
          GWETROOT: gwetRoot,
          GWETTOP: gwetTop,
          ALLSKY_SFC_SW_DWN: solar,
          RH2M: rh2m,
        },
      },
    },
    lat,
    lng,
    'CLIMATOLOGY_FALLBACK'
  );
}

function getIrrigationSupplyMm(access: IrrigationAccess): number {
  if (access === 'full_pivot') return 320;
  if (access === 'deficit_drip') return 155;
  return 0;
}

function scoreSingleCropForSite(
  crop: CropProfile,
  nasa: NasaPowerSummary,
  priorities: FarmerPriorities
): number {
  const effectiveWaterSupplyMm =
    nasa.annualPrecipMm * 0.62 + getIrrigationSupplyMm(priorities.irrigationAccess);

  const waterDeficit = Math.max(0, crop.waterDemandMm - effectiveWaterSupplyMm);
  const waterScore = Math.max(
    0,
    100 - (waterDeficit / Math.max(120, crop.waterDemandMm)) * 115 - (crop.waterDemandMm / 700) * 28
  );

  const heatExcess = Math.max(0, nasa.peakSummerTempC - crop.heatStressThresholdC);
  const climateFitScore = Math.max(
    0,
    100 - heatExcess * 11 + crop.droughtTolerance * (nasa.dryStressMonths * 4.5)
  );

  const soilScore = Math.max(
    0,
    Math.min(
      100,
      50 + crop.organicCarbonDeltaTonHa * 85 + crop.nitrogenDeltaKgHa * 0.35
    )
  );

  const yieldScore = crop.baseYieldValueIndex * (1 - heatExcess * 0.06);

  const totalWeight =
    Math.max(1, priorities.waterEfficiency + priorities.soilHealth + priorities.yieldStability);

  return (
    (waterScore * priorities.waterEfficiency +
      soilScore * priorities.soilHealth +
      (yieldScore * 0.6 + climateFitScore * 0.4) * priorities.yieldStability) /
    totalWeight
  );
}

export function optimizeCropRotation(
  parcel: FarmParcelProfile,
  nasa: NasaPowerSummary,
  priorities: FarmerPriorities
): RotationSimulationResult {
  const cashCandidates = CROP_CATALOG.filter((c) => c.category !== 'cover_forage');
  const coverCandidates = CROP_CATALOG.filter((c) => c.category === 'cover_forage');

  const baseCrop = getCropById(parcel.currentCropId);
  const effectiveSupplyMm =
    nasa.annualPrecipMm * 0.64 + getIrrigationSupplyMm(priorities.irrigationAccess);

  // Build optimal diversified sequence over horizonYears using greedy + lookahead family-alternation scoring
  const chosenPrimary: CropProfile[] = [];
  const chosenCovers: Array<CropProfile | null> = [];

  for (let yr = 1; yr <= priorities.horizonYears; yr++) {
    const prevPrimary = chosenPrimary[yr - 2] ?? baseCrop;
    const usedIds = new Set(chosenPrimary.map((c) => c.id));

    let bestCrop = cashCandidates[0];
    let bestScore = -Infinity;

    for (const candidate of cashCandidates) {
      let score = scoreSingleCropForSite(candidate, nasa, priorities);

      // Strong botanical family diversification bonus (never repeat same family consecutively)
      if (candidate.family !== prevPrimary.family) {
        score += 24;
      } else {
        score -= 36;
      }

      // Reward legume after high-N-demanding cereal
      if (prevPrimary.nitrogenDeltaKgHa < -60 && candidate.family === 'Fabaceae') {
        score += 18 * (0.4 + priorities.soilHealth / 100);
      }

      // Encourage broad crop diversity across the full 3-4 year window
      if (!usedIds.has(candidate.id)) {
        score += 14;
      } else {
        score -= 18;
      }

      // Enforce water reality when rainfed and dry
      if (
        priorities.irrigationAccess === 'rainfed' &&
        nasa.meanRootMoisture < 0.47 &&
        candidate.waterDemandMm > 460
      ) {
        score -= 28;
      }

      if (score > bestScore) {
        bestScore = score;
        bestCrop = candidate;
      }
    }

    chosenPrimary.push(bestCrop);

    if (priorities.includeCoverCrops) {
      // Pick legume cover after cereal, or cereal rye cover after legume/oilseed
      const cover =
        bestCrop.family === 'Fabaceae'
          ? coverCandidates.find((c) => c.id === 'cereal_rye_cover') ?? coverCandidates[0]
          : bestCrop.id === 'sorghum' && priorities.soilHealth > 70 && yr === priorities.horizonYears
            ? coverCandidates.find((c) => c.id === 'alfalfa') ?? coverCandidates[1]
            : coverCandidates.find((c) => c.id === 'crimson_clover_cover') ?? coverCandidates[1];
      chosenCovers.push(cover);
    } else {
      chosenCovers.push(null);
    }
  }

  let runningCarbonPct = parcel.baselineOrganicCarbon;
  const steps: RotationYearStep[] = [];

  for (let i = 0; i < priorities.horizonYears; i++) {
    const primary = chosenPrimary[i];
    const cover = chosenCovers[i];
    const prevPrimary = i === 0 ? baseCrop : chosenPrimary[i - 1];

    const coverMoistureRetentionFactor = cover ? 0.91 : 1.0;
    const totalWaterUsedMm = Math.round(
      primary.waterDemandMm * coverMoistureRetentionFactor +
        (cover ? cover.waterDemandMm * 0.35 : 0)
    );
    const deficit = Math.max(0, totalWaterUsedMm - Math.round(effectiveSupplyMm));

    const nCarryover = prevPrimary.family === 'Fabaceae' ? 28 : 0;
    const nBalance = Math.round(
      primary.nitrogenDeltaKgHa + (cover ? cover.nitrogenDeltaKgHa : 0) + nCarryover
    );

    const carbonDelta = Number(
      (
        primary.organicCarbonDeltaTonHa +
        (cover ? cover.organicCarbonDeltaTonHa * 0.85 : 0)
      ).toFixed(2)
    );
    runningCarbonPct = Number((runningCarbonPct + carbonDelta * 0.08).toFixed(2));

    const moistureBonus = cover ? 0.045 : 0;
    const projectedRootMoisture = Number(
      Math.max(
        0.22,
        Math.min(
          0.88,
          nasa.meanRootMoisture +
            moistureBonus -
            (deficit / 1200) * 0.14
        )
      ).toFixed(3)
    );

    const heatPenalty = Math.max(0, nasa.peakSummerTempC - primary.heatStressThresholdC) * 4.5;
    const familyBreakBonus = primary.family !== prevPrimary.family ? 11 : -8;
    const stepResilience = Math.round(
      Math.max(
        32,
        Math.min(
          98,
          62 +
            primary.droughtTolerance * 22 +
            familyBreakBonus +
            (cover ? 8 : 0) -
            heatPenalty -
            (deficit > 80 ? 9 : 0)
        )
      )
    );

    const rationaleParts = [
      primary.family !== prevPrimary.family
        ? `Rotates from ${prevPrimary.family} to ${primary.family} to disrupt root pathogens.`
        : `Maintains resilient cereal canopy.`,
      deficit === 0
        ? `Water demand (${totalWaterUsedMm} mm) fits seasonal NASA moisture supply.`
        : `Moderate deficit (${deficit} mm) buffered by ${primary.rootDepthM}m root zone.`,
      cover
        ? `Off-season ${cover.name} adds +${cover.organicCarbonDeltaTonHa} t C/ha and reduces evaporation.`
        : `Bare winter fallow leaves surface moisture exposed.`,
    ];

    steps.push({
      year: i + 1,
      primaryCrop: primary,
      coverCrop: cover,
      waterUsedMm: totalWaterUsedMm,
      waterDeficitMm: deficit,
      projectedRootMoisture,
      nitrogenBalanceKgHa: nBalance,
      carbonDeltaTonHa: carbonDelta,
      yieldResilienceScore: stepResilience,
      rationale: rationaleParts.join(' '),
    });
  }

  // Baseline continuous monoculture metrics
  const baseWaterDeficit = Math.max(0, baseCrop.waterDemandMm - effectiveSupplyMm);
  const baseResilience = Math.round(
    Math.max(
      24,
      Math.min(
        82,
        48 +
          baseCrop.droughtTolerance * 18 -
          (baseWaterDeficit / 25) -
          Math.max(0, nasa.peakSummerTempC - baseCrop.heatStressThresholdC) * 5 -
          12 // continuous monoculture pest & soil-fatigue penalty
      )
    )
  );

  const avgAdaptedWater = Math.round(
    steps.reduce((s, st) => s + st.waterUsedMm, 0) / steps.length
  );
  const waterSavingsPct = Number(
    (
      ((baseCrop.waterDemandMm - avgAdaptedWater) /
        Math.max(1, baseCrop.waterDemandMm)) *
      100
    ).toFixed(1)
  );
  const cumulativeCarbon = Number(
    steps.reduce((s, st) => s + st.carbonDeltaTonHa, 0).toFixed(2)
  );
  const cumulativeN = Math.round(
    steps.reduce((s, st) => s + st.nitrogenBalanceKgHa, 0)
  );
  const avgResilience = Math.round(
    steps.reduce((s, st) => s + st.yieldResilienceScore, 0) / steps.length
  );

  const distinctFamilies = new Set(steps.map((s) => s.primaryCrop.family)).size;
  const pestBreakScore = Math.min(
    98,
    Math.round(38 + distinctFamilies * 18 + (priorities.includeCoverCrops ? 10 : 0))
  );

  const adaptedRadar: AgronomicRadarMetrics = {
    waterEfficiency: Math.max(25, Math.min(98, Math.round(62 + waterSavingsPct * 1.1))),
    soilOrganicCarbon: Math.max(25, Math.min(98, Math.round(40 + cumulativeCarbon * 22))),
    nitrogenSelfSufficiency: Math.max(
      20,
      Math.min(96, Math.round(68 + cumulativeN * 0.14))
    ),
    heatDroughtResilience: avgResilience,
    pestDiseaseBreak: pestBreakScore,
    yieldStability: Math.round(
      Math.max(
        40,
        Math.min(
          97,
          steps.reduce((s, st) => s + st.primaryCrop.baseYieldValueIndex, 0) /
            steps.length *
            0.55 +
            avgResilience * 0.45
        )
      )
    ),
  };

  const baselineRadar: AgronomicRadarMetrics = {
    waterEfficiency: Math.max(18, Math.min(78, Math.round(52 - baseWaterDeficit / 18))),
    soilOrganicCarbon: Math.max(18, Math.min(62, Math.round(35 + baseCrop.organicCarbonDeltaTonHa * 45))),
    nitrogenSelfSufficiency: Math.max(
      15,
      Math.min(70, Math.round(48 + baseCrop.nitrogenDeltaKgHa * 0.2))
    ),
    heatDroughtResilience: baseResilience,
    pestDiseaseBreak: 24,
    yieldStability: Math.max(30, Math.min(76, Math.round(baseResilience * 0.92))),
  };

  const monthlyMoistureProjection = nasa.climatology.map((c) => {
    const basePct = Math.round(Math.max(18, Math.min(86, c.rootMoisture * 100 - 4)));
    const adaptedBoost = priorities.includeCoverCrops ? 8 : 4;
    const waterSaveBoost = Math.max(0, waterSavingsPct * 0.22);
    const adaptedPct = Math.round(
      Math.max(22, Math.min(92, basePct + adaptedBoost + waterSaveBoost))
    );
    return {
      monthLabel: c.label,
      baselineMoisturePct: basePct,
      adaptedMoisturePct: adaptedPct,
    };
  });

  const SHORT_CROP_NAMES: Record<string, string> = {
    maize: 'Maize',
    soybean: 'Soybean',
    sorghum: 'Sorghum',
    pearl_millet: 'Millet',
    winter_wheat: 'Wheat',
    chickpea: 'Chickpea',
    sunflower: 'Sunflower',
    alfalfa: 'Alfalfa',
    cereal_rye_cover: 'Rye',
    crimson_clover_cover: 'Clover',
  };
  const sequenceShort = steps
    .map((s) => SHORT_CROP_NAMES[s.primaryCrop.id] ?? s.primaryCrop.name.split(' ')[0])
    .join(' → ');

  return {
    planName: `${priorities.horizonYears}-Yr Shift: ${sequenceShort}`,
    steps,
    baselineMonoculture: {
      crop: baseCrop,
      annualWaterMm: baseCrop.waterDemandMm,
      cumulativeCarbonDeltaTonHa: Number(
        ((baseCrop.organicCarbonDeltaTonHa - 0.18) * priorities.horizonYears).toFixed(2)
      ),
      cumulativeNitrogenKgHa: baseCrop.nitrogenDeltaKgHa * priorities.horizonYears,
      resilienceScore: baseResilience,
      radar: baselineRadar,
    },
    adaptedTotals: {
      avgAnnualWaterMm: avgAdaptedWater,
      waterSavingsPct,
      cumulativeCarbonDeltaTonHa: cumulativeCarbon,
      cumulativeNitrogenKgHa: cumulativeN,
      resilienceScore: avgResilience,
      finalSoilOrganicCarbonPct: runningCarbonPct,
      radar: adaptedRadar,
    },
    monthlyMoistureProjection,
  };
}

export interface FiveYearSoilNutrientPoint {
  monthKey: string;
  label: string;
  year: string;
  rootMoisturePct: number;
  surfaceMoisturePct: number;
  nutrientDepletionPct: number;
}

export interface FiveYearSoilNutrientTrendSummary {
  points: FiveYearSoilNutrientPoint[];
  firstYearMoisturePct: number;
  latestYearMoisturePct: number;
  moistureDeltaPct: number;
  latestSurfaceMoisturePct: number;
  startDepletionPct: number;
  endDepletionPct: number;
  depletionDeltaPct: number;
  cropName: string;
}

export function deriveFiveYearSoilNutrientTrends(
  nasa: NasaPowerSummary,
  parcel: FarmParcelProfile
): FiveYearSoilNutrientTrendSummary {
  const currentCrop = getCropById(parcel.currentCropId);
  const series = nasa.monthlySeries;

  const isLegumeFixer = currentCrop.nitrogenDeltaKgHa > 0;
  const socBuffer = Math.max(
    0.58,
    Math.min(1.15, 1.12 - parcel.baselineOrganicCarbon * 0.12)
  );
  let cumulativeDepletion = isLegumeFixer ? 10.0 : 14.0;

  const points: FiveYearSoilNutrientPoint[] = series.map((pt) => {
    const rootMoisturePct = Number((pt.rootMoisture * 100).toFixed(1));
    const surfaceMoisturePct = Number((pt.surfaceMoisture * 100).toFixed(1));

    const isActiveSeason = pt.tempC > 9 && pt.rootMoisture > 0.28;
    const seasonFactor = isActiveSeason ? 1.32 : 0.45;

    // Nitrogen/nutrient extraction or biological replenishment modulated by active season
    const baseMonthlyDemand = isLegumeFixer
      ? isActiveSeason
        ? -0.06
        : 0.12
      : (Math.abs(currentCrop.nitrogenDeltaKgHa) / 12) * 0.085 * seasonFactor;

    // Nitrate & base-cation leaching during high precipitation months (>3.6 mm/day avg)
    const leachingStress = Math.max(0, pt.precipMmDay - 3.6) * 0.14;

    // Organic matter mineralization / volatilization loss under heat extremes (>28°C)
    const thermalLoss = Math.max(0, pt.tempC - 28) * 0.055;

    const monthlyStep = (baseMonthlyDemand + leachingStress + thermalLoss) * socBuffer;
    cumulativeDepletion = Math.max(4, Math.min(96, cumulativeDepletion + monthlyStep));

    return {
      monthKey: pt.monthKey,
      label: pt.label,
      year: pt.monthKey.slice(0, 4),
      rootMoisturePct,
      surfaceMoisturePct,
      nutrientDepletionPct: Number(cumulativeDepletion.toFixed(1)),
    };
  });

  const windowSize = Math.min(12, Math.max(1, points.length));
  const firstSlice = points.slice(0, windowSize);
  const lastSlice = points.slice(-windowSize);

  const avg = (arr: FiveYearSoilNutrientPoint[], pick: (p: FiveYearSoilNutrientPoint) => number) =>
    Number((arr.reduce((s, p) => s + pick(p), 0) / Math.max(1, arr.length)).toFixed(1));

  const firstYearMoisturePct = avg(firstSlice, (p) => p.rootMoisturePct);
  const latestYearMoisturePct = avg(lastSlice, (p) => p.rootMoisturePct);
  const moistureDeltaPct = Number((latestYearMoisturePct - firstYearMoisturePct).toFixed(1));
  const latestSurfaceMoisturePct = avg(lastSlice, (p) => p.surfaceMoisturePct);

  const startDepletionPct = points[0]?.nutrientDepletionPct ?? 14;
  const endDepletionPct = points[points.length - 1]?.nutrientDepletionPct ?? startDepletionPct;
  const depletionDeltaPct = Number((endDepletionPct - startDepletionPct).toFixed(1));

  return {
    points,
    firstYearMoisturePct,
    latestYearMoisturePct,
    moistureDeltaPct,
    latestSurfaceMoisturePct,
    startDepletionPct,
    endDepletionPct,
    depletionDeltaPct,
    cropName: currentCrop.name,
  };
}

export interface MultiYearClimatePoint {
  index: number;
  monthKey: string;
  label: string;
  year: string;
  tempC: number;
  precipMmMonth: number;
  tempTrendC: number;
  precipTrendMm: number;
}

export interface AnnualClimateRollupPoint {
  index: number;
  year: string;
  meanTempC: number;
  peakTempC: number;
  totalPrecipMm: number;
  meanMonthlyPrecipMm: number;
  tempTrendC: number;
  precipTrendMm: number;
}

export interface MultiYearClimateTrendSummary {
  monthlyPoints: MultiYearClimatePoint[];
  annualPoints: AnnualClimateRollupPoint[];
  tempSlopePerFiveYrsC: number;
  precipSlopePerFiveYrsMm: number;
  hottestMonthLabel: string;
  hottestMonthTempC: number;
  driestYearLabel: string;
  driestYearPrecipMm: number;
  adaptationAdvisory: string;
}

function computeLinearFit(values: number[]): { intercept: number; slope: number } {
  const n = values.length;
  if (n <= 1) return { intercept: values[0] ?? 0, slope: 0 };
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += values[i];
    sumXY += i * values[i];
    sumXX += i * i;
  }
  const denom = n * sumXX - sumX * sumX;
  if (Math.abs(denom) < 1e-9) {
    return { intercept: sumY / n, slope: 0 };
  }
  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  return { intercept, slope };
}

export function deriveMultiYearClimateTrends(
  nasa: NasaPowerSummary
): MultiYearClimateTrendSummary {
  const rawSeries = nasa.monthlySeries;
  const temps = rawSeries.map((p) => p.tempC);
  const precips = rawSeries.map((p) => Number((p.precipMmDay * 30.4).toFixed(1)));

  const tempFit = computeLinearFit(temps);
  const precipFit = computeLinearFit(precips);

  const monthlyPoints: MultiYearClimatePoint[] = rawSeries.map((pt, idx) => {
    const precipMmMonth = precips[idx];
    const tempTrendC = Number((tempFit.intercept + tempFit.slope * idx).toFixed(2));
    const precipTrendMm = Number(
      Math.max(0, precipFit.intercept + precipFit.slope * idx).toFixed(1)
    );
    return {
      index: idx,
      monthKey: pt.monthKey,
      label: pt.label,
      year: pt.monthKey.slice(0, 4),
      tempC: pt.tempC,
      precipMmMonth,
      tempTrendC,
      precipTrendMm,
    };
  });

  // Group into annual rollups
  const byYear = new Map<string, MultiYearClimatePoint[]>();
  for (const pt of monthlyPoints) {
    const list = byYear.get(pt.year) ?? [];
    list.push(pt);
    byYear.set(pt.year, list);
  }

  const years = Array.from(byYear.keys()).sort();
  const rawAnnual = years.map((year, idx) => {
    const pts = byYear.get(year) ?? [];
    const count = Math.max(1, pts.length);
    const meanTempC = Number(
      (pts.reduce((s, p) => s + p.tempC, 0) / count).toFixed(2)
    );
    const peakTempC = Number(
      Math.max(...pts.map((p) => p.tempC), meanTempC).toFixed(1)
    );
    const meanMonthlyPrecipMm = Number(
      (pts.reduce((s, p) => s + p.precipMmMonth, 0) / count).toFixed(1)
    );
    const totalPrecipMm = Math.round(meanMonthlyPrecipMm * 12);
    return {
      index: idx,
      year,
      meanTempC,
      peakTempC,
      totalPrecipMm,
      meanMonthlyPrecipMm,
    };
  });

  const annTempFit = computeLinearFit(rawAnnual.map((a) => a.meanTempC));
  const annPrecipFit = computeLinearFit(rawAnnual.map((a) => a.totalPrecipMm));

  const annualPoints: AnnualClimateRollupPoint[] = rawAnnual.map((a, idx) => ({
    ...a,
    tempTrendC: Number((annTempFit.intercept + annTempFit.slope * idx).toFixed(2)),
    precipTrendMm: Math.round(
      Math.max(0, annPrecipFit.intercept + annPrecipFit.slope * idx)
    ),
  }));

  const spanYears = Math.max(1, annualPoints.length - 1);
  const tempSlopePerFiveYrsC = Number((annTempFit.slope * spanYears).toFixed(2));
  const precipSlopePerFiveYrsMm = Math.round(annPrecipFit.slope * spanYears);

  let hottest = monthlyPoints[0];
  for (const pt of monthlyPoints) {
    if (!hottest || pt.tempC > hottest.tempC) hottest = pt;
  }

  let driest = annualPoints[0];
  for (const yr of annualPoints) {
    if (!driest || yr.totalPrecipMm < driest.totalPrecipMm) driest = yr;
  }

  const warmingNote =
    tempSlopePerFiveYrsC >= 0.25
      ? `Warming trajectory (+${tempSlopePerFiveYrsC}°C across ${nasa.periodLabel}) accelerates reproductive heat stress`
      : `Thermal regime stable (${tempSlopePerFiveYrsC >= 0 ? '+' : ''}${tempSlopePerFiveYrsC}°C shift)`;

  const rainNote =
    precipSlopePerFiveYrsMm < -15
      ? `drying rainfall trend (${precipSlopePerFiveYrsMm} mm/yr) favors deep-rooted C4 grains and drought-hardy pulses.`
      : precipSlopePerFiveYrsMm > 15
        ? `rising precipitation trend (+${precipSlopePerFiveYrsMm} mm/yr) increases nitrate leaching risk—maintain winter cover-crop roots.`
        : `inter-annual rainfall swings (driest year ${driest?.year ?? '2023'} at ${driest?.totalPrecipMm ?? nasa.annualPrecipMm} mm) reward diversified root depths.`;

  return {
    monthlyPoints,
    annualPoints,
    tempSlopePerFiveYrsC,
    precipSlopePerFiveYrsMm,
    hottestMonthLabel: hottest?.label ?? 'Jul',
    hottestMonthTempC: hottest?.tempC ?? nasa.peakSummerTempC,
    driestYearLabel: driest?.year ?? '2023',
    driestYearPrecipMm: driest?.totalPrecipMm ?? nasa.annualPrecipMm,
    adaptationAdvisory: `${warmingNote}; ${rainNote}`,
  };
}

export interface ParsedCoordinateResult {
  lat: number;
  lng: number;
  formatted: string;
}

/**
 * Parses flexible coordinate strings such as:
 * - "36.7378, -119.7871"
 * - "36.7378 -119.7871"
 * - "30.9010° N, 75.8573° E"
 * - "lat: 41.5868, lng: -93.6250"
 */
export function parseCoordinateQuery(raw: string): ParsedCoordinateResult | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 80) return null;

  // Reject plain text words that aren't coordinate labels or cardinal directions
  const strippedAlpha = trimmed
    .replace(/\b(lat|latitude|lng|lon|long|longitude)\b/gi, '')
    .replace(/[°'"NSEWnsew,:\s+-.\d]/g, '');
  if (strippedAlpha.length > 0) return null;

  const tokenRegex = /([+-]?\d+(?:\.\d+)?)\s*°?\s*([NSEWnsew])?/g;
  const matches = Array.from(trimmed.matchAll(tokenRegex));
  if (matches.length !== 2) return null;

  let firstVal = Number(matches[0][1]);
  const firstDir = (matches[0][2] || '').toUpperCase();
  let secondVal = Number(matches[1][1]);
  const secondDir = (matches[1][2] || '').toUpperCase();

  if (!Number.isFinite(firstVal) || !Number.isFinite(secondVal)) return null;

  if (firstDir === 'S') firstVal = -Math.abs(firstVal);
  if (firstDir === 'N') firstVal = Math.abs(firstVal);
  if (firstDir === 'W') firstVal = -Math.abs(firstVal);
  if (firstDir === 'E') firstVal = Math.abs(firstVal);

  if (secondDir === 'S') secondVal = -Math.abs(secondVal);
  if (secondDir === 'N') secondVal = Math.abs(secondVal);
  if (secondDir === 'W') secondVal = -Math.abs(secondVal);
  if (secondDir === 'E') secondVal = Math.abs(secondVal);

  let lat = firstVal;
  let lng = secondVal;

  // Swap if user gave E/W first and N/S second
  if ((firstDir === 'E' || firstDir === 'W') && (secondDir === 'N' || secondDir === 'S')) {
    lat = secondVal;
    lng = firstVal;
  }

  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;

  const cleanLat = Number(lat.toFixed(4));
  const cleanLng = Number(lng.toFixed(4));
  return {
    lat: cleanLat,
    lng: cleanLng,
    formatted: `${cleanLat.toFixed(4)}, ${cleanLng.toFixed(4)}`,
  };
}

export interface AgriculturalDirectoryEntry {
  id: string;
  name: string;
  region: string;
  country: string;
  lat: number;
  lng: number;
  soilType: string;
  primaryCrop: string;
  climateTag: string;
  parcelPreset?: FarmParcelProfile;
}

export const GLOBAL_AGRICULTURAL_DIRECTORY: AgriculturalDirectoryEntry[] = [
  ...CURATED_PARCELS.map((p) => ({
    id: p.id,
    name: p.name,
    region: p.region,
    country: p.region.split(',').pop()?.trim() || 'Global',
    lat: p.lat,
    lng: p.lng,
    soilType: p.soilType,
    primaryCrop: getCropById(p.currentCropId).name,
    climateTag: 'Benchmark Parcel',
    parcelPreset: p,
  })),
  {
    id: 'dir-imperial-valley',
    name: 'Imperial Valley Irrigated District',
    region: 'El Centro, California, USA',
    country: 'USA',
    lat: 32.792,
    lng: -115.5631,
    soilType: 'Colorado River Alluvial Silt',
    primaryCrop: 'Alfalfa & Winter Vegetables',
    climateTag: 'Hyper-Arid Canal',
  },
  {
    id: 'dir-sacramento-valley',
    name: 'Sacramento Valley Rice & Orchard Belt',
    region: 'Colusa County, California, USA',
    country: 'USA',
    lat: 39.2143,
    lng: -122.0094,
    soilType: 'Capay Silty Clay',
    primaryCrop: 'Rice & Sunflower',
    climateTag: 'Mediterranean Basin',
  },
  {
    id: 'dir-ogallala-kansas',
    name: 'Ogallala Aquifer High Plains Sector',
    region: 'Garden City, Kansas, USA',
    country: 'USA',
    lat: 37.9717,
    lng: -100.8727,
    soilType: 'Richfield Silt Loam',
    primaryCrop: 'Grain Sorghum & Winter Wheat',
    climateTag: 'Aquifer Depletion Zone',
  },
  {
    id: 'dir-palouse-washington',
    name: 'Palouse Loess Dryland Hills',
    region: 'Whitman County, Washington, USA',
    country: 'USA',
    lat: 46.7298,
    lng: -117.1817,
    soilType: 'Palouse Deep Windblown Loess',
    primaryCrop: 'Winter Wheat & Chickpea',
    climateTag: 'Steep Slope Erosion',
  },
  {
    id: 'dir-mississippi-delta',
    name: 'Mississippi Alluvial Plain',
    region: 'Stuttgart, Arkansas, USA',
    country: 'USA',
    lat: 34.5004,
    lng: -91.5526,
    soilType: 'Sharkey Alluvial Clay Loam',
    primaryCrop: 'Soybean & Maize',
    climateTag: 'Humid Subtropical',
  },
  {
    id: 'dir-red-river-nd',
    name: 'Red River Valley Glacial Lake Plain',
    region: 'Fargo, North Dakota, USA',
    country: 'USA',
    lat: 46.8772,
    lng: -96.7898,
    soilType: 'Fargo-Hegne Mollisol Clay',
    primaryCrop: 'Spring Wheat & Oilseed Sunflower',
    climateTag: 'Short Season Cold',
  },
  {
    id: 'dir-nile-delta',
    name: 'Nile River Delta Agronomic Basin',
    region: 'Kafr El Sheikh, Nile Delta, Egypt',
    country: 'Egypt',
    lat: 31.1107,
    lng: 30.9388,
    soilType: 'Nile Alluvial Vertisol',
    primaryCrop: 'Winter Wheat & Berseem Clover',
    climateTag: 'Salinity & Heat Watch',
  },
  {
    id: 'dir-murray-darling',
    name: 'Murray-Darling Riverina Plain',
    region: 'Griffith, New South Wales, Australia',
    country: 'Australia',
    lat: -34.2886,
    lng: 146.0509,
    soilType: 'Red-Brown Chromosol Loam',
    primaryCrop: 'Winter Wheat & Chickpea',
    climateTag: 'ENSO Drought Variability',
  },
  {
    id: 'dir-pampas-argentina',
    name: 'Humid Pampas Core Cropland',
    region: 'Pergamino, Buenos Aires, Argentina',
    country: 'Argentina',
    lat: -33.89,
    lng: -60.5736,
    soilType: 'Typic Argiudoll Mollisol',
    primaryCrop: 'Soybean & Maize Rotation',
    climateTag: 'La Niña Moisture Swing',
  },
  {
    id: 'dir-po-valley',
    name: 'Po Valley Alluvial Plain',
    region: 'Piacenza, Emilia-Romagna, Italy',
    country: 'Italy',
    lat: 45.0526,
    lng: 9.693,
    soilType: 'Calcareous Fluvisol Loam',
    primaryCrop: 'Maize, Tomato & Alfalfa',
    climateTag: 'Alpine Runoff Deficit',
  },
  {
    id: 'dir-ukraine-chernozem',
    name: 'Central Dnipro Chernozem Steppe',
    region: 'Poltava Oblast, Ukraine',
    country: 'Ukraine',
    lat: 49.5883,
    lng: 34.5514,
    soilType: 'Deep Black Chernozem (5.2% SOC)',
    primaryCrop: 'Oilseed Sunflower & Winter Wheat',
    climateTag: 'Continental Steppe',
  },
  {
    id: 'dir-mekong-delta',
    name: 'Mekong Delta Alluvial Terrace',
    region: 'Can Tho, Mekong Delta, Vietnam',
    country: 'Vietnam',
    lat: 10.0452,
    lng: 105.7469,
    soilType: 'Gleyic Fluvisol Silt',
    primaryCrop: 'Rice & Mungbean Pulse',
    climateTag: 'Monsoon & Tidal Intrusion',
  },
];

export function searchAgriculturalDirectory(
  query: string,
  limit = 6
): AgriculturalDirectoryEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    return GLOBAL_AGRICULTURAL_DIRECTORY.slice(0, limit);
  }

  const tokens = q.split(/\s+/).filter(Boolean);
  const scored: Array<{ entry: AgriculturalDirectoryEntry; score: number }> = [];

  for (const entry of GLOBAL_AGRICULTURAL_DIRECTORY) {
    const nameL = entry.name.toLowerCase();
    const regionL = entry.region.toLowerCase();
    const countryL = entry.country.toLowerCase();
    const cropL = entry.primaryCrop.toLowerCase();
    const soilL = entry.soilType.toLowerCase();
    const tagL = entry.climateTag.toLowerCase();
    const combined = `${nameL} ${regionL} ${countryL} ${cropL} ${soilL} ${tagL} ${entry.lat} ${entry.lng}`;

    const allMatched = tokens.every((tok) => combined.includes(tok));
    if (!allMatched) continue;

    let score = 10;
    if (nameL.startsWith(q) || regionL.startsWith(q)) score += 50;
    else if (nameL.includes(q)) score += 35;
    else if (regionL.includes(q) || countryL.includes(q)) score += 25;
    if (cropL.includes(q) || soilL.includes(q)) score += 15;
    if (entry.parcelPreset) score += 8;

    scored.push({ entry, score });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.entry);
}



