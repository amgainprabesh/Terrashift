# TerraShift — NASA Earth Observation Crop Rotation Workbench

Built for the **NASA Space Apps Challenge 2026: "Field Shift: Adapting Farms with NASA Data"**, TerraShift helps farmers, agronomists, and agricultural extension planners evaluate farm-scale climate exposure using live NASA Earth observation climatology and design multi-year, soil-regenerative crop rotations.

---

## Core Capabilities

### 1. Field Observatory (Satellite Telemetry & Hyperlocal Weather)
- **Interactive Satellite & Terrain Map**: Powered by Google Maps Platform (`@vis.gl/react-google-maps`) with `PlaceAutocompleteElement` location search, 5 benchmark agricultural regions (Iowa Corn Belt, California Central Valley, Punjab Wheat-Rice Belt, Mato Grosso Cerrado, East African Rift), and custom latitude/longitude coordinate inspection.
- **Live NASA POWER Agroclimatology (`AG` Community)**: Server-side proxy (`/api/nasa/power`) queries 2021–2025 monthly point climatology from `https://power.larc.nasa.gov/api/temporal/monthly/point` with a 15-minute cache and deterministic latitude-aware fallback if upstream telemetry is temporarily unreachable:
  - `T2M` — 2-meter Air Temperature (°C, plus warming shift & peak summer stress)
  - `PRECTOTCORR` — Bias-corrected Total Precipitation (mm/yr & inter-annual variability CV%)
  - `ALLSKY_SFC_SW_DWN` — All-sky Surface Shortwave Downward Irradiance (MJ/m²/day)
  - `GWETROOT` — Root-zone Soil Wetness (0–100 cm fraction)
  - `GWETTOP` — Surface Soil Wetness (0–5 cm fraction)
  - `RH2M` — 2-meter Relative Humidity (%)
- **Google Weather & Grounding**: Proxied 5-day hyperlocal forecast (`/api/maps/weather`), fast field checks (`/api/ai/quick-check` via `gemini-3.1-flash-lite`), live regional agricultural extension bulletins (`/api/ai/grounding-search`), and nearby soil labs & co-op discovery (`/api/ai/grounding-maps`).

### 2. 3D Soil-Horizon & Crop Digital Twin (`FieldTwin3D`)
- Hardware-accelerated Three.js PBR WebGL scene (`RoomEnvironment`, `PMREMGenerator`, `ACESFilmicToneMapping`, warm directional key lighting, `FogExp2`, and on-demand coalesced rendering).
- **Composite Field Instrumentation**: Multi-part NASA Eddy-Covariance Flux Tower and animated Center-Pivot Irrigation Rig with droplet spray particles (active when irrigation mode is enabled).
- **Exploded Soil Horizon Inspector**: Interactive cutaway separating **O/A Topsoil**, **B Subsoil & Clay Accumulation**, **C Parent Material / Saprolite**, subsurface root-channel `TubeGeometry`, and the deeper **Aquifer / Water Table** so farmers can inspect root penetration and moisture retention year-by-year across the simulated crop rotation.

### 3. Multi-Year Crop Rotation Optimizer (`agronomy.ts`)
- Pure TypeScript simulation engine balancing user weights across **Water Efficiency**, **Soil Health & Organic Carbon**, and **Yield Stability** over 3- or 4-year horizons, rainfed vs. irrigated water access, and optional winter cover crops.
- Enforces botanical family diversification to break pest/disease cycles, models biological nitrogen fixation credits, projects 12-month root-zone moisture trajectories vs. monoculture baselines, and renders a 6-axis comparison radar alongside Gemini-synthesized adaptation briefs (`/api/ai/deep-strategy` using `gemini-4-hydrogen` with automatic `429` fallback to `gemini-3.1-flash-lite`).

### 4. Persistent Farm Archive & Google Workspace Integration
- **Cloud SQL (PostgreSQL) + Drizzle ORM**: Authenticated persistence (via Firebase Auth ID tokens) across four normalized tables (`users`, `farm_parcels`, `nasa_snapshots`, `rotation_plans`).
- **Google Workspace Exports**: Client-side OAuth integration creating structured **Google Sheets** rotation schedules, **Google Docs** agronomic briefs, and **Google Forms** farmer adaptation readiness surveys (with explicit confirmation dialogs before every external write or deletion).

