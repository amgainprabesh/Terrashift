import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  ChevronDown,
  ChevronUp,
  Compass,
  Droplets,
  Eye,
  Layers,
  Mountain,
  Sprout,
} from 'lucide-react';
import type {
  CropVisualArchetype,
  FarmParcelProfile,
  NasaPowerSummary,
  RotationSimulationResult,
} from '../lib/agronomy';
import { fetchMultiSourceTelemetry } from '../lib/api';
import {
  buildTerrainAndSoilProfile3D,
  sampleBilinearTerrainHeight,
  type RawExternalTelemetryInput,
  type SoilHorizonLayer3D,
} from '../lib/nasaResources';

interface FieldTwin3DProps {
  parcel: FarmParcelProfile;
  nasa: NasaPowerSummary;
  simulation: RotationSimulationResult;
  activeYearIndex: number;
  onSelectYearIndex: (index: number) => void;
}

type CameraPresetId = 'overview' | 'water' | 'strata' | 'canopy' | 'tower';

const CAMERA_PRESETS: Record<
  CameraPresetId,
  {
    label: string;
    pos: [number, number, number];
    target: [number, number, number];
  }
> = {
  overview: {
    label: 'Terrain Overview',
    pos: [16.4, 9.4, 17.2],
    target: [0, -2.75, 0],
  },
  water: {
    label: 'Water Level Cutaway',
    pos: [14.6, 4.6, 15.2],
    target: [0.3, -2.65, 0.3],
  },
  strata: {
    label: 'Soil Layers',
    pos: [16.8, 5.4, 16.8],
    target: [0, -2.95, 0],
  },
  canopy: {
    label: 'Crop & Roots',
    pos: [10.4, 4.2, 11.2],
    target: [0, -1.1, 0],
  },
  tower: {
    label: 'NASA Flux Tower',
    pos: [-2.4, 5.4, 7.6],
    target: [-5.9, 1.5, -5.9],
  },
};

const BLOCK_HALF = 7.3; // 14.6m x 14.6m geological monolith

// Pre-allocated scratch helpers outside animation loop (zero GC)
const _dummy = new THREE.Object3D();
const _color = new THREE.Color();
const _presetPos = new THREE.Vector3();
const _presetTarget = new THREE.Vector3();

function sampleWorldSurfaceY(
  worldHeightGrid7x7: number[],
  x: number,
  z: number
): number {
  const u = (x + BLOCK_HALF) / (BLOCK_HALF * 2);
  const v = (z + BLOCK_HALF) / (BLOCK_HALF * 2);
  const base = sampleBilinearTerrainHeight(worldHeightGrid7x7, u, v);
  // Cultivated furrow micro-corrugation along crop rows
  const furrow = Math.sin(x * 3.08) * 0.028;
  return base + furrow;
}

/**
 * Displaces a segmented BoxGeometry so its top and bottom surfaces conform
 * to the real 3D SRTM terrain relief (`worldHeightGrid7x7`) at every (x, z) vertex.
 */
function deformBoxToTerrainRelief(
  geo: THREE.BoxGeometry,
  basePositions: Float32Array,
  worldHeightGrid7x7: number[],
  reliefInfluence = 1.0,
  includeFurrows = false
) {
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const count = pos.count;
  for (let i = 0; i < count; i++) {
    const bx = basePositions[i * 3];
    const by = basePositions[i * 3 + 1];
    const bz = basePositions[i * 3 + 2];
    const u = (bx + BLOCK_HALF) / (BLOCK_HALF * 2);
    const v = (bz + BLOCK_HALF) / (BLOCK_HALF * 2);
    const terrainH =
      sampleBilinearTerrainHeight(worldHeightGrid7x7, u, v) * reliefInfluence;
    const furrow = includeFurrows && by > 0 ? Math.sin(bx * 3.08) * 0.028 : 0;
    pos.setY(i, by + terrainH + furrow);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
}

function createProceduralTopsoilTexture(moisture: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const wetDarken = Math.round(moisture * 34);
    const r = Math.max(40, 104 - wetDarken);
    const g = Math.max(30, 78 - wetDarken);
    const b = Math.max(20, 54 - Math.round(wetDarken * 0.6));
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(0, 0, 256, 256);

    // Cultivated tillage furrow rows & humus aggregate crumbs
    for (let x = 0; x < 256; x += 16) {
      ctx.fillStyle = 'rgba(15, 23, 42, 0.16)';
      ctx.fillRect(x, 0, 4, 256);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.fillRect(x + 6, 0, 3, 256);
    }
    for (let i = 0; i < 2000; i++) {
      const px = (i * 73) % 256;
      const py = (i * 137) % 256;
      ctx.fillStyle =
        i % 3 === 0 ? 'rgba(25,16,8,0.22)' : 'rgba(185,145,105,0.13)';
      ctx.fillRect(px, py, 2, 2);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 4);
  return tex;
}

function createStrataWallTexture(
  kind: 'subsoil_b' | 'substratum_c' | 'bedrock_r'
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    if (kind === 'subsoil_b') {
      const grad = ctx.createLinearGradient(0, 0, 0, 128);
      grad.addColorStop(0, '#6e442b');
      grad.addColorStop(0.5, '#7c4d32');
      grad.addColorStop(1, '#8a583b');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 256, 128);
      // Clay-loam horizontal banding & fine root pores
      for (let y = 6; y < 128; y += 12) {
        ctx.fillStyle = 'rgba(40, 20, 10, 0.14)';
        ctx.fillRect(0, y, 256, 3);
      }
      for (let i = 0; i < 600; i++) {
        const px = (i * 53) % 256;
        const py = (i * 97) % 128;
        ctx.fillStyle = 'rgba(235, 195, 155, 0.15)';
        ctx.fillRect(px, py, 3, 2);
      }
    } else if (kind === 'substratum_c') {
      const grad = ctx.createLinearGradient(0, 0, 0, 128);
      grad.addColorStop(0, '#8d6e53');
      grad.addColorStop(1, '#785d46');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 256, 128);
      // Weathered gravel & glacial till pebbles
      for (let i = 0; i < 420; i++) {
        const px = (i * 67) % 250;
        const py = (i * 89) % 122;
        const w = 3 + (i % 5);
        const h = 2 + (i % 4);
        ctx.fillStyle =
          i % 2 === 0 ? 'rgba(60, 50, 42, 0.28)' : 'rgba(215, 200, 180, 0.24)';
        ctx.fillRect(px, py, w, h);
      }
    } else {
      const grad = ctx.createLinearGradient(0, 0, 0, 128);
      grad.addColorStop(0, '#475569');
      grad.addColorStop(1, '#334155');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 256, 128);
      // Fractured bedrock jointing planes
      ctx.strokeStyle = 'rgba(15, 23, 42, 0.38)';
      ctx.lineWidth = 2;
      for (let y = 16; y < 128; y += 24) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(256, y + ((y % 48) - 24) * 0.2);
        ctx.stroke();
      }
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 1);
  return tex;
}

function createWaterSurfaceTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#0284c7';
    ctx.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 256; y += 16) {
      ctx.fillStyle =
        y % 32 === 0 ? 'rgba(186, 230, 253, 0.28)' : 'rgba(12, 74, 110, 0.22)';
      ctx.fillRect(0, y, 256, 5);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 3);
  return tex;
}

function createDepthScaleTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 160;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
    ctx.fillRect(0, 0, 160, 512);
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.5)';
    ctx.lineWidth = 3;
    ctx.strokeRect(2, 2, 156, 508);

    const marks = [
      { cm: '0 cm', label: 'SURFACE', y: 26, color: '#a3e635' },
      { cm: '-25 cm', label: 'A TOPSOIL', y: 92, color: '#fbbf24' },
      { cm: '-80 cm', label: 'B ROOT ZONE', y: 222, color: '#38bdf8' },
      { cm: '-150 cm', label: 'C SUBSTRATE', y: 382, color: '#cbd5e1' },
      { cm: '-200 cm', label: 'R BEDROCK', y: 492, color: '#94a3b8' },
    ];

    for (let y = 26; y <= 492; y += 24) {
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(8, y, 16, 2);
    }

    ctx.font = 'bold 18px monospace';
    for (const m of marks) {
      ctx.fillStyle = m.color;
      ctx.fillRect(6, m.y - 2, 28, 4);
      ctx.fillText(m.cm, 40, m.y + 5);
      ctx.font = 'bold 13px sans-serif';
      ctx.fillStyle = '#e2e8f0';
      ctx.fillText(m.label, 40, m.y + 22);
      ctx.font = 'bold 18px monospace';
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createContactShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(64, 64, 6, 64, 64, 60);
    grad.addColorStop(0, 'rgba(15, 23, 42, 0.55)');
    grad.addColorStop(0.65, 'rgba(15, 23, 42, 0.2)');
    grad.addColorStop(1, 'rgba(15, 23, 42, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Composite 7-part NASA Eddy-Covariance Flux Tower (bottom-center pivot)
function buildNasaFluxTower(): THREE.Group {
  const group = new THREE.Group();
  const concreteMat = new THREE.MeshStandardMaterial({
    color: 0x94a3b8,
    roughness: 0.85,
    metalness: 0.05,
  });
  const aluminumMat = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    roughness: 0.32,
    metalness: 0.78,
  });
  const solarMat = new THREE.MeshStandardMaterial({
    color: 0x0f2d5e,
    roughness: 0.16,
    metalness: 0.45,
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color: 0x0284c7,
    roughness: 0.35,
    metalness: 0.3,
  });

  const pad = new THREE.Mesh(
    new THREE.BoxGeometry(1.1, 0.16, 1.1),
    concreteMat
  );
  pad.position.y = 0.08;
  pad.castShadow = true;
  pad.receiveShadow = true;
  group.add(pad);

  const legGeo = new THREE.CylinderGeometry(0.045, 0.055, 4.4, 8);
  const legOffsets: Array<[number, number]> = [
    [-0.22, -0.18],
    [0.22, -0.18],
    [0, 0.22],
  ];
  for (const [lx, lz] of legOffsets) {
    const leg = new THREE.Mesh(legGeo, aluminumMat);
    leg.position.set(lx, 2.36, lz);
    leg.castShadow = true;
    group.add(leg);
  }

  for (const cy of [1.2, 2.4, 3.6]) {
    const collar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.28, 0.08, 6),
      aluminumMat
    );
    collar.position.y = cy;
    group.add(collar);
  }

  const solarPanel = new THREE.Mesh(
    new THREE.BoxGeometry(0.92, 0.05, 0.62),
    solarMat
  );
  solarPanel.position.set(0.38, 2.15, 0.32);
  solarPanel.rotation.x = 0.52;
  solarPanel.castShadow = true;
  group.add(solarPanel);

  const box = new THREE.Mesh(
    new THREE.BoxGeometry(0.36, 0.46, 0.26),
    accentMat
  );
  box.position.set(-0.28, 1.5, 0.14);
  box.castShadow = true;
  group.add(box);

  const boom = new THREE.Mesh(
    new THREE.BoxGeometry(1.1, 0.06, 0.06),
    aluminumMat
  );
  boom.position.set(0.3, 4.1, 0);
  group.add(boom);

  const sensorDome = new THREE.Mesh(
    new THREE.SphereGeometry(0.14, 14, 10),
    accentMat
  );
  sensorDome.position.set(0.82, 4.24, 0);
  group.add(sensorDome);

  const whip = new THREE.Mesh(
    new THREE.CylinderGeometry(0.015, 0.025, 0.85, 6),
    aluminumMat
  );
  whip.position.set(0, 4.95, 0);
  group.add(whip);

  return group;
}

// Composite 6-part Center-Pivot Irrigation Span
function buildIrrigationRig(): THREE.Group {
  const group = new THREE.Group();
  const galvMat = new THREE.MeshStandardMaterial({
    color: 0xcbd5e1,
    roughness: 0.3,
    metalness: 0.82,
  });
  const tireMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.88,
    metalness: 0.05,
  });
  const valveMat = new THREE.MeshStandardMaterial({
    color: 0x0284c7,
    roughness: 0.35,
    metalness: 0.25,
  });

  const riserBase = new THREE.Mesh(
    new THREE.CylinderGeometry(0.34, 0.42, 0.4, 12),
    tireMat
  );
  riserBase.position.y = 0.2;
  group.add(riserBase);

  const riserPipe = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.14, 2.2, 10),
    galvMat
  );
  riserPipe.position.y = 1.3;
  group.add(riserPipe);

  const boom = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.08, 10.4, 10),
    galvMat
  );
  boom.rotation.z = Math.PI / 2;
  boom.position.set(-5.2, 2.25, 0);
  boom.castShadow = true;
  group.add(boom);

  for (const tx of [-4.2, -8.8]) {
    const legA = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 2.25, 0.08),
      galvMat
    );
    legA.position.set(tx, 1.15, -0.45);
    legA.rotation.x = 0.2;
    group.add(legA);

    const legB = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 2.25, 0.08),
      galvMat
    );
    legB.position.set(tx, 1.15, 0.45);
    legB.rotation.x = -0.2;
    group.add(legB);

    for (const wz of [-0.62, 0.62]) {
      const wheel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.28, 0.28, 0.14, 12),
        tireMat
      );
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(tx, 0.28, wz);
      wheel.castShadow = true;
      group.add(wheel);
    }
  }

  for (let i = 1; i <= 7; i++) {
    const nx = -i * 1.35;
    const drop = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.025, 0.75, 6),
      valveMat
    );
    drop.position.set(nx, 1.85, 0);
    group.add(drop);
  }

  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), valveMat);
  cap.position.y = 2.48;
  group.add(cap);

  return group;
}

