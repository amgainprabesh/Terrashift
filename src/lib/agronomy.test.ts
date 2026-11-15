import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeNasaPowerPayload,
  buildDeterministicFallbackPower,
  CURATED_PARCELS,
  deriveFiveYearSoilNutrientTrends,
  deriveMultiYearClimateTrends,
  optimizeCropRotation,
  parseCoordinateQuery,
  searchAgriculturalDirectory,
} from './agronomy';

test('analyzeNasaPowerPayload parses monthly NASA POWER parameters into summary metrics', () => {
  const mockPowerPayload = {
    geometry: { coordinates: [-93.625, 41.586, 293] },
    properties: {
      parameter: {
        T2M: {
          '202301': -4.2,
          '202307': 24.5,
          '202313': 10.1,
          '202401': -3.0,
          '202407': 26.2,
          '202413': 11.4,
        },
        PRECTOTCORR: {
          '202301': 1.1,
          '202307': 3.5,
          '202401': 1.4,
          '202407': 2.8,
        },
        GWETROOT: {
          '202301': 0.56,
          '202307': 0.44,
          '202401': 0.55,
          '202407': 0.41,
        },
        GWETTOP: {
          '202301': 0.59,
          '202307': 0.4,
          '202401': 0.58,
          '202407': 0.38,
        },
        ALLSKY_SFC_SW_DWN: {
          '202301': 7.1,
          '202307': 22.4,
          '202401': 6.9,
          '202407': 23.1,
        },
        RH2M: {
          '202301': 72,
          '202307': 64,
          '202401': 74,
          '202407': 61,
        },
      },
    },
  };

  const summary = analyzeNasaPowerPayload(mockPowerPayload, 41.586, -93.625);
  assert.equal(summary.elevationM, 293);
  assert.equal(summary.monthlySeries.length, 4); // excludes '13' annual rollups
  assert.equal(summary.peakSummerTempC, 25.4);
  assert.ok(summary.climateRiskIndex >= 12 && summary.climateRiskIndex <= 96);
  assert.ok(summary.estimatedNdvi > 0.15 && summary.estimatedNdvi < 0.9);
});

test('optimizeCropRotation breaks monoculture families and improves resilience & soil carbon', () => {
  const iowaParcel = CURATED_PARCELS[0];
  const nasa = buildDeterministicFallbackPower(iowaParcel.lat, iowaParcel.lng);

  const result = optimizeCropRotation(iowaParcel, nasa, {
    waterEfficiency: 70,
    soilHealth: 90,
    yieldStability: 65,
    horizonYears: 4,
    irrigationAccess: 'rainfed',
    includeCoverCrops: true,
  });

  assert.equal(result.steps.length, 4);
  // Consecutive steps should diversify botanical families
  for (let i = 1; i < result.steps.length; i++) {
    assert.notEqual(
      result.steps[i].primaryCrop.family,
      result.steps[i - 1].primaryCrop.family
    );
  }
  assert.ok(
    result.adaptedTotals.resilienceScore >
      result.baselineMonoculture.resilienceScore
  );
  assert.ok(
    result.adaptedTotals.cumulativeCarbonDeltaTonHa >
      result.baselineMonoculture.cumulativeCarbonDeltaTonHa
  );
  assert.equal(result.monthlyMoistureProjection.length, 12);
});

test('water-first priority in arid California favors lower-water crops than baseline maize', () => {
  const caParcel = CURATED_PARCELS[1];
  const nasa = buildDeterministicFallbackPower(caParcel.lat, caParcel.lng);

  const waterFocused = optimizeCropRotation(caParcel, nasa, {
    waterEfficiency: 100,
    soilHealth: 40,
    yieldStability: 40,
    horizonYears: 3,
    irrigationAccess: 'rainfed',
    includeCoverCrops: true,
  });

  assert.ok(waterFocused.adaptedTotals.waterSavingsPct > 10);
  assert.ok(
    waterFocused.adaptedTotals.avgAnnualWaterMm <
      waterFocused.baselineMonoculture.annualWaterMm
  );
});

