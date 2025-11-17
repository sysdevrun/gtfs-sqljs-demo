# GTFS SQL.js Demo - Project Documentation

## Project Overview

A browser-based GTFS (General Transit Feed Specification) data explorer built with React, TypeScript, and SQL.js. This application processes and visualizes static GTFS schedules and real-time transit data entirely in the browser using WebAssembly, with no backend server required.

**Live Demo:** Deployed via GitHub Pages
**Repository:** github.com/sysdevrun/gtfs-sqljs-demo

---

## Architecture

### Core Design Principles

1. **Web Worker Architecture**: Heavy GTFS data processing runs in a dedicated Web Worker to prevent UI blocking
2. **Client-Side Only**: All data processing happens in the browser using WebAssembly (SQL.js)
3. **Caching Strategy**: Multi-layer caching (IndexedDB + in-memory) for optimal performance
4. **Real-time Integration**: Combines static GTFS schedules with live GTFS-RT feeds

### Data Flow

```
User Input → App.tsx (Main Thread)
                ↓
          Comlink RPC
                ↓
    gtfs.worker.ts (Worker Thread)
                ↓
    gtfs-sqljs Library
                ↓
    SQL.js (WebAssembly SQLite)
                ↓
    Results → GtfsApiAdapter (Cache Layer)
                ↓
    UI Components
```

---

## Project Structure

```
gtfs-sqljs-demo/
├── src/
│   ├── App.tsx                    # Main application with state management
│   ├── main.tsx                   # React entry point
│   ├── gtfs.worker.ts            # Web Worker wrapping gtfs-sqljs
│   │
│   ├── components/               # Reusable UI components
│   │   ├── AgenciesList.tsx
│   │   ├── AlertsTable.tsx
│   │   ├── ConfigurationPanel.tsx
│   │   ├── LoadingProgress.tsx
│   │   ├── RouteLabel.tsx
│   │   ├── RoutesGrid.tsx
│   │   ├── StopTimesTable.tsx
│   │   ├── TripsList.tsx
│   │   ├── VehiclesTable.tsx
│   │   └── utils.ts
│   │
│   ├── tabs/                     # Feature tab components
│   │   ├── AlertsTab.tsx
│   │   ├── BrowseDataTab.tsx
│   │   ├── ConfigurationTab.tsx
│   │   ├── DeparturesTab.tsx
│   │   ├── DeparturesV2Tab.tsx
│   │   ├── MapTab.tsx
│   │   └── TimetablesTab.tsx
│   │
│   ├── utils/
│   │   ├── GtfsApiAdapter.ts    # Caching layer for sync data access
│   │   └── configStorage.ts     # LocalStorage configuration
│   │
│   └── types/
│       └── GtfsApi.ts           # TypeScript type definitions
│
├── public/
│   ├── sql-wasm.wasm            # SQL.js WebAssembly binary
│   └── car-jaune-1er-dec-2025.zip  # Sample GTFS data
│
├── dist/                         # Build output
├── index.html                    # HTML entry point
├── package.json
├── vite.config.ts               # Vite bundler configuration
├── tsconfig.json                # TypeScript strict mode config
└── DEPARTURE_BOARD_ANALYSIS.md  # Performance analysis docs
```

---

## GTFS Data Fetching

### Data Sources

