# TerraShift — NASA Earth Observation & Multi-Mission Crop Rotation Workbench

Built for the **NASA Space Apps Challenge 2026: "Field Shift: Adapting Farms with NASA Data"**, **TerraShift** is a full-stack precision agriculture and climate-adaptation decision workbench. It fuses **22 official NASA, USDA, USGS, and FAO Earth observation datasets** with an interactive **3D SRTM Terrain & 5-Layer Soil Water Cutaway Digital Twin**, **Recharts & D3.js multi-year agroclimatic trend visualizers**, a **multi-objective Crop Rotation Optimizer**, **Cloud SQL (PostgreSQL) persistence**, and **Google Workspace (Sheets, Docs, Forms) exports**.

---

## Key Features & Modules

### 1. Field Observatory (`src/components/FieldObservatory.tsx`)
- **Zero-Lag Google Maps Satellite & Terrain Explorer**:
  - Uses an uncontrolled `<Map defaultCenter defaultZoom gestureHandling="greedy">` with a dedicated `MapCameraController` (`useMap().panTo`) so cursor dragging and panning run natively at 60fps without React re-render jitter.
  - **Unified Agricultural Location Omnibox**: Combines live **Google Places API (New)** (`AutocompleteSuggestion.fetchAutocompleteSuggestions` + `AutocompleteSessionToken`), instant decimal/DMS coordinate parsing (`parseCoordinateQuery`, e.g. `36.74, -119.77` or `42.03°N 93.63°W`), a curated 12-region global agricultural directory (`searchAgriculturalDirectory`), keyboard shortcuts (`/` to focus, `ArrowUp`/`ArrowDown`/`Enter`/`Escape`), quick-jump valley chips, and browser GPS (`My GPS`).
- **Live NASA POWER Agroclimatology (`AG` Community, 2021–2025)**:
  - Server-side proxy (`/api/nasa/power`) queries 60 monthly observations of `T2M` (2m Air Temperature), `PRECTOTCORR` (Bias-Corrected Precipitation), `ALLSKY_SFC_SW_DWN` (Solar Irradiance), `GWETROOT` (Root-Zone Soil Wetness 0–100 cm), `GWETTOP` (Surface Soil Wetness 0–5 cm), and `RH2M` (Relative Humidity).
- **Recharts 5-Year Soil Moisture & Nutrient Depletion Trend Chart**:
  - Visualizes 60-month trajectories (`deriveFiveYearSoilNutrientTrends`) of **Root-Zone Soil Moisture (`GWETROOT %`)**, toggleable **Surface Soil Moisture (`GWETTOP %`)**, and the **Cumulative Nutrient Depletion Index (`%`)** against drought-stress (`38%`) and nutrient-exhaustion (`65%`) thresholds.
- **Tactical Grounding & Hyperlocal Weather**:
  - Proxied 5-day Google Weather forecast (`/api/maps/weather`), fast 3-point agronomic field checks (`/api/ai/quick-check`), live Google Search-grounded regional extension bulletins (`/api/ai/grounding-search`), and Google Maps-grounded local soil testing labs and seed co-ops (`/api/ai/grounding-maps`).

---

### 2. Multi-Mission Earth Observation & 22-Dataset Fusion Suite (`src/components/NasaMultiSourcePanel.tsx`, `src/lib/nasaResources.ts`)
Integrates all **22 official NASA & Partner Agency resources** from the Space Apps "Field Shift" specification via `/api/nasa/multi-source`:

