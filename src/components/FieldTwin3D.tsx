import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { ChevronDown, ChevronUp, Droplets, Layers } from 'lucide-react';
import type {
  CropVisualArchetype,
  FarmParcelProfile,
  NasaPowerSummary,
  RotationSimulationResult,
} from '../lib/agronomy';

interface FieldTwin3DProps {
  parcel: FarmParcelProfile;
  nasa: NasaPowerSummary;
  simulation: RotationSimulationResult;
  activeYearIndex: number;
  onSelectYearIndex: (index: number) => void;
}

type CameraPresetId = 'overview' | 'strata' | 'canopy' | 'tower';

const CAMERA_PRESETS: Record<
  CameraPresetId,
  { label: string; pos: [number, number, number]; target: [number, number, number] }
> = {
  overview: { label: 'Parcel Overview', pos: [15.5, 9.6, 16.5], target: [0, -0.3, 0] },
  strata: { label: 'Soil Strata', pos: [14.5, 2.2, 14.5], target: [0, -1.65, 0] },
  canopy: { label: 'Crop Canopy', pos: [6.8, 3.1, 7.6], target: [0, 0.9, 0] },
  tower: { label: 'NASA Flux Tower', pos: [-2.2, 5.2, 7.4], target: [-6.1, 2.5, -6.1] },
};

// Pre-allocated scratch helpers outside animation loop (zero GC)
const _dummy = new THREE.Object3D();
const _color = new THREE.Color();
const _presetPos = new THREE.Vector3();
const _presetTarget = new THREE.Vector3();

function groundHeightAt(x: number, z: number): number {
  return Math.sin(x * 0.16) * Math.cos(z * 0.16) * 0.14;
}

function createProceduralSoilTexture(moisture: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const wetDarken = Math.round(moisture * 28);
    const r = Math.max(48, 108 - wetDarken);
    const g = Math.max(36, 82 - wetDarken);
    const b = Math.max(24, 58 - Math.round(wetDarken * 0.6));
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(0, 0, 256, 256);

    // Furrow striations & soil aggregate speckles
    for (let y = 0; y < 256; y += 8) {
      ctx.fillStyle = y % 16 === 0 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.09)';
      ctx.fillRect(0, y, 256, 3);
    }
    for (let i = 0; i < 1800; i++) {
      const px = (i * 73) % 256;
      const py = (i * 137) % 256;
      ctx.fillStyle = i % 3 === 0 ? 'rgba(30,20,10,0.18)' : 'rgba(190,150,110,0.12)';
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

  // 1. Concrete footing pad
  const pad = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.16, 1.1), concreteMat);
  pad.position.y = 0.08;
  pad.castShadow = true;
  pad.receiveShadow = true;
  group.add(pad);

  // 2. Primary triangular mast legs (3 columns)
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

  // 3. Cross-brace instrumentation collars
  for (const cy of [1.2, 2.4, 3.6]) {
    const collar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.28, 0.08, 6),
      aluminumMat
    );
    collar.position.y = cy;
    group.add(collar);
  }

  // 4. Tilted Photovoltaic Solar Array
  const solarPanel = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.05, 0.62), solarMat);
  solarPanel.position.set(0.38, 2.15, 0.32);
  solarPanel.rotation.x = 0.52;
  solarPanel.castShadow = true;
  group.add(solarPanel);

  // 5. Weatherproof Telemetry Logger Enclosure
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.46, 0.26), accentMat);
  box.position.set(-0.28, 1.5, 0.14);
  box.castShadow = true;
  group.add(box);

  // 6. Eddy-Covariance Sensor Crossbar & Sonic Anemometer Head
  const boom = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.06, 0.06), aluminumMat);
  boom.position.set(0.3, 4.1, 0);
  group.add(boom);

  const sensorDome = new THREE.Mesh(
    new THREE.SphereGeometry(0.14, 14, 10),
    accentMat
  );
  sensorDome.position.set(0.82, 4.24, 0);
  group.add(sensorDome);

  // 7. Top Telemetry Whip Antenna
  const whip = new THREE.Mesh(
    new THREE.CylinderGeometry(0.015, 0.025, 0.85, 6),
    aluminumMat
  );
  whip.position.set(0, 4.95, 0);
  group.add(whip);

  return group;
}

