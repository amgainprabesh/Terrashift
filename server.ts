import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import {
  analyzeNasaPowerPayload,
  buildDeterministicFallbackPower,
  type NasaPowerSummary,
} from './src/lib/agronomy.ts';
import {
  latLngToAlbers5070,
  type RawExternalTelemetryInput,
} from './src/lib/nasaResources.ts';
import { requireAuth, type AuthRequest } from './src/middleware/auth.ts';
import {
  createRotationPlan,
  createUserParcel,
  deleteUserParcel,
  listUserFarms,
  updateRotationExports,
} from './src/db/farms.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: '2mb' }));

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

const powerCache = new Map<
  string,
  { expiresAt: number; summary: NasaPowerSummary }
>();

const multiSourceCache = new Map<
  string,
  { expiresAt: number; data: RawExternalTelemetryInput }
>();

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'terrashift' });
});

app.get('/api/maps/client-config', (_req, res) => {
  const googleMapsApiKey =
    process.env.VITE_GOOGLE_MAPS_API_KEY ||
    process.env.GOOGLE_MAPS_API_KEY ||
    '';
  res.json({ googleMapsApiKey });
});

app.get('/api/nasa/power', async (req, res) => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);

  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    res.status(400).json({ error: 'Valid latitude and longitude coordinates are required.' });
    return;
  }

  const cacheKey = `${lat.toFixed(1)}_${lng.toFixed(1)}`;
  const cached = powerCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    res.json(cached.summary);
    return;
  }

  const url = new URL('https://power.larc.nasa.gov/api/temporal/monthly/point');
  url.searchParams.set(
    'parameters',
    'T2M,PRECTOTCORR,ALLSKY_SFC_SW_DWN,GWETROOT,GWETTOP,RH2M'
  );
  url.searchParams.set('community', 'AG');
  url.searchParams.set('longitude', lng.toFixed(4));
  url.searchParams.set('latitude', lat.toFixed(4));
  url.searchParams.set('start', '2021');
  url.searchParams.set('end', '2025');
  url.searchParams.set('format', 'JSON');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9000);

  try {
    const upstream = await fetch(url.toString(), { signal: controller.signal });
    clearTimeout(timeout);

    if (!upstream.ok) {
      throw new Error(`NASA POWER HTTP ${upstream.status}`);
    }

    const json = (await upstream.json()) as Record<string, unknown>;
    const summary = analyzeNasaPowerPayload(json, lat, lng, 'NASA_POWER_LIVE');
    if (summary.monthlySeries.length === 0) {
      throw new Error('NASA POWER returned empty monthly series');
    }

    powerCache.set(cacheKey, {
      expiresAt: Date.now() + 15 * 60 * 1000,
      summary,
    });
    res.json(summary);
  } catch (error) {
    clearTimeout(timeout);
    console.warn('NASA POWER live fetch fell back to climatology:', error);
    const fallback = buildDeterministicFallbackPower(lat, lng);
    res.json(fallback);
  }
});