| Category | Integrated Datasets & Missions | Agronomic & Physical Metrics Derived |
| :--- | :--- | :--- |
| **NASA Satellite Missions (8)** | **NASA POWER**, **SMAP L4**, **GPM IMERG**, **Landsat 8/9**, **MODIS/VIIRS**, **SRTM 30m/90m DEM**, **ECOSTRESS**, **GEDI Lidar** | Live **NASA GIBS WMS** satellite tiles (7 selectable layers), 5-horizon soil moisture assimilation (`0–81 cm`), land-surface temperature (`LST`), canopy ΔT, slope `%`, aspect, RUSLE `LS` erosion factor, canopy biomass (`Mg/ha`) |
| **Spectral & Evapotranspiration (3)** | **Harmonized Landsat-Sentinel-2 (HLS)**, **OpenET / FAO-56 Penman-Monteith**, **NLDAS-2 / GLDAS** | `NDVI`, `NDWI`, `NDMI`, `EVI2` spectral indices, daily reference evapotranspiration (`ET₀ mm/day`), seasonal crop water demand, Evaporative Stress Index (`ESI`), vapor pressure deficit (`VPD kPa`) |
| **USDA Soil & Cropland Intelligence (5)** | **USDA CDL (CropScape)**, **Web Soil Survey (WSS)**, **NRCS SSURGO / STATSGO2**, **USDA NAIP (1m)**, **USDA Ag Data Commons** | Live CONUS Albers Equal-Area (`EPSG:5070`) CropScape queries, Hydrologic Soil Group (`A/B/C/D`), drainage class, available water capacity (`AWC`), bulk density, bare-soil exposure, conservation tillage compatibility |
| **Climate, Hydrology & Markets (6)** | **PRISM Climate Group**, **USGS NLCD**, **USGS NWIS Groundwater**, **CoCoRaHS**, **FAO GAEZ v4**, **USDA AMS Market News & NASS QuickStats** | 30-year climate normals, frost-free days, USGS piezometer water-table depth (`m`), agro-ecological suitability index (`0–100`), commodity prices (`$/bu` or `$/t`), and estimated rotation gross revenue (`$/ha`) |

---

### 3. 3D SRTM Terrain, 5-Layer Soil Cutaway & Soil Water Level Twin (`src/components/FieldTwin3D.tsx`)
A hardware- and software-WebGL optimized Three.js digital twin (`buildTerrainAndSoilProfile3D`) designed so farmers can immediately understand their land's 3D topography, underground soil horizons, and water level:

- **Real 3D Location Terrain (`7×7` SRTM DEM Grid)**:
  - Queries a 49-point (`7×7`, `~1.6 km × 1.6 km`) SRTM elevation grid around the active farm parcel and bilinearly displaces (`sampleBilinearTerrainHeight`, `deformBoxToTerrainRelief`) the 3D topsoil, subsurface horizons, 3D elevation contour lines, 144 instanced crop stalks/heads, 36 branching 3D root systems (`TubeGeometry`), the NASA Eddy-Covariance Flux Tower, and the Center-Pivot Irrigation Rig.
- **How the Land Is Divided into Layers (`0 cm` to `-200 cm`)**:
  1. **`O / A Horizon` (`0 – 25 cm`, Topsoil & Seedbed)**: Dark organic humus and cultivated furrow seedbed for germination and rainfall infiltration.
  2. **`B Horizon` (`25 – 80 cm`, Active Root Subsoil)**: Clay-loam mineral horizon storing seasonal moisture and supplying ~70% of crop uptake.
  3. **`Soil Water Level` (`-22 cm` to `-176 cm`, Capillary Water Table)**: Dynamic 3D underground water volume (`waterVolumeMesh`), front-right cutaway water window (`waterWindowMesh`), and glowing 3D meniscus ribbon (`meniscusBandMesh` + `waterRingLine`) showing the exact depth where soil pores are saturated.
  4. **`C Horizon` (`80 – 150 cm`, Deep Taproot Substratum)**: Weathered sandy-gravel substratum tapped by deep-rooting rotation crops (alfalfa, sunflower, sorghum, chickpea) during drought.
  5. **`R Horizon` (`150 – 200 cm`, Parent Bedrock & Perched Aquifer)**: Fractured bedrock floor supporting the deep perched groundwater table.
