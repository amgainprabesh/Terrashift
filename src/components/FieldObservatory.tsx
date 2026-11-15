import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AdvancedMarker,
  InfoWindow,
  Map as GoogleMap,
  Pin,
  useAdvancedMarkerRef,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  CloudSun,
  Compass,
  Crosshair,
  Droplets,
  ExternalLink,
  Loader2,
  LocateFixed,
  MapPin,
  Minus,
  Plus,
  RotateCcw,
  Satellite,
  Search,
  Sparkles,
  X,
  Zap,
} from 'lucide-react';
import {
  CURATED_PARCELS,
  deriveFiveYearSoilNutrientTrends,
  getCropById,
  parseCoordinateQuery,
  searchAgriculturalDirectory,
  type AgriculturalDirectoryEntry,
  type FarmParcelProfile,
  type FiveYearSoilNutrientPoint,
  type NasaPowerSummary,
  type RotationSimulationResult,
} from '../lib/agronomy';
import {
  fetchMultiSourceTelemetry,
  requestAiQuickCheck,
  requestMapsGrounding,
  requestSearchGrounding,
  type MapsWeatherResponse,
} from '../lib/api';
import type { RawExternalTelemetryInput } from '../lib/nasaResources';
import { NasaMultiSourcePanel } from './NasaMultiSourcePanel';

interface FieldObservatoryProps {
  parcel: FarmParcelProfile;
  onSelectParcel: (parcel: FarmParcelProfile) => void;
  onInspectCoordinates: (lat: number, lng: number, label?: string) => void;
  nasa: NasaPowerSummary;
  nasaLoading: boolean;
  nasaError: string | null;
  weather: MapsWeatherResponse | null;
  mapsAvailable: boolean;
  simulation: RotationSimulationResult;
  onOpenTwin3D: () => void;
  onOpenOptimizer: () => void;
}

function TelemetryChartSvg({ nasa }: { nasa: NasaPowerSummary }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const series = nasa.climatology;
  const w = 660;
  const h = 230;
  const padL = 44;
  const padR = 44;
  const padT = 22;
  const padB = 30;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;

  const maxPrecip = Math.max(120, ...series.map((d) => d.precipMmMonth));
  const minTemp = Math.min(-5, ...series.map((d) => d.tempC)) - 2;
  const maxTemp = Math.max(38, ...series.map((d) => d.tempC)) + 2;

  const xCenter = (i: number) => padL + ((i + 0.5) / series.length) * plotW;
  const yPrecip = (mm: number) => padT + plotH - (mm / maxPrecip) * plotH;
  const yMoisture = (m: number) => padT + plotH - m * plotH;
  const yTemp = (t: number) =>
    padT + plotH - ((t - minTemp) / Math.max(1, maxTemp - minTemp)) * plotH;

  const moisturePath = series
    .map((d, i) => `${i === 0 ? 'M' : 'L'}${xCenter(i).toFixed(1)},${yMoisture(d.rootMoisture).toFixed(1)}`)
    .join(' ');
  const tempPath = series
    .map((d, i) => `${i === 0 ? 'M' : 'L'}${xCenter(i).toFixed(1)},${yTemp(d.tempC).toFixed(1)}`)
    .join(' ');

  const hovered = hoverIdx !== null ? series[hoverIdx] : null;

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex flex-wrap items-center gap-4">
          <span className="inline-flex items-center gap-1.5 font-medium text-sky-800">
            <span className="inline-block h-2.5 w-2.5 rounded-xs bg-sky-200 border border-sky-500" />
            Precipitation (mm/mo)
          </span>
          <span className="inline-flex items-center gap-1.5 font-medium text-emerald-800">
            <span className="inline-block h-0.5 w-4 bg-emerald-600" />
            Root Moisture (GWETROOT)
          </span>
          <span className="inline-flex items-center gap-1.5 font-medium text-amber-800">
            <span className="inline-block h-0.5 w-4 bg-amber-600" />
            2m Temp (°C)
          </span>
        </div>

        <span className="font-mono tabular-nums text-slate-600">
          {hovered
            ? `${hovered.label}: ${hovered.precipMmMonth} mm · ${Math.round(hovered.rootMoisture * 100)}% GWETROOT · ${hovered.tempC}°C`
            : `Period ${nasa.periodLabel}`}
        </span>
      </div>

      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="h-auto w-full"
        onMouseLeave={() => setHoverIdx(null)}
        role="img"
        aria-label="NASA POWER 12-month climatology chart"
      >
        {[0.25, 0.5, 0.75, 1.0].map((frac) => {
          const y = padT + plotH * (1 - frac);
          return (
            <g key={frac}>
              <line
                x1={padL}
                y1={y}
                x2={w - padR}
                y2={y}
                stroke="#f1f5f9"
                strokeWidth={1}
              />
              <text
                x={padL - 6}
                y={y + 3}
                textAnchor="end"
                className="fill-slate-400 font-mono text-[10px]"
              >
                {Math.round(maxPrecip * frac)}
              </text>
              <text
                x={w - padR + 6}
                y={y + 3}
                textAnchor="start"
                className="fill-emerald-700 font-mono text-[10px]"
              >
                {Math.round(frac * 100)}%
              </text>
            </g>
          );
        })}

        {series.map((d, i) => {
          const barW = Math.max(12, (plotW / series.length) * 0.52);
          const x = xCenter(i) - barW / 2;
          const topY = yPrecip(d.precipMmMonth);
          const barH = Math.max(2, padT + plotH - topY);
          return (
            <g key={d.label}>
              <rect
                x={x}
                y={topY}
                width={barW}
                height={barH}
                rx={2}
                fill={hoverIdx === i ? '#0284c7' : '#bae6fd'}
                stroke="#0284c7"
                strokeOpacity={0.45}
              />
              <text
                x={xCenter(i)}
                y={h - 9}
                textAnchor="middle"
                className="fill-slate-500 text-[10px]"
              >
                {d.label}
              </text>
            </g>
          );
        })}

        <path d={moisturePath} fill="none" stroke="#059669" strokeWidth={2.5} />
        <path d={tempPath} fill="none" stroke="#d97706" strokeWidth={2} />

        {series.map((d, i) => (
          <g key={`hit-${d.label}`}>
            <circle
              cx={xCenter(i)}
              cy={yMoisture(d.rootMoisture)}
              r={hoverIdx === i ? 4.5 : 2.5}
              fill="#059669"
            />
            <circle
              cx={xCenter(i)}
              cy={yTemp(d.tempC)}
              r={hoverIdx === i ? 4 : 2.2}
              fill="#d97706"
            />
            <rect
              x={padL + (i / series.length) * plotW}
              y={padT}
              width={plotW / series.length}
              height={plotH}
              fill="transparent"
              onMouseEnter={() => setHoverIdx(i)}
            />
          </g>
        ))}
      </svg>
    </div>
  );
}