// Multi-source Earth Observation & Partner Agency fusion (ERA5/SMAP, SRTM 5-pt DEM, USDA CDL CropScape, USGS NWIS)
app.get('/api/nasa/multi-source', async (req, res) => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);

  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    res.status(400).json({ error: 'Valid latitude and longitude coordinates are required.' });
    return;
  }

  const cacheKey = `${lat.toFixed(2)}_${lng.toFixed(2)}`;
  const cached = multiSourceCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    res.json(cached.data);
    return;
  }

  const result: RawExternalTelemetryInput = {};
  const isConus = lat >= 24 && lat <= 50 && lng >= -125 && lng <= -66;

  // 1. Open-Meteo ERA5/IFS 5-layer soil moisture, soil temp, VPD, and FAO-56 ET0
  const omPromise = (async () => {
    try {
      const omUrl = new URL('https://api.open-meteo.com/v1/forecast');
      omUrl.searchParams.set('latitude', lat.toFixed(4));
      omUrl.searchParams.set('longitude', lng.toFixed(4));
      omUrl.searchParams.set(
        'current',
        'temperature_2m,relative_humidity_2m,soil_temperature_0cm,soil_moisture_0_to_1cm,soil_moisture_1_to_3cm,soil_moisture_3_to_9cm,soil_moisture_9_to_27cm,soil_moisture_27_to_81cm,vapour_pressure_deficit'
      );
      omUrl.searchParams.set(
        'daily',
        'et0_fao_evapotranspiration,precipitation_sum,shortwave_radiation_sum'
      );
      omUrl.searchParams.set('timezone', 'auto');
      omUrl.searchParams.set('forecast_days', '7');

      const r = await fetch(omUrl.toString(), { signal: AbortSignal.timeout(4500) });
      if (r.ok) {
        const j = (await r.json()) as {
          current?: RawExternalTelemetryInput['openMeteoCurrent'];
          daily?: RawExternalTelemetryInput['openMeteoDaily'];
        };
        if (j.current) result.openMeteoCurrent = j.current;
        if (j.daily) result.openMeteoDaily = j.daily;
      }
    } catch {
      // Fallback handled in synthesizeMultiSourceObservatory
    }
  })();

  // 2. SRTM 7x7 (49-point) Digital Elevation Model grid (~1.6km x 1.6km around parcel) + 5-point cross
  const srtmPromise = (async () => {
    try {
      const step = 0.0025; // 2 steps = 0.005 deg for N/S/E/W cross
      const lats: string[] = [];
      const lngs: string[] = [];
      for (let r = -3; r <= 3; r++) {
        for (let c = -3; c <= 3; c++) {
          // Row 0 is North (+3*step), Row 6 is South (-3*step); Col 0 is West (-3*step), Col 6 is East (+3*step)
          lats.push((lat - r * step).toFixed(4));
          lngs.push((lng + c * step).toFixed(4));
        }
      }
      const r = await fetch(
        `https://api.open-meteo.com/v1/elevation?latitude=${lats.join(',')}&longitude=${lngs.join(',')}`,
        { signal: AbortSignal.timeout(4500) }
      );
      if (r.ok) {
        const j = (await r.json()) as { elevation?: number[] };
        if (Array.isArray(j.elevation) && j.elevation.length === 49) {
          result.srtmGrid7x7 = j.elevation;
          // Extract [Center(r=0,c=0 -> idx 24), North(r=-2,c=0 -> idx 10), South(r=+2,c=0 -> idx 38), East(r=0,c=+2 -> idx 26), West(r=0,c=-2 -> idx 22)]
          result.srtmElevations = [
            j.elevation[24],
            j.elevation[10],
            j.elevation[38],
            j.elevation[26],
            j.elevation[22],
          ];
        }
      }
    } catch {
      // Fallback handled in synthesizeMultiSourceObservatory
    }
  })();

  // 3. USDA NASS CropScape Cropland Data Layer (CDL) for CONUS coordinates (2021-2023)
  const cdlPromise = (async () => {
    if (!isConus) return;
    try {
      const { x, y } = latLngToAlbers5070(lat, lng);
      // Sample rural field pixel (+3.2 km north) to avoid road/town center pixels
      const fieldX = Math.round(x);
      const fieldY = Math.round(y + 3200);
      const years = [2021, 2022, 2023];
      const entries = await Promise.all(
        years.map(async (yr) => {
          const url = `https://nassgeodata.gmu.edu/axis2/services/CDLService/GetCDLValue?year=${yr}&x=${fieldX}&y=${fieldY}`;
          const r = await fetch(url, { signal: AbortSignal.timeout(6500) });
          if (!r.ok) return null;
          const xml = await r.text();
          const catMatch = xml.match(/category:\s*"([^"]+)"/);
          const colMatch = xml.match(/color:\s*"([^"]+)"/);
          if (!catMatch?.[1]) return null;
          return {
            year: yr,
            category: catMatch[1],
            colorHex: colMatch?.[1] ?? '#16a34a',
          };
        })
      );
      const valid = entries.filter(
        (e): e is { year: number; category: string; colorHex: string } => Boolean(e)
      );
      if (valid.length > 0) {
        result.cdlByYear = valid;
      }
    } catch {
      // Fallback handled in synthesizeMultiSourceObservatory
    }
  })();

  // 4. USGS National Water Information System (NWIS) nearby watershed stream gauge
  const usgsPromise = (async () => {
    if (!isConus) return;
    try {
      const bBox = [
        (lng - 0.35).toFixed(3),
        (lat - 0.28).toFixed(3),
        (lng + 0.35).toFixed(3),
        (lat + 0.28).toFixed(3),
      ].join(',');
      const url = `https://waterservices.usgs.gov/nwis/iv/?format=json&bBox=${bBox}&parameterCd=00060,00065&siteStatus=active`;
      const r = await fetch(url, { signal: AbortSignal.timeout(4500) });
      if (!r.ok) return;
      const j = (await r.json()) as {
        value?: {
          timeSeries?: Array<{
            sourceInfo?: {
              siteName?: string;
              siteCode?: Array<{ value?: string }>;
            };
            variable?: { variableCode?: Array<{ value?: string }> };
            values?: Array<{ value?: Array<{ value?: string }> }>;
          }>;
        };
      };
      const tsList = j.value?.timeSeries ?? [];
      if (tsList.length === 0) return;

      const firstSite = tsList[0]?.sourceInfo;
      const stationName = firstSite?.siteName ?? 'USGS Watershed Gauge';
      const stationId = firstSite?.siteCode?.[0]?.value ?? 'USGS';

      let streamflowCfs: number | null = null;
      let gageHeightFt: number | null = null;

      for (const ts of tsList) {
        if (ts.sourceInfo?.siteCode?.[0]?.value !== stationId) continue;
        const code = ts.variable?.variableCode?.[0]?.value;
        const rawVal = Number(ts.values?.[0]?.value?.[0]?.value);
        if (!Number.isFinite(rawVal) || rawVal < 0) continue;
        if (code === '00060') streamflowCfs = rawVal;
        if (code === '00065') gageHeightFt = rawVal;
      }

      result.usgsStation = {
        stationName,
        stationId,
        streamflowCfs,
        gageHeightFt,
      };
    } catch {
      // Fallback handled in synthesizeMultiSourceObservatory
    }
  })();

  await Promise.all([omPromise, srtmPromise, cdlPromise, usgsPromise]);

  multiSourceCache.set(cacheKey, {
    expiresAt: Date.now() + 15 * 60 * 1000,
    data: result,
  });

  res.json(result);
});