- **Farmer-Focused Interactive Inspection**:
  - **3D Stratigraphic Depth Ruler & Sight-Glass Piezometer Standpipe**: Positioned along the right cutaway wall (`0 cm` to `-200 cm`) with a rising blue water column and floating level ring.
  - **0–200 cm Cross-Section Diagram & Plain-English Inspector**: Shows scaled soil horizons, moisture `%`, dashed crop root reach (`🌱 Roots -95cm`), rising water column (`💧 -104cm`), and a plain-English status badge (`ROOTS REACH WATER` vs. `WATER BELOW ROOTS`).
  - **X-Ray Water Mode & Layer Separation Slider**: Toggles glass-translucent soil layers (`depthWrite: false`) to reveal the 3D water table and root penetration inside the ground, or separates the 4 geological layers vertically.

---

### 4. Multi-Year Crop Rotation Optimizer & D3 Climate Shift Visualizer (`src/components/RotationOptimizer.tsx`, `src/lib/agronomy.ts`)
- **Multi-Objective Agronomic Simulation Engine**:
  - Optimizes 3- or 4-year crop rotations across **Water Efficiency**, **Soil Health & Organic Carbon**, and **Yield Stability** under rainfed or irrigated conditions with optional winter cover-crop armor.
  - Prevents consecutive monoculture pest penalties, credits legume biological nitrogen fixation (`+N kg/ha`), projects year-by-year root-zone moisture vs. baseline monoculture, and renders a 6-axis resilience radar.
- **D3.js Multi-Year NASA POWER Temperature & Precipitation Trend Chart**:
  - Built with `d3` (`scaleBand`, `scaleLinear`, `line`, `area`, `curveMonotoneX`) via `deriveMultiYearClimateTrends` to visualize 5-year annual and 60-month temperature (`T2M °C`) and precipitation (`PRECTOTCORR mm`) trajectories, ordinary least-squares (OLS) linear trendlines (`°C/decade` warming rate & `mm/yr` rainfall shift), and a `30°C` reproductive heat-stress threshold.
- **AI Agronomic Adaptation Strategy Brief**:
  - Synthesizes multi-section field transition plans via `/api/ai/deep-strategy`.

---

### 5. Cloud SQL Archive & Google Workspace Integration (`src/components/WorkspaceHub.tsx`)
- **Cloud SQL (PostgreSQL) + Drizzle ORM**:
  - Authenticated persistence (verified via Firebase Admin ID tokens) across four relational tables: `users`, `farm_parcels`, `nasa_snapshots`, and `rotation_plans`.
- **Google Workspace 1P OAuth Exports**:
  - Exports structured **Google Sheets** multi-year rotation schedules, **Google Docs** agronomic adaptation briefs, and **Google Forms** farmer readiness checklists directly to the user's Google account, with confirmation modals before all external mutations.

---

## Project Structure

```text
/
├── server.ts                         # Express server + Vite dev middleware + NASA/Maps/AI/DB API routes
├── src/
│   ├── App.tsx                       # Top-level state, Firebase Auth & Google Maps APIProvider, tab routing
│   ├── main.tsx                      # React root & Google Maps auth/quota listener
│   ├── index.css                     # Tailwind CSS v4 + typography & custom scrollbar utilities
│   ├── components/
│   │   ├── TopNav.tsx                # Navigation bar & Google Sign-In
│   │   ├── FieldObservatory.tsx      # Uncontrolled Google Map, Unified Omnibox, NASA KPIs, Recharts 5-yr chart
│   │   ├── NasaMultiSourcePanel.tsx  # 22-dataset NASA/USDA/USGS/FAO Explorer & live NASA GIBS WMS viewer
│   │   ├── FieldTwin3D.tsx           # Three.js 3D SRTM terrain, 5-layer soil cutaway & 3D water table twin
│   │   ├── RotationOptimizer.tsx     # Crop rotation simulator, D3 multi-year climate chart, radar & AI brief
│   │   ├── WorkspaceHub.tsx          # Cloud SQL farm archive + Google Sheets / Docs / Forms exports
│   │   └── ConfirmDialog.tsx         # Accessible confirmation modal for destructive/external actions
│   ├── db/
│   │   ├── index.ts                  # PostgreSQL Pool & Drizzle ORM instance
│   │   ├── schema.ts                 # Drizzle schema: users, farm_parcels, nasa_snapshots, rotation_plans
│   │   ├── farms.ts                  # Database query helpers
│   │   └── drizzle.config.ts         # Drizzle Kit configuration
│   ├── middleware/
│   │   └── auth.ts                   # Firebase Admin Bearer token verification & user upsert
│   └── lib/
│       ├── agronomy.ts               # NASA POWER parser, crop catalog, rotation optimizer, Recharts/D3 series, Omnibox search
│       ├── agronomy.test.ts          # Unit tests for agronomy, Recharts/D3 trends, coordinates & directory search
│       ├── nasaResources.ts          # 22-dataset fusion engine, EPSG:5070 projection, SRTM slope, GIBS WMS, 3D terrain/water profile
│       ├── nasaResources.test.ts     # Unit tests for EPSG:5070, SRTM terrain, GIBS WMS, 22-dataset synthesis & 3D profile
│       ├── api.ts                    # Typed frontend client for backend endpoints
│       ├── firebase.ts               # Client Firebase Web SDK initialization
│       ├── firebase-admin.ts         # Server Firebase Admin SDK initialization
│       └── workspaceApi.ts           # Client-side Google Sheets, Docs & Forms REST API helpers
└── package.json
```