export function FieldTwin3D({
  parcel,
  nasa,
  simulation,
  activeYearIndex,
  onSelectYearIndex,
}: FieldTwin3DProps) {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const [exploded, setExploded] = useState(0.28);
  const [xrayWaterMode, setXrayWaterMode] = useState(false);
  const [irrigationOn, setIrrigationOn] = useState(
    parcel.irrigationAccess !== 'rainfed'
  );
  const [cameraPreset, setCameraPreset] = useState<CameraPresetId>('overview');
  const [selectedLayerId, setSelectedLayerId] =
    useState<SoilHorizonLayer3D['id']>('water_table');
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [isSoftwareGlFlag, setIsSoftwareGlFlag] = useState(false);
  const [canvasReady, setCanvasReady] = useState(false);
  const [externalTelemetry, setExternalTelemetry] =
    useState<RawExternalTelemetryInput>({});

  useEffect(() => {
    setIrrigationOn(parcel.irrigationAccess !== 'rainfed');
    let cancelled = false;
    fetchMultiSourceTelemetry(parcel.lat, parcel.lng)
      .then((res) => {
        if (!cancelled) setExternalTelemetry(res);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [parcel.id, parcel.lat, parcel.lng, parcel.irrigationAccess]);

  const clampedYearIdx = Math.max(
    0,
    Math.min(simulation.steps.length - 1, activeYearIndex)
  );
  const currentStep = simulation.steps[clampedYearIdx];
  const activeCrop = currentStep?.primaryCrop;

  // Build live 3D SRTM terrain & 5-layer soil-water profile for the farmer's current location
  const profile3D = useMemo(
    () =>
      buildTerrainAndSoilProfile3D(parcel, nasa, externalTelemetry, {
        projectedRootMoisture:
          currentStep?.projectedRootMoisture ?? nasa.meanRootMoisture,
        cropRootDepthM: activeCrop?.rootDepthM ?? 1.2,
        cropName: activeCrop?.name,
        irrigationOn,
      }),
    [
      parcel,
      nasa,
      externalTelemetry,
      currentStep?.projectedRootMoisture,
      activeCrop?.rootDepthM,
      activeCrop?.name,
      irrigationOn,
    ]
  );

  const selectedHorizon =
    profile3D.horizons.find((h) => h.id === selectedLayerId) ??
    profile3D.horizons[2];

  // Refs synced to Three.js scene without tearing down WebGL context
  const sceneStateRef = useRef({
    explodedTarget: exploded,
    xrayWaterMode,
    irrigationOn,
    moisture: currentStep?.projectedRootMoisture ?? nasa.meanRootMoisture,
    waterFillFrac: profile3D.waterLevelFillPct / 100,
    worldHeightGrid7x7: profile3D.worldHeightGrid7x7,
    terrainKey: `${parcel.lat.toFixed(4)}_${parcel.lng.toFixed(4)}_${profile3D.terrainSource}`,
    archetype: (activeCrop?.archetype ?? 'maize') as CropVisualArchetype,
    rootDepthM: activeCrop?.rootDepthM ?? 1.2,
    cropColorHex: activeCrop?.colorHex ?? '#16a34a',
    presetTrigger: {
      id: cameraPreset,
      version: 0,
    },
    requestRender: () => {},
  });

  useEffect(() => {
    sceneStateRef.current.explodedTarget = exploded;
    sceneStateRef.current.xrayWaterMode = xrayWaterMode;
    sceneStateRef.current.irrigationOn = irrigationOn;
    sceneStateRef.current.moisture =
      currentStep?.projectedRootMoisture ?? nasa.meanRootMoisture;
    sceneStateRef.current.waterFillFrac = profile3D.waterLevelFillPct / 100;
    sceneStateRef.current.worldHeightGrid7x7 = profile3D.worldHeightGrid7x7;
    sceneStateRef.current.terrainKey = `${parcel.lat.toFixed(4)}_${parcel.lng.toFixed(4)}_${profile3D.terrainSource}_${profile3D.centerElevationM}`;
    sceneStateRef.current.archetype = activeCrop?.archetype ?? 'maize';
    sceneStateRef.current.rootDepthM = activeCrop?.rootDepthM ?? 1.2;
    sceneStateRef.current.cropColorHex = activeCrop?.colorHex ?? '#16a34a';
    sceneStateRef.current.requestRender();
  }, [
    exploded,
    xrayWaterMode,
    irrigationOn,
    currentStep,
    nasa.meanRootMoisture,
    profile3D,
    parcel.lat,
    parcel.lng,
    activeCrop,
  ]);

  const handleSelectPreset = (id: CameraPresetId) => {
    setCameraPreset(id);
    sceneStateRef.current.presetTrigger = {
      id,
      version: sceneStateRef.current.presetTrigger.version + 1,
    };
    sceneStateRef.current.requestRender();
  };

  const handleSelectLayerCard = (layerId: SoilHorizonLayer3D['id']) => {
    setSelectedLayerId(layerId);
    if (layerId === 'water_table') {
      handleSelectPreset('water');
    } else if (layerId === 'topsoil_oa') {
      handleSelectPreset('canopy');
    } else {
      handleSelectPreset('strata');
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        e.key.toLowerCase() === 'h' &&
        document.activeElement &&
        !['INPUT', 'TEXTAREA', 'SELECT'].includes(
          document.activeElement.tagName
        )
      ) {
        setDockCollapsed((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const mount = canvasMountRef.current;
    if (!mount) return;

    // 1. Software-WebGL probe via renderer string
    const isSoftwareGl = (() => {
      const probeCanvas = document.createElement('canvas');
      const gl = probeCanvas.getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();
    setIsSoftwareGlFlag(isSoftwareGl);

    // 2. Renderer setup
    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.setPixelRatio(
      isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2)
    );
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setSize(mount.clientWidth || 960, mount.clientHeight || 560);
    mount.innerHTML = '';
    mount.appendChild(renderer.domElement);

    const onContextLost = (e: Event) => {
      e.preventDefault();
    };
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);

    // 3. Scene, Environment, Sky/Horizon Fog
    const scene = new THREE.Scene();
    const horizonHex = 0xe6eff7;
    scene.background = new THREE.Color(horizonHex);
    scene.fog = new THREE.FogExp2(horizonHex, 0.013);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    scene.environment = pmremGenerator.fromScene(
      new RoomEnvironment(),
      0.04
    ).texture;
    pmremGenerator.dispose();

    const camera = new THREE.PerspectiveCamera(
      43,
      (mount.clientWidth || 960) / (mount.clientHeight || 560),
      0.1,
      150
    );
    camera.position.set(...CAMERA_PRESETS.overview.pos);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(...CAMERA_PRESETS.overview.target);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.06;
    controls.maxPolarAngle = Math.PI * 0.495;
    controls.minDistance = 4.5;
    controls.maxDistance = 38;

    // 4. Warm Key Light + Cool Hemisphere Fill + Rim Light
    const hemiLight = new THREE.HemisphereLight(0xd8ecff, 0x4b3d2b, 0.88);
    scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(0xfff2d9, 2.15);
    sunLight.position.set(16, 23, 14);
    sunLight.castShadow = !isSoftwareGl;
    sunLight.shadow.mapSize.set(1024, 1024);
    sunLight.shadow.camera.near = 2;
    sunLight.shadow.camera.far = 55;
    sunLight.shadow.camera.left = -12;
    sunLight.shadow.camera.right = 12;
    sunLight.shadow.camera.top = 12;
    sunLight.shadow.camera.bottom = -12;
    sunLight.shadow.bias = -0.0005;
    sunLight.shadow.normalBias = 0.02;
    scene.add(sunLight);

    const rimLight = new THREE.DirectionalLight(0x7dd3fc, 0.65);
    rimLight.position.set(-14, 8, -12);
    scene.add(rimLight);

    // 5. Surrounding Watershed Basin Floor (sits below the geological monolith so all 4 cutaway faces are unobstructed)
    const outerGroundGeo = new THREE.PlaneGeometry(160, 160, 32, 32);
    outerGroundGeo.rotateX(-Math.PI / 2);
    const outerPos = outerGroundGeo.attributes.position;
    for (let i = 0; i < outerPos.count; i++) {
      const gx = outerPos.getX(i);
      const gz = outerPos.getZ(i);
      const dist = Math.hypot(gx, gz);
      const slope =
        dist < 15.2
          ? -5.35
          : -5.35 +
            Math.min(5.2, (dist - 15.2) * 0.16) +
            Math.sin(gx * 0.11) * Math.cos(gz * 0.11) * 0.35;
      outerPos.setY(i, slope);
    }
    outerGroundGeo.computeVertexNormals();
    const outerGroundMat = new THREE.MeshStandardMaterial({
      color: 0xbac7b2,
      roughness: 0.92,
      metalness: 0.0,
    });
    const outerGround = new THREE.Mesh(outerGroundGeo, outerGroundMat);
    outerGround.receiveShadow = true;
    scene.add(outerGround);

    // Perimeter shelterbelt trees around distant watershed rim
    const trunkGeo = new THREE.CylinderGeometry(0.14, 0.22, 1.4, 7);
    const trunkMat = new THREE.MeshStandardMaterial({
      color: 0x5c4033,
      roughness: 0.9,
    });
    const crownGeo = new THREE.DodecahedronGeometry(0.82, 1);
    const crownMat = new THREE.MeshStandardMaterial({
      color: 0x4d7c0f,
      roughness: 0.78,
    });
    const TREE_COUNT = 24;
    const treeTrunks = new THREE.InstancedMesh(trunkGeo, trunkMat, TREE_COUNT);
    const treeCrowns = new THREE.InstancedMesh(crownGeo, crownMat, TREE_COUNT);
    for (let i = 0; i < TREE_COUNT; i++) {
      const ang = (i / TREE_COUNT) * Math.PI * 2;
      const rad = 22 + (i % 3) * 3.2;
      const tx = Math.cos(ang) * rad;
      const tz = Math.sin(ang) * rad;
      const ty = -4.45 + Math.min(4.6, (rad - 14.2) * 0.15);
      const s = 0.85 + ((i * 29) % 7) * 0.1;

      _dummy.position.set(tx, ty + 0.7 * s, tz);
      _dummy.scale.set(s, s, s);
      _dummy.rotation.set(0, ang, 0);
      _dummy.updateMatrix();
      treeTrunks.setMatrixAt(i, _dummy.matrix);

      _dummy.position.set(tx, ty + 1.85 * s, tz);
      _dummy.scale.set(s * 1.05, s * 1.15, s * 1.05);
      _dummy.updateMatrix();
      treeCrowns.setMatrixAt(i, _dummy.matrix);
      _color
        .setHex(0x4d7c0f)
        .offsetHSL(((i % 5) - 2) * 0.02, 0, ((i % 3) - 1) * 0.04);
      treeCrowns.setColorAt(i, _color);
    }
    treeTrunks.computeBoundingSphere();
    treeCrowns.computeBoundingSphere();
    if (treeCrowns.instanceColor) treeCrowns.instanceColor.needsUpdate = true;
    scene.add(treeTrunks);
    scene.add(treeCrowns);

    // 6. Topographically-Conformal 4 Soil/Bedrock Horizons + Dynamic 3D Soil Water Volume
    // Total geological column height = 3.20 world units = 200 cm depth (1.6 world units per meter of soil depth)
    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    const soilTex = createProceduralTopsoilTexture(
      sceneStateRef.current.moisture
    );
    soilTex.anisotropy = maxAniso;

    const wallTexB = createStrataWallTexture('subsoil_b');
    wallTexB.anisotropy = maxAniso;
    const wallTexC = createStrataWallTexture('substratum_c');
    wallTexC.anisotropy = maxAniso;
    const wallTexR = createStrataWallTexture('bedrock_r');
    wallTexR.anisotropy = maxAniso;
    const waterSurfTex = createWaterSurfaceTexture();
    waterSurfTex.anisotropy = maxAniso;
    const depthScaleTex = createDepthScaleTexture();
    depthScaleTex.anisotropy = maxAniso;

    const SEG = 24;
    // Layer 1: O/A Topsoil (0 - 25 cm -> thickness 0.42 world units)
    const topsoilGeo = new THREE.BoxGeometry(14.6, 0.42, 14.6, SEG, 1, SEG);
    const topsoilBasePos = new Float32Array(
      (topsoilGeo.attributes.position as THREE.BufferAttribute).array
    );
    const topsoilMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: soilTex,
      roughness: 0.88,
      metalness: 0.02,
      transparent: true,
      opacity: 1.0,
    });
    const topsoilSlab = new THREE.Mesh(topsoilGeo, topsoilMat);
    topsoilSlab.position.y = -0.21;
    topsoilSlab.receiveShadow = true;
    topsoilSlab.castShadow = !isSoftwareGl;
    scene.add(topsoilSlab);

    // Layer 2: B Horizon Active Root Subsoil (25 - 80 cm -> thickness 0.88 world units)
    const horizonBGeo = new THREE.BoxGeometry(14.56, 0.88, 14.56, SEG, 1, SEG);
    const horizonBBasePos = new Float32Array(
      (horizonBGeo.attributes.position as THREE.BufferAttribute).array
    );
    const horizonBMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: wallTexB,
      roughness: 0.82,
      metalness: 0.04,
      transparent: true,
      opacity: 1.0,
    });
    const horizonBSlab = new THREE.Mesh(horizonBGeo, horizonBMat);
    horizonBSlab.position.y = -0.86;
    horizonBSlab.receiveShadow = true;
    horizonBSlab.castShadow = !isSoftwareGl;
    scene.add(horizonBSlab);

    // Layer 3: C Horizon Deep Substratum (80 - 150 cm -> thickness 1.10 world units)
    const horizonCGeo = new THREE.BoxGeometry(14.52, 1.1, 14.52, SEG, 1, SEG);
    const horizonCBasePos = new Float32Array(
      (horizonCGeo.attributes.position as THREE.BufferAttribute).array
    );
    const horizonCMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: wallTexC,
      roughness: 0.86,
      metalness: 0.05,
      transparent: true,
      opacity: 1.0,
    });
    const horizonCSlab = new THREE.Mesh(horizonCGeo, horizonCMat);
    horizonCSlab.position.y = -1.85;
    horizonCSlab.receiveShadow = true;
    scene.add(horizonCSlab);

    // Layer 4: R Horizon Parent Bedrock & Perched Aquifer Base (150 - 200 cm -> thickness 0.80 world units)
    const horizonRGeo = new THREE.BoxGeometry(14.48, 0.8, 14.48, SEG, 1, SEG);
    const horizonRBasePos = new Float32Array(
      (horizonRGeo.attributes.position as THREE.BufferAttribute).array
    );
    const horizonRMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: wallTexR,
      roughness: 0.9,
      metalness: 0.1,
    });
    const horizonRSlab = new THREE.Mesh(horizonRGeo, horizonRMat);
    horizonRSlab.position.y = -2.8;
    horizonRSlab.receiveShadow = true;
    scene.add(horizonRSlab);

    // Dynamic 3D Soil Water Volume:
    // 1) Core underground water table (14.42 x 1.0 x 14.42) inside the geological monolith (visible between separated layers and in X-Ray mode)
    const waterVolumeGeo = new THREE.BoxGeometry(14.42, 1.0, 14.42, SEG, 1, SEG);
    waterVolumeGeo.translate(0, 0.5, 0);
    const waterBasePos = new Float32Array(
      (waterVolumeGeo.attributes.position as THREE.BufferAttribute).array
    );
    const waterVolumeMat = new THREE.MeshStandardMaterial({
      color: 0x0ea5e9,
      map: waterSurfTex,
      roughness: 0.14,
      metalness: 0.12,
      emissive: 0x0284c7,
      emissiveIntensity: 0.36,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
    });
    const waterVolumeMesh = new THREE.Mesh(waterVolumeGeo, waterVolumeMat);
    waterVolumeMesh.renderOrder = 3;
    scene.add(waterVolumeMesh);

    // 2) Front-Right Hydro-Geological Cutaway Water Window (shows the saturated water column rising on the front-right corner while leaving left/right soil strata bare for comparison)
    const waterWindowGeo = new THREE.BoxGeometry(6.8, 1.0, 6.8, 12, 1, 12);
    waterWindowGeo.translate(3.96, 0.5, 3.96);
    const waterWindowBasePos = new Float32Array(
      (waterWindowGeo.attributes.position as THREE.BufferAttribute).array
    );
    const waterWindowMat = new THREE.MeshStandardMaterial({
      color: 0x0284c7,
      map: waterSurfTex,
      roughness: 0.16,
      metalness: 0.1,
      emissive: 0x0369a1,
      emissiveIntensity: 0.38,
      transparent: true,
      opacity: 0.62,
      depthWrite: false,
    });
    const waterWindowMesh = new THREE.Mesh(waterWindowGeo, waterWindowMat);
    waterWindowMesh.renderOrder = 4;
    scene.add(waterWindowMesh);

    // 3) 3D Water-Table Meniscus Ribbon & Glowing Crest Line around all 4 cutaway walls
    const meniscusBandGeo = new THREE.BoxGeometry(14.72, 0.14, 14.72, SEG, 1, SEG);
    const meniscusBandBasePos = new Float32Array(
      (meniscusBandGeo.attributes.position as THREE.BufferAttribute).array
    );
    const meniscusBandMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 0.65,
      roughness: 0.15,
      transparent: true,
      opacity: 0.88,
    });
    const meniscusBandMesh = new THREE.Mesh(meniscusBandGeo, meniscusBandMat);
    meniscusBandMesh.renderOrder = 5;
    scene.add(meniscusBandMesh);

    const WATER_RING_PTS = 96;
    const waterRingPositions = new Float32Array((WATER_RING_PTS + 1) * 3);
    const waterRingGeo = new THREE.BufferGeometry();
    waterRingGeo.setAttribute(
      'position',
      new THREE.BufferAttribute(waterRingPositions, 3)
    );
    const waterRingMat = new THREE.LineBasicMaterial({
      color: 0xe0f2fe,
    });
    const waterRingLine = new THREE.Line(waterRingGeo, waterRingMat);
    waterRingLine.renderOrder = 6;
    scene.add(waterRingLine);

    // 3D Topographic Elevation Contour Lines & Downslope Drainage Grid on Topsoil Surface
    const contourGroup = new THREE.Group();
    const contourMat = new THREE.LineBasicMaterial({
      color: 0xd97706,
      transparent: true,
      opacity: 0.55,
    });
    const CONTOUR_LINES = 5;
    const contourGeos: THREE.BufferGeometry[] = [];
    for (let cIdx = 0; cIdx < CONTOUR_LINES; cIdx++) {
      const pts = new Float32Array(29 * 3);
      const cGeo = new THREE.BufferGeometry();
      cGeo.setAttribute('position', new THREE.BufferAttribute(pts, 3));
      contourGeos.push(cGeo);
      contourGroup.add(new THREE.Line(cGeo, contourMat));
    }
    scene.add(contourGroup);

    // Right-Edge 3D Stratigraphic Depth Scale & Piezometer Sight-Glass Water Gauge (positioned cleanly to the right of the monolith, clear of the bottom dock)
    const gaugeGroup = new THREE.Group();
    const scaleBoard = new THREE.Mesh(
      new THREE.PlaneGeometry(1.25, 3.2),
      new THREE.MeshBasicMaterial({
        map: depthScaleTex,
        side: THREE.DoubleSide,
      })
    );
    scaleBoard.position.set(8.35, -1.6, 0.85);
    scaleBoard.rotation.y = Math.PI / 4;
    gaugeGroup.add(scaleBoard);

    // Transparent sight-glass standpipe tube next to depth board
    const glassTube = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.14, 3.2, 14),
      new THREE.MeshStandardMaterial({
        color: 0xe0f2fe,
        roughness: 0.15,
        metalness: 0.1,
        transparent: true,
        opacity: 0.36,
        depthWrite: false,
      })
    );
    glassTube.position.set(7.65, -1.6, 1.55);
    gaugeGroup.add(glassTube);

    // Rising blue water column inside the sight-glass standpipe
    const standpipeWaterGeo = new THREE.CylinderGeometry(0.1, 0.1, 1.0, 12);
    standpipeWaterGeo.translate(0, 0.5, 0);
    const standpipeWaterMesh = new THREE.Mesh(
      standpipeWaterGeo,
      new THREE.MeshStandardMaterial({
        color: 0x0284c7,
        emissive: 0x0ea5e9,
        emissiveIntensity: 0.45,
        roughness: 0.2,
      })
    );
    standpipeWaterMesh.position.set(7.65, -3.2, 1.55);
    gaugeGroup.add(standpipeWaterMesh);

    // Floating water-level marker ring on the standpipe
    const floatRingMesh = new THREE.Mesh(
      new THREE.TorusGeometry(0.16, 0.035, 8, 20),
      new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        emissive: 0x38bdf8,
        emissiveIntensity: 0.6,
        roughness: 0.2,
      })
    );
    floatRingMesh.rotation.x = Math.PI / 2;
    floatRingMesh.position.set(7.65, -1.6, 1.55);
    gaugeGroup.add(floatRingMesh);
    scene.add(gaugeGroup);

    // 7. 3D Crop Root Systems (36 branching taproots & lateral feeder roots descending from the crop rows into the soil/water)
    const rootGroup = new THREE.Group();
    const rootMat = new THREE.MeshStandardMaterial({
      color: 0xfde68a,
      roughness: 0.55,
      metalness: 0.05,
      emissive: 0xd97706,
      emissiveIntensity: 0.18,
    });
    const rootData: Array<{
      mesh: THREE.Mesh;
      rx: number;
      rz: number;
      baseLen: number;
    }> = [];

    for (let i = 0; i < 36; i++) {
      const row = Math.floor(i / 6);
      const col = i % 6;
      const rx = (col - 2.5) * 2.15;
      const rz = (row - 2.5) * 2.15;
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(
          Math.sin(i * 1.7) * 0.22,
          -0.55,
          Math.cos(i * 1.3) * 0.22
        ),
        new THREE.Vector3(
          Math.cos(i * 2.1) * 0.28,
          -1.15,
          Math.sin(i * 2.3) * 0.28
        ),
        new THREE.Vector3(
          Math.sin(i * 0.9) * 0.18,
          -1.6,
          Math.cos(i * 1.9) * 0.18
        ),
      ]);
      const tubeGeo = new THREE.TubeGeometry(curve, 10, 0.048, 6, false);
      const mesh = new THREE.Mesh(tubeGeo, rootMat);
      rootGroup.add(mesh);
      rootData.push({ mesh, rx, rz, baseLen: 1.6 });
    }
    scene.add(rootGroup);

    // 8. Grounded Hero Props: NASA Flux Tower & Center-Pivot Irrigation Rig
    const shadowTex = createContactShadowTexture();
    const makeContactDisc = (radius: number) => {
      const disc = new THREE.Mesh(
        new THREE.CircleGeometry(radius, 24),
        new THREE.MeshBasicMaterial({
          map: shadowTex,
          transparent: true,
          opacity: 0.55,
          depthWrite: false,
        })
      );
      disc.rotation.x = -Math.PI / 2;
      return disc;
    };

    const fluxTower = buildNasaFluxTower();
    const towerShadow = makeContactDisc(1.1);
    scene.add(fluxTower);
    scene.add(towerShadow);

    const irrigationRig = buildIrrigationRig();
    irrigationRig.rotation.y = 0.55;
    const rigShadow = makeContactDisc(1.0);
    scene.add(irrigationRig);
    scene.add(rigShadow);

    // 9. InstancedMesh Crop Field (144 plants = 12x12 grid, stalks + canopy heads seated on 3D terrain)
    const GRID = 12;
    const COUNT = GRID * GRID;
    const stalkGeo = new THREE.CylinderGeometry(0.045, 0.065, 1.0, 7);
    stalkGeo.translate(0, 0.5, 0);
    const stalkMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.78,
      metalness: 0.02,
    });
    const stalkMesh = new THREE.InstancedMesh(stalkGeo, stalkMat, COUNT);
    stalkMesh.castShadow = !isSoftwareGl;
    stalkMesh.receiveShadow = true;
    scene.add(stalkMesh);

    const headGeo = new THREE.DodecahedronGeometry(0.26, 1);
    headGeo.translate(0, 0.18, 0);
    const headMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.56,
      metalness: 0.04,
    });
    const headMesh = new THREE.InstancedMesh(headGeo, headMat, COUNT);
    headMesh.castShadow = !isSoftwareGl;
    scene.add(headMesh);

    let lastArchetype: CropVisualArchetype | null = null;
    let lastTerrainKey = '';
    let lastMoistureSnapshot = -1;

    const rebuildTerrainAndCrops = () => {
      const grid7x7 = sceneStateRef.current.worldHeightGrid7x7;
      const arch = sceneStateRef.current.archetype;
      const baseHex = sceneStateRef.current.cropColorHex;

      // Deform all 4 geological horizons to match the farmer's real 3D SRTM terrain relief
      deformBoxToTerrainRelief(topsoilGeo, topsoilBasePos, grid7x7, 1.0, true);
      deformBoxToTerrainRelief(horizonBGeo, horizonBBasePos, grid7x7, 0.85, false);
      deformBoxToTerrainRelief(horizonCGeo, horizonCBasePos, grid7x7, 0.55, false);
      deformBoxToTerrainRelief(horizonRGeo, horizonRBasePos, grid7x7, 0.25, false);

      // Deform top surface of the 3D water volume, cutaway water window, and meniscus band to follow local terrain relief
      const wPos = waterVolumeGeo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < wPos.count; i++) {
        const bx = waterBasePos[i * 3];
        const by = waterBasePos[i * 3 + 1]; // 0 at bottom, 1 at top
        const bz = waterBasePos[i * 3 + 2];
        const u = (bx + BLOCK_HALF) / (BLOCK_HALF * 2);
        const v = (bz + BLOCK_HALF) / (BLOCK_HALF * 2);
        const th = sampleBilinearTerrainHeight(grid7x7, u, v) * 0.45 * by;
        wPos.setY(i, by + th * 0.22);
      }
      wPos.needsUpdate = true;
      waterVolumeGeo.computeVertexNormals();

      const wwPos = waterWindowGeo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < wwPos.count; i++) {
        const bx = waterWindowBasePos[i * 3];
        const by = waterWindowBasePos[i * 3 + 1];
        const bz = waterWindowBasePos[i * 3 + 2];
        const u = (bx + BLOCK_HALF) / (BLOCK_HALF * 2);
        const v = (bz + BLOCK_HALF) / (BLOCK_HALF * 2);
        const th = sampleBilinearTerrainHeight(grid7x7, u, v) * 0.45 * by;
        wwPos.setY(i, by + th * 0.22);
      }
      wwPos.needsUpdate = true;
      waterWindowGeo.computeVertexNormals();

      deformBoxToTerrainRelief(
        meniscusBandGeo,
        meniscusBandBasePos,
        grid7x7,
        0.25,
        false
      );

      // Update 3D topographic contour lines across the surface
      for (let cIdx = 0; cIdx < CONTOUR_LINES; cIdx++) {
        const zLine = ((cIdx + 1) / (CONTOUR_LINES + 1) - 0.5) * 13.6;
        const attr = contourGeos[cIdx].attributes
          .position as THREE.BufferAttribute;
        for (let s = 0; s <= 28; s++) {
          const xPt = (s / 28 - 0.5) * 14.2;
          const yPt = sampleWorldSurfaceY(grid7x7, xPt, zLine) + 0.03;
          attr.setXYZ(s, xPt, yPt, zLine);
        }
        attr.needsUpdate = true;
      }

      // Seat NASA Flux Tower & Irrigation Rig flush on the 3D terrain surface
      const towerY = sampleWorldSurfaceY(grid7x7, -6.1, -6.1);
      fluxTower.position.set(-6.1, towerY, -6.1);
      towerShadow.position.set(-6.1, towerY + 0.02, -6.1);

      const rigY = sampleWorldSurfaceY(grid7x7, 6.0, 6.0);
      irrigationRig.position.set(6.0, rigY, 6.0);
      rigShadow.position.set(6.0, rigY + 0.02, 6.0);

      // Seat 36 3D root systems under the crop rows
      for (const rItem of rootData) {
        const ry = sampleWorldSurfaceY(grid7x7, rItem.rx, rItem.rz) - 0.12;
        rItem.mesh.position.set(rItem.rx, ry, rItem.rz);
      }

      // Seat all 144 crop stalks & canopy heads on the 3D terrain surface
      const archProfile: Record<
        CropVisualArchetype,
        {
          stalkH: number;
          stalkW: number;
          headY: number;
          headScale: [number, number, number];
          stalkHex: number;
        }
      > = {
        maize: {
          stalkH: 1.55,
          stalkW: 1.15,
          headY: 1.48,
          headScale: [1.1, 1.3, 1.1],
          stalkHex: 0x3f6212,
        },
        sorghum_millet: {
          stalkH: 1.25,
          stalkW: 1.0,
          headY: 1.18,
          headScale: [0.85, 1.15, 0.85],
          stalkHex: 0x4d7c0f,
        },
        soybean: {
          stalkH: 0.55,
          stalkW: 0.85,
          headY: 0.45,
          headScale: [1.55, 0.8, 1.55],
          stalkHex: 0x15803d,
        },
        wheat_rye: {
          stalkH: 0.88,
          stalkW: 0.65,
          headY: 0.84,
          headScale: [0.55, 1.1, 0.55],
          stalkHex: 0x65a30d,
        },
        clover_alfalfa: {
          stalkH: 0.35,
          stalkW: 0.9,
          headY: 0.28,
          headScale: [1.75, 0.58, 1.75],
          stalkHex: 0x059669,
        },
        sunflower: {
          stalkH: 1.38,
          stalkW: 1.05,
          headY: 1.35,
          headScale: [1.35, 0.45, 1.35],
          stalkHex: 0x365314,
        },
      };

      const cfg = archProfile[arch];
      for (let i = 0; i < COUNT; i++) {
        const row = Math.floor(i / GRID);
        const col = i % GRID;
        const x = (col - (GRID - 1) / 2) * 1.02 + ((row % 2) * 0.14 - 0.07);
        const z = (row - (GRID - 1) / 2) * 1.02;
        const gy = sampleWorldSurfaceY(grid7x7, x, z);
        const jitter = 0.85 + (((i * 19) % 11) / 10) * 0.3;

        _dummy.position.set(x, gy, z);
        _dummy.rotation.set(0, (i * 0.618) % (Math.PI * 2), 0);
        _dummy.scale.set(cfg.stalkW, cfg.stalkH * jitter, cfg.stalkW);
        _dummy.updateMatrix();
        stalkMesh.setMatrixAt(i, _dummy.matrix);
        _color
          .setHex(cfg.stalkHex)
          .offsetHSL(((i % 5) - 2) * 0.012, 0, ((i % 3) - 1) * 0.03);
        stalkMesh.setColorAt(i, _color);

        _dummy.position.set(x, gy + cfg.headY * jitter, z);
        _dummy.scale.set(
          cfg.headScale[0] * jitter,
          cfg.headScale[1] * jitter,
          cfg.headScale[2] * jitter
        );
        _dummy.updateMatrix();
        headMesh.setMatrixAt(i, _dummy.matrix);
        _color
          .set(baseHex)
          .offsetHSL(((i % 7) - 3) * 0.01, 0, ((i % 3) - 1) * 0.04);
        headMesh.setColorAt(i, _color);
      }

      stalkMesh.instanceMatrix.needsUpdate = true;
      if (stalkMesh.instanceColor) stalkMesh.instanceColor.needsUpdate = true;
      headMesh.instanceMatrix.needsUpdate = true;
      if (headMesh.instanceColor) headMesh.instanceColor.needsUpdate = true;
      stalkMesh.computeBoundingSphere();
      headMesh.computeBoundingSphere();
    };

    const updateWaterRingPerimeter = (
      waterTopY: number,
      grid7x7: number[]
    ) => {
      const half = 7.36;
      const attr = waterRingGeo.attributes.position as THREE.BufferAttribute;
      const segsPerSide = WATER_RING_PTS / 4;
      for (let i = 0; i <= WATER_RING_PTS; i++) {
        const side = Math.min(3, Math.floor(i / segsPerSide));
        const t = (i - side * segsPerSide) / segsPerSide;
        let wx = 0;
        let wz = 0;
        if (side === 0) {
          wx = -half + t * half * 2;
          wz = half;
        } else if (side === 1) {
          wx = half;
          wz = half - t * half * 2;
        } else if (side === 2) {
          wx = half - t * half * 2;
          wz = -half;
        } else {
          wx = -half;
          wz = -half + t * half * 2;
        }
        const u = (wx + BLOCK_HALF) / (BLOCK_HALF * 2);
        const v = (wz + BLOCK_HALF) / (BLOCK_HALF * 2);
        const th = sampleBilinearTerrainHeight(grid7x7, u, v) * 0.25;
        attr.setXYZ(i, wx, waterTopY + th, wz);
      }
      attr.needsUpdate = true;
    };

    rebuildTerrainAndCrops();
    lastArchetype = sceneStateRef.current.archetype;
    lastTerrainKey = sceneStateRef.current.terrainKey;
    updateWaterRingPerimeter(
      -3.2 + sceneStateRef.current.waterFillFrac * 3.05,
      sceneStateRef.current.worldHeightGrid7x7
    );

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    // 10. On-demand coalesced rendering + software-WebGL afterDraw pacing
    let frameId = 0;
    let disposed = false;
    let renderBusy = false;
    let renderDirty = false;
    let currentExploded = sceneStateRef.current.explodedTarget;
    let currentWaterFrac = sceneStateRef.current.waterFillFrac;
    let lastTime = performance.now();
    let seenPresetVersion = sceneStateRef.current.presetTrigger.version;
    let presetAnimating = false;

    const handleUserControlStart = () => {
      presetAnimating = false;
    };
    controls.addEventListener('start', handleUserControlStart);

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) {
          if (sync) gl.deleteSync(sync);
          return;
        }
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function requestRender() {
      if (disposed) return;
      if (renderBusy) {
        renderDirty = true;
        return;
      }
      renderBusy = true;
      frameId = requestAnimationFrame((now) => {
        if (disposed) return;
        renderDirty = false;
        const dt = Math.min(0.1, Math.max(0.001, (now - lastTime) / 1000));
        lastTime = now;

        const targetState = sceneStateRef.current;

        // Rebuild terrain & crops whenever parcel coordinates, SRTM grid, or crop archetype change
        if (
          targetState.archetype !== lastArchetype ||
          targetState.terrainKey !== lastTerrainKey
        ) {
          lastArchetype = targetState.archetype;
          lastTerrainKey = targetState.terrainKey;
          rebuildTerrainAndCrops();
        }

        if (Math.abs(targetState.moisture - lastMoistureSnapshot) > 0.02) {
          lastMoistureSnapshot = targetState.moisture;
        }

        // Toggle X-Ray Water & Roots inspection transparency (disable depthWrite when translucent so internal water table & roots are 100% visible)
        const isXray = targetState.xrayWaterMode;
        const targetSoilOpacity = isXray ? 0.24 : 1.0;
        topsoilMat.opacity = targetSoilOpacity;
        topsoilMat.depthWrite = !isXray;
        horizonBMat.opacity = targetSoilOpacity;
        horizonBMat.depthWrite = !isXray;
        horizonCMat.opacity = isXray ? 0.32 : 1.0;
        horizonCMat.depthWrite = !isXray;
        waterVolumeMat.opacity = isXray ? 0.86 : 0.72;
        waterWindowMat.opacity = isXray ? 0.88 : 0.64;

        // Toggle irrigation rig visibility
        irrigationRig.visible = targetState.irrigationOn;
        rigShadow.visible = targetState.irrigationOn;

        // Smooth damping (instantaneous on software GL so screenshots and clicks never lag)
        const dampSpeed = isSoftwareGl ? 45 : 8;
        const expDiff = Math.abs(targetState.explodedTarget - currentExploded);
        if (expDiff > 0.004) {
          currentExploded = isSoftwareGl
            ? targetState.explodedTarget
            : THREE.MathUtils.damp(
                currentExploded,
                targetState.explodedTarget,
                dampSpeed,
                dt
              );
          if (!isSoftwareGl) renderDirty = true;
        } else {
          currentExploded = targetState.explodedTarget;
        }

        const waterDiff = Math.abs(
          targetState.waterFillFrac - currentWaterFrac
        );
        if (waterDiff > 0.003) {
          currentWaterFrac = isSoftwareGl
            ? targetState.waterFillFrac
            : THREE.MathUtils.damp(
                currentWaterFrac,
                targetState.waterFillFrac,
                dampSpeed,
                dt
              );
          if (!isSoftwareGl) renderDirty = true;
        } else {
          currentWaterFrac = targetState.waterFillFrac;
        }

        // Position the 4 soil horizons with clear stratigraphic separation
        topsoilSlab.position.y = -0.21;
        horizonBSlab.position.y = -0.92 - currentExploded * 0.9;
        horizonCSlab.position.y = -2.02 - currentExploded * 1.95;
        horizonRSlab.position.y = -3.08 - currentExploded * 3.0;

        // Position & scale the 3D Soil Water Table Volume, Cutaway Window, Meniscus Ribbon & Sight-Glass Gauge
        const baseBottomY = -3.48 - currentExploded * 2.8;
        const maxColumnH = 3.3 + currentExploded * 2.3;
        const waterHeightWorld = Math.max(0.32, currentWaterFrac * maxColumnH);
        waterVolumeMesh.position.y = baseBottomY;
        waterVolumeMesh.scale.y = waterHeightWorld;

        waterWindowMesh.position.y = baseBottomY;
        waterWindowMesh.scale.y = waterHeightWorld;

        const waterTopY = baseBottomY + waterHeightWorld;
        meniscusBandMesh.position.y = waterTopY;
        updateWaterRingPerimeter(waterTopY + 0.07, targetState.worldHeightGrid7x7);

        standpipeWaterMesh.position.y = -3.2;
        standpipeWaterMesh.scale.y = Math.max(0.25, currentWaterFrac * 3.05);
        floatRingMesh.position.y = -3.2 + currentWaterFrac * 3.05;

        // Scale 3D crop roots to match actual root depth in meters (1.6 world units per meter)
        const rootScaleY = Math.max(0.5, (targetState.rootDepthM * 1.6) / 1.6);
        for (const rItem of rootData) {
          rItem.mesh.scale.set(1, rootScaleY, 1);
          rItem.mesh.renderOrder = isXray ? 7 : 2;
        }
        // Color roots bright cyan-green when they reach the wet capillary zone, or warm amber when dry
        const rootTipWorldY = -0.15 - targetState.rootDepthM * 1.6;
        const rootsTouchWater = rootTipWorldY <= waterTopY + 0.35;
        rootMat.color.setHex(rootsTouchWater ? 0x38bdf8 : 0xfbbf24);
        rootMat.emissive.setHex(rootsTouchWater ? 0x0284c7 : 0xd97706);
        rootMat.emissiveIntensity = isXray ? 0.55 : 0.25;

        // Camera preset transition (instant on software GL, smooth damped on hardware GPU)
        if (targetState.presetTrigger.version !== seenPresetVersion) {
          seenPresetVersion = targetState.presetTrigger.version;
          presetAnimating = true;
        }
        if (presetAnimating) {
          const preset = CAMERA_PRESETS[targetState.presetTrigger.id];
          _presetPos.set(...preset.pos);
          _presetTarget.set(...preset.target);
          if (isSoftwareGl) {
            camera.position.copy(_presetPos);
            controls.target.copy(_presetTarget);
            presetAnimating = false;
          } else {
            const alpha = 1 - Math.exp(-7 * dt);
            camera.position.lerp(_presetPos, alpha);
            controls.target.lerp(_presetTarget, alpha);
            if (
              camera.position.distanceTo(_presetPos) < 0.05 &&
              controls.target.distanceTo(_presetTarget) < 0.04
            ) {
              camera.position.copy(_presetPos);
              controls.target.copy(_presetTarget);
              presetAnimating = false;
            } else {
              renderDirty = true;
            }
          }
        }

        controls.update();
        renderer.render(scene, camera);
        setCanvasReady(true);

        const done = () => {
          renderBusy = false;
          if (renderDirty && !disposed) requestRender();
        };
        if (isSoftwareGl) afterDraw(done);
        else done();
      });
    }

    sceneStateRef.current.requestRender = requestRender;
    controls.addEventListener('change', requestRender);

    const handleResize = () => {
      if (!mount || disposed) return;
      const w = mount.clientWidth || 960;
      const h = mount.clientHeight || 560;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      requestRender();
    };
    window.addEventListener('resize', handleResize);

    // Initial render
    requestRender();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      window.removeEventListener('resize', handleResize);
      controls.removeEventListener('change', requestRender);
      controls.removeEventListener('start', handleUserControlStart);
      controls.dispose();
      renderer.domElement.removeEventListener(
        'webglcontextlost',
        onContextLost
      );
      soilTex.dispose();
      wallTexB.dispose();
      wallTexC.dispose();
      wallTexR.dispose();
      waterSurfTex.dispose();
      depthScaleTex.dispose();
      shadowTex.dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <div
      data-testid="field-twin-3d"
      className="relative h-[calc(100vh-148px)] min-h-[580px] w-full overflow-hidden bg-slate-100"
      data-active-year={clampedYearIdx + 1}
      data-exploded={exploded.toFixed(2)}
      data-crop-id={activeCrop?.id ?? 'unknown'}
      data-water-depth-cm={profile3D.waterTableDepthCm}
      data-water-fill-pct={profile3D.waterLevelFillPct}
      data-roots-reach-water={String(profile3D.rootsReachWater)}
      data-is-software-gl={String(isSoftwareGlFlag)}
      data-canvas-ready={String(canvasReady)}
    >
      {/* Dedicated empty WebGL mount container */}
      <div ref={canvasMountRef} className="h-full w-full" />

      {/* Top-Left Farmer-Friendly Terrain & 3D Soil Water Status Badge (no backdrop-filter over WebGL) */}
      <div
        data-testid="twin3d-farmer-summary-card"
        className="pointer-events-none absolute left-4 top-4 z-10 max-w-md rounded-xl border border-slate-200 bg-white/95 px-4 py-3 shadow-sm"
      >
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-500">
            3D SRTM Terrain &amp; Soil Water Cutaway
          </p>
          <span
            className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-bold ${
              profile3D.rootsReachWater
                ? 'bg-emerald-100 text-emerald-900'
                : 'bg-amber-100 text-amber-900'
            }`}
          >
            {profile3D.rootsReachWater
              ? 'ROOTS REACH WATER'
              : 'WATER BELOW ROOTS'}
          </span>
        </div>

        <h1 className="mt-0.5 font-display text-sm font-bold text-slate-950">
          {parcel.name} · Year {clampedYearIdx + 1}: {activeCrop?.name}
        </h1>

        <div className="mt-1.5 grid grid-cols-3 gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px]">
          <div>
            <span className="block text-[9px] font-semibold uppercase text-slate-400">
              3D Terrain
            </span>
            <span className="font-mono font-bold text-slate-900">
              {profile3D.centerElevationM}m ASL
            </span>
            <span className="block truncate text-[10px] text-slate-500">
              {profile3D.slopePct}% {profile3D.aspectLabel}
            </span>
          </div>

          <div>
            <span className="block text-[9px] font-semibold uppercase text-sky-700">
              Soil Water Level
            </span>
            <span className="font-mono font-bold text-sky-800">
              -{profile3D.waterTableDepthCm} cm
            </span>
            <span className="block text-[10px] text-sky-700">
              {profile3D.waterLevelFillPct}% soil column full
            </span>
          </div>

          <div>
            <span className="block text-[9px] font-semibold uppercase text-emerald-700">
              Crop Root Reach
            </span>
            <span className="font-mono font-bold text-emerald-900">
              -{profile3D.cropRootDepthCm} cm
            </span>
            <span className="block truncate text-[10px] text-slate-500">
              {activeCrop?.name.split(' ')[0]} roots
            </span>
          </div>
        </div>

        <p className="mt-1.5 text-[11px] leading-snug text-slate-700">
          {profile3D.farmerWaterSummary}
        </p>
      </div>

      {/* Right-Side Live 0–200cm Soil Layer & Water Table Depth Cutaway Diagram */}
      <div
        data-testid="twin3d-layer-legend-panel"
        className="pointer-events-auto absolute right-4 top-4 z-10 hidden w-72 rounded-xl border border-slate-200 bg-white/95 p-3 shadow-sm lg:block"
      >
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-[0.06em] text-slate-500">
            Soil Layers &amp; Water Depth (0–200 cm)
          </span>
          <span className="font-mono text-[10px] font-bold text-sky-700">
            Water @ -{profile3D.waterTableDepthCm} cm
          </span>
        </div>

        {/* Visual 0-200cm Cross-Section Column */}
        <div className="relative mt-2 h-44 w-full overflow-hidden rounded-lg border border-slate-300 bg-slate-900">
          {/* Layer 1: O/A Topsoil (0-25cm -> 12.5% height) */}
          <button
            type="button"
            onClick={() => handleSelectLayerCard('topsoil_oa')}
            className="flex h-[15%] w-full items-center justify-between border-b border-amber-950/60 bg-[#3d291a] px-2.5 text-[10px] font-semibold text-amber-100 hover:brightness-110"
          >
            <span>1. O/A Topsoil (0–25 cm)</span>
            <span className="font-mono">{profile3D.horizons[0]?.moisturePct}%</span>
          </button>

          {/* Layer 2: B Active Root Subsoil (25-80cm -> 27.5% height) */}
          <button
            type="button"
            onClick={() => handleSelectLayerCard('subsoil_b')}
            className="flex h-[27.5%] w-full items-center justify-between border-b border-amber-950/60 bg-[#854d27] px-2.5 text-[10px] font-semibold text-amber-50 hover:brightness-110"
          >
            <span>2. B Root Subsoil (25–80 cm)</span>
            <span className="font-mono">{profile3D.horizons[1]?.moisturePct}%</span>
          </button>

          {/* Layer 3: C Deep Substratum (80-150cm -> 35% height) */}
          <button
            type="button"
            onClick={() => handleSelectLayerCard('substratum_c')}
            className="flex h-[35%] w-full items-center justify-between border-b border-stone-800 bg-[#a67649] px-2.5 text-[10px] font-semibold text-stone-950 hover:brightness-105"
          >
            <span>3. C Substratum (80–150 cm)</span>
            <span className="font-mono">{profile3D.horizons[3]?.moisturePct}%</span>
          </button>

          {/* Layer 4: R Bedrock & Aquifer (150-200cm -> 22.5% height) */}
          <button
            type="button"
            onClick={() => handleSelectLayerCard('bedrock_r')}
            className="flex h-[22.5%] w-full items-center justify-between bg-[#475569] px-2.5 text-[10px] font-semibold text-slate-100 hover:brightness-110"
          >
            <span>4. R Bedrock (150–200 cm)</span>
            <span className="font-mono">{profile3D.horizons[4]?.moisturePct}%</span>
          </button>

          {/* Rising Translucent Blue Water Level Overlay on the Right Half of the Column */}
          <div
            onClick={() => handleSelectLayerCard('water_table')}
            style={{ height: `${profile3D.waterLevelFillPct}%` }}
            className="cursor-pointer absolute bottom-0 right-0 w-2/5 border-l border-t-2 border-sky-300 bg-sky-500/55 transition-all duration-300"
            title="Click to inspect 3D Soil Water Level"
          >
            <div className="bg-sky-400/90 px-1 py-0.5 text-center font-mono text-[9px] font-bold text-slate-950">
              💧 -{profile3D.waterTableDepthCm}cm
            </div>
          </div>

          {/* Crop Root Reach Marker Line */}
          <div
            style={{
              top: `${Math.min(96, Math.max(8, (profile3D.cropRootDepthCm / 200) * 100))}%`,
            }}
            className="pointer-events-none absolute left-0 right-0 border-t-2 border-dashed border-emerald-300"
          >
            <span className="ml-1.5 inline-block -translate-y-2 rounded bg-emerald-950/90 px-1.5 py-0.2 font-mono text-[9px] font-bold text-emerald-300">
              🌱 Roots -{profile3D.cropRootDepthCm}cm
            </span>
          </div>
        </div>

        <p className="mt-1.5 text-[10px] leading-tight text-slate-600">
          {profile3D.farmerTerrainSummary}
        </p>
      </div>

      {/* Collapsible Unified Bottom Control & Soil Layer Inspector Dock (no backdrop-filter) */}
      <div className="pointer-events-none absolute bottom-3 left-1/2 z-20 flex w-[min(1040px,96vw)] -translate-x-1/2 flex-col items-center">
        <button
          type="button"
          onClick={() => setDockCollapsed((v) => !v)}
          className="pointer-events-auto mb-1 inline-flex items-center gap-1 rounded-t-lg border border-slate-300 bg-white/95 px-3 py-1 text-[11px] font-semibold text-slate-800 shadow-xs hover:bg-slate-50"
        >
          {dockCollapsed ? (
            <>
              <ChevronUp className="h-3.5 w-3.5" />
              <span>Show Soil Layers &amp; Controls</span>
            </>
          ) : (
            <>
              <ChevronDown className="h-3.5 w-3.5" />
              <span>Hide Controls (H)</span>
            </>
          )}
        </button>

        {!dockCollapsed && (
          <div className="pointer-events-auto w-full space-y-2 rounded-xl border border-slate-300 bg-white/95 p-3 shadow-lg">
            {/* Row 1: Interactive 5-Layer Soil & Water Profile Cards (Click any layer to inspect in 3D) */}
            <div
              data-testid="soil-horizons-strip"
              className="grid grid-cols-2 gap-1.5 sm:grid-cols-5"
            >
              {profile3D.horizons.map((layer) => {
                const isSelected = layer.id === selectedLayerId;
                const isWater = layer.id === 'water_table';
                return (
                  <button
                    key={layer.id}
                    type="button"
                    data-testid={`soil-layer-btn-${layer.id}`}
                    onClick={() => handleSelectLayerCard(layer.id)}
                    className={`flex flex-col justify-between rounded-lg border px-2.5 py-1.5 text-left transition-colors ${
                      isSelected
                        ? isWater
                          ? 'border-sky-600 bg-sky-50/90'
                          : 'border-slate-900 bg-slate-100/90'
                        : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.04em] text-slate-700">
                        <span
                          className="inline-block h-2.5 w-2.5 rounded-xs"
                          style={{ backgroundColor: layer.colorHex }}
                        />
                        <span className="truncate">{layer.code}</span>
                      </span>
                      <span className="font-mono text-[10px] font-semibold text-slate-500">
                        {layer.depthRangeCm}
                      </span>
                    </div>

                    <div className="mt-1 flex items-baseline justify-between gap-1">
                      <span className="truncate text-xs font-semibold text-slate-950">
                        {layer.name}
                      </span>
                      <span
                        className={`font-mono text-xs font-bold ${
                          isWater ? 'text-sky-700' : 'text-emerald-800'
                        }`}
                      >
                        {layer.moisturePct}%
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Selected Layer Plain-English Farmer Explanation Bar */}
            <div
              data-testid="selected-layer-explanation"
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs"
            >
              <div className="flex items-center gap-2">
                <span
                  className="inline-block h-3 w-3 shrink-0 rounded-xs"
                  style={{ backgroundColor: selectedHorizon.colorHex }}
                />
                <span className="font-semibold text-slate-900">
                  {selectedHorizon.simpleFarmerTitle}:
                </span>
                <span className="text-slate-700">
                  {selectedHorizon.farmerExplanation}
                </span>
              </div>
              <span className="font-mono text-[11px] font-medium text-slate-500">
                <Mountain className="mr-1 inline h-3 w-3 text-slate-500" />
                {profile3D.drainageDirectionLabel}
              </span>
            </div>

            {/* Row 2: Rotation Year Switcher + Layer Separation Slider + X-Ray & Camera Controls */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
              {/* Rotation Year Switcher */}
              <div className="flex items-center gap-1">
                {simulation.steps.map((s, idx) => (
                  <button
                    key={s.year}
                    type="button"
                    data-twin-year={s.year}
                    onClick={() => onSelectYearIndex(idx)}
                    className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
                      idx === clampedYearIdx
                        ? 'bg-sky-700 text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    Y{s.year}: {s.primaryCrop.name.split(' ')[0]}
                  </button>
                ))}
              </div>

              {/* Exploded Strata Slider */}
              <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
                <Layers className="h-3.5 w-3.5 text-amber-700" />
                <span>Separate Soil Layers</span>
                <input
                  type="range"
                  data-testid="explode-layers-slider"
                  aria-label="Separate Soil Layers"
                  min={0}
                  max={1}
                  step={0.05}
                  value={exploded}
                  onChange={(e) => setExploded(Number(e.target.value))}
                  className="w-24 accent-amber-700"
                />
              </label>

              {/* Camera Presets + X-Ray Water View + Irrigation Toggle */}
              <div className="flex flex-wrap items-center gap-1.5">
                {(Object.keys(CAMERA_PRESETS) as CameraPresetId[]).map(
                  (pid) => (
                    <button
                      key={pid}
                      type="button"
                      data-camera-preset={pid}
                      onClick={() => handleSelectPreset(pid)}
                      className={`rounded-md border px-2 py-1 text-[11px] font-medium ${
                        cameraPreset === pid
                          ? 'border-slate-900 bg-slate-900 text-white'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {CAMERA_PRESETS[pid].label}
                    </button>
                  )
                )}

                <button
                  type="button"
                  data-testid="xray-water-toggle"
                  onClick={() => setXrayWaterMode((v) => !v)}
                  className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-[11px] font-semibold ${
                    xrayWaterMode
                      ? 'border-sky-700 bg-sky-700 text-white'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                  title="Make soil layers translucent to see 3D water level and root reach inside the ground"
                >
                  <Eye className="h-3 w-3" />
                  <span>{xrayWaterMode ? 'X-Ray Water On' : 'X-Ray Water'}</span>
                </button>

                <button
                  type="button"
                  data-testid="irrigation-pivot-toggle"
                  onClick={() => setIrrigationOn((v) => !v)}
                  className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-[11px] font-semibold ${
                    irrigationOn
                      ? 'border-emerald-700 bg-emerald-50 text-emerald-900'
                      : 'border-slate-200 bg-white text-slate-600'
                  }`}
                >
                  <Droplets className="h-3 w-3" />
                  <span>{irrigationOn ? 'Irrigation On' : 'Rainfed Only'}</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
