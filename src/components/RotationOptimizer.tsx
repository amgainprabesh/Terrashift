import { useMemo, useState } from 'react';
import * as d3 from 'd3';
import {
  BrainCircuit,
  Droplets,
  Flame,
  Leaf,
  Loader2,
  ShieldCheck,
  Sparkles,
  Sprout,
  TrendingUp,
} from 'lucide-react';
import {
  deriveMultiYearClimateTrends,
  type AgronomicRadarMetrics,
  type FarmerPriorities,
  type FarmParcelProfile,
  type IrrigationAccess,
  type NasaPowerSummary,
  type RotationSimulationResult,
} from '../lib/agronomy';

interface RotationOptimizerProps {
  parcel: FarmParcelProfile;
  nasa: NasaPowerSummary;
  priorities: FarmerPriorities;
  onChangePriorities: (next: FarmerPriorities) => void;
  simulation: RotationSimulationResult;
  aiBriefMarkdown: string | null;
  aiBriefMeta: { model: string; latencyMs: number } | null;
  aiBusy: boolean;
  aiError: string | null;
  onGenerateDeepStrategy: () => void;
  onInspectYearIn3D: (yearIndex: number) => void;
}

const RADAR_AXES: Array<{ key: keyof AgronomicRadarMetrics; label: string }> = [
  { key: 'waterEfficiency', label: 'Water Eff.' },
  { key: 'soilOrganicCarbon', label: 'Soil Carbon' },
  { key: 'nitrogenSelfSufficiency', label: 'N Autonomy' },
  { key: 'heatDroughtResilience', label: 'Heat/Drought' },
  { key: 'pestDiseaseBreak', label: 'Pest Break' },
  { key: 'yieldStability', label: 'Yield Stab.' },
];

function AgronomicRadarSvg({
  baseline,
  adapted,
}: {
  baseline: AgronomicRadarMetrics;
  adapted: AgronomicRadarMetrics;
}) {
  const cx = 185;
  const cy = 160;
  const maxR = 88;
  const rings = [25, 50, 75, 100];

  const pointAt = (index: number, value: number) => {
    const angle = (Math.PI * 2 * index) / RADAR_AXES.length - Math.PI / 2;
    const r = (Math.max(8, Math.min(100, value)) / 100) * maxR;
    return {
      x: cx + Math.cos(angle) * r,
      y: cy + Math.sin(angle) * r,
    };
  };

  const polygonPoints = (metrics: AgronomicRadarMetrics) =>
    RADAR_AXES.map((axis, idx) => {
      const p = pointAt(idx, metrics[axis.key]);
      return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
    }).join(' ');

  return (
    <svg
      viewBox="0 0 370 320"
      className="h-auto w-full max-w-[355px]"
      role="img"
      aria-label="Six-axis agronomic performance comparison radar chart"
    >
      {rings.map((ring) => {
        const pts = RADAR_AXES.map((_, idx) => {
          const p = pointAt(idx, ring);
          return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
        }).join(' ');
        return (
          <polygon
            key={ring}
            points={pts}
            fill="none"
            stroke="#e2e8f0"
            strokeWidth={1}
          />
        );
      })}

      {RADAR_AXES.map((axis, idx) => {
        const edge = pointAt(idx, 100);
        const labelPos = pointAt(idx, 128);
        const anchor =
          idx === 0 || idx === 3
            ? 'middle'
            : idx === 1 || idx === 2
              ? 'start'
              : 'end';
        const dyOffset = idx === 0 ? -4 : idx === 3 ? 8 : 0;
        return (
          <g key={axis.key}>
            <line
              x1={cx}
              y1={cy}
              x2={edge.x}
              y2={edge.y}
              stroke="#cbd5e1"
              strokeWidth={1}
            />
            <text
              x={labelPos.x}
              y={labelPos.y + dyOffset}
              textAnchor={anchor}
              dominantBaseline="middle"
              className="fill-slate-600 text-[10.5px] font-medium"
            >
              {axis.label}
            </text>
          </g>
        );
      })}

      {/* Baseline Monoculture */}
      <polygon
        points={polygonPoints(baseline)}
        fill="rgba(217, 119, 6, 0.14)"
        stroke="#d97706"
        strokeWidth={1.75}
        strokeDasharray="4 3"
      />

      {/* Adapted NASA Rotation */}
      <polygon
        points={polygonPoints(adapted)}
        fill="rgba(5, 150, 105, 0.22)"
        stroke="#059669"
        strokeWidth={2.25}
      />

      {RADAR_AXES.map((axis, idx) => {
        const p = pointAt(idx, adapted[axis.key]);
        return (
          <circle
            key={axis.key}
            cx={p.x}
            cy={p.y}
            r={3.5}
            fill="#059669"
            stroke="#ffffff"
            strokeWidth={1.5}
          />
        );
      })}
    </svg>
  );
}