interface TrendTooltipEntry {
  dataKey?: string | number;
  name?: string;
  value?: number;
  color?: string;
  payload?: FiveYearSoilNutrientPoint;
}

function FiveYearTrendTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: ReadonlyArray<TrendTooltipEntry>;
  label?: string | number;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const pt = payload[0]?.payload;

  return (
    <div className="rounded-lg border border-slate-200 bg-white/95 px-3 py-2 text-xs shadow-sm">
      <p className="font-mono font-semibold text-slate-900">
        {pt?.monthKey ?? String(label ?? '')}
      </p>
      <div className="mt-1 space-y-0.5 font-mono tabular-nums">
        {payload.map((entry) => (
          <div key={String(entry.dataKey)} className="flex items-center justify-between gap-4">
            <span className="text-slate-600">{entry.name}</span>
            <span className="font-semibold" style={{ color: entry.color ?? '#0f172a' }}>
              {typeof entry.value === 'number' ? `${entry.value.toFixed(1)}%` : '--'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function FiveYearSoilNutrientRechart({
  nasa,
  parcel,
}: {
  nasa: NasaPowerSummary;
  parcel: FarmParcelProfile;
}) {
  const [showSurface, setShowSurface] = useState(true);
  const trends = useMemo(
    () => deriveFiveYearSoilNutrientTrends(nasa, parcel),
    [nasa, parcel]
  );

  return (
    <section
      data-testid="five-year-trends-section"
      className="min-w-0 rounded-xl border border-slate-200 bg-white p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500">
            5-Year Trajectory · NASA POWER Time Series ({nasa.periodLabel})
          </p>
          <h2 className="font-display text-base font-semibold text-slate-950">
            5-Year Soil Moisture &amp; Nutrient Depletion Trends
          </h2>
          <p className="mt-0.5 text-xs text-slate-600">
            Baseline pressure: {trends.cropName} · Soil carbon buffer {parcel.baselineOrganicCarbon}% SOC · {trends.points.length} monthly observations
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-5 rounded-lg border border-slate-200 bg-slate-50/70 px-3.5 py-2">
            <div>
              <span className="block text-[10px] font-semibold uppercase tracking-[0.05em] text-slate-500">
                Yr-5 Root Moisture
              </span>
              <span className="font-mono tabular-nums text-sm font-bold text-emerald-800">
                {trends.latestYearMoisturePct.toFixed(1)}%
              </span>
              <span className="ml-1.5 font-mono tabular-nums text-[11px] text-slate-500">
                ({trends.moistureDeltaPct >= 0 ? '+' : ''}
                {trends.moistureDeltaPct.toFixed(1)}%)
              </span>
            </div>
            <div className="h-7 w-px bg-slate-200" aria-hidden="true" />
            <div>
              <span className="block text-[10px] font-semibold uppercase tracking-[0.05em] text-slate-500">
                Nutrient Depletion Index
              </span>
              <span className="font-mono tabular-nums text-sm font-bold text-amber-800">
                {trends.endDepletionPct.toFixed(1)}%
              </span>
              <span className="ml-1.5 font-mono tabular-nums text-[11px] text-amber-700">
                (+{trends.depletionDeltaPct.toFixed(1)} pts)
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowSurface((v) => !v)}
            aria-pressed={showSurface}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
              showSurface
                ? 'border-sky-700 bg-sky-50 text-sky-900'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            <Droplets className="h-3.5 w-3.5" />
            <span>{showSurface ? 'Surface Moisture On' : 'Show Surface Moisture'}</span>
          </button>
        </div>
      </div>

      <div className="mt-3 mb-2 flex flex-wrap items-center gap-5 text-xs">
        <span className="inline-flex items-center gap-1.5 font-medium text-emerald-800">
          <span className="inline-block h-0.5 w-4 bg-emerald-600" />
          Root Soil Moisture (GWETROOT %)
        </span>
        {showSurface && (
          <span className="inline-flex items-center gap-1.5 font-medium text-sky-800">
            <span className="inline-block h-0.5 w-4 border-t-2 border-dashed border-sky-600" />
            Surface Soil Moisture (GWETTOP %)
          </span>
        )}
        <span className="inline-flex items-center gap-1.5 font-medium text-amber-800">
          <span className="inline-block h-0.5 w-4 bg-amber-600" />
          Cumulative Nutrient Depletion Index (%)
        </span>
      </div>

      <div data-testid="five-year-trends-chart" className="h-[270px] w-full min-w-0">
        {trends.points.length > 0 ? (
          <ResponsiveContainer width="100%" height={270} minWidth={0}>
            <LineChart
              data={trends.points}
              margin={{ top: 10, right: 16, left: -12, bottom: 4 }}
            >
              <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="label"
                interval={Math.max(4, Math.floor(trends.points.length / 10))}
                tick={{ fontSize: 11, fill: '#64748b' }}
                tickLine={false}
                axisLine={{ stroke: '#cbd5e1' }}
              />
              <YAxis
                domain={[0, 100]}
                unit="%"
                tick={{ fontSize: 11, fill: '#64748b' }}
                tickLine={false}
                axisLine={false}
              />
              <ReferenceLine
                y={42}
                stroke="#cbd5e1"
                strokeDasharray="4 4"
              />
              <Tooltip content={<FiveYearTrendTooltip />} />
              <Line
                type="monotone"
                dataKey="rootMoisturePct"
                name="Root Moisture (GWETROOT)"
                stroke="#059669"
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 4, fill: '#059669' }}
                isAnimationActive={false}
              />
              {showSurface && (
                <Line
                  type="monotone"
                  dataKey="surfaceMoisturePct"
                  name="Surface Moisture (GWETTOP)"
                  stroke="#0284c7"
                  strokeWidth={1.75}
                  strokeDasharray="4 3"
                  dot={false}
                  activeDot={{ r: 3.5, fill: '#0284c7' }}
                  isAnimationActive={false}
                />
              )}
              <Line
                type="monotone"
                dataKey="nutrientDepletionPct"
                name="Nutrient Depletion Index"
                stroke="#d97706"
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 4, fill: '#d97706' }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-slate-200 text-xs text-slate-500">
            Insufficient multi-year monthly observations for trajectory plot.
          </div>
        )}
      </div>
    </section>
  );
}

interface FetchedPlaceLike {
  displayName?: string | null;
  formattedAddress?: string | null;
  location?: {
    lat: number | (() => number);
    lng: number | (() => number);
  } | null;
  fetchFields: (opts: { fields: string[] }) => Promise<unknown>;
}

interface LivePlacePredictionItem {
  id: string;
  mainText: string;
  secondaryText: string;
  fullText: string;
  toPlace: () => FetchedPlaceLike;
}

function GooglePlacesLiveBridge({
  query,
  biasLat,
  biasLng,
  onPredictions,
  onLoadingChange,
  resetTrigger,
}: {
  query: string;
  biasLat: number;
  biasLng: number;
  onPredictions: (items: LivePlacePredictionItem[]) => void;
  onLoadingChange: (loading: boolean) => void;
  resetTrigger: number;
}) {
  const placesLib = useMapsLibrary('places');
  const sessionTokenRef = useRef<unknown>(null);
  const onPredictionsRef = useRef(onPredictions);
  onPredictionsRef.current = onPredictions;
  const onLoadingRef = useRef(onLoadingChange);
  onLoadingRef.current = onLoadingChange;

  useEffect(() => {
    sessionTokenRef.current = null;
  }, [resetTrigger]);

  useEffect(() => {
    const trimmed = query.trim();
    if (!placesLib || trimmed.length < 2 || parseCoordinateQuery(trimmed)) {
      onPredictionsRef.current([]);
      onLoadingRef.current(false);
      return;
    }

    const typedPlacesLib = placesLib as unknown as {
      AutocompleteSessionToken?: new () => unknown;
      AutocompleteSuggestion?: {
        fetchAutocompleteSuggestions?: (req: {
          input: string;
          sessionToken?: unknown;
          locationBias?: {
            west: number;
            south: number;
            east: number;
            north: number;
          };
        }) => Promise<{
          suggestions?: Array<{
            placePrediction?: {
              placeId?: string;
              mainText?: { text?: string };
              secondaryText?: { text?: string };
              text?: { text?: string };
              toPlace?: () => FetchedPlaceLike;
            };
          }>;
        }>;
      };
    };

    const { AutocompleteSessionToken, AutocompleteSuggestion } = typedPlacesLib;
    if (!AutocompleteSuggestion?.fetchAutocompleteSuggestions) {
      onPredictionsRef.current([]);
      onLoadingRef.current(false);
      return;
    }

    if (!sessionTokenRef.current && AutocompleteSessionToken) {
      sessionTokenRef.current = new AutocompleteSessionToken();
    }

    let cancelled = false;
    onLoadingRef.current(true);

    const timer = window.setTimeout(async () => {
      try {
        const res =
          await AutocompleteSuggestion.fetchAutocompleteSuggestions!({
            input: trimmed,
            sessionToken: sessionTokenRef.current ?? undefined,
            locationBias: {
              west: Math.max(-180, biasLng - 2.5),
              south: Math.max(-90, biasLat - 2.5),
              east: Math.min(180, biasLng + 2.5),
              north: Math.min(90, biasLat + 2.5),
            },
          });
        if (cancelled) return;

        const mapped: LivePlacePredictionItem[] = [];
        for (const s of res.suggestions ?? []) {
          const pred = s.placePrediction;
          if (!pred || typeof pred.toPlace !== 'function') continue;
          const toPlaceFn = pred.toPlace.bind(pred);
          const mainText =
            pred.mainText?.text || pred.text?.text || trimmed;
          const secondaryText = pred.secondaryText?.text || '';
          const fullText = pred.text?.text || mainText;
          mapped.push({
            id: pred.placeId || fullText,
            mainText,
            secondaryText,
            fullText,
            toPlace: () => toPlaceFn(),
          });
        }
        onPredictionsRef.current(mapped.slice(0, 5));
      } catch (err) {
        const msg = String(err);
        if (
          msg.includes('429') ||
          msg.includes('RESOURCE_EXHAUSTED') ||
          msg.includes('OVER_QUERY_LIMIT') ||
          msg.includes('QuotaExceeded')
        ) {
          window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
        }
        if (!cancelled) {
          onPredictionsRef.current([]);
        }
      } finally {
        if (!cancelled) {
          onLoadingRef.current(false);
        }
      }
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [placesLib, query, biasLat, biasLng]);

  return null;
}

interface OmniboxActionItem {
  key: string;
  kind: 'coordinate' | 'place' | 'directory';
  title: string;
  subtitle: string;
  badge: string;
  lat?: number;
  lng?: number;
  onTrigger: () => void | Promise<void>;
}

const QUICK_REGION_CHIPS: Array<{
  label: string;
  lat: number;
  lng: number;
  fullLabel: string;
  parcelId?: string;
}> = [
  {
    label: 'Central Iowa',
    lat: 41.5868,
    lng: -93.625,
    fullLabel: 'Central Iowa Corn Belt',
    parcelId: 'iowa-cornbelt',
  },
  {
    label: 'San Joaquin CA',
    lat: 36.7378,
    lng: -119.7871,
    fullLabel: 'San Joaquin Valley, CA',
    parcelId: 'california-sanjoaquin',
  },
  {
    label: 'Ogallala Aquifer KS',
    lat: 37.9717,
    lng: -100.8727,
    fullLabel: 'Ogallala Aquifer High Plains, KS',
  },
  {
    label: 'Punjab Plain',
    lat: 30.901,
    lng: 75.8573,
    fullLabel: 'Indo-Gangetic Plain, Punjab',
    parcelId: 'punjab-indogangetic',
  },
  {
    label: 'Nile Delta',
    lat: 31.1107,
    lng: 30.9388,
    fullLabel: 'Nile River Delta Basin, Egypt',
  },
  {
    label: 'Mato Grosso BR',
    lat: -12.5449,
    lng: -55.7226,
    fullLabel: 'Mato Grosso Cerrado, Brazil',
    parcelId: 'matogrosso-cerrado',
  },
];

function LocationOmnibox({
  parcel,
  mapsAvailable,
  onSelectParcel,
  onInspectCoordinates,
}: {
  parcel: FarmParcelProfile;
  mapsAvailable: boolean;
  onSelectParcel: (parcel: FarmParcelProfile) => void;
  onInspectCoordinates: (lat: number, lng: number, label?: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [livePredictions, setLivePredictions] = useState<
    LivePlacePredictionItem[]
  >([]);
  const [placesLoading, setPlacesLoading] = useState(false);
  const [sessionResetSeq, setSessionResetSeq] = useState(0);
  const [geoBusy, setGeoBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const parsedCoord = useMemo(() => parseCoordinateQuery(query), [query]);
  const directoryMatches = useMemo(
    () => searchAgriculturalDirectory(query, query.trim() ? 5 : 6),
    [query]
  );

  // Global "/" or Cmd+K shortcut to focus search bar
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setIsOpen(true);
        return;
      }
      if (
        e.key === '/' &&
        document.activeElement &&
        !['INPUT', 'TEXTAREA', 'SELECT'].includes(
          document.activeElement.tagName
        )
      ) {
        e.preventDefault();
        inputRef.current?.focus();
        setIsOpen(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const onPointerDown = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, []);

  const handlePickPlacePrediction = useCallback(
    async (item: LivePlacePredictionItem) => {
      try {
        setPlacesLoading(true);
        const place = item.toPlace();
        await place.fetchFields({
          fields: ['displayName', 'formattedAddress', 'location', 'viewport'],
        });
        setSessionResetSeq((n) => n + 1);
        setLivePredictions([]);

        const loc = place.location;
        if (!loc) return;
        const lat = typeof loc.lat === 'function' ? loc.lat() : Number(loc.lat);
        const lng = typeof loc.lng === 'function' ? loc.lng() : Number(loc.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

        const label =
          place.displayName ||
          item.mainText ||
          place.formattedAddress ||
          `Parcel (${lat.toFixed(3)}, ${lng.toFixed(3)})`;
        setQuery(label);
        setIsOpen(false);
        setStatusMessage(null);
        onInspectCoordinates(lat, lng, label);
      } catch (err) {
        const msg = String(err);
        if (
          msg.includes('429') ||
          msg.includes('RESOURCE_EXHAUSTED') ||
          msg.includes('OVER_QUERY_LIMIT')
        ) {
          window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
        }
        console.warn('Place selection error:', err);
      } finally {
        setPlacesLoading(false);
      }
    },
    [onInspectCoordinates]
  );

  const handlePickDirectoryEntry = useCallback(
    (entry: AgriculturalDirectoryEntry) => {
      setQuery(entry.name);
      setIsOpen(false);
      setStatusMessage(null);
      if (entry.parcelPreset) {
        onSelectParcel(entry.parcelPreset);
      } else {
        onInspectCoordinates(entry.lat, entry.lng, `${entry.name} (${entry.region})`);
      }
    },
    [onInspectCoordinates, onSelectParcel]
  );

  const actionItems = useMemo<OmniboxActionItem[]>(() => {
    const list: OmniboxActionItem[] = [];

    if (parsedCoord) {
      list.push({
        key: `coord-${parsedCoord.formatted}`,
        kind: 'coordinate',
        title: `Inspect Coordinates ${parsedCoord.formatted}`,
        subtitle: `Direct satellite & NASA POWER point query at Lat ${parsedCoord.lat}, Lng ${parsedCoord.lng}`,
        badge: 'GPS COORD',
        lat: parsedCoord.lat,
        lng: parsedCoord.lng,
        onTrigger: () => {
          setQuery(parsedCoord.formatted);
          setIsOpen(false);
          setStatusMessage(null);
          onInspectCoordinates(
            parsedCoord.lat,
            parsedCoord.lng,
            `Custom Sector (${parsedCoord.formatted})`
          );
        },
      });
    }

    for (const pred of livePredictions) {
      list.push({
        key: `place-${pred.id}`,
        kind: 'place',
        title: pred.mainText,
        subtitle: pred.secondaryText || pred.fullText,
        badge: 'GOOGLE MAPS',
        onTrigger: () => handlePickPlacePrediction(pred),
      });
    }

    for (const entry of directoryMatches) {
      list.push({
        key: `dir-${entry.id}`,
        kind: 'directory',
        title: entry.name,
        subtitle: `${entry.region} · ${entry.soilType} · ${entry.primaryCrop}`,
        badge: entry.climateTag.toUpperCase(),
        lat: entry.lat,
        lng: entry.lng,
        onTrigger: () => handlePickDirectoryEntry(entry),
      });
    }

    return list;
  }, [
    parsedCoord,
    livePredictions,
    directoryMatches,
    onInspectCoordinates,
    handlePickPlacePrediction,
    handlePickDirectoryEntry,
  ]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, livePredictions.length, directoryMatches.length]);

  const handleUseMyLocation = () => {
    if (!navigator.geolocation) {
      setStatusMessage('Geolocation is not supported by this browser.');
      return;
    }
    setGeoBusy(true);
    setStatusMessage(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeoBusy(false);
        const lat = Number(pos.coords.latitude.toFixed(4));
        const lng = Number(pos.coords.longitude.toFixed(4));
        setQuery(`${lat}, ${lng}`);
        setIsOpen(false);
        onInspectCoordinates(lat, lng, `GPS Field Location (${lat.toFixed(3)}, ${lng.toFixed(3)})`);
      },
      () => {
        setGeoBusy(false);
        setStatusMessage('Location permission declined; type a region or coordinates above.');
      },
      { enableHighAccuracy: false, timeout: 6000 }
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
        return;
      }
      setActiveIndex((prev) =>
        actionItems.length > 0 ? (prev + 1) % actionItems.length : 0
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
        return;
      }
      setActiveIndex((prev) =>
        actionItems.length > 0
          ? (prev - 1 + actionItems.length) % actionItems.length
          : 0
      );
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const chosen = actionItems[activeIndex] ?? actionItems[0];
      if (chosen) {
        void chosen.onTrigger();
      } else if (parsedCoord) {
        setIsOpen(false);
        onInspectCoordinates(
          parsedCoord.lat,
          parsedCoord.lng,
          `Custom Sector (${parsedCoord.formatted})`
        );
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
      inputRef.current?.blur();
    }
  };

  return (
    <div ref={containerRef} className="relative z-20 space-y-2">
      {mapsAvailable && (
        <GooglePlacesLiveBridge
          query={query}
          biasLat={parcel.lat}
          biasLng={parcel.lng}
          onPredictions={setLivePredictions}
          onLoadingChange={setPlacesLoading}
          resetTrigger={sessionResetSeq}
        />
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            ref={inputRef}
            type="text"
            data-testid="location-search-input"
            aria-label="Search farm valley, county, address, or coordinates"
            value={query}
            onFocus={() => setIsOpen(true)}
            onChange={(e) => {
              setQuery(e.target.value);
              setIsOpen(true);
              if (statusMessage) setStatusMessage(null);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Search any farm valley, county, address, crop belt, or lat, lng (e.g. San Joaquin, Ogallala, 36.74, -119.77)..."
            className="w-full rounded-xl border border-slate-300 bg-slate-50/70 py-2.5 pr-24 pl-9 text-xs font-medium text-slate-900 placeholder:text-slate-400 transition-colors focus:border-sky-600 focus:bg-white focus:ring-2 focus:ring-sky-600/15 focus:outline-none"
          />

          <div className="absolute right-2.5 top-1/2 flex -translate-y-1/2 items-center gap-1">
            {placesLoading && (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-sky-600" />
            )}
            {query ? (
              <button
                type="button"
                aria-label="Clear search query"
                onClick={() => {
                  setQuery('');
                  setLivePredictions([]);
                  inputRef.current?.focus();
                  setIsOpen(true);
                }}
                className="rounded-md p-1 text-slate-400 hover:bg-slate-200/70 hover:text-slate-700"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : (
              <kbd className="hidden rounded border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-[10px] text-slate-400 sm:inline-block">
                /
              </kbd>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={handleUseMyLocation}
          disabled={geoBusy}
          title="Inspect my current GPS coordinates"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-60"
        >
          {geoBusy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-sky-700" />
          ) : (
            <LocateFixed className="h-3.5 w-3.5 text-sky-700" />
          )}
          <span className="hidden sm:inline">My GPS</span>
        </button>
      </div>

      {/* Quick-jump region chips */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-[0.05em] text-slate-400">
          Quick Valleys:
        </span>
        {QUICK_REGION_CHIPS.map((chip) => {
          const isCurrent =
            Math.abs(parcel.lat - chip.lat) < 0.05 &&
            Math.abs(parcel.lng - chip.lng) < 0.05;
          return (
            <button
              key={chip.label}
              type="button"
              onClick={() => {
                setIsOpen(false);
                setQuery('');
                const matchedParcel = chip.parcelId
                  ? CURATED_PARCELS.find((p) => p.id === chip.parcelId)
                  : undefined;
                if (matchedParcel) {
                  onSelectParcel(matchedParcel);
                } else {
                  onInspectCoordinates(chip.lat, chip.lng, chip.fullLabel);
                }
              }}
              className={`rounded-md border px-2 py-0.5 text-[11px] font-medium transition-colors ${
                isCurrent
                  ? 'border-sky-700 bg-sky-50 font-semibold text-sky-900'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              {chip.label}
            </button>
          );
        })}
      </div>

      {statusMessage && (
        <p className="text-[11px] font-medium text-amber-700">{statusMessage}</p>
      )}

      {/* Rich Dropdown Suggestions */}
      {isOpen && actionItems.length > 0 && (
        <div
          data-testid="location-search-dropdown"
          role="listbox"
          className="absolute left-0 right-0 top-[44px] z-30 max-h-[340px] overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl"
        >
          <div className="flex items-center justify-between px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-400">
            <span>
              {query.trim()
                ? 'Matching Places, Coordinates & Agricultural Basins'
                : 'Featured Agricultural Valleys & Benchmarks'}
            </span>
            <span className="font-mono">↑↓ Enter</span>
          </div>

          <div className="mt-0.5 space-y-0.5">
            {actionItems.map((item, idx) => {
              const highlighted = idx === activeIndex;
              return (
                <button
                  key={item.key}
                  type="button"
                  role="option"
                  aria-selected={highlighted}
                  data-testid={`search-suggestion-${idx}`}
                  onMouseEnter={() => setActiveIndex(idx)}
                  onMouseDown={(e) => {
                    // Prevent input blur before click handler runs
                    e.preventDefault();
                    void item.onTrigger();
                  }}
                  className={`flex w-full items-start justify-between gap-3 rounded-lg px-2.5 py-2 text-left transition-colors ${
                    highlighted ? 'bg-sky-50/90 text-slate-950' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex min-w-0 items-start gap-2.5">
                    <MapPin
                      className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${
                        item.kind === 'place'
                          ? 'text-sky-700'
                          : item.kind === 'coordinate'
                            ? 'text-amber-600'
                            : 'text-emerald-700'
                      }`}
                    />
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-slate-900">
                        {item.title}
                      </p>
                      <p className="truncate text-[11px] text-slate-500">
                        {item.subtitle}
                      </p>
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-0.5">
                    <span
                      className={`rounded px-1.5 py-0.5 font-mono text-[9px] font-semibold ${
                        item.kind === 'place'
                          ? 'bg-sky-100 text-sky-900'
                          : item.kind === 'coordinate'
                            ? 'bg-amber-100 text-amber-900'
                            : 'bg-emerald-100 text-emerald-900'
                      }`}
                    >
                      {item.badge}
                    </span>
                    {item.lat !== undefined && item.lng !== undefined && (
                      <span className="font-mono tabular-nums text-[10px] text-slate-400">
                        {item.lat.toFixed(2)}, {item.lng.toFixed(2)}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Uncontrolled Google Map camera synchronizer.
 * Only pans the map when the selected parcel coordinates or explicit recenter trigger change,
 * leaving cursor drag/pan and wheel zoom 100% native and lag-free.
 */
function MapCameraController({
  targetLat,
  targetLng,
  recenterSeq,
  zoomCommand,
}: {
  targetLat: number;
  targetLng: number;
  recenterSeq: number;
  zoomCommand: { seq: number; delta: number };
}) {
  const map = useMap();
  const lastTargetRef = useRef<{ lat: number; lng: number; seq: number }>({
    lat: targetLat,
    lng: targetLng,
    seq: recenterSeq,
  });
  const lastZoomSeqRef = useRef(0);

  useEffect(() => {
    if (!map) return;
    const prev = lastTargetRef.current;
    const coordsChanged =
      Math.abs(prev.lat - targetLat) > 1e-5 ||
      Math.abs(prev.lng - targetLng) > 1e-5;
    const recenterRequested = prev.seq !== recenterSeq;

    if (coordsChanged || recenterRequested) {
      lastTargetRef.current = {
        lat: targetLat,
        lng: targetLng,
        seq: recenterSeq,
      };
      map.panTo({ lat: targetLat, lng: targetLng });
    }
  }, [map, targetLat, targetLng, recenterSeq]);

  useEffect(() => {
    if (!map || zoomCommand.seq === 0 || zoomCommand.seq === lastZoomSeqRef.current) {
      return;
    }
    lastZoomSeqRef.current = zoomCommand.seq;
    const currentZoom = map.getZoom() ?? 11;
    map.setZoom(Math.max(2, Math.min(20, currentZoom + zoomCommand.delta)));
  }, [map, zoomCommand]);

  return null;
}

function SatelliteMapCanvas({
  parcel,
  nasa,
  onInspectCoordinates,
}: {
  parcel: FarmParcelProfile;
  nasa: NasaPowerSummary;
  onInspectCoordinates: (lat: number, lng: number, label?: string) => void;
}) {
  const [mapType, setMapType] = useState<'hybrid' | 'terrain'>('hybrid');
  const [infoOpen, setInfoOpen] = useState(false);
  const [markerRef, marker] = useAdvancedMarkerRef();
  const [recenterSeq, setRecenterSeq] = useState(0);
  const [zoomCommand, setZoomCommand] = useState({ seq: 0, delta: 0 });
  const [pannedCenter, setPannedCenter] = useState<{
    lat: number;
    lng: number;
  }>({ lat: parcel.lat, lng: parcel.lng });

  useEffect(() => {
    setPannedCenter({ lat: parcel.lat, lng: parcel.lng });
  }, [parcel.lat, parcel.lng]);

  const isPannedAway =
    Math.hypot(pannedCenter.lat - parcel.lat, pannedCenter.lng - parcel.lng) >
    0.008;

  return (
    <div
      data-testid="satellite-map-container"
      className="relative h-[400px] w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-100 select-none"
    >
      <GoogleMap
        mapId="DEMO_MAP_ID"
        defaultCenter={{ lat: parcel.lat, lng: parcel.lng }}
        defaultZoom={11}
        mapTypeId={mapType}
        gestureHandling="greedy"
        clickableIcons={false}
        mapTypeControl={false}
        streetViewControl={false}
        fullscreenControl={false}
        zoomControl={false}
        internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
        onIdle={(ev) => {
          const c = ev.map.getCenter();
          if (c) {
            setPannedCenter({
              lat: Number(c.lat().toFixed(4)),
              lng: Number(c.lng().toFixed(4)),
            });
          }
        }}
        onClick={(ev) => {
          const ll = ev.detail.latLng;
          if (ll) {
            onInspectCoordinates(ll.lat, ll.lng);
            setInfoOpen(false);
          }
        }}
        style={{ width: '100%', height: '100%' }}
      >
        <MapCameraController
          targetLat={parcel.lat}
          targetLng={parcel.lng}
          recenterSeq={recenterSeq}
          zoomCommand={zoomCommand}
        />

        <AdvancedMarker
          ref={markerRef}
          position={{ lat: parcel.lat, lng: parcel.lng }}
          onClick={() => setInfoOpen((v) => !v)}
          title={parcel.name}
        >
          <Pin background="#0284c7" borderColor="#0f172a" glyphColor="#ffffff" />
        </AdvancedMarker>

        {infoOpen && marker && (
          <InfoWindow anchor={marker} onCloseClick={() => setInfoOpen(false)}>
            <div className="max-w-[220px] p-1 text-xs text-slate-900">
              <p className="font-display font-bold">{parcel.name}</p>
              <p className="text-slate-600">{parcel.region}</p>
              <p className="mt-1 font-mono text-[11px]">
                GWETROOT {Math.round(nasa.meanRootMoisture * 100)}% · {nasa.annualPrecipMm} mm/yr
              </p>
            </div>
          </InfoWindow>
        )}
      </GoogleMap>

      {/* Subtle center reticle when panning with cursor */}
      {isPannedAway && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 flex items-center justify-center"
        >
          <div className="flex h-7 w-7 items-center justify-center rounded-full border border-white/80 bg-slate-950/35 text-white shadow-sm">
            <Crosshair className="h-3.5 w-3.5" />
          </div>
        </div>
      )}

      {/* Top-Left Hybrid / Terrain Switcher */}
      <div className="absolute left-3 top-3 z-10 flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white/95 p-1 shadow-xs">
        {(['hybrid', 'terrain'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setMapType(t)}
            className={`rounded-md px-2.5 py-1 text-[11px] font-semibold capitalize ${
              mapType === t
                ? 'bg-sky-700 text-white'
                : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Top-Right Native Zoom & Recenter Controls */}
      <div className="absolute right-3 top-3 z-10 flex items-center gap-1 rounded-lg border border-slate-200 bg-white/95 p-1 shadow-xs">
        <button
          type="button"
          aria-label="Zoom in"
          onClick={() =>
            setZoomCommand((prev) => ({ seq: prev.seq + 1, delta: 1 }))
          }
          className="rounded-md p-1.5 text-slate-700 hover:bg-slate-100"
          title="Zoom in"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          aria-label="Zoom out"
          onClick={() =>
            setZoomCommand((prev) => ({ seq: prev.seq + 1, delta: -1 }))
          }
          className="rounded-md p-1.5 text-slate-700 hover:bg-slate-100"
          title="Zoom out"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <div className="h-4 w-px bg-slate-200" aria-hidden="true" />
        <button
          type="button"
          aria-label="Recenter map on active parcel"
          data-testid="map-recenter-btn"
          onClick={() => {
            setRecenterSeq((s) => s + 1);
            setPannedCenter({ lat: parcel.lat, lng: parcel.lng });
          }}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
          title="Recenter camera on active parcel pin"
        >
          <RotateCcw className="h-3 w-3" />
          <span>Recenter</span>
        </button>
      </div>

      {/* Bottom Floating Bar when User Pans Map with Cursor */}
      {isPannedAway && (
        <div
          data-testid="map-panned-action-bar"
          className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-xl border border-slate-200 bg-white/95 px-3 py-1.5 text-xs shadow-md backdrop-blur-xs"
        >
          <span className="font-mono tabular-nums text-[11px] text-slate-600">
            View: {pannedCenter.lat.toFixed(4)}, {pannedCenter.lng.toFixed(4)}
          </span>
          <button
            type="button"
            data-testid="inspect-panned-center-btn"
            onClick={() =>
              onInspectCoordinates(
                pannedCenter.lat,
                pannedCenter.lng,
                `Field Sector (${pannedCenter.lat.toFixed(3)}, ${pannedCenter.lng.toFixed(3)})`
              )
            }
            className="rounded-lg bg-sky-700 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-sky-800"
          >
            Inspect Map Center
          </button>
          <button
            type="button"
            onClick={() => {
              setRecenterSeq((s) => s + 1);
              setPannedCenter({ lat: parcel.lat, lng: parcel.lng });
            }}
            className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
          >
            Pin
          </button>
        </div>
      )}
    </div>
  );
}

export function FieldObservatory({
  parcel,
  onSelectParcel,
  onInspectCoordinates,
  nasa,
  nasaLoading,
  nasaError,
  weather,
  mapsAvailable,
  simulation,
  onOpenTwin3D,
  onOpenOptimizer,
}: FieldObservatoryProps) {
  const [quickCheck, setQuickCheck] = useState<{
    text: string;
    model: string;
    latencyMs: number;
  } | null>(null);
  const [quickBusy, setQuickBusy] = useState(false);

  const [searchGrounding, setSearchGrounding] = useState<{
    markdown: string;
    sources: Array<{ uri: string; title?: string }>;
  } | null>(null);
  const [searchBusy, setSearchBusy] = useState(false);

  const [mapsGrounding, setMapsGrounding] = useState<{
    markdown: string;
    places: Array<{ uri: string; title?: string }>;
  } | null>(null);
  const [mapsBusy, setMapsBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [externalTelemetry, setExternalTelemetry] =
    useState<RawExternalTelemetryInput>({});
  const [externalLoading, setExternalLoading] = useState(false);

  useEffect(() => {
    setQuickCheck(null);
    setSearchGrounding(null);
    setMapsGrounding(null);
    setAiError(null);

    let cancelled = false;
    setExternalLoading(true);
    fetchMultiSourceTelemetry(parcel.lat, parcel.lng)
      .then((data) => {
        if (!cancelled) setExternalTelemetry(data);
      })
      .finally(() => {
        if (!cancelled) setExternalLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [parcel.id, parcel.lat, parcel.lng]);

  const handleRunQuickCheck = async () => {
    setQuickBusy(true);
    setAiError(null);
    try {
      const currentCrop = getCropById(parcel.currentCropId).name;
      const nextYearCrop = simulation.steps[0]?.primaryCrop.name;
      const res = await requestAiQuickCheck({
        parcelName: parcel.name,
        region: parcel.region,
        currentCrop,
        nasa,
        nextYearCrop,
      });
      setQuickCheck(res);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Quick check failed');
    } finally {
      setQuickBusy(false);
    }
  };

  const handleRunSearchGrounding = async () => {
    setSearchBusy(true);
    setAiError(null);
    try {
      const cropName = getCropById(parcel.currentCropId).name;
      const res = await requestSearchGrounding({
        region: parcel.region,
        cropName,
        soilType: parcel.soilType,
        climateRiskIndex: nasa.climateRiskIndex,
      });
      setSearchGrounding(res);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Search grounding failed');
    } finally {
      setSearchBusy(false);
    }
  };

  const handleRunMapsGrounding = async () => {
    setMapsBusy(true);
    setAiError(null);
    try {
      const res = await requestMapsGrounding({
        lat: parcel.lat,
        lng: parcel.lng,
        region: parcel.region,
      });
      setMapsGrounding(res);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Maps grounding failed');
    } finally {
      setMapsBusy(false);
    }
  };

  const kpis = [
    {
      label: 'Mean Temp',
      value: `${nasa.meanTempC}°C`,
      sub: `Shift ${nasa.tempAnomalyC >= 0 ? '+' : ''}${nasa.tempAnomalyC}°C`,
      tone: 'text-slate-950',
    },
    {
      label: 'Peak Summer',
      value: `${nasa.peakSummerTempC}°C`,
      sub: `${nasa.dryStressMonths}/12 dry months`,
      tone: nasa.peakSummerTempC >= 33 ? 'text-amber-700' : 'text-slate-950',
    },
    {
      label: 'Annual Precip',
      value: `${nasa.annualPrecipMm} mm`,
      sub: `Variability ${nasa.precipVariabilityPct}% CV`,
      tone: 'text-sky-800',
    },
    {
      label: 'Root Moisture',
      value: `${Math.round(nasa.meanRootMoisture * 100)}%`,
      sub: `Min ${Math.round(nasa.minRootMoisture * 100)}% GWETROOT`,
      tone: 'text-emerald-800',
    },
    {
      label: 'Climate Risk',
      value: `${nasa.climateRiskIndex}/100`,
      sub: `Solar ${nasa.meanSolarIrradiance} MJ/m²`,
      tone: nasa.climateRiskIndex >= 65 ? 'text-amber-700' : 'text-slate-950',
    },
    {
      label: 'NDVI Proxy',
      value: nasa.estimatedNdvi.toFixed(2),
      sub: `Elev ${nasa.elevationM} m`,
      tone: 'text-emerald-800',
    },
  ];

  return (
    <div className="mx-auto max-w-[1440px] space-y-6 px-4 py-6 sm:px-6">
      {/* Top Grid: Left Parcel Selector + Satellite Map */}
      <div className="grid gap-5 lg:grid-cols-12">
        {/* Left Control Rail */}
        <aside className="flex min-w-0 flex-col justify-between rounded-xl border border-slate-200 bg-white p-4 lg:col-span-4">
          <div>
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500">
                Global Challenge Benchmarks
              </p>
              <span className="font-mono text-[11px] text-slate-500">
                {nasa.source === 'NASA_POWER_LIVE' ? 'NASA POWER LIVE' : 'CLIMATOLOGY'}
              </span>
            </div>

            <div className="mt-3 space-y-2.5">
              {CURATED_PARCELS.map((item) => {
                const active = item.id === parcel.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    data-parcel-id={item.id}
                    onClick={() => onSelectParcel(item)}
                    className={`w-full rounded-lg border px-3 py-3 text-left transition-colors ${
                      active
                        ? 'border-sky-700 bg-sky-50/70'
                        : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-950">
                        {item.name}
                      </span>
                      <span className="font-mono text-[11px] text-slate-500">
                        {item.areaHectares} ha
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-slate-600">
                      {item.region} · {item.soilType.split(' ')[0]} ·{' '}
                      {getCropById(item.currentCropId).name.split(' ')[0]}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-4 flex gap-2 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={onOpenTwin3D}
              className="flex-1 rounded-lg border border-slate-300 bg-white py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50"
            >
              Open 3D Soil Twin
            </button>
            <button
              type="button"
              onClick={onOpenOptimizer}
              className="flex-1 rounded-lg bg-emerald-700 py-2 text-xs font-semibold text-white hover:bg-emerald-800"
            >
              Optimize Rotation
            </button>
          </div>
        </aside>

        {/* Right Primary Map & NASA KPI Header */}
        <section className="min-w-0 space-y-3.5 rounded-xl border border-slate-200 bg-white p-4 lg:col-span-8">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-display text-lg font-bold text-slate-950">
                  {parcel.name}
                </h1>
                {nasaLoading && (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-sky-700">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Syncing NASA POWER...
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-600">
                {parcel.region} ·{' '}
                <span className="font-mono tabular-nums">
                  {parcel.lat.toFixed(4)}, {parcel.lng.toFixed(4)}
                </span>{' '}
                · {parcel.soilType} (pH {parcel.soilPh}, SOC {parcel.baselineOrganicCarbon}%)
              </p>
            </div>
            <p className="text-xs font-medium text-slate-500">
              Drag freely to pan · Click any point to inspect live 5-yr NASA telemetry
            </p>
          </div>

          {/* Unified Location & Agricultural Basin Omnibox Search Bar */}
          <LocationOmnibox
            parcel={parcel}
            mapsAvailable={mapsAvailable}
            onSelectParcel={onSelectParcel}
            onInspectCoordinates={onInspectCoordinates}
          />

          {nasaError && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              {nasaError}
            </div>
          )}

          {mapsAvailable ? (
            <SatelliteMapCanvas
              parcel={parcel}
              nasa={nasa}
              onInspectCoordinates={onInspectCoordinates}
            />
          ) : (
            <div className="flex h-[390px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
              <Compass className="h-8 w-8 text-sky-700" />
              <p className="mt-2 font-display text-sm font-semibold text-slate-900">
                Interactive Coordinate Observatory Active
              </p>
              <p className="mt-1 max-w-md text-xs text-slate-600">
                Satellite map key is currently unavailable; use the omnibox search bar, benchmark parcel cards, or custom latitude/longitude controls to pull live NASA POWER data anywhere on Earth.
              </p>
            </div>
          )}

          {/* NASA KPI Strip */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
            {kpis.map((kpi) => (
              <div
                key={kpi.label}
                className="rounded-lg border border-slate-200 bg-slate-50/70 p-3"
              >
                <span className="block text-[10px] font-semibold uppercase tracking-[0.05em] text-slate-500">
                  {kpi.label}
                </span>
                <span
                  className={`mt-1 block font-mono tabular-nums text-base font-bold ${kpi.tone}`}
                >
                  {kpi.value}
                </span>
                <span className="block truncate text-[11px] text-slate-500">
                  {kpi.sub}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Middle Row: Dual-Axis Telemetry Chart + Live Weather Strip */}
      <div className="grid gap-5 lg:grid-cols-12">
        <section className="rounded-xl border border-slate-200 bg-white p-5 lg:col-span-8">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500">
                5-Year Monthly Agroclimatology
              </p>
              <h2 className="font-display text-base font-semibold text-slate-950">
                Precipitation, Root-Zone Soil Moisture & Thermal Curve
              </h2>
            </div>
            <Satellite className="h-4.5 w-4.5 text-sky-700" />
          </div>
          <TelemetryChartSvg nasa={nasa} />
        </section>

        <section className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 lg:col-span-4">
          <div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500">
                  Local Tactical Forecast
                </p>
                <h2 className="font-display text-base font-semibold text-slate-950">
                  5-Day Field Conditions
                </h2>
              </div>
              <CloudSun className="h-4.5 w-4.5 text-amber-600" />
            </div>

            {weather?.available && weather.current ? (
              <div className="mt-4 space-y-3">
                <div className="flex items-baseline justify-between rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div>
                    <span className="text-xs font-medium text-slate-500">Current Conditions</span>
                    <p className="font-display text-sm font-semibold text-slate-900">
                      {weather.current.weatherCondition?.description?.text ?? 'Clear'}
                    </p>
                  </div>
                  <div className="text-right font-mono tabular-nums">
                    <span className="text-xl font-bold text-slate-950">
                      {Math.round(weather.current.temperature?.degrees ?? nasa.meanTempC)}°C
                    </span>
                    <span className="block text-[11px] text-slate-500">
                      RH {weather.current.relativeHumidity ?? 55}%
                    </span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  {(weather.forecastDays ?? []).slice(0, 5).map((day, i) => {
                    const d = day.displayDate;
                    const label = d ? `${d.month}/${d.day}` : `Day ${i + 1}`;
                    return (
                      <div
                        key={i}
                        className="flex items-center justify-between rounded-md border border-slate-100 px-2.5 py-1.5 text-xs"
                      >
                        <span className="font-mono font-medium text-slate-600">
                          {label}
                        </span>
                        <span className="truncate px-2 text-slate-700">
                          {day.daytimeForecast?.weatherCondition?.description?.text ?? 'Partly Cloudy'}
                        </span>
                        <span className="font-mono tabular-nums font-semibold text-slate-900">
                          {Math.round(day.maxTemperature?.degrees ?? 26)}° /{' '}
                          {Math.round(day.minTemperature?.degrees ?? 14)}°
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs leading-relaxed text-slate-600">
                Live short-range Google Weather telemetry displays here when regional forecast data is available; 5-year NASA POWER agroclimatology remains active for all global coordinates.
              </div>
            )}
          </div>

          <p className="mt-3 text-[11px] text-slate-500">
            Climate zone note: {parcel.climateZoneNote}
          </p>
        </section>
      </div>

      {/* 5-Year Recharts Soil Moisture & Nutrient Depletion Trends */}
      <FiveYearSoilNutrientRechart nasa={nasa} parcel={parcel} />

      {/* Multi-Mission NASA & Partner Agency Earth Observation Suite */}
      <NasaMultiSourcePanel
        parcel={parcel}
        nasa={nasa}
        simulation={simulation}
        externalTelemetry={externalTelemetry}
        externalLoading={externalLoading}
      />

      {/* Bottom Row: Tactical Quick-Check + Search Grounding + Maps Grounding */}
      {aiError && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-medium text-rose-900">
          {aiError}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Gemini Flash-Lite Tactical Quick-Check */}
        <section className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5">
          <div>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-amber-600" />
                <h3 className="font-display text-sm font-semibold text-slate-950">
                  Tactical Field Quick-Check
                </h3>
              </div>
              <button
                type="button"
                onClick={handleRunQuickCheck}
                disabled={quickBusy}
                className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
              >
                {quickBusy ? 'Checking...' : 'Run Check'}
              </button>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Fast 3-point posture check for irrigation, residue armor, and rotation prep.
            </p>
            {quickCheck ? (
              <div className="mt-3 whitespace-pre-line rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs leading-relaxed text-slate-800">
                {quickCheck.text}
              </div>
            ) : (
              <div className="mt-3 rounded-lg border border-dashed border-slate-200 p-4 text-center text-xs text-slate-400">
                Click Run Check for instant parcel actions
              </div>
            )}
          </div>
          {quickCheck && (
            <p className="mt-2 text-right font-mono text-[10px] text-slate-400">
              {quickCheck.model} · {quickCheck.latencyMs}ms
            </p>
          )}
        </section>

        {/* Google Search Grounding */}
        <section className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5">
          <div>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Search className="h-4 w-4 text-sky-700" />
                <h3 className="font-display text-sm font-semibold text-slate-950">
                  Regional Extension Bulletins
                </h3>
              </div>
              <button
                type="button"
                onClick={handleRunSearchGrounding}
                disabled={searchBusy}
                className="rounded-lg border border-sky-700 bg-sky-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-800 disabled:opacity-60"
              >
                {searchBusy ? 'Searching...' : 'Search Live'}
              </button>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Live Google Search grounding for regional drought advisories & conservation incentives.
            </p>
            {searchGrounding ? (
              <div className="mt-3 space-y-2">
                <div className="max-h-40 overflow-y-auto whitespace-pre-line rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs leading-relaxed text-slate-800">
                  {searchGrounding.markdown.replace(/[#*]/g, '')}
                </div>
                {searchGrounding.sources.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {searchGrounding.sources.map((s, idx) => (
                      <a
                        key={idx}
                        href={s.uri}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-sky-800 hover:bg-sky-50"
                      >
                        <span className="max-w-[140px] truncate">
                          {s.title || 'Extension Source'}
                        </span>
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="mt-3 rounded-lg border border-dashed border-slate-200 p-4 text-center text-xs text-slate-400">
                Fetch live regional drought & cover-crop advisories
              </div>
            )}
          </div>
        </section>

        {/* Google Maps Grounding */}
        <section className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5">
          <div>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-emerald-700" />
                <h3 className="font-display text-sm font-semibold text-slate-950">
                  Nearby Soil Labs & Co-Ops
                </h3>
              </div>
              <button
                type="button"
                onClick={handleRunMapsGrounding}
                disabled={mapsBusy}
                className="inline-flex items-center gap-1 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
              >
                <Sparkles className="h-3 w-3" />
                <span>{mapsBusy ? 'Locating...' : 'Find Nearby'}</span>
              </button>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Live Google Maps grounding anchored to {parcel.lat.toFixed(2)}, {parcel.lng.toFixed(2)}.
            </p>
            {mapsGrounding ? (
              <div className="mt-3 space-y-2">
                <div className="max-h-40 overflow-y-auto whitespace-pre-line rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs leading-relaxed text-slate-800">
                  {mapsGrounding.markdown.replace(/[#*]/g, '')}
                </div>
                {mapsGrounding.places.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {mapsGrounding.places.map((p, idx) => (
                      <a
                        key={idx}
                        href={p.uri}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-900 hover:bg-emerald-100"
                      >
                        <span className="max-w-[150px] truncate">
                          {p.title || 'Google Maps Place'}
                        </span>
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="mt-3 rounded-lg border border-dashed border-slate-200 p-4 text-center text-xs text-slate-400">
                Locate verified extension offices, labs & seed co-ops
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