test('deriveFiveYearSoilNutrientTrends builds 60-month moisture & depletion series', () => {
  const iowaParcel = CURATED_PARCELS[0];
  const nasa = buildDeterministicFallbackPower(iowaParcel.lat, iowaParcel.lng);
  const trends = deriveFiveYearSoilNutrientTrends(nasa, iowaParcel);

  assert.equal(trends.points.length, nasa.monthlySeries.length);
  assert.equal(trends.points.length, 60);
  assert.equal(
    trends.points[0].rootMoisturePct,
    Number((nasa.monthlySeries[0].rootMoisture * 100).toFixed(1))
  );
  for (const pt of trends.points) {
    assert.ok(pt.rootMoisturePct >= 0 && pt.rootMoisturePct <= 100);
    assert.ok(pt.surfaceMoisturePct >= 0 && pt.surfaceMoisturePct <= 100);
    assert.ok(pt.nutrientDepletionPct >= 4 && pt.nutrientDepletionPct <= 96);
  }
  assert.ok(trends.depletionDeltaPct > 0);
});

test('deriveFiveYearSoilNutrientTrends shows lower nutrient depletion for N-fixing soybean than maize', () => {
  const baseParcel = CURATED_PARCELS[0];
  const nasa = buildDeterministicFallbackPower(baseParcel.lat, baseParcel.lng);

  const maizeTrend = deriveFiveYearSoilNutrientTrends(nasa, {
    ...baseParcel,
    currentCropId: 'maize',
    baselineOrganicCarbon: 1.2,
  });
  const soyTrend = deriveFiveYearSoilNutrientTrends(nasa, {
    ...baseParcel,
    currentCropId: 'soybean',
    baselineOrganicCarbon: 1.2,
  });

  assert.ok(maizeTrend.endDepletionPct > soyTrend.endDepletionPct);
  assert.ok(maizeTrend.depletionDeltaPct > soyTrend.depletionDeltaPct);
});

test('deriveMultiYearClimateTrends computes 60 monthly points, 5 annual rollups, and OLS trendlines', () => {
  const iowaParcel = CURATED_PARCELS[0];
  const nasa = buildDeterministicFallbackPower(iowaParcel.lat, iowaParcel.lng);
  const climate = deriveMultiYearClimateTrends(nasa);

  assert.equal(climate.monthlyPoints.length, 60);
  assert.equal(climate.annualPoints.length, 5);
  assert.ok(climate.tempSlopePerFiveYrsC > 0, 'Expected positive warming slope from fallback series');
  assert.equal(climate.driestYearLabel, '2023');
  assert.ok(climate.adaptationAdvisory.length > 20);
});

test('parseCoordinateQuery parses decimal and cardinal coordinate strings accurately', () => {
  const dec = parseCoordinateQuery('36.7378, -119.7871');
  assert.ok(dec);
  assert.equal(dec.lat, 36.7378);
  assert.equal(dec.lng, -119.7871);

  const cardinal = parseCoordinateQuery('30.9010° N, 75.8573° W');
  assert.ok(cardinal);
  assert.equal(cardinal.lat, 30.901);
  assert.equal(cardinal.lng, -75.8573);

  assert.equal(parseCoordinateQuery('San Joaquin Valley'), null);
  assert.equal(parseCoordinateQuery('99.5, -119.7'), null);
});

test('searchAgriculturalDirectory ranks matching farm regions, crops, and soil types', () => {
  const caResults = searchAgriculturalDirectory('San Joaquin');
  assert.ok(caResults.length > 0);
  assert.ok(caResults[0].name.includes('San Joaquin'));

  const aquiferResults = searchAgriculturalDirectory('Ogallala');
  assert.ok(aquiferResults.length > 0);
  assert.equal(aquiferResults[0].id, 'dir-ogallala-kansas');

  const chernozemResults = searchAgriculturalDirectory('Chernozem');
  assert.ok(chernozemResults.length > 0);
  assert.equal(chernozemResults[0].country, 'Ukraine');
});