---

## API Reference

| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/health` | Public | Server health status |
| `GET` | `/api/maps/client-config` | Public | Returns client Google Maps API key configuration |
| `GET` | `/api/nasa/power?lat=&lng=` | Public | Fetches & caches 5-year (60-month) NASA POWER `AG` point telemetry |
| `GET` | `/api/nasa/multi-source?lat=&lng=` | Public | Parallel proxy for Open-Meteo ERA5/SMAP 5-layer soil moisture + `ET₀`, 49-point (`7×7`) SRTM elevation grid, USDA NASS CDL (`EPSG:5070`), and USGS NWIS groundwater |
| `GET` | `/api/maps/weather?lat=&lng=` | Public | Proxies Google Weather current conditions & 5-day forecast |
| `POST` | `/api/ai/quick-check` | Public | Fast 3-point field posture check (`gemini-3.1-flash-lite-preview`) |
| `POST` | `/api/ai/deep-strategy` | Public | Multi-section agronomic adaptation strategy brief |
| `POST` | `/api/ai/grounding-search` | Public | Live Google Search-grounded regional extension bulletins |
| `POST` | `/api/ai/grounding-maps` | Public | Live Google Maps-grounded nearby soil testing labs & ag co-ops |
| `GET` | `/api/farms` | Firebase Bearer | Lists authenticated user's saved farm parcels, snapshots & rotation plans |
| `POST` | `/api/farms` | Firebase Bearer | Saves a farm parcel and its NASA POWER telemetry snapshot to Cloud SQL |
| `DELETE` | `/api/farms/:id` | Firebase Bearer | Deletes a saved farm parcel from Cloud SQL |
| `POST` | `/api/rotations` | Firebase Bearer | Saves an optimized multi-year crop rotation plan to Cloud SQL |
| `PATCH` | `/api/rotations/:id/exports` | Firebase Bearer | Records exported Google Sheets, Docs, or Forms URLs on a saved rotation plan |

---

## Environment Variables

See `.env.example` for required runtime configuration (never commit real keys):

- `GEMINI_API_KEY` — Server-side Gemini API key for agronomic synthesis and search/maps grounding.
- `DATABASE_URL` — PostgreSQL connection string for Cloud SQL persistence.
- `GOOGLE_MAPS_API_KEY` / `VITE_GOOGLE_MAPS_API_KEY` — Google Maps Platform key (Maps JavaScript API, Places API New, Weather API).
- `APP_URL` — Public application origin URL.

---

## Development & Verification Commands

```bash
# Install dependencies
npm install

# Run all 13 unit tests (agronomy + 22 NASA resources + 3D terrain/water profile)
npm test

# Type-check TypeScript across client and server
npm run lint

# Build production client bundle
npm run build

# Start full-stack Express + Vite server on port 3000
npm run dev
```