// Composite 6-part Center-Pivot Irrigation Span (bottom-center pivot at x=6.2, z=6.2)
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

  // 1. Center turret concrete & riser
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

  // 2. Main water boom stretching 10.5m across parcel
  const boom = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.08, 10.4, 10),
    galvMat
  );
  boom.rotation.z = Math.PI / 2;
  boom.position.set(-5.2, 2.25, 0);
  boom.castShadow = true;
  group.add(boom);

  // 3 & 4. Two wheeled bogie towers
  for (const tx of [-4.2, -8.8]) {
    const legA = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.25, 0.08), galvMat);
    legA.position.set(tx, 1.15, -0.45);
    legA.rotation.x = 0.2;
    group.add(legA);

    const legB = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.25, 0.08), galvMat);
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

  // 5. Suspended drop-nozzles along boom
  for (let i = 1; i <= 7; i++) {
    const nx = -i * 1.35;
    const drop = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.025, 0.75, 6),
      valveMat
    );
    drop.position.set(nx, 1.85, 0);
    group.add(drop);
  }

  // 6. Control beacon cap
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
  const [exploded, setExploded] = useState(0.55);
  const [irrigationOn, setIrrigationOn] = useState(
    parcel.irrigationAccess !== 'rainfed'
  );
  const [cameraPreset, setCameraPreset] = useState<CameraPresetId>('overview');
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [isSoftwareGlFlag, setIsSoftwareGlFlag] = useState(false);
  const [canvasReady, setCanvasReady] = useState(false);

  const clampedYearIdx = Math.max(
    0,
    Math.min(simulation.steps.length - 1, activeYearIndex)
  );
  const currentStep = simulation.steps[clampedYearIdx];
  const activeCrop = currentStep?.primaryCrop;

  // Refs synced to Three.js scene without tearing down renderer
  const sceneStateRef = useRef({
    explodedTarget: exploded,
    irrigationOn,
    moisture: currentStep?.projectedRootMoisture ?? nasa.meanRootMoisture,
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
    sceneStateRef.current.irrigationOn = irrigationOn;
    sceneStateRef.current.moisture =
      currentStep?.projectedRootMoisture ?? nasa.meanRootMoisture;
    sceneStateRef.current.archetype = activeCrop?.archetype ?? 'maize';
    sceneStateRef.current.rootDepthM = activeCrop?.rootDepthM ?? 1.2;
    sceneStateRef.current.cropColorHex = activeCrop?.colorHex ?? '#16a34a';
    sceneStateRef.current.requestRender();
  }, [
    exploded,
    irrigationOn,
    currentStep,
    nasa.meanRootMoisture,
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'h') {
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
    scene.fog = new THREE.FogExp2(horizonHex, 0.014);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    scene.environment = pmremGenerator.fromScene(
      new RoomEnvironment(),
      0.04
    ).texture;
    pmremGenerator.dispose();

    const camera = new THREE.PerspectiveCamera(
      44,
      (mount.clientWidth || 960) / (mount.clientHeight || 560),
      0.1,
      140
    );
    camera.position.set(...CAMERA_PRESETS.overview.pos);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(...CAMERA_PRESETS.overview.target);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.06;
    controls.maxPolarAngle = Math.PI * 0.49;
    controls.minDistance = 4;
    controls.maxDistance = 38;

    // 4. Warm Key Light + Cool Hemisphere Fill
    const hemiLight = new THREE.HemisphereLight(0xcfe8ff, 0x4b3d2b, 0.85);
    scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(0xfff1d6, 2.1);
    sunLight.position.set(16, 22, 12);
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

    // 5. Continuous Valley Floor & Natural Perimeter Shelterbelt (below soil monolith so O/A, B, C strata remain visible)
    const outerGroundGeo = new THREE.PlaneGeometry(150, 150, 32, 32);
    outerGroundGeo.rotateX(-Math.PI / 2);
    const outerPos = outerGroundGeo.attributes.position;
    for (let i = 0; i < outerPos.count; i++) {
      const gx = outerPos.getX(i);
      const gz = outerPos.getZ(i);
      const dist = Math.hypot(gx, gz);
      const slope =
        dist < 13.5
          ? -3.65
          : -3.65 + Math.min(4.2, (dist - 13.5) * 0.16) + Math.sin(gx * 0.12) * Math.cos(gz * 0.12) * 0.35;
      outerPos.setY(i, slope);
    }
    outerGroundGeo.computeVertexNormals();
    const outerGroundMat = new THREE.MeshStandardMaterial({
      color: 0xb6c4ad,
      roughness: 0.92,
      metalness: 0.0,
    });
    const outerGround = new THREE.Mesh(outerGroundGeo, outerGroundMat);
    outerGround.receiveShadow = true;
    scene.add(outerGround);

    // Subtle aquifer water table plane beneath bedrock C-horizon
    const aquiferMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(24, 24),
      new THREE.MeshStandardMaterial({
        color: 0x0284c7,
        roughness: 0.2,
        metalness: 0.15,
        transparent: true,
        opacity: 0.42,
      })
    );
    aquiferMesh.rotation.x = -Math.PI / 2;
    aquiferMesh.position.y = -3.6;
    scene.add(aquiferMesh);

    // Natural perimeter windbreak trees & boulders around distant rim
    const trunkGeo = new THREE.CylinderGeometry(0.14, 0.22, 1.4, 7);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5c4033, roughness: 0.9 });
    const crownGeo = new THREE.DodecahedronGeometry(0.82, 1);
    const crownMat = new THREE.MeshStandardMaterial({ color: 0x4d7c0f, roughness: 0.78 });
    const TREE_COUNT = 24;
    const treeTrunks = new THREE.InstancedMesh(trunkGeo, trunkMat, TREE_COUNT);
    const treeCrowns = new THREE.InstancedMesh(crownGeo, crownMat, TREE_COUNT);
    for (let i = 0; i < TREE_COUNT; i++) {
      const ang = (i / TREE_COUNT) * Math.PI * 2;
      const rad = 21 + (i % 3) * 3.2;
      const tx = Math.cos(ang) * rad;
      const tz = Math.sin(ang) * rad;
      const ty = -3.65 + Math.min(4.2, (rad - 13.5) * 0.16);
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
      _color.setHex(0x4d7c0f).offsetHSL(((i % 5) - 2) * 0.02, 0, ((i % 3) - 1) * 0.04);
      treeCrowns.setColorAt(i, _color);
    }
    treeTrunks.computeBoundingSphere();
    treeCrowns.computeBoundingSphere();
    if (treeCrowns.instanceColor) treeCrowns.instanceColor.needsUpdate = true;
    scene.add(treeTrunks);
    scene.add(treeCrowns);

    // 6. Active Agricultural Parcel Topsoil & Exploded Soil Horizons (O/A, B, C)
    const soilTex = createProceduralSoilTexture(sceneStateRef.current.moisture);
    soilTex.anisotropy = renderer.capabilities.getMaxAnisotropy();

    const topsoilGeo = new THREE.BoxGeometry(14.6, 0.44, 14.6, 16, 1, 16);
    const topsoilMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: soilTex,
      roughness: 0.88,
      metalness: 0.02,
    });
    const topsoilSlab = new THREE.Mesh(topsoilGeo, topsoilMat);
    topsoilSlab.position.y = -0.22;
    topsoilSlab.receiveShadow = true;
    topsoilSlab.castShadow = true;
    scene.add(topsoilSlab);

    const horizonBMat = new THREE.MeshStandardMaterial({
      color: 0x8b5a3c,
      roughness: 0.82,
      metalness: 0.04,
    });
    const horizonBSlab = new THREE.Mesh(
      new THREE.BoxGeometry(14.5, 0.72, 14.5),
      horizonBMat
    );
    horizonBSlab.position.y = -0.84;
    horizonBSlab.receiveShadow = true;
    horizonBSlab.castShadow = true;
    scene.add(horizonBSlab);

    const horizonCMat = new THREE.MeshStandardMaterial({
      color: 0x64748b,
      roughness: 0.9,
      metalness: 0.08,
    });
    const horizonCSlab = new THREE.Mesh(
      new THREE.BoxGeometry(14.4, 0.82, 14.4),
      horizonCMat
    );
    horizonCSlab.position.y = -1.72;
    horizonCSlab.receiveShadow = true;
    scene.add(horizonCSlab);

    // Root-zone moisture veins (TubeGeometry attached across O/A and B strata)
    const rootGroup = new THREE.Group();
    const rootMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      roughness: 0.25,
      metalness: 0.15,
      emissive: 0x0284c7,
      emissiveIntensity: 0.35,
    });
    for (let i = 0; i < 12; i++) {
      const rx = ((i % 4) - 1.5) * 3.4;
      const rz = (Math.floor(i / 4) - 1) * 4.2;
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(rx, -0.4, rz),
        new THREE.Vector3(rx + 0.45, -1.05, rz - 0.3),
        new THREE.Vector3(rx - 0.25, -1.75, rz + 0.35),
      ]);
      const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 10, 0.075, 7, false), rootMat);
      rootGroup.add(tube);
    }
    scene.add(rootGroup);

    // 7. Grounded Hero Props: NASA Flux Tower & Center-Pivot Irrigation Rig
    const shadowTex = createContactShadowTexture();
    const makeContactDisc = (radius: number, x: number, z: number) => {
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
      disc.position.set(x, 0.015, z);
      return disc;
    };

    const fluxTower = buildNasaFluxTower();
    fluxTower.position.set(-6.1, groundHeightAt(-6.1, -6.1), -6.1);
    scene.add(fluxTower);
    scene.add(makeContactDisc(1.1, -6.1, -6.1));

    const irrigationRig = buildIrrigationRig();
    irrigationRig.position.set(6.0, groundHeightAt(6.0, 6.0), 6.0);
    irrigationRig.rotation.y = 0.55;
    scene.add(irrigationRig);
    scene.add(makeContactDisc(1.0, 6.0, 6.0));

    // 8. InstancedMesh Crop Field (144 plants = 12x12 grid, stalks + canopy heads)
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
    let lastMoistureSnapshot = -1;

    const rebuildCropInstances = () => {
      const arch = sceneStateRef.current.archetype;
      const baseHex = sceneStateRef.current.cropColorHex;

      const archProfile: Record<
        CropVisualArchetype,
        { stalkH: number; stalkW: number; headY: number; headScale: [number, number, number]; stalkHex: number }
      > = {
        maize: { stalkH: 1.55, stalkW: 1.15, headY: 1.48, headScale: [1.1, 1.3, 1.1], stalkHex: 0x3f6212 },
        sorghum_millet: { stalkH: 1.25, stalkW: 1.0, headY: 1.18, headScale: [0.85, 1.15, 0.85], stalkHex: 0x4d7c0f },
        soybean: { stalkH: 0.55, stalkW: 0.85, headY: 0.45, headScale: [1.55, 0.8, 1.55], stalkHex: 0x15803d },
        wheat_rye: { stalkH: 0.88, stalkW: 0.65, headY: 0.84, headScale: [0.55, 1.1, 0.55], stalkHex: 0x65a30d },
        clover_alfalfa: { stalkH: 0.35, stalkW: 0.9, headY: 0.28, headScale: [1.75, 0.58, 1.75], stalkHex: 0x059669 },
        sunflower: { stalkH: 1.38, stalkW: 1.05, headY: 1.35, headScale: [1.35, 0.45, 1.35], stalkHex: 0x365314 },
      };

      const cfg = archProfile[arch];
      for (let i = 0; i < COUNT; i++) {
        const row = Math.floor(i / GRID);
        const col = i % GRID;
        const x = (col - (GRID - 1) / 2) * 1.02 + ((row % 2) * 0.14 - 0.07);
        const z = (row - (GRID - 1) / 2) * 1.02;
        const gy = groundHeightAt(x, z);
        const jitter = 0.85 + (((i * 19) % 11) / 10) * 0.3; // ±15% height variation

        _dummy.position.set(x, gy, z);
        _dummy.rotation.set(0, (i * 0.618) % (Math.PI * 2), 0);
        _dummy.scale.set(cfg.stalkW, cfg.stalkH * jitter, cfg.stalkW);
        _dummy.updateMatrix();
        stalkMesh.setMatrixAt(i, _dummy.matrix);
        _color.setHex(cfg.stalkHex).offsetHSL(((i % 5) - 2) * 0.012, 0, ((i % 3) - 1) * 0.03);
        stalkMesh.setColorAt(i, _color);

        _dummy.position.set(x, gy + cfg.headY * jitter, z);
        _dummy.scale.set(
          cfg.headScale[0] * jitter,
          cfg.headScale[1] * jitter,
          cfg.headScale[2] * jitter
        );
        _dummy.updateMatrix();
        headMesh.setMatrixAt(i, _dummy.matrix);
        _color.set(baseHex).offsetHSL(((i % 7) - 3) * 0.01, 0, ((i % 3) - 1) * 0.04);
        headMesh.setColorAt(i, _color);
      }

      stalkMesh.instanceMatrix.needsUpdate = true;
      if (stalkMesh.instanceColor) stalkMesh.instanceColor.needsUpdate = true;
      headMesh.instanceMatrix.needsUpdate = true;
      if (headMesh.instanceColor) headMesh.instanceColor.needsUpdate = true;
      stalkMesh.computeBoundingSphere();
      headMesh.computeBoundingSphere();
    };

    rebuildCropInstances();
    lastArchetype = sceneStateRef.current.archetype;

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    // 9. On-demand coalesced rendering + software-WebGL afterDraw pacing
    let frameId = 0;
    let disposed = false;
    let renderBusy = false;
    let renderDirty = false;
    let currentExploded = sceneStateRef.current.explodedTarget;
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

        // Detect archetype or moisture updates
        if (targetState.archetype !== lastArchetype) {
          lastArchetype = targetState.archetype;
          rebuildCropInstances();
        }
        if (Math.abs(targetState.moisture - lastMoistureSnapshot) > 0.03) {
          lastMoistureSnapshot = targetState.moisture;
          horizonBMat.color.setHex(targetState.moisture > 0.55 ? 0x6f4730 : 0x8b5a3c);
        }

        // Toggle irrigation rig visibility
        irrigationRig.visible = targetState.irrigationOn;

        // Exponential damping for exploded soil strata
        const expDiff = Math.abs(targetState.explodedTarget - currentExploded);
        if (expDiff > 0.004) {
          currentExploded = THREE.MathUtils.damp(
            currentExploded,
            targetState.explodedTarget,
            8,
            dt
          );
          renderDirty = true;
        } else {
          currentExploded = targetState.explodedTarget;
        }

        horizonBSlab.position.y = -0.84 - currentExploded * 1.45;
        horizonCSlab.position.y = -1.72 - currentExploded * 2.75;
        rootGroup.scale.y = Math.max(0.75, targetState.rootDepthM / 1.1);
        rootGroup.position.y = -currentExploded * 0.45;

        // Exponential damping for camera presets
        if (targetState.presetTrigger.version !== seenPresetVersion) {
          seenPresetVersion = targetState.presetTrigger.version;
          presetAnimating = true;
        }
        if (presetAnimating) {
          const preset = CAMERA_PRESETS[targetState.presetTrigger.id];
          _presetPos.set(...preset.pos);
          _presetTarget.set(...preset.target);
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
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      soilTex.dispose();
      shadowTex.dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <div
      className="relative h-[calc(100vh-148px)] min-h-[540px] w-full overflow-hidden bg-slate-100"
      data-active-year={clampedYearIdx + 1}
      data-exploded={exploded.toFixed(2)}
      data-crop-id={activeCrop?.id ?? 'unknown'}
      data-is-software-gl={String(isSoftwareGlFlag)}
      data-canvas-ready={String(canvasReady)}
    >
      {/* Dedicated empty WebGL mount container */}
      <div ref={canvasMountRef} className="h-full w-full" />

      {/* Minimal Top-Left Spec Header (never uses backdrop-filter over WebGL) */}
      <div className="pointer-events-none absolute left-4 top-4 z-10 max-w-sm rounded-xl border border-slate-200 bg-white/95 px-4 py-3 shadow-sm">
        <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-500">
          3D Soil-Horizon & Crop Digital Twin
        </p>
        <h1 className="mt-0.5 font-display text-sm font-bold text-slate-950">
          {parcel.name} · Year {clampedYearIdx + 1}: {activeCrop?.name}
        </h1>
        <p className="mt-0.5 font-mono text-[11px] tabular-nums text-slate-600">
          Root {activeCrop?.rootDepthM}m · GWETROOT{' '}
          {Math.round((currentStep?.projectedRootMoisture ?? nasa.meanRootMoisture) * 100)}% · Soil SOC{' '}
          {parcel.baselineOrganicCarbon}%
        </p>
      </div>

      {/* Collapsible Bottom Control Dock (<= 15% viewport height, no backdrop-filter) */}
      <div className="pointer-events-none absolute bottom-4 left-1/2 z-20 flex w-[min(940px,94vw)] -translate-x-1/2 flex-col items-center">
        <button
          type="button"
          onClick={() => setDockCollapsed((v) => !v)}
          className="pointer-events-auto mb-1.5 inline-flex items-center gap-1 rounded-t-lg border border-slate-300 bg-white/95 px-3 py-1 text-[11px] font-semibold text-slate-800 shadow-xs hover:bg-slate-50"
        >
          {dockCollapsed ? (
            <>
              <ChevronUp className="h-3.5 w-3.5" />
              <span>Show Controls</span>
            </>
          ) : (
            <>
              <ChevronDown className="h-3.5 w-3.5" />
              <span>Hide Controls (H)</span>
            </>
          )}
        </button>

        {!dockCollapsed && (
          <div className="pointer-events-auto flex w-full flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-300 bg-white/95 px-4 py-2.5 shadow-lg">
            {/* Rotation Year Switcher */}
            <div className="flex items-center gap-1">
              {simulation.steps.map((s, idx) => (
                <button
                  key={s.year}
                  type="button"
                  data-twin-year={s.year}
                  onClick={() => onSelectYearIndex(idx)}
                  className={`rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors ${
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
              <span>Soil Strata</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={exploded}
                onChange={(e) => setExploded(Number(e.target.value))}
                className="w-24 accent-amber-700"
              />
            </label>

            {/* Camera Presets & Irrigation Toggle */}
            <div className="flex flex-wrap items-center gap-1.5">
              {(Object.keys(CAMERA_PRESETS) as CameraPresetId[]).map((pid) => (
                <button
                  key={pid}
                  type="button"
                  onClick={() => handleSelectPreset(pid)}
                  className={`rounded-md border px-2 py-1 text-[11px] font-medium ${
                    cameraPreset === pid
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {CAMERA_PRESETS[pid].label}
                </button>
              ))}

              <button
                type="button"
                onClick={() => setIrrigationOn((v) => !v)}
                className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-[11px] font-semibold ${
                  irrigationOn
                    ? 'border-sky-700 bg-sky-50 text-sky-800'
                    : 'border-slate-200 bg-white text-slate-600'
                }`}
              >
                <Droplets className="h-3 w-3" />
                <span>{irrigationOn ? 'Pivot On' : 'Pivot Off'}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