app.get('/api/maps/weather', async (req, res) => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    res.status(400).json({ error: 'Valid lat and lng are required.' });
    return;
  }

  const apiKey =
    process.env.VITE_GOOGLE_MAPS_API_KEY ||
    process.env.GOOGLE_MAPS_API_KEY ||
    '';

  if (!apiKey) {
    res.json({ available: false, reason: 'No Google Maps API key configured.' });
    return;
  }

  try {
    const currentUrl = new URL(
      'https://weather.googleapis.com/v1/currentConditions:lookup'
    );
    currentUrl.searchParams.set('key', apiKey);
    currentUrl.searchParams.set('location.latitude', String(lat));
    currentUrl.searchParams.set('location.longitude', String(lng));

    const forecastUrl = new URL(
      'https://weather.googleapis.com/v1/forecast/days:lookup'
    );
    forecastUrl.searchParams.set('key', apiKey);
    forecastUrl.searchParams.set('location.latitude', String(lat));
    forecastUrl.searchParams.set('location.longitude', String(lng));
    forecastUrl.searchParams.set('days', '5');
    forecastUrl.searchParams.set('pageSize', '5');

    const headers = {
      'X-Goog-Maps-Solution-ID': 'gmp_mcp_codeassist_v1_aistudio',
    };

    const [currentRes, forecastRes] = await Promise.all([
      fetch(currentUrl.toString(), { headers }),
      fetch(forecastUrl.toString(), { headers }),
    ]);

    if (currentRes.status === 429 || forecastRes.status === 429) {
      res.status(429).json({
        available: false,
        quotaExceeded: true,
        error: { status: 'RESOURCE_EXHAUSTED' },
      });
      return;
    }

    if (!currentRes.ok || !forecastRes.ok) {
      const errText = await currentRes.text().catch(() => '');
      if (errText.includes('RESOURCE_EXHAUSTED')) {
        res.status(429).json({
          available: false,
          quotaExceeded: true,
          error: { status: 'RESOURCE_EXHAUSTED' },
        });
        return;
      }
      res.json({
        available: false,
        reason: `Weather endpoint returned ${currentRes.status}`,
      });
      return;
    }

    const [current, forecast] = await Promise.all([
      currentRes.json(),
      forecastRes.json(),
    ]);

    res.json({
      available: true,
      current,
      forecastDays: Array.isArray(forecast.forecastDays)
        ? forecast.forecastDays
        : [],
    });
  } catch (error) {
    console.warn('Google Maps Weather API lookup error:', error);
    res.json({ available: false, reason: 'Weather service unavailable.' });
  }
});