#### GTFS Static Feeds (ZIP Files)
- **Default:** `https://pysae.com/api/v2/groups/car-jaune/gtfs/pub`
- **Built-in Presets:** 9 French transit agencies (Car Jaune, Irigo, Kar'Ouest, Alternéo, etc.)
- **Local File:** `/car-jaune-1er-dec-2025.zip` (940KB sample)
- **CORS Proxy:** All URLs proxied through `https://gtfs-proxy.sys-dev-run.re/proxy/`

#### GTFS-RT Feeds (Real-time)
- **Default:** `https://pysae.com/api/v2/groups/car-jaune/gtfs-rt`
- **Format:** Protocol Buffers
- **Feed Types:** Vehicle Positions, Trip Updates, Service Alerts
- **Update Interval:** 5 seconds (configurable)

### Core Library: gtfs-sqljs

**Package:** `github:sysdevrun/gtfs-sqljs#7cfd31560795daa6e77c04561363d601feba8c94`

**Key Features:**
- Downloads and extracts GTFS ZIP files
- Parses CSV files using PapaParse
- Builds SQLite database in WebAssembly
- Fetches and merges GTFS-RT data
- IndexedDB caching
- Progress reporting

**Configuration** (src/gtfs.worker.ts:87-103):
```typescript
{
  realtimeFeedUrls: gtfsRtUrls,
  stalenessThreshold: 120,              // RT data valid for 120s
  skipFiles: ['shapes.txt', 'fare_attributes.txt'],  // Omit for performance
  locateFile: (filename) => { /* WASM file resolver */ },
  onProgress: (progress) => { /* Progress callback */ }
}
```

### Loading Process

**Function:** `loadGtfs()` in App.tsx:218-299

**Phases:**
1. `checking_cache` - Check IndexedDB cache
2. `loading_from_cache` / `downloading` - Load cached or download ZIP
3. `extracting` - Extract GTFS text files
4. `creating_schema` - Create SQLite tables
5. `inserting_data` - Parse CSV and insert rows
6. `creating_indexes` - Build database indexes
7. `analyzing` - Optimize query performance
8. `loading_realtime` - Fetch GTFS-RT data
9. `saving_cache` - Save to IndexedDB
10. `complete` - Ready for queries

### Caching Mechanisms

#### 1. IndexedDB (Persistent)
- Caches downloaded GTFS ZIP files
- Stores compiled SQLite database
- Survives browser restarts

#### 2. In-Memory Cache (GtfsApiAdapter.ts)
```typescript
private stopsCache: Map<string, Stop>
private tripsCache: Map<string, Trip>
private stopTimesCache: Map<string, StopTimeWithRealtime[]>
```
**Purpose:** Enables synchronous access for frequently-needed data

#### 3. LocalStorage (configStorage.ts)
- Key: `'gtfs-app-config'`
- Persists user configuration (URLs, settings)

### Worker API Methods

**Interface:** GtfsWorkerAPI (src/gtfs.worker.ts:52-70)

**Lifecycle:**
- `loadGtfs(gtfsUrl, gtfsRtUrls, onProgress)` - Load GTFS dataset
- `clearData()` - Clear all data
- `getDatabase()` - Export SQLite database

**Query Methods:**
- `getAgencies(filters?)` - List transit agencies
- `getRoutes(filters?)` - List routes
- `getTrips(filters?)` - List trips
- `getStops(filters?)` - List stops
- `getStopTimes(filters?)` - Get stop times with RT data
- `getAlerts(filters?)` - Get service alerts
- `getVehiclePositions(filters?)` - Get vehicle locations
- `getTripUpdates(filters?)` - Get trip delay predictions

**Real-time:**
- `fetchRealtimeData()` - Refresh RT feeds
- `getActiveServiceIds(date)` - Get active service IDs for date

**Utilities:**
- `buildOrderedStopList(tripIds)` - Build ordered stop sequence

### Real-time Updates

**Auto-refresh** (App.tsx:356-369):
```typescript
setInterval(async () => {
  await workerRef.current.fetchRealtimeData()
  await updateRealtimeData()
}, config.updateInterval * 1000)  // Default: 5 seconds
```

**updateRealtimeData()** (App.tsx:301-347):
1. Fetch alerts, vehicles, trip updates
2. Pre-fetch trip data for all vehicles
3. Sort vehicles by route order
4. Trigger UI re-render

---

## Tech Stack

### Frontend Framework
- **React** 18.3.1 with TypeScript 5.6.3
- **Vite** 6.0.1 (dev server & build tool)

### UI Library
- **Material-UI (MUI)** 7.3.5
  - @mui/material - Component library
  - @mui/icons-material - Icons
  - @emotion/react & @emotion/styled - CSS-in-JS

### Mapping
- **Leaflet** 1.9.4 - Interactive maps
- **react-leaflet** 4.2.1 - React bindings
- **OpenStreetMap** tiles

### Data Processing
- **sql.js** - SQLite compiled to WebAssembly
- **gtfs-sqljs** - GTFS → SQLite converter
- **jszip** - ZIP file handling
- **papaparse** - CSV parsing
- **protobufjs** - Protocol Buffer decoding
- **geolib** 3.3.4 - Geographic calculations

### Worker Communication
- **Comlink** 4.4.2 - RPC over Web Workers

### Styling
- **Tailwind CSS** 3.4.18
- **PostCSS** 8.5.6 + Autoprefixer 10.4.21

### Development
- **TypeScript** with strict mode
- **ESLint** with React hooks plugin
- **GitHub Actions** for deployment

---

## Key Features

### 1. Configuration Tab
**File:** src/tabs/ConfigurationTab.tsx

- 9 built-in GTFS feed presets
- Custom GTFS URL input
- Multiple GTFS-RT URL management
- Live reload functionality
- Database export (.db file)
- System information display:
  - Dataset statistics (agencies, routes, vehicles, alerts)
  - Agency timezone
  - RT feed timestamps
  - Update intervals

### 2. Browse Data Tab
**File:** src/tabs/BrowseDataTab.tsx

- Agency listing
- Route browsing with color-coded labels
- Trip selection (filtered by route & date)
- Stop times with real-time updates
- Vehicle positions table

### 3. Timetables Tab
**File:** src/tabs/TimetablesTab.tsx

- Route selection
- Trip filtering by direction
- Complete timetable display
- Real-time delay visualization
- Block ID navigation with smooth scrolling

### 4. Map Tab
**File:** src/tabs/MapTab.tsx

**Advanced Features:**
- Interactive OpenStreetMap
- Custom pin-style markers with route colors
- Vehicle labels + trip numbers
- Destination display on markers
- Real-time arrival information
- Delay visualization (color-coded)
- Auto-center on vehicles (with user interaction detection)
- Recenter button
- Vehicle detail modal

**Marker Design** (lines 80-138):
- Pin-shaped SVG markers
- Route color coding
- Trip short name + vehicle label
- Destination stop name
- Arrival time with delay indicator

### 5. Alerts Tab
**File:** src/tabs/AlertsTab.tsx

- Active service alerts
- Affected routes display
- Time period information
- Alert severity levels

### 6. Departures at Stop Tab
**File:** src/tabs/DeparturesTab.tsx

**Sophisticated Features:**
- Multi-stop selection with search
- Stop grouping by name
- Route chips for each stop group
- Real-time departure board
- Configurable upcoming departures count
- Auto-refresh capability
- Agency timezone handling
- Countdown timer (shows "X min." for <60 minutes)
- Delay visualization
- Platform/track information
- Debug information panel

**Performance Optimization:**
- Single SQL query for all selected stops
- Service ID filtering
- Efficient trip data enrichment

### 7. Departures V2 Tab
**File:** src/tabs/DeparturesV2Tab.tsx

Enhanced version with improved implementation

---

## Development Guide

### Prerequisites
- Node.js (latest LTS)
- npm or yarn

### Installation
```bash
npm install
```

### Development Server
```bash
npm run dev
```

### Build for Production
```bash
npm run build
```

### Preview Production Build
```bash
npm run preview
```

### Deploy to GitHub Pages
```bash
npm run deploy
```

### Key Files to Modify

**Adding a new tab:**
1. Create component in `src/tabs/NewTab.tsx`
2. Add tab to `App.tsx` state and navigation

**Changing GTFS data source:**
1. Update `config.gtfsUrl` and `config.gtfsRtUrls` in `App.tsx`
2. Or use Configuration tab UI

**Modifying worker queries:**
1. Edit methods in `src/gtfs.worker.ts`
2. Update interface in `GtfsWorkerAPI`

**Customizing map markers:**
1. Edit SVG in `src/tabs/MapTab.tsx` lines 80-138

**Adjusting caching behavior:**
1. Modify `GtfsApiAdapter.ts` for in-memory cache
2. Edit `gtfs-sqljs` config in `gtfs.worker.ts` for IndexedDB

---

## Key Files Reference

### Core Application
- **App.tsx** - Main state, worker management, tab routing (400+ lines)
- **main.tsx** - React entry point
- **index.html** - HTML shell (minimal)

### GTFS Processing
- **gtfs.worker.ts** - Web Worker wrapping gtfs-sqljs library
- **utils/GtfsApiAdapter.ts** - Synchronous caching layer for async worker calls
- **types/GtfsApi.ts** - TypeScript interfaces for GTFS entities

### Configuration
- **utils/configStorage.ts** - LocalStorage persistence
- **vite.config.ts** - Build optimization, base path, worker handling

### Documentation
- **DEPARTURE_BOARD_ANALYSIS.md** - Detailed analysis of departure board implementation

---

## Performance Characteristics

### Initial Load
- Downloads GTFS ZIP (~1-5 MB typical)
- Extracts and parses CSV files
- Builds SQLite database (~10-20 MB in memory)
- Creates indexes
- Saves to IndexedDB cache
- **Time:** 5-15 seconds depending on feed size

### Subsequent Loads
- Checks cache first
- Loads from IndexedDB if available
- **~10x faster** than initial load (~1-2 seconds)

### Real-time Updates
- Fetches Protocol Buffer feeds (~10-100 KB)
- Merges with static schedule
- Updates every 5 seconds (configurable)
- **Non-blocking** (runs in worker)

---

## Known Limitations

1. **No shapes.txt support** - Skipped for performance (reduces DB size by ~50%)
2. **No fare information** - fare_attributes.txt skipped
3. **CORS proxy required** - Cannot directly fetch cross-origin feeds
4. **Browser memory limits** - Very large GTFS feeds (>50MB) may cause issues
5. **No offline mode** - Requires internet for initial load (unless cached)

---

## Contributing

This project demonstrates:
- Web Worker patterns for heavy computation
- WebAssembly integration (SQL.js)
- Real-time data streaming
- Client-side database caching
- Material-UI best practices
- TypeScript strict mode

**Key areas for contribution:**
- Additional map visualizations
- Performance optimizations
- New GTFS feed presets
- Enhanced real-time features
- Accessibility improvements

---

## License

See repository for license information.

---

**Generated:** 2025-11-17
**Last Updated:** 2025-11-17