---

## Architecture Overview

```text
/
├── server.ts                    # Express server + Vite SSR/HMR dev middleware + API routes
├── src/
│   ├── App.tsx                  # Top-level state, auth/APIProvider context, view routing
│   ├── main.tsx                 # Entrypoint & Google Maps quota failure listener
│   ├── components/
│   │   ├── TopNav.tsx           # Responsive navigation & Firebase Google sign-in button
│   │   ├── FieldObservatory.tsx # Google Map, PlaceAutocomplete, NASA POWER KPIs & charts
│   │   ├── FieldTwin3D.tsx      # Three.js PBR 3D soil-horizon & crop rotation twin
│   │   ├── RotationOptimizer.tsx# Multi-year rotation simulator, radar & Gemini strategy
│   │   ├── WorkspaceHub.tsx     # Cloud SQL archive + Sheets / Docs / Forms exports
│   │   └── ConfirmDialog.tsx    # Accessible confirmation modal for mutations
│   ├── db/
│   │   ├── index.ts             # PostgreSQL Pool & Drizzle client
│   │   ├── schema.ts            # users, farm_parcels, nasa_snapshots, rotation_plans
│   │   ├── farms.ts             # CRUD data access queries
│   │   └── drizzle.config.ts    # Drizzle Kit schema & connection configuration
│   ├── middleware/
│   │   └── auth.ts              # Firebase Admin token verification & user upsert
│   └── lib/
│       ├── agronomy.ts          # NASA POWER parser, crop catalog, rotation optimizer
│       ├── agronomy.test.ts     # Unit tests (node:test)
│       ├── api.ts               # Typed frontend API client
│       ├── firebase.ts          # Client Firebase Auth initialization
│       ├── firebase-admin.ts    # Server Firebase Admin initialization
│       └── workspaceApi.ts      # Client-side Sheets, Docs & Forms REST helpers
└── package.json
```

---

## Key API Endpoints

| Method | Endpoint | Auth | Purpose |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/health` | Public | Server health check |
| `GET` | `/api/maps/client-config` | Public | Supplies Google Maps API key configuration |
| `GET` | `/api/nasa/power?lat=&lng=` | Public | Fetches/caches NASA POWER `AG` monthly point climatology |
| `GET` | `/api/maps/weather?lat=&lng=` | Public | Proxies Google Weather current conditions & 5-day forecast |
| `POST` | `/api/ai/quick-check` | Public | Low-latency 3-point agronomic field check (`gemini-3.1-flash-lite`) |
| `POST` | `/api/ai/deep-strategy` | Public | Multi-section adaptation plan (`gemini-4-hydrogen` / fallback) |
| `POST` | `/api/ai/grounding-search` | Public | Google Search-grounded regional extension bulletins |
| `POST` | `/api/ai/grounding-maps` | Public | Google Maps-grounded local soil labs & ag cooperatives |
| `GET` / `POST` / `DELETE` | `/api/farms`, `/api/farms/:id` | Firebase Bearer | List, create, and delete saved farm parcels & telemetry snapshots |
| `POST` / `PATCH` | `/api/rotations`, `/api/rotations/:id/exports` | Firebase Bearer | Persist rotation plans and Workspace document links |

---

## Environment Configuration

Configure runtime secrets in `.env` (never commit secrets):

- `GEMINI_API_KEY` — Gemini API key for server-side agronomic synthesis & grounding.
- `DATABASE_URL` — PostgreSQL connection string for Cloud SQL via Drizzle ORM.
- `GOOGLE_MAPS_API_KEY` (or `VITE_GOOGLE_MAPS_API_KEY`) — Google Maps Platform key for Maps JS, Places Autocomplete, and Weather API.
- `APP_URL` — Public application origin URL.

---

## Development, Testing & Verification

```bash
# Install dependencies
npm install

# Run agronomic engine unit tests
npm test

# Type-check TypeScript
npm run lint

# Build production bundle
npm run build

# Start development / full-stack server on port 3000
npm run dev
```