// Low-latency Gemini 3.1 Flash-Lite tactical field check
app.post('/api/ai/quick-check', async (req, res) => {
  const startedAt = Date.now();
  const { parcelName, region, currentCrop, nasa, nextYearCrop } = req.body ?? {};
  if (!parcelName || !nasa) {
    res.status(400).json({ error: 'Parcel and NASA telemetry payload are required.' });
    return;
  }

  try {
    const prompt = `Parcel: ${parcelName} (${region})
Current Crop: ${currentCrop}
Recommended Next Crop: ${nextYearCrop ?? 'Diversified Legume/Cover'}
NASA POWER Telemetry (${nasa.periodLabel}):
- Mean Temp: ${nasa.meanTempC}°C (Peak Summer: ${nasa.peakSummerTempC}°C, Anomaly: ${nasa.tempAnomalyC >= 0 ? '+' : ''}${nasa.tempAnomalyC}°C)
- Annual Precip: ${nasa.annualPrecipMm} mm (Variability CV: ${nasa.precipVariabilityPct}%)
- Root-Zone Moisture (GWETROOT): ${Math.round(nasa.meanRootMoisture * 100)}% (Min: ${Math.round(nasa.minRootMoisture * 100)}%)
- Dry Stress Months: ${nasa.dryStressMonths}/12

Give exactly 3 crisp, actionable 1-sentence field checks for this week: (1) Immediate moisture/irrigation posture, (2) Residue/soil-armor action, (3) Next-season transition prep. No fluff.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-lite',
      contents: prompt,
      config: {
        systemInstruction:
          'You are a precision agronomist interpreting NASA POWER Earth observation telemetry. Keep every response concise, empirical, and practical for farmers.',
      },
    });

    res.json({
      text: response.text ?? 'Unable to generate quick check.',
      model: 'gemini-3.1-flash-lite',
      latencyMs: Date.now() - startedAt,
    });
  } catch (error: unknown) {
    console.error('Gemini quick-check error:', error);
    const message = error instanceof Error ? error.message : 'AI request failed';
    res.status(500).json({ error: message });
  }
});

function extractCleanAiError(error: unknown): { status: number; message: string } {
  const raw = error instanceof Error ? error.message : String(error);
  if (raw.includes('RESOURCE_EXHAUSTED') || raw.includes('"code":429')) {
    return {
      status: 429,
      message:
        'Gemini API quota limit reached on the current key. Wait briefly or upgrade your key in Settings > Secrets.',
    };
  }
  return { status: 500, message: raw || 'Gemini AI request failed' };
}

// High-thinking Gemini 4 Hydrogen deep agronomic strategy (falls back to 3.1-flash-lite on free-tier 429)
app.post('/api/ai/deep-strategy', async (req, res) => {
  const startedAt = Date.now();
  const { parcel, nasa, simulation, priorities } = req.body ?? {};
  if (!parcel || !nasa || !simulation) {
    res.status(400).json({ error: 'Parcel, NASA summary, and simulation data are required.' });
    return;
  }

  try {
    const stepsText = (simulation.steps ?? [])
      .map(
        (s: {
          year: number;
          primaryCrop: { name: string; family: string; seasonWindow: string };
          coverCrop: { name: string } | null;
          waterUsedMm: number;
          waterDeficitMm: number;
          nitrogenBalanceKgHa: number;
          carbonDeltaTonHa: number;
          yieldResilienceScore: number;
        }) =>
          `Year ${s.year}: ${s.primaryCrop.name} (${s.primaryCrop.family}, ${s.primaryCrop.seasonWindow})${s.coverCrop ? ` + Cover: ${s.coverCrop.name}` : ''} | Water: ${s.waterUsedMm}mm (Deficit: ${s.waterDeficitMm}mm) | N-Balance: ${s.nitrogenBalanceKgHa} kg/ha | Carbon: +${s.carbonDeltaTonHa} t/ha | Resilience: ${s.yieldResilienceScore}/100`
      )
      .join('\n');

    const prompt = `Design an executive climate-adaptation agronomic strategy for this farm based on NASA POWER Earth observations and our multi-year crop rotation simulation.

FARM PARCEL:
- Name: ${parcel.name} (${parcel.region})
- Coordinates: ${parcel.lat.toFixed(4)}, ${parcel.lng.toFixed(4)} | Elevation: ${nasa.elevationM} m | Area: ${parcel.areaHectares} ha
- Soil: ${parcel.soilType}, pH ${parcel.soilPh}, Baseline Organic Carbon ${parcel.baselineOrganicCarbon}%
- Irrigation: ${priorities?.irrigationAccess ?? parcel.irrigationAccess}
- Priorities: Water=${priorities?.waterEfficiency ?? 70}/100, Soil Health=${priorities?.soilHealth ?? 80}/100, Yield Stability=${priorities?.yieldStability ?? 65}/100

NASA POWER EARTH OBSERVATIONS (${nasa.periodLabel}):
- Mean Temp: ${nasa.meanTempC}°C | Peak Summer: ${nasa.peakSummerTempC}°C | Warming Shift: ${nasa.tempAnomalyC >= 0 ? '+' : ''}${nasa.tempAnomalyC}°C
- Annual Rainfall: ${nasa.annualPrecipMm} mm (CV ${nasa.precipVariabilityPct}%)
- Root-Zone Soil Wetness (GWETROOT): ${(nasa.meanRootMoisture * 100).toFixed(1)}% (Min ${(nasa.minRootMoisture * 100).toFixed(1)}%)
- Solar Irradiance: ${nasa.meanSolarIrradiance} MJ/m2/day | Climate Risk Index: ${nasa.climateRiskIndex}/100

SIMULATED ADAPTED ROTATION (${simulation.planName}):
${stepsText}

SUMMARY VS MONOCULTURE (${simulation.baselineMonoculture?.crop?.name}):
- Water Savings: ${simulation.adaptedTotals?.waterSavingsPct}%
- Cumulative Carbon Gain: +${simulation.adaptedTotals?.cumulativeCarbonDeltaTonHa} t C/ha
- Resilience Score: ${simulation.adaptedTotals?.resilienceScore}/100 (vs ${simulation.baselineMonoculture?.resilienceScore}/100 baseline)

Structure your brief into 4 concise markdown sections:
1. **Climate Vulnerability Diagnosis** (tie directly to the NASA root-zone moisture, peak heat, and rainfall variability numbers)
2. **Season-by-Season Execution Calendar** (planting/termination windows, seeding & cover-crop termination timing to avoid moisture theft)
3. **Soil Carbon & Nitrogen Optimization** (how residue management and biological N fixation reduce synthetic fertilizer input)
4. **Drought Contingency Triggers** (explicit soil wetness % / rainfall thresholds for switching cultivars or terminating cover crops early).`;

    const sysPrompt =
      'You are a lead NASA agricultural Earth-science advisor. Deliver rigorous, quantitative, farmer-ready agronomic adaptation plans grounded strictly in the provided satellite climatology and rotation outputs.';

    let usedModel = 'gemini-4-hydrogen';
    let thinkingLevel = 'HIGH';
    let response;
    try {
      response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
          systemInstruction: sysPrompt,
        },
      });
    } catch (primaryErr) {
      const parsed = extractCleanAiError(primaryErr);
      if (parsed.status !== 429) throw primaryErr;
      usedModel = 'gemini-3.1-flash-lite';
      thinkingLevel = 'STANDARD';
      response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents: prompt,
        config: { systemInstruction: sysPrompt },
      });
    }

    res.json({
      markdown: response.text ?? '',
      model: usedModel,
      thinkingLevel,
      latencyMs: Date.now() - startedAt,
    });
  } catch (error: unknown) {
    console.error('Gemini deep-strategy error:', error);
    const { status, message } = extractCleanAiError(error);
    res.status(status).json({ error: message });
  }
});

// Live Google Search Grounding for regional ag-extension bulletins & drought advisories
app.post('/api/ai/grounding-search', async (req, res) => {
  const { region, cropName, soilType, climateRiskIndex } = req.body ?? {};
  if (!region) {
    res.status(400).json({ error: 'Region is required.' });
    return;
  }

  const prompt = `Find current 2025-2026 agricultural extension recommendations, drought outlook bulletins, cover crop incentives, and climate-resilient crop rotation guidance for farmers in ${region} growing ${cropName ?? 'row crops'} on ${soilType ?? 'loam'} soil (climate risk index ${climateRiskIndex ?? 55}/100). Provide a concise 4-bullet summary citing regional extension programs or conservation programs.`;

  try {
    let response;
    try {
      response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: { tools: [{ googleSearch: {} }] },
      });
    } catch (primaryErr) {
      const parsed = extractCleanAiError(primaryErr);
      if (parsed.status !== 429) throw primaryErr;
      response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents: prompt,
        config: { tools: [{ googleSearch: {} }] },
      });
    }

    const rawChunks =
      response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
    const sources = rawChunks
      .map((c) => c.web)
      .filter((w): w is { uri: string; title?: string } => Boolean(w?.uri))
      .slice(0, 6);

    res.json({
      markdown: response.text ?? '',
      sources,
    });
  } catch (error: unknown) {
    console.error('Gemini search grounding error:', error);
    const { status, message } = extractCleanAiError(error);
    res.status(status).json({ error: message });
  }
});

// Live Google Maps Grounding for nearby soil labs, extension offices & ag co-ops
app.post('/api/ai/grounding-maps', async (req, res) => {
  const { lat, lng, region } = req.body ?? {};
  if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) {
    res.status(400).json({ error: 'Valid lat and lng are required.' });
    return;
  }

  const prompt = `What agricultural extension offices, soil testing laboratories, irrigation districts, or farm seed supply cooperatives are located near ${region ?? 'this farm'}? List the closest verified options with what services they offer for soil health and crop rotation transitions.`;
  const config = {
    tools: [{ googleMaps: {} }],
    toolConfig: {
      retrievalConfig: {
        latLng: {
          latitude: Number(lat),
          longitude: Number(lng),
        },
      },
    },
  };

  try {
    let response;
    try {
      response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config,
      });
    } catch (primaryErr) {
      const parsed = extractCleanAiError(primaryErr);
      if (parsed.status !== 429) throw primaryErr;
      response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents: prompt,
        config,
      });
    }

    const rawChunks =
      response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
    const places = rawChunks
      .map((c) => c.maps)
      .filter((m): m is { uri: string; title?: string } => Boolean(m?.uri))
      .slice(0, 8);

    res.json({
      markdown: response.text ?? '',
      places,
    });
  } catch (error: unknown) {
    console.error('Gemini maps grounding error:', error);
    const { status, message } = extractCleanAiError(error);
    res.status(status).json({ error: message });
  }
});

// Cloud SQL Protected Farm & Rotation Routes
app.get('/api/farms', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!req.dbUser) {
      res.status(401).json({ error: 'User not synchronized' });
      return;
    }
    const farms = await listUserFarms(req.dbUser.id);
    res.json({ farms });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load farms';
    res.status(500).json({ error: message });
  }
});

app.post('/api/farms', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!req.dbUser) {
      res.status(401).json({ error: 'User not synchronized' });
      return;
    }
    const body = req.body ?? {};
    if (!body.name || !body.region || !Number.isFinite(Number(body.lat)) || !Number.isFinite(Number(body.lng))) {
      res.status(400).json({ error: 'Parcel name, region, latitude, and longitude are required.' });
      return;
    }
    const created = await createUserParcel(req.dbUser.id, {
      name: String(body.name),
      region: String(body.region),
      lat: Number(body.lat),
      lng: Number(body.lng),
      areaHectares: Number(body.areaHectares ?? 40),
      soilType: String(body.soilType ?? 'Loam'),
      soilPh: Number(body.soilPh ?? 6.5),
      baselineOrganicCarbon: Number(body.baselineOrganicCarbon ?? 2.0),
      irrigationAccess: String(body.irrigationAccess ?? 'rainfed'),
      currentCrop: String(body.currentCrop ?? 'maize'),
      snapshot: body.snapshot,
    });
    res.status(201).json({ farm: created });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to save farm parcel';
    res.status(500).json({ error: message });
  }
});

app.delete('/api/farms/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!req.dbUser) {
      res.status(401).json({ error: 'User not synchronized' });
      return;
    }
    const parcelId = Number(req.params.id);
    if (!Number.isInteger(parcelId) || parcelId <= 0) {
      res.status(400).json({ error: 'Invalid parcel id' });
      return;
    }
    const deleted = await deleteUserParcel(req.dbUser.id, parcelId);
    if (!deleted) {
      res.status(404).json({ error: 'Farm parcel not found' });
      return;
    }
    res.json({ deletedId: parcelId });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to delete farm parcel';
    res.status(500).json({ error: message });
  }
});

app.post('/api/rotations', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!req.dbUser) {
      res.status(401).json({ error: 'User not synchronized' });
      return;
    }
    const body = req.body ?? {};
    const parcelId = Number(body.parcelId);
    if (!Number.isInteger(parcelId) || !body.planName || !body.sequenceJson) {
      res.status(400).json({ error: 'parcelId, planName, and sequenceJson are required.' });
      return;
    }
    const created = await createRotationPlan(req.dbUser.id, {
      parcelId,
      planName: String(body.planName),
      horizonYears: Number(body.horizonYears ?? 4),
      waterPriority: Number(body.waterPriority ?? 70),
      soilCarbonPriority: Number(body.soilCarbonPriority ?? 80),
      yieldPriority: Number(body.yieldPriority ?? 65),
      sequenceJson: String(body.sequenceJson),
      waterSavingsPct: Number(body.waterSavingsPct ?? 0),
      carbonDeltaTonPerHa: Number(body.carbonDeltaTonPerHa ?? 0),
      nitrogenBalanceKgHa: Number(body.nitrogenBalanceKgHa ?? 0),
      resilienceScore: Number(body.resilienceScore ?? 70),
      aiBriefMarkdown: body.aiBriefMarkdown ?? null,
      sheetUrl: body.sheetUrl ?? null,
      docUrl: body.docUrl ?? null,
      formUrl: body.formUrl ?? null,
    });
    if (!created) {
      res.status(404).json({ error: 'Target farm parcel not found for this user.' });
      return;
    }
    res.status(201).json({ plan: created });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to save rotation plan';
    res.status(500).json({ error: message });
  }
});

app.patch('/api/rotations/:id/exports', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!req.dbUser) {
      res.status(401).json({ error: 'User not synchronized' });
      return;
    }
    const planId = Number(req.params.id);
    if (!Number.isInteger(planId) || planId <= 0) {
      res.status(400).json({ error: 'Invalid rotation plan id' });
      return;
    }
    const updated = await updateRotationExports(req.dbUser.id, planId, req.body ?? {});
    if (!updated) {
      res.status(404).json({ error: 'Rotation plan not found' });
      return;
    }
    res.json({ plan: updated });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update export links';
    res.status(500).json({ error: message });
  }
});

async function startServer() {
  const PORT = 3000;

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`TerraShift server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
