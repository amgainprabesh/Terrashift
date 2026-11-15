import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDeterministicFallbackPower,
  CURATED_PARCELS,
} from './agronomy';
import {
  buildNasaGibsWmsUrl,
  buildTerrainAndSoilProfile3D,
  computeSrtmTerrainMetrics,
  latLngToAlbers5070,
  NASA_GIBS_LAYERS,
  sampleBilinearTerrainHeight,
  synthesizeMultiSourceObservatory,
} from './nasaResources';

test('latLngToAlbers5070 projects Story County Iowa into expected CONUS Albers coordinates', () => {
  const { x, y } = latLngToAlbers5070(42.0308, -93.6319);
  // Central meridian is -96.0, so -93.6319 is ~195 km east (+x), and 42.0308 is north of 23.0 (+y ~2,115 km)
  assert.ok(x > 180000 && x < 210000, `Expected x near 195,000m, got ${x}`);
  assert.ok(y > 2050000 && y < 2200000, `Expected y near 2,119,000m, got ${y}`);
});

test('computeSrtmTerrainMetrics calculates slope %, aspect, and RUSLE LS erosion factor', () => {
  // Flat terrain
  const flat = computeSrtmTerrainMetrics([280, 280, 280, 280, 280], 42.0, 0.005);
  assert.equal(flat.slopePct, 0);
  assert.equal(flat.erosionRiskClass, 'Low');
  assert.equal(flat.aspectLabel, 'Flat Plain');

  // Steep south-sloping hillside (North=340m, South=260m over ~1113m distance -> ~7.2% slope)
  const sloped = computeSrtmTerrainMetrics([300, 340, 260, 300, 300], 42.0, 0.005);
  assert.ok(sloped.slopePct > 6.5 && sloped.slopePct < 8.0);
  assert.equal(sloped.aspectLabel, 'S-Facing');
  assert.ok(sloped.rusleLsFactor > flat.rusleLsFactor);
  assert.ok(
    sloped.erosionRiskClass === 'High' || sloped.erosionRiskClass === 'Severe'
  );
});

test('buildNasaGibsWmsUrl constructs valid EPSG:4326 WMS GetMap URL for all 7 NASA GIBS layers', () => {
  for (const layer of NASA_GIBS_LAYERS) {
    const url = buildNasaGibsWmsUrl(layer.id, 42.0308, -93.6319, 1.2);
    assert.ok(url.startsWith('https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?'));
    assert.ok(url.includes('BlueMarble_ShadedRelief_Bathymetry'));
    assert.ok(url.includes(layer.id));
    assert.ok(url.includes('FORMAT=image%2Fpng'));
  }
});

test('synthesizeMultiSourceObservatory fuses live ERA5/SMAP, SRTM, USDA CDL, and USGS NWIS inputs', () => {
  const iowa = CURATED_PARCELS[0];
  const nasa = buildDeterministicFallbackPower(iowa.lat, iowa.lng);

  const payload = synthesizeMultiSourceObservatory(iowa, nasa, {
    openMeteoCurrent: {
      temperature_2m: 22.4,
      soil_temperature_0cm: 20.1,
      soil_moisture_0_to_1cm: 0.24,
      soil_moisture_1_to_3cm: 0.26,
      soil_moisture_3_to_9cm: 0.29,
      soil_moisture_9_to_27cm: 0.31,
      soil_moisture_27_to_81cm: 0.33,
      vapour_pressure_deficit: 1.15,
    },
    openMeteoDaily: {
      et0_fao_evapotranspiration: [4.2, 4.6, 4.1, 3.9, 4.4],
    },
    srtmElevations: [277, 291, 274, 282, 275],
    cdlByYear: [
      { year: 2021, category: 'Corn', colorHex: '#ffd300' },
      { year: 2022, category: 'Soybeans', colorHex: '#267000' },
      { year: 2023, category: 'Corn', colorHex: '#ffd300' },
    ],
    usgsStation: {
      stationName: 'South Skunk River near Ames, IA',
      stationId: '05470000',
      streamflowCfs: 184,
      gageHeightFt: 3.42,
    },
  });

  assert.equal(payload.smap.source, 'ERA5_SMAP_ASSIMILATION_LIVE');
  assert.equal(payload.smap.layers.length, 5);
  assert.equal(payload.ecostressOpenEt.source, 'ERA5_FAO56_ET_LIVE');
  assert.equal(payload.srtm.source, 'SRTM_OPEN_METEO_LIVE');
  assert.equal(payload.cdlHistory.length, 3);
  assert.equal(payload.cdlHistory[1].cropCategory, 'Soybeans');
  assert.equal(payload.usgsWater.source, 'USGS_NWIS_LIVE');
  assert.equal(payload.usgsWater.stationId, '05470000');
  assert.ok(payload.datasetCatalog.length >= 14);
  assert.ok(payload.marketBenchmarks.length >= 7);
});

test('buildTerrainAndSoilProfile3D constructs 7x7 SRTM terrain relief, 5 soil layers, and water table depth', () => {
  const caParcel = CURATED_PARCELS[1];
  const nasa = buildDeterministicFallbackPower(caParcel.lat, caParcel.lng);

  // Create a 49-point grid sloping from 140m in the North down to 80m in the South
  const grid49: number[] = [];
  for (let r = 0; r < 7; r++) {
    for (let c = 0; c < 7; c++) {
      grid49.push(140 - r * 10 + c * 1.5);
    }
  }

  const dryProfile = buildTerrainAndSoilProfile3D(
    caParcel,
    nasa,
    { srtmGrid7x7: grid49 },
    {
      projectedRootMoisture: 0.25,
      cropRootDepthM: 0.65,
      cropName: 'Shallow Vegetable',
      irrigationOn: false,
    }
  );

  const wetProfile = buildTerrainAndSoilProfile3D(
    caParcel,
    nasa,
    { srtmGrid7x7: grid49 },
    {
      projectedRootMoisture: 0.68,
      cropRootDepthM: 1.6,
      cropName: 'Grain Sorghum',
      irrigationOn: true,
    }
  );

  assert.equal(dryProfile.terrainSource, 'SRTM_DEM_LIVE_7X7');
  assert.equal(dryProfile.elevationGrid7x7.length, 49);
  assert.equal(dryProfile.worldHeightGrid7x7.length, 49);
  assert.equal(dryProfile.horizons.length, 5);
  assert.ok(dryProfile.reliefSpanM >= 55);

  // Wet profile has higher water fill % and shallower water table depth than dry profile
  assert.ok(wetProfile.waterLevelFillPct > dryProfile.waterLevelFillPct);
  assert.ok(wetProfile.waterTableDepthCm < dryProfile.waterTableDepthCm);
  assert.equal(wetProfile.rootsReachWater, true);
  assert.equal(dryProfile.rootsReachWater, false);

  // Bilinear sampler interpolates smoothly between North (v=0, higher) and South (v=1, lower)
  const northH = sampleBilinearTerrainHeight(dryProfile.worldHeightGrid7x7, 0.5, 0.0);
  const southH = sampleBilinearTerrainHeight(dryProfile.worldHeightGrid7x7, 0.5, 1.0);
  assert.ok(northH > southH, `Expected northH (${northH}) > southH (${southH})`);
});