function MonthlyMoistureSvg({
  data,
}: {
  data: RotationSimulationResult['monthlyMoistureProjection'];
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const w = 560;
  const h = 190;
  const padL = 38;
  const padR = 16;
  const padT = 18;
  const padB = 28;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;

  const xFor = (i: number) =>
    padL + (i / Math.max(1, data.length - 1)) * plotW;
  const yFor = (pct: number) =>
    padT + plotH - (Math.max(10, Math.min(100, pct)) - 10) * (plotH / 90);

  const baselinePath = data
    .map((d, i) => `${i === 0 ? 'M' : 'L'}${xFor(i).toFixed(1)},${yFor(d.baselineMoisturePct).toFixed(1)}`)
    .join(' ');
  const adaptedPath = data
    .map((d, i) => `${i === 0 ? 'M' : 'L'}${xFor(i).toFixed(1)},${yFor(d.adaptedMoisturePct).toFixed(1)}`)
    .join(' ');

  const activePoint = hoverIdx !== null ? data[hoverIdx] : null;

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-4">
          <span className="inline-flex items-center gap-1.5 font-medium text-emerald-800">
            <span className="inline-block h-2 w-4 rounded-xs bg-emerald-600" />
            Adapted Rotation Moisture (%)
          </span>
          <span className="inline-flex items-center gap-1.5 font-medium text-amber-800">
            <span className="inline-block h-0.5 w-4 border-t-2 border-dashed border-amber-600" />
            Monoculture Baseline (%)
          </span>
        </div>
        {activePoint && (
          <span className="font-mono tabular-nums text-slate-700">
            {activePoint.monthLabel}: Adapted {activePoint.adaptedMoisturePct}% vs Baseline{' '}
            {activePoint.baselineMoisturePct}%
          </span>
        )}
      </div>

      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="h-auto w-full"
        onMouseLeave={() => setHoverIdx(null)}
      >
        {[20, 40, 60, 80].map((tick) => {
          const y = yFor(tick);
          return (
            <g key={tick}>
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
                {tick}%
              </text>
            </g>
          );
        })}

        <path
          d={baselinePath}
          fill="none"
          stroke="#d97706"
          strokeWidth={2}
          strokeDasharray="5 4"
        />
        <path d={adaptedPath} fill="none" stroke="#059669" strokeWidth={2.5} />

        {data.map((d, i) => {
          const x = xFor(i);
          return (
            <g key={d.monthLabel}>
              <text
                x={x}
                y={h - 8}
                textAnchor="middle"
                className="fill-slate-500 text-[10px]"
              >
                {d.monthLabel}
              </text>
              <circle
                cx={x}
                cy={yFor(d.adaptedMoisturePct)}
                r={hoverIdx === i ? 4.5 : 2.8}
                fill="#059669"
              />
              <rect
                x={x - plotW / 24}
                y={padT}
                width={plotW / 12}
                height={plotH}
                fill="transparent"
                onMouseEnter={() => setHoverIdx(i)}
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function D3MultiYearClimateChart({
  nasa,
  parcel,
  simulation,
}: {
  nasa: NasaPowerSummary;
  parcel: FarmParcelProfile;
  simulation: RotationSimulationResult;
}) {
  const [granularity, setGranularity] = useState<'monthly' | 'annual'>('monthly');
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const trends = useMemo(() => deriveMultiYearClimateTrends(nasa), [nasa]);
  const isMonthly = granularity === 'monthly';
  const activeCount = isMonthly
    ? trends.monthlyPoints.length
    : trends.annualPoints.length;

  const w = 920;
  const h = 265;
  const padL = 48;
  const padR = 54;
  const padT = 22;
  const padB = 34;

  const heatThresholdC = simulation.baselineMonoculture.crop.heatStressThresholdC;

  const d3Geometry = useMemo(() => {
    const xScale = d3
      .scaleLinear()
      .domain([0, Math.max(1, activeCount - 1)])
      .range([padL, w - padR]);

    if (isMonthly) {
      const pts = trends.monthlyPoints;
      const tempExtent = d3.extent(pts, (d) => d.tempC) as [number, number];
      const yTempMin = Math.min(-4, Math.floor((tempExtent[0] ?? 0) - 4));
      const yTempMax = Math.max(
        heatThresholdC + 4,
        Math.ceil((tempExtent[1] ?? 35) + 4)
      );

      const maxPrecip = Math.max(
        100,
        d3.max(pts, (d) => Math.max(d.precipMmMonth, d.precipTrendMm)) ?? 120
      );

      const yTemp = d3
        .scaleLinear()
        .domain([yTempMin, yTempMax])
        .range([h - padB, padT]);

      const yPrecip = d3
        .scaleLinear()
        .domain([0, Math.ceil(maxPrecip * 1.12)])
        .range([h - padB, padT]);

      const tempLine = d3
        .line<(typeof pts)[number]>()
        .x((d) => xScale(d.index))
        .y((d) => yTemp(d.tempC))
        .curve(d3.curveMonotoneX)(pts) ?? '';

      const tempTrendLine = d3
        .line<(typeof pts)[number]>()
        .x((d) => xScale(d.index))
        .y((d) => yTemp(d.tempTrendC))
        .curve(d3.curveLinear)(pts) ?? '';

      const precipArea = d3
        .area<(typeof pts)[number]>()
        .x((d) => xScale(d.index))
        .y0(h - padB)
        .y1((d) => yPrecip(d.precipMmMonth))
        .curve(d3.curveMonotoneX)(pts) ?? '';

      const precipLine = d3
        .line<(typeof pts)[number]>()
        .x((d) => xScale(d.index))
        .y((d) => yPrecip(d.precipMmMonth))
        .curve(d3.curveMonotoneX)(pts) ?? '';

      const precipTrendLine = d3
        .line<(typeof pts)[number]>()
        .x((d) => xScale(d.index))
        .y((d) => yPrecip(d.precipTrendMm))
        .curve(d3.curveLinear)(pts) ?? '';

      const tempTicks = yTemp.ticks(5);
      const precipTicks = yPrecip.ticks(5);
      const xTickIndices = d3
        .range(0, pts.length, Math.max(1, Math.floor(pts.length / 10)))
        .map((i) => ({ index: i, x: xScale(i), label: pts[i]?.label ?? '' }));

      return {
        xScale,
        yTemp,
        yPrecip,
        tempLine,
        tempTrendLine,
        precipArea,
        precipLine,
        precipTrendLine,
        tempTicks,
        precipTicks,
        xTickIndices,
        precipUnit: 'mm/mo',
      };
    } else {
      const pts = trends.annualPoints;
      const tempMin = Math.min(
        0,
        Math.floor((d3.min(pts, (d) => d.meanTempC) ?? 8) - 4)
      );
      const tempMax = Math.max(
        heatThresholdC + 4,
        Math.ceil((d3.max(pts, (d) => d.peakTempC) ?? 32) + 4)
      );
      const maxPrecip = Math.max(
        400,
        d3.max(pts, (d) => Math.max(d.totalPrecipMm, d.precipTrendMm)) ?? 900
      );

      const yTemp = d3
        .scaleLinear()
        .domain([tempMin, tempMax])
        .range([h - padB, padT]);

      const yPrecip = d3
        .scaleLinear()
        .domain([0, Math.ceil(maxPrecip * 1.15)])
        .range([h - padB, padT]);

      const tempLine = d3
        .line<(typeof pts)[number]>()
        .x((d) => xScale(d.index))
        .y((d) => yTemp(d.meanTempC))
        .curve(d3.curveMonotoneX)(pts) ?? '';

      const tempTrendLine = d3
        .line<(typeof pts)[number]>()
        .x((d) => xScale(d.index))
        .y((d) => yTemp(d.tempTrendC))
        .curve(d3.curveLinear)(pts) ?? '';

      const precipArea = d3
        .area<(typeof pts)[number]>()
        .x((d) => xScale(d.index))
        .y0(h - padB)
        .y1((d) => yPrecip(d.totalPrecipMm))
        .curve(d3.curveMonotoneX)(pts) ?? '';

      const precipLine = d3
        .line<(typeof pts)[number]>()
        .x((d) => xScale(d.index))
        .y((d) => yPrecip(d.totalPrecipMm))
        .curve(d3.curveMonotoneX)(pts) ?? '';

      const precipTrendLine = d3
        .line<(typeof pts)[number]>()
        .x((d) => xScale(d.index))
        .y((d) => yPrecip(d.precipTrendMm))
        .curve(d3.curveLinear)(pts) ?? '';

      const tempTicks = yTemp.ticks(5);
      const precipTicks = yPrecip.ticks(5);
      const xTickIndices = pts.map((p) => ({
        index: p.index,
        x: xScale(p.index),
        label: p.year,
      }));

      return {
        xScale,
        yTemp,
        yPrecip,
        tempLine,
        tempTrendLine,
        precipArea,
        precipLine,
        precipTrendLine,
        tempTicks,
        precipTicks,
        xTickIndices,
        precipUnit: 'mm/yr',
      };
    }
  }, [activeCount, heatThresholdC, isMonthly, trends]);

  const handleSvgMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    const svgX = ((e.clientX - rect.left) / rect.width) * w;
    const rawIdx = Math.round(d3Geometry.xScale.invert(svgX));
    const clampedIdx = Math.max(0, Math.min(activeCount - 1, rawIdx));
    setHoverIdx(clampedIdx);
  };

  const activeMonthly =
    isMonthly && hoverIdx !== null ? trends.monthlyPoints[hoverIdx] : null;
  const activeAnnual =
    !isMonthly && hoverIdx !== null ? trends.annualPoints[hoverIdx] : null;

  return (
    <section
      data-testid="d3-climate-trends-section"
      className="min-w-0 rounded-xl border border-slate-200 bg-white p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500">
            D3 Multi-Year Climate Shift Analyzer · NASA POWER ({nasa.periodLabel})
          </p>
          <h2 className="mt-0.5 font-display text-base font-semibold text-slate-950">
            Multi-Year Temperature &amp; Precipitation Trends ({parcel.name})
          </h2>
          <p className="mt-0.5 text-xs text-slate-600">
            {trends.adaptationAdvisory}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* KPI Shift Readouts */}
          <div className="flex items-center gap-4 rounded-lg border border-slate-200 bg-slate-50/70 px-3.5 py-2">
            <div>
              <span className="block text-[10px] font-semibold uppercase tracking-[0.05em] text-slate-500">
                5-Yr Thermal Shift
              </span>
              <span className="font-mono tabular-nums text-sm font-bold text-amber-800">
                {trends.tempSlopePerFiveYrsC >= 0 ? '+' : ''}
                {trends.tempSlopePerFiveYrsC}°C
              </span>
              <span className="ml-1.5 font-mono tabular-nums text-[11px] text-slate-500">
                (Peak {trends.hottestMonthTempC}°C)
              </span>
            </div>
            <div className="h-7 w-px bg-slate-200" aria-hidden="true" />
            <div>
              <span className="block text-[10px] font-semibold uppercase tracking-[0.05em] text-slate-500">
                5-Yr Rainfall Shift
              </span>
              <span className="font-mono tabular-nums text-sm font-bold text-sky-800">
                {trends.precipSlopePerFiveYrsMm >= 0 ? '+' : ''}
                {trends.precipSlopePerFiveYrsMm} mm/yr
              </span>
              <span className="ml-1.5 font-mono tabular-nums text-[11px] text-slate-500">
                (Min {trends.driestYearLabel}: {trends.driestYearPrecipMm} mm)
              </span>
            </div>
          </div>

          {/* Mode Toggle */}
          <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-100 p-1">
            <button
              type="button"
              data-climate-mode="monthly"
              onClick={() => {
                setGranularity('monthly');
                setHoverIdx(null);
              }}
              className={`rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                isMonthly
                  ? 'bg-white text-slate-950 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              60-Month Series
            </button>
            <button
              type="button"
              data-climate-mode="annual"
              onClick={() => {
                setGranularity('annual');
                setHoverIdx(null);
              }}
              className={`rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                !isMonthly
                  ? 'bg-white text-slate-950 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Annual Rollup
            </button>
          </div>
        </div>
      </div>

      {/* Legend & Live Crosshair Readout Bar */}
      <div className="mt-3 mb-2 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex flex-wrap items-center gap-4">
          <span className="inline-flex items-center gap-1.5 font-medium text-amber-800">
            <span className="inline-block h-0.5 w-4 bg-amber-600" />
            2m Temperature (°C)
          </span>
          <span className="inline-flex items-center gap-1.5 font-medium text-amber-900">
            <span className="inline-block h-0.5 w-4 border-t-2 border-dashed border-amber-700" />
            OLS Thermal Trendline
          </span>
          <span className="inline-flex items-center gap-1.5 font-medium text-sky-800">
            <span className="inline-block h-0.5 w-4 bg-sky-600" />
            Precipitation ({d3Geometry.precipUnit})
          </span>
          <span className="inline-flex items-center gap-1.5 font-medium text-sky-900">
            <span className="inline-block h-0.5 w-4 border-t-2 border-dashed border-sky-700" />
            OLS Rainfall Trendline
          </span>
          <span className="inline-flex items-center gap-1.5 font-medium text-rose-700">
            <Flame className="h-3.5 w-3.5" />
            <span>
              {simulation.baselineMonoculture.crop.name} Heat Threshold ({heatThresholdC}°C)
            </span>
          </span>
        </div>

        <span
          data-testid="d3-climate-readout"
          className="font-mono tabular-nums text-xs text-slate-700"
        >
          {activeMonthly
            ? `${activeMonthly.monthKey}: Temp ${activeMonthly.tempC}°C (Trend ${activeMonthly.tempTrendC}°C) · Precip ${activeMonthly.precipMmMonth} mm/mo (Trend ${activeMonthly.precipTrendMm} mm)`
            : activeAnnual
              ? `Year ${activeAnnual.year}: Mean ${activeAnnual.meanTempC}°C (Peak ${activeAnnual.peakTempC}°C) · Total ${activeAnnual.totalPrecipMm} mm/yr (Trend ${activeAnnual.precipTrendMm} mm)`
              : 'Hover chart to inspect monthly or annual OLS trend coordinates'}
        </span>
      </div>

      {/* D3 Dual-Axis Line Chart SVG */}
      <svg
        data-testid="d3-climate-svg"
        viewBox={`0 0 ${w} ${h}`}
        className="h-auto w-full select-none cursor-crosshair"
        onMouseMove={handleSvgMouseMove}
        onMouseLeave={() => setHoverIdx(null)}
        role="img"
        aria-label="D3 multi-year NASA POWER temperature and precipitation trend line chart"
      >
        {/* Horizontal Gridlines & Left/Right Axis Ticks */}
        {d3Geometry.tempTicks.map((tVal, i) => {
          const y = d3Geometry.yTemp(tVal);
          const pVal = d3Geometry.precipTicks[i];
          return (
            <g key={`grid-${tVal}`}>
              <line
                x1={padL}
                y1={y}
                x2={w - padR}
                y2={y}
                stroke="#f1f5f9"
                strokeWidth={1}
              />
              <text
                x={padL - 8}
                y={y + 3.5}
                textAnchor="end"
                className="fill-amber-800 font-mono text-[10px]"
              >
                {tVal}°C
              </text>
              {typeof pVal === 'number' && (
                <text
                  x={w - padR + 8}
                  y={d3Geometry.yPrecip(pVal) + 3.5}
                  textAnchor="start"
                  className="fill-sky-800 font-mono text-[10px]"
                >
                  {pVal} mm
                </text>
              )}
            </g>
          );
        })}

        {/* Baseline Crop Heat Stress Threshold Reference Line */}
        <line
          x1={padL}
          y1={d3Geometry.yTemp(heatThresholdC)}
          x2={w - padR}
          y2={d3Geometry.yTemp(heatThresholdC)}
          stroke="#e11d48"
          strokeWidth={1.25}
          strokeDasharray="3 3"
          opacity={0.7}
        />

        {/* D3 Precipitation Area & Line */}
        <path
          data-series="precip-area"
          d={d3Geometry.precipArea}
          fill="rgba(2, 132, 199, 0.10)"
        />
        <path
          data-series="precip-line"
          d={d3Geometry.precipLine}
          fill="none"
          stroke="#0284c7"
          strokeWidth={2}
        />
        <path
          data-series="precip-trend"
          d={d3Geometry.precipTrendLine}
          fill="none"
          stroke="#0369a1"
          strokeWidth={1.75}
          strokeDasharray="5 4"
        />

        {/* D3 Temperature Line & OLS Warming Trendline */}
        <path
          data-series="temp-line"
          d={d3Geometry.tempLine}
          fill="none"
          stroke="#d97706"
          strokeWidth={2.5}
        />
        <path
          data-series="temp-trend"
          d={d3Geometry.tempTrendLine}
          fill="none"
          stroke="#b45309"
          strokeWidth={1.85}
          strokeDasharray="6 4"
        />

        {/* X-Axis Labels */}
        {d3Geometry.xTickIndices.map((tk) => (
          <text
            key={`xtick-${tk.index}`}
            x={tk.x}
            y={h - 10}
            textAnchor="middle"
            className="fill-slate-500 font-mono text-[10px]"
          >
            {tk.label}
          </text>
        ))}

        {/* Annual Vertex Dots when in Annual Mode */}
        {!isMonthly &&
          trends.annualPoints.map((pt) => (
            <g key={`ann-pt-${pt.year}`}>
              <circle
                cx={d3Geometry.xScale(pt.index)}
                cy={d3Geometry.yTemp(pt.meanTempC)}
                r={4}
                fill="#d97706"
                stroke="#ffffff"
                strokeWidth={1.5}
              />
              <circle
                cx={d3Geometry.xScale(pt.index)}
                cy={d3Geometry.yPrecip(pt.totalPrecipMm)}
                r={4}
                fill="#0284c7"
                stroke="#ffffff"
                strokeWidth={1.5}
              />
            </g>
          ))}

        {/* Interactive Hover Crosshair */}
        {hoverIdx !== null && (
          <g>
            <line
              x1={d3Geometry.xScale(hoverIdx)}
              y1={padT}
              x2={d3Geometry.xScale(hoverIdx)}
              y2={h - padB}
              stroke="#475569"
              strokeWidth={1}
              strokeDasharray="3 3"
            />
            {activeMonthly && (
              <>
                <circle
                  cx={d3Geometry.xScale(hoverIdx)}
                  cy={d3Geometry.yTemp(activeMonthly.tempC)}
                  r={4.5}
                  fill="#d97706"
                  stroke="#ffffff"
                  strokeWidth={1.5}
                />
                <circle
                  cx={d3Geometry.xScale(hoverIdx)}
                  cy={d3Geometry.yPrecip(activeMonthly.precipMmMonth)}
                  r={4.5}
                  fill="#0284c7"
                  stroke="#ffffff"
                  strokeWidth={1.5}
                />
              </>
            )}
            {activeAnnual && (
              <>
                <circle
                  cx={d3Geometry.xScale(hoverIdx)}
                  cy={d3Geometry.yTemp(activeAnnual.meanTempC)}
                  r={5.5}
                  fill="#d97706"
                  stroke="#ffffff"
                  strokeWidth={1.75}
                />
                <circle
                  cx={d3Geometry.xScale(hoverIdx)}
                  cy={d3Geometry.yPrecip(activeAnnual.totalPrecipMm)}
                  r={5.5}
                  fill="#0284c7"
                  stroke="#ffffff"
                  strokeWidth={1.75}
                />
              </>
            )}
          </g>
        )}
      </svg>
    </section>
  );
}

export function RotationOptimizer({
  parcel,
  nasa,
  priorities,
  onChangePriorities,
  simulation,
  aiBriefMarkdown,
  aiBriefMeta,
  aiBusy,
  aiError,
  onGenerateDeepStrategy,
  onInspectYearIn3D,
}: RotationOptimizerProps) {
  const renderMarkdownLines = (md: string) =>
    md
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line, i) => {
        if (line.startsWith('###') || line.startsWith('##') || /^\d+\.\s\*\*/.test(line)) {
          return (
            <h4 key={i} className="mt-4 font-display text-sm font-bold text-slate-950 first:mt-0">
              {line.replace(/^[#*]+\s*/, '').replace(/\*\*/g, '')}
            </h4>
          );
        }
        if (line.startsWith('- ') || line.startsWith('* ')) {
          return (
            <li key={i} className="ml-4 list-disc text-sm leading-relaxed text-slate-700">
              {line.slice(2).replace(/\*\*/g, '')}
            </li>
          );
        }
        return (
          <p key={i} className="text-sm leading-relaxed text-slate-700">
            {line.replace(/\*\*/g, '')}
          </p>
        );
      });

  return (
    <div className="mx-auto max-w-[1440px] space-y-6 px-4 py-6 sm:px-6">
      {/* Top Priority & Comparison Shell */}
      <div className="grid gap-5 lg:grid-cols-12">
        {/* Controls Panel */}
        <section className="rounded-xl border border-slate-200 bg-white p-5 lg:col-span-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500">
            Agronomic Calibration
          </p>
          <h1 className="mt-1 font-display text-lg font-bold text-slate-950">
            {parcel.name}
          </h1>
          <p className="mt-0.5 text-xs text-slate-500">
            Calibrated to NASA POWER {nasa.annualPrecipMm} mm/yr precip &{' '}
            {Math.round(nasa.meanRootMoisture * 100)}% GWETROOT
          </p>

          <div className="mt-5 space-y-4">
            <div>
              <div className="flex justify-between text-xs font-medium text-slate-700">
                <span>Water Conservation Priority</span>
                <span className="font-mono tabular-nums text-sky-700">
                  {priorities.waterEfficiency}/100
                </span>
              </div>
              <input
                type="range"
                min={10}
                max={100}
                value={priorities.waterEfficiency}
                onChange={(e) =>
                  onChangePriorities({
                    ...priorities,
                    waterEfficiency: Number(e.target.value),
                  })
                }
                className="mt-1.5 w-full accent-sky-700"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs font-medium text-slate-700">
                <span>Soil Carbon & Nitrogen Autonomy</span>
                <span className="font-mono tabular-nums text-emerald-700">
                  {priorities.soilHealth}/100
                </span>
              </div>
              <input
                type="range"
                min={10}
                max={100}
                value={priorities.soilHealth}
                onChange={(e) =>
                  onChangePriorities({
                    ...priorities,
                    soilHealth: Number(e.target.value),
                  })
                }
                className="mt-1.5 w-full accent-emerald-700"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs font-medium text-slate-700">
                <span>Cash-Crop Yield Stability</span>
                <span className="font-mono tabular-nums text-amber-700">
                  {priorities.yieldStability}/100
                </span>
              </div>
              <input
                type="range"
                min={10}
                max={100}
                value={priorities.yieldStability}
                onChange={(e) =>
                  onChangePriorities({
                    ...priorities,
                    yieldStability: Number(e.target.value),
                  })
                }
                className="mt-1.5 w-full accent-amber-600"
              />
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Horizon
                </label>
                <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                  {([3, 4] as const).map((yr) => (
                    <button
                      key={yr}
                      type="button"
                      onClick={() =>
                        onChangePriorities({ ...priorities, horizonYears: yr })
                      }
                      className={`rounded-lg border py-1.5 text-xs font-semibold ${
                        priorities.horizonYears === yr
                          ? 'border-sky-700 bg-sky-700 text-white'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {yr}-Year
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Irrigation
                </label>
                <select
                  value={priorities.irrigationAccess}
                  onChange={(e) =>
                    onChangePriorities({
                      ...priorities,
                      irrigationAccess: e.target.value as IrrigationAccess,
                    })
                  }
                  className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 focus:border-sky-600 focus:outline-none"
                >
                  <option value="rainfed">Rainfed</option>
                  <option value="deficit_drip">Deficit Drip</option>
                  <option value="full_pivot">Full Pivot</option>
                </select>
              </div>
            </div>

            <label className="flex cursor-pointer items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
              <div>
                <span className="block text-xs font-semibold text-slate-900">
                  Winter Cover-Crop Soil Armor
                </span>
                <span className="text-[11px] text-slate-500">
                  Cereal rye / crimson clover between cash seasons
                </span>
              </div>
              <input
                type="checkbox"
                checked={priorities.includeCoverCrops}
                onChange={(e) =>
                  onChangePriorities({
                    ...priorities,
                    includeCoverCrops: e.target.checked,
                  })
                }
                className="h-4 w-4 accent-emerald-700"
              />
            </label>
          </div>
        </section>

        {/* Monoculture vs Adapted Summary + Radar */}
        <section className="grid gap-5 rounded-xl border border-slate-200 bg-white p-5 md:grid-cols-12 lg:col-span-8">
          <div className="flex flex-col justify-between md:col-span-6">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500">
                Monoculture vs. Adapted Outcome
              </p>
              <h2 className="mt-1 font-display text-lg font-bold text-slate-950">
                {simulation.planName}
              </h2>
              <p className="mt-1 text-xs text-slate-600">
                Compared against continuous{' '}
                <span className="font-semibold text-slate-900">
                  {simulation.baselineMonoculture.crop.name}
                </span>{' '}
                under identical climate stress.
              </p>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  <Droplets className="h-3.5 w-3.5 text-sky-700" />
                  <span>Water Savings</span>
                </div>
                <p className="mt-1 font-mono tabular-nums text-2xl font-bold text-sky-800">
                  {simulation.adaptedTotals.waterSavingsPct >= 0 ? '+' : ''}
                  {simulation.adaptedTotals.waterSavingsPct}%
                </p>
                <p className="text-[11px] text-slate-500">
                  {simulation.adaptedTotals.avgAnnualWaterMm} vs{' '}
                  {simulation.baselineMonoculture.annualWaterMm} mm/yr
                </p>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  <Leaf className="h-3.5 w-3.5 text-emerald-700" />
                  <span>Soil Carbon Gain</span>
                </div>
                <p className="mt-1 font-mono tabular-nums text-2xl font-bold text-emerald-800">
                  +{simulation.adaptedTotals.cumulativeCarbonDeltaTonHa} t/ha
                </p>
                <p className="text-[11px] text-slate-500">
                  Final SOC: {simulation.adaptedTotals.finalSoilOrganicCarbonPct}%
                </p>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  <Sprout className="h-3.5 w-3.5 text-emerald-700" />
                  <span>Net N Balance</span>
                </div>
                <p className="mt-1 font-mono tabular-nums text-2xl font-bold text-slate-900">
                  {simulation.adaptedTotals.cumulativeNitrogenKgHa >= 0 ? '+' : ''}
                  {simulation.adaptedTotals.cumulativeNitrogenKgHa} kg/ha
                </p>
                <p className="text-[11px] text-slate-500">
                  Baseline: {simulation.baselineMonoculture.cumulativeNitrogenKgHa} kg/ha
                </p>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  <ShieldCheck className="h-3.5 w-3.5 text-amber-700" />
                  <span>Resilience Index</span>
                </div>
                <p className="mt-1 font-mono tabular-nums text-2xl font-bold text-slate-900">
                  {simulation.adaptedTotals.resilienceScore}/100
                </p>
                <p className="text-[11px] text-slate-500">
                  Monoculture: {simulation.baselineMonoculture.resilienceScore}/100
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-col items-center justify-center md:col-span-6">
            <AgronomicRadarSvg
              baseline={simulation.baselineMonoculture.radar}
              adapted={simulation.adaptedTotals.radar}
            />
            <div className="mt-1 flex items-center gap-4 text-[11px] font-medium text-slate-600">
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-xs bg-emerald-600" />
                NASA-Adapted Rotation
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-xs border border-amber-600 bg-amber-100" />
                Baseline Monoculture
              </span>
            </div>
          </div>
        </section>
      </div>

      {/* Year-by-Year Sequence Cards */}
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-950">
              {priorities.horizonYears}-Year Botanical Rotation Schedule
            </h2>
            <p className="text-xs text-slate-500">
              Enforces botanical family alternation to break soil pathogens and balance root-zone extraction depths
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {simulation.steps.map((step, idx) => (
            <div
              key={step.year}
              className="flex flex-col justify-between rounded-xl border border-slate-200 bg-slate-50/60 p-4"
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold uppercase tracking-wider text-sky-700">
                    Year {step.year}
                  </span>
                  <span className="font-mono tabular-nums text-xs font-semibold text-slate-700">
                    {step.yieldResilienceScore}/100 Res.
                  </span>
                </div>

                <h3 className="mt-1.5 font-display text-base font-bold text-slate-950">
                  {step.primaryCrop.name}
                </h3>
                <p className="text-xs font-medium text-slate-500">
                  {step.primaryCrop.family} · {step.primaryCrop.seasonWindow} · Root{' '}
                  <span className="font-mono">{step.primaryCrop.rootDepthM}m</span>
                </p>

                {step.coverCrop && (
                  <p className="mt-2 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-900">
                    Cover: {step.coverCrop.name}
                  </p>
                )}

                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5">
                    <span className="block text-[10px] text-slate-500">Water / Deficit</span>
                    <span className="font-mono tabular-nums font-semibold text-slate-900">
                      {step.waterUsedMm} / {step.waterDeficitMm} mm
                    </span>
                  </div>
                  <div className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5">
                    <span className="block text-[10px] text-slate-500">N / SOC Delta</span>
                    <span className="font-mono tabular-nums font-semibold text-emerald-800">
                      {step.nitrogenBalanceKgHa >= 0 ? '+' : ''}
                      {step.nitrogenBalanceKgHa} kg · +{step.carbonDeltaTonHa}t
                    </span>
                  </div>
                </div>

                <p className="mt-3 text-xs leading-relaxed text-slate-600">
                  {step.rationale}
                </p>
              </div>

              <button
                type="button"
                onClick={() => onInspectYearIn3D(idx)}
                className="mt-4 w-full rounded-lg border border-slate-300 bg-white py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-100"
              >
                Inspect Year {step.year} in 3D Twin
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* D3 Multi-Year NASA POWER Temperature & Precipitation Trend Analyzer */}
      <D3MultiYearClimateChart
        nasa={nasa}
        parcel={parcel}
        simulation={simulation}
      />

      {/* Bottom Row: Root-Zone Moisture Trajectory + Deep Gemini Thinking Strategy */}
      <div className="grid gap-5 lg:grid-cols-12">
        <section className="rounded-xl border border-slate-200 bg-white p-5 lg:col-span-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500">
            Root-Zone Moisture Conservation
          </p>
          <h2 className="mt-1 font-display text-base font-semibold text-slate-950">
            12-Month GWETROOT Soil Moisture Trajectory
          </h2>
          <p className="mb-4 text-xs text-slate-500">
            Projected root-zone wetness retention from residue armor and lower evapotranspiration demand
          </p>
          <MonthlyMoistureSvg data={simulation.monthlyMoistureProjection} />
        </section>

        <section className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 lg:col-span-6">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500">
                  Gemini Deep Agronomic Strategist
                </p>
                <h2 className="mt-0.5 font-display text-base font-semibold text-slate-950">
                  Execution Calendar & Drought Triggers
                </h2>
              </div>

              <button
                type="button"
                onClick={onGenerateDeepStrategy}
                disabled={aiBusy}
                className="inline-flex items-center gap-1.5 rounded-lg bg-sky-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-sky-800 disabled:opacity-60"
              >
                {aiBusy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <BrainCircuit className="h-3.5 w-3.5" />
                )}
                <span>
                  {aiBusy
                    ? 'Synthesizing Strategy...'
                    : aiBriefMarkdown
                      ? 'Regenerate Brief'
                      : 'Generate Deep Strategy'}
                </span>
              </button>
            </div>

            {aiError && (
              <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
                {aiError}
              </div>
            )}

            {aiBriefMarkdown ? (
              <div className="mt-4 max-h-[300px] space-y-2 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50/70 p-4">
                {renderMarkdownLines(aiBriefMarkdown)}
              </div>
            ) : (
              <div className="mt-4 rounded-lg border border-dashed border-slate-300 bg-slate-50/50 p-6 text-center">
                <Sparkles className="mx-auto h-6 w-6 text-sky-600" />
                <p className="mt-2 text-sm font-medium text-slate-800">
                  Ready to synthesize satellite-grounded execution plan
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Analyzes {nasa.periodLabel} NASA telemetry, {simulation.planName}, planting windows, and soil wetness triggers.
                </p>
              </div>
            )}
          </div>

          {aiBriefMeta && (
            <p className="mt-3 text-right font-mono text-[11px] text-slate-400">
              {aiBriefMeta.model} · {(aiBriefMeta.latencyMs / 1000).toFixed(1)}s
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
