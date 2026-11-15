import { useEffect, useMemo, useState } from 'react';
import {
  Database,
  Droplets,
  Layers,
  Loader2,
  Mountain,
  Sprout,
  TrendingUp,
} from 'lucide-react';
import type {
  FarmParcelProfile,
  NasaPowerSummary,
  RotationSimulationResult,
} from '../lib/agronomy';
import {
  buildNasaGibsWmsUrl,
  NASA_GIBS_LAYERS,
  synthesizeMultiSourceObservatory,
  type NasaGibsLayerId,
  type RawExternalTelemetryInput,
} from '../lib/nasaResources';

interface NasaMultiSourcePanelProps {
  parcel: FarmParcelProfile;
  nasa: NasaPowerSummary;
  simulation: RotationSimulationResult;
  externalTelemetry: RawExternalTelemetryInput;
  externalLoading: boolean;
}

type DomainTabId =
  | 'smap_openet'
  | 'srtm_ssurgo'
  | 'spectral_gedi_usgs'
  | 'cdl_markets'
  | 'catalog';

export function NasaMultiSourcePanel({
  parcel,
  nasa,
  simulation,
  externalTelemetry,
  externalLoading,
}: NasaMultiSourcePanelProps) {
  const [activeLayerId, setActiveLayerId] = useState<NasaGibsLayerId>(
    'SMAP_L4_Analyzed_Root_Zone_Soil_Moisture'
  );
  const [spanDeg, setSpanDeg] = useState<1.4 | 0.55>(1.4);
  const [imgFailed, setImgFailed] = useState(false);
  const [imgLoading, setImgLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<DomainTabId>('smap_openet');

  const multi = useMemo(
    () => synthesizeMultiSourceObservatory(parcel, nasa, externalTelemetry),
    [parcel, nasa, externalTelemetry]
  );

  const activeLayerSpec =
    NASA_GIBS_LAYERS.find((l) => l.id === activeLayerId) ?? NASA_GIBS_LAYERS[0];

  const wmsUrl = useMemo(
    () =>
      buildNasaGibsWmsUrl(
        activeLayerId,
        parcel.lat,
        parcel.lng,
        spanDeg,
        activeLayerSpec.defaultDate
      ),
    [activeLayerId, parcel.lat, parcel.lng, spanDeg, activeLayerSpec.defaultDate]
  );

  useEffect(() => {
    setImgFailed(false);
    setImgLoading(true);
  }, [wmsUrl]);

  const rotationCropIds = useMemo(
    () => new Set(simulation.steps.map((s) => s.primaryCrop.id)),
    [simulation.steps]
  );

  const tabs: Array<{ id: DomainTabId; label: string; icon: typeof Droplets }> = [
    { id: 'smap_openet', label: 'SMAP & OpenET', icon: Droplets },
    { id: 'srtm_ssurgo', label: 'SRTM & Soil', icon: Mountain },
    { id: 'spectral_gedi_usgs', label: 'Spectral & Water', icon: Sprout },
    { id: 'cdl_markets', label: 'CDL & Markets', icon: TrendingUp },
    { id: 'catalog', label: '22 Datasets', icon: Database },
  ];

  return (
    <section
      data-testid="nasa-multi-source-panel"
      className="min-w-0 rounded-xl border border-slate-200 bg-white p-5"
    >
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500">
            Multi-Mission Earth Observation &amp; Partner Agency Fusion
          </p>
          <h2 className="font-display text-base font-semibold text-slate-950">
            NASA SMAP, GPM IMERG, ECOSTRESS/OpenET, SRTM, GEDI, Sentinel-2 &amp; USDA/USGS Suite
          </h2>
          <p className="mt-0.5 text-xs text-slate-600">
            NASA GIBS WMS satellite imagery · ERA5/NLDAS 5-layer soil assimilation · SRTM slope/RUSLE erosion · USDA CDL &amp; NASS/AMS economics
          </p>
        </div>

        <div className="flex items-center gap-3 text-xs text-slate-500">
          {externalLoading && (
            <span className="inline-flex items-center gap-1.5 font-medium text-sky-700">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>Syncing partner agencies...</span>
            </span>
          )}
          <span className="font-mono tabular-nums">
            {multi.smap.source === 'ERA5_SMAP_ASSIMILATION_LIVE'
              ? 'ERA5/SMAP Live'
              : 'Assimilated'}
            {' · '}
            {multi.srtm.source === 'SRTM_OPEN_METEO_LIVE'
              ? 'SRTM DEM Live'
              : 'SRTM Grid'}
            {multi.cdlHistory[0]?.source === 'USDA_CROPSCAPE_LIVE'
              ? ' · USDA CDL Live'
              : ''}
            {multi.usgsWater.source === 'USGS_NWIS_LIVE'
              ? ' · USGS NWIS Live'
              : ''}
          </span>
        </div>
      </div>

      {/* Main 12-Col Grid: Left NASA GIBS Satellite Layer Viewer (5 cols) + Right Telemetry Deck (7 cols) */}
      <div className="mt-5 grid gap-5 lg:grid-cols-12">
        {/* Left: Live NASA GIBS / Worldview Satellite Imagery Inspector */}
        <div className="flex min-w-0 flex-col justify-between rounded-xl border border-slate-200 bg-slate-50/60 p-4 lg:col-span-5">
          <div>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <Layers className="h-4 w-4 text-sky-700" />
                <h3 className="font-display text-sm font-semibold text-slate-950">
                  NASA Worldview / GIBS Satellite Layer
                </h3>
              </div>

              <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-0.5">
                <button
                  type="button"
                  onClick={() => setSpanDeg(1.4)}
                  className={`rounded-md px-2 py-1 text-[11px] font-semibold transition-colors whitespace-nowrap shrink-0 ${
                    spanDeg === 1.4
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Regional ±1.4°
                </button>
                <button
                  type="button"
                  onClick={() => setSpanDeg(0.55)}
                  className={`rounded-md px-2 py-1 text-[11px] font-semibold transition-colors whitespace-nowrap shrink-0 ${
                    spanDeg === 0.55
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Basin ±0.55°
                </button>
              </div>
            </div>

            {/* Layer Selector Buttons */}
            <div className="mt-3 flex flex-wrap gap-1.5">
              {NASA_GIBS_LAYERS.map((layer) => {
                const active = layer.id === activeLayerId;
                return (
                  <button
                    key={layer.id}
                    type="button"
                    data-gibs-layer={layer.id}
                    onClick={() => setActiveLayerId(layer.id)}
                    className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-colors whitespace-nowrap shrink-0 ${
                      active
                        ? 'border-sky-700 bg-sky-700 text-white'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {layer.shortLabel}
                  </button>
                );
              })}
            </div>

            {/* WMS Viewport Frame */}
            <div className="relative mt-3 h-[225px] w-full overflow-hidden rounded-lg border border-slate-300 bg-slate-900">
              {!imgFailed ? (
                <img
                  src={wmsUrl}
                  alt={`${activeLayerSpec.shortLabel} NASA GIBS satellite layer for ${parcel.name}`}
                  referrerPolicy="no-referrer"
                  onLoad={() => setImgLoading(false)}
                  onError={() => {
                    setImgLoading(false);
                    setImgFailed(true);
                  }}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center bg-slate-900 p-4 text-center text-slate-300">
                  <p className="font-mono text-xs font-semibold">
                    {activeLayerSpec.mission} · {activeLayerSpec.resolution}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-400">
                    BBOX centered at {parcel.lat.toFixed(3)}°, {parcel.lng.toFixed(3)}°
                  </p>
                </div>
              )}

              {/* Subtle Coordinate Grid & Target Crosshair Overlay */}
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="h-7 w-7 rounded-full border border-white/80 bg-sky-500/20" />
                <div className="absolute h-px w-10 bg-white/70" />
                <div className="absolute h-10 w-px bg-white/70" />
              </div>

              {/* Bottom Scrim Metadata */}
              <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/50 to-transparent px-3 py-2 text-[11px] text-white">
                <div className="flex items-center justify-between gap-2 font-mono tabular-nums">
                  <span>
                    {activeLayerSpec.mission} · {activeLayerSpec.resolution}
                  </span>
                  <span>
                    {imgLoading ? 'Loading tile...' : activeLayerSpec.unitLabel}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <p className="mt-2.5 text-xs leading-relaxed text-slate-600">
            {activeLayerSpec.description}
          </p>
        </div>

        {/* Right: Multi-Agency Domain Tabs & Quantitative Readouts */}
        <div className="flex min-w-0 flex-col justify-between lg:col-span-7">
          <div>
            {/* Segmented Tab Bar */}
            <div
              role="tablist"
              aria-label="Earth observation dataset domains"
              className="flex flex-wrap items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-100 p-1"
            >
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const active = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    data-domain-tab={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                      active
                        ? 'bg-white text-slate-950 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Tab 1: SMAP + NLDAS/GLDAS + ECOSTRESS + OpenET */}
            {activeTab === 'smap_openet' && (
              <div className="mt-4 space-y-4">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
                    <span className="block text-[10px] font-semibold uppercase tracking-[0.05em] text-slate-500">
                      ECOSTRESS LST
                    </span>
                    <span className="mt-1 block font-mono tabular-nums text-base font-bold text-slate-950">
                      {multi.ecostressOpenEt.landSurfaceTempC}°C
                    </span>
                    <span className="block text-[11px] text-slate-500">
                      Canopy ΔT {multi.ecostressOpenEt.canopyThermalDeltaC >= 0 ? '+' : ''}
                      {multi.ecostressOpenEt.canopyThermalDeltaC}°C
                    </span>
                  </div>

                  <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
                    <span className="block text-[10px] font-semibold uppercase tracking-[0.05em] text-slate-500">
                      OpenET / FAO ET₀
                    </span>
                    <span className="mt-1 block font-mono tabular-nums text-base font-bold text-sky-800">
                      {multi.ecostressOpenEt.dailyEt0Mm} mm/d
                    </span>
                    <span className="block text-[11px] text-slate-500">
                      Season ~{multi.ecostressOpenEt.seasonalCropEtMm} mm
                    </span>
                  </div>

                  <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
                    <span className="block text-[10px] font-semibold uppercase tracking-[0.05em] text-slate-500">
                      Evap Stress (ESI)
                    </span>
                    <span className="mt-1 block font-mono tabular-nums text-base font-bold text-emerald-800">
                      {multi.ecostressOpenEt.evaporativeStressIndex}
                    </span>
                    <span className="block truncate text-[11px] text-slate-500">
                      VPD {multi.ecostressOpenEt.vapourPressureDeficitKpa} kPa
                    </span>
                  </div>

                  <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
                    <span className="block text-[10px] font-semibold uppercase tracking-[0.05em] text-slate-500">
                      SMAP Freeze/Thaw
                    </span>
                    <span className="mt-1 block font-mono tabular-nums text-sm font-bold text-slate-950">
                      {multi.smap.soilTemp0cmC}°C Soil
                    </span>
                    <span className="block truncate text-[11px] text-slate-500">
                      {multi.smap.freezeThawState}
                    </span>
                  </div>
                </div>

                {/* 5-Layer NLDAS / GLDAS / ERA5 Soil Moisture Profile */}
                <div className="rounded-lg border border-slate-200 p-3.5">
                  <div className="mb-2.5 flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-900">
                      SMAP + NLDAS/ERA5 5-Horizon Soil Wetness Assimilation
                    </span>
                    <span className="font-mono tabular-nums text-slate-500">
                      Infiltration Capacity: {multi.smap.infiltrationRateMmHr} mm/hr
                    </span>
                  </div>
                  <div className="space-y-2">
                    {multi.smap.layers.map((lyr) => (
                      <div key={lyr.depthLabel} className="grid grid-cols-12 items-center gap-2 text-xs">
                        <span className="col-span-4 truncate font-mono text-[11px] text-slate-700">
                          {lyr.depthLabel}
                        </span>
                        <span className="col-span-2 truncate text-[11px] text-slate-500">
                          {lyr.horizonCode}
                        </span>
                        <div className="col-span-4 h-2 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full bg-emerald-600"
                            style={{ width: `${Math.min(100, lyr.volumetricPct)}%` }}
                          />
                        </div>
                        <span className="col-span-2 text-right font-mono tabular-nums text-[11px] font-semibold text-slate-900">
                          {lyr.volumetricPct.toFixed(1)}% · {lyr.statusLabel}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Tab 2: SRTM Terrain + USDA NRCS SSURGO/WSS + FAO GAEZ */}
            {activeTab === 'srtm_ssurgo' && (
              <div className="mt-4 space-y-4">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
                    <span className="block text-[10px] font-semibold uppercase tracking-[0.05em] text-slate-500">
                      SRTM Slope &amp; Aspect
                    </span>
                    <span className="mt-1 block font-mono tabular-nums text-base font-bold text-slate-950">
                      {multi.srtm.slopePct}%
                    </span>
                    <span className="block text-[11px] text-slate-500">
                      {multi.srtm.aspectLabel} · {multi.srtm.elevationM} m
                    </span>
                  </div>

                  <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
                    <span className="block text-[10px] font-semibold uppercase tracking-[0.05em] text-slate-500">
                      RUSLE Erosion (LS)
                    </span>
                    <span className="mt-1 block font-mono tabular-nums text-base font-bold text-amber-800">
                      {multi.srtm.rusleLsFactor}
                    </span>
                    <span className="block text-[11px] text-slate-500">
                      Risk: {multi.srtm.erosionRiskClass}
                    </span>
                  </div>

                  <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
                    <span className="block text-[10px] font-semibold uppercase tracking-[0.05em] text-slate-500">
                      SSURGO / WSS Group
                    </span>
                    <span className="mt-1 block font-mono tabular-nums text-base font-bold text-sky-800">
                      Group {multi.soilSurveyGaez.hydrologicSoilGroup}
                    </span>
                    <span className="block truncate text-[11px] text-slate-500">
                      AWC {multi.soilSurveyGaez.availableWaterCapacityCm} cm/m
                    </span>
                  </div>

                  <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
                    <span className="block text-[10px] font-semibold uppercase tracking-[0.05em] text-slate-500">
                      FAO GAEZ Suitability
                    </span>
                    <span className="mt-1 block font-mono tabular-nums text-base font-bold text-emerald-800">
                      {multi.soilSurveyGaez.faoGaezSuitabilityIndex}/100
                    </span>
                    <span className="block text-[11px] text-slate-500">
                      Kw Factor {multi.soilSurveyGaez.erodibilityKwFactor}
                    </span>
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3.5 text-xs space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold text-slate-900">
                      Soil Mapunit: {multi.soilSurveyGaez.mapunitName}
                    </span>
                    <span className="font-mono text-slate-600">
                      Drainage: {multi.soilSurveyGaez.drainageClass}
                    </span>
                  </div>
                  <p className="text-slate-600">
                    <strong className="font-semibold text-slate-800">USGS NLCD / WorldCover Context:</strong>{' '}
                    {multi.soilSurveyGaez.nlcdSurroundingContext}
                  </p>
                  <p className="text-slate-600">
                    <strong className="font-semibold text-slate-800">SRTM Terrain Prescription:</strong>{' '}
                    {multi.srtm.recommendedContourPractice}
                  </p>
                </div>
              </div>
            )}

            {/* Tab 3: Landsat/MODIS/Sentinel-2 + GEDI Lidar + USGS NWIS Water */}
            {activeTab === 'spectral_gedi_usgs' && (
              <div className="mt-4 space-y-4">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
                    <span className="block text-[10px] font-semibold uppercase tracking-[0.05em] text-slate-500">
                      Landsat / MODIS
                    </span>
                    <span className="mt-1 block font-mono tabular-nums text-base font-bold text-emerald-800">
                      NDVI {multi.spectralGedi.landsat30mNdvi}
                    </span>
                    <span className="block text-[11px] text-slate-500">
                      EVI {multi.spectralGedi.modis250mEvi}
                    </span>
                  </div>

                  <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
                    <span className="block text-[10px] font-semibold uppercase tracking-[0.05em] text-slate-500">
                      ESA Sentinel-2
                    </span>
                    <span className="mt-1 block font-mono tabular-nums text-base font-bold text-sky-800">
                      NDRE {multi.spectralGedi.sentinel2RedEdgeNdre}
                    </span>
                    <span className="block text-[11px] text-slate-500">
                      SWIR BSI {multi.spectralGedi.bareSoilIndexBsi}
                    </span>
                  </div>

                  <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
                    <span className="block text-[10px] font-semibold uppercase tracking-[0.05em] text-slate-500">
                      ISS GEDI L4B Lidar
                    </span>
                    <span className="mt-1 block font-mono tabular-nums text-base font-bold text-slate-950">
                      {multi.spectralGedi.gediBiomassTonHa} Mg/ha
                    </span>
                    <span className="block text-[11px] text-slate-500">
                      Canopy {multi.spectralGedi.gediCanopyHeightM} m
                    </span>
                  </div>

                  <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
                    <span className="block text-[10px] font-semibold uppercase tracking-[0.05em] text-slate-500">
                      USGS NWIS Flow
                    </span>
                    <span className="mt-1 block font-mono tabular-nums text-base font-bold text-sky-900">
                      {multi.usgsWater.streamflowCfs !== null
                        ? `${multi.usgsWater.streamflowCfs} cfs`
                        : multi.usgsWater.watershedStatus.split(' ')[0]}
                    </span>
                    <span className="block truncate text-[11px] text-slate-500">
                      {multi.usgsWater.watershedStatus}
                    </span>
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3.5 text-xs space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold text-slate-900">
                      Phenology &amp; Reflectance State: {multi.spectralGedi.phenologyStage}
                    </span>
                    <span className="font-mono text-slate-500">
                      Station: {multi.usgsWater.stationName} (#{multi.usgsWater.stationId})
                    </span>
                  </div>
                  <p className="text-slate-600">
                    {multi.usgsWater.irrigationBufferNote}
                  </p>
                </div>
              </div>
            )}

            {/* Tab 4: USDA Cropland Data Layer (CDL) + NASS QuickStats + AMS Market News */}
            {activeTab === 'cdl_markets' && (
              <div className="mt-4 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50/70 p-3">
                  <div>
                    <span className="block text-[10px] font-semibold uppercase tracking-[0.05em] text-slate-500">
                      USDA NASS Cropland Data Layer (30m CropScape Sequence)
                    </span>
                    <div className="mt-1 flex flex-wrap items-center gap-3 text-xs font-semibold text-slate-900">
                      {multi.cdlHistory.map((item, idx) => (
                        <span key={item.year} className="inline-flex items-center gap-1.5 font-mono">
                          <span
                            className="inline-block h-2.5 w-2.5 rounded-xs border border-slate-400"
                            style={{ backgroundColor: item.colorHex }}
                          />
                          <span>
                            {item.year}: {item.cropCategory}
                          </span>
                          {idx < multi.cdlHistory.length - 1 && (
                            <span className="text-slate-400">→</span>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>
                  <span className="font-mono text-[11px] text-slate-500">
                    {multi.cdlHistory[0]?.source === 'USDA_CROPSCAPE_LIVE'
                      ? 'USDA CropScape 30m Live'
                      : 'Regional Cropland Archive'}
                  </span>
                </div>

                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-slate-200 bg-slate-50 text-[10px] font-semibold uppercase tracking-[0.05em] text-slate-500">
                      <tr>
                        <th className="px-3 py-2">Crop Candidate</th>
                        <th className="px-3 py-2 text-right">NASS Yield</th>
                        <th className="px-3 py-2 text-right">AMS Price</th>
                        <th className="px-3 py-2 text-right">Gross Rev</th>
                        <th className="px-3 py-2">Market Posture</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono tabular-nums">
                      {multi.marketBenchmarks.map((row) => {
                        const inRotation = rotationCropIds.has(row.cropId);
                        return (
                          <tr
                            key={row.cropId}
                            className={inRotation ? 'bg-emerald-50/50' : 'bg-white'}
                          >
                            <td className="px-3 py-1.5 font-sans font-medium text-slate-900">
                              {row.cropName}
                              {inRotation ? ' (In Plan)' : ''}
                            </td>
                            <td className="px-3 py-1.5 text-right text-slate-700">
                              {row.nassCountyYieldTonHa} t/ha
                            </td>
                            <td className="px-3 py-1.5 text-right text-slate-700">
                              ${row.amsPriceUsdPerTon}/t
                            </td>
                            <td className="px-3 py-1.5 text-right font-semibold text-emerald-800">
                              ${row.estimatedGrossRevUsdHa}/ha
                            </td>
                            <td className="px-3 py-1.5 font-sans text-[11px] text-slate-600">
                              {row.marketDemandTrend}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Tab 5: Full 14-Row Challenge Dataset Provenance Matrix */}
            {activeTab === 'catalog' && (
              <div className="mt-4 max-h-[260px] overflow-y-auto rounded-lg border border-slate-200">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 border-b border-slate-200 bg-slate-50 text-[10px] font-semibold uppercase tracking-[0.05em] text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Space Apps Resource</th>
                      <th className="px-3 py-2">Agency &amp; Scale</th>
                      <th className="px-3 py-2">Active Parcel Telemetry</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {multi.datasetCatalog.map((ds) => (
                      <tr key={ds.id} className="bg-white">
                        <td className="px-3 py-1.5 font-semibold text-slate-900">
                          {ds.name}
                        </td>
                        <td className="px-3 py-1.5 font-mono text-[11px] text-slate-500">
                          {ds.agency} · {ds.resolution}
                        </td>
                        <td className="px-3 py-1.5 font-mono tabular-nums text-[11px] text-slate-800">
                          {ds.keyMetricInApp}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2.5 text-[11px] text-slate-500">
            <span>
              Covers all 22 official NASA Space Apps &quot;Field Shift&quot; Earth observation, soil, hydrology &amp; market datasets
            </span>
            <span className="font-mono tabular-nums">
              {parcel.lat.toFixed(4)}°N, {parcel.lng.toFixed(4)}°E
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
