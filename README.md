# GTFS SQL.js Demo

A Vite + React + TypeScript web application that demonstrates the usage of the [gtfs-sqljs](https://github.com/sysdevrun/gtfs-sqljs) module for querying GTFS (General Transit Feed Specification) data in the browser.

## Features

- Load GTFS data from a URL
- Real-time GTFS-RT (Realtime) updates every 10 seconds
- Display agencies, routes with colors, trips, and stop times
- Show active alerts with affected routes
- Display vehicle positions with status and current stops
- Configurable GTFS and GTFS-RT URLs with CORS proxy support

## Demo

Visit the live demo: [https://sysdevrun.github.io/gtfs-sqljs-demo/](https://sysdevrun.github.io/gtfs-sqljs-demo/)

## Usage

### Configuration

- **GTFS URL**: URL to the GTFS ZIP file (default: Car Jaune GTFS feed)
- **GTFS-RT URL**: URL to the GTFS Realtime feed (default: Car Jaune GTFS-RT feed)

Both URLs are automatically proxied through `https://gtfs-proxy.sys-dev-run.re/proxy/` to prevent CORS issues.

### Features

- **Agencies**: Lists all transit agencies in the GTFS feed
- **Routes**: Displays routes with their colors and allows route selection (sorted by route_sort_order)
- **Trips**: Shows trips for the selected route, grouped by direction and sorted by trip_short_name
- **Stop Times**: Displays stop times for the selected trip
- **Alerts**: Shows active alerts with affected routes and time periods
- **Vehicles**: Lists all vehicles with their current position, status, and stops
- **Auto-refresh**: Toggle automatic GTFS-RT data refresh (every 10 seconds)

## Development

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Module

This demo uses the [gtfs-sqljs](https://github.com/sysdevrun/gtfs-sqljs) npm module.

## Author

**Théophile Helleboid / SysDevRun**
Contact: contact@sys-dev-run.fr

## License

MIT
