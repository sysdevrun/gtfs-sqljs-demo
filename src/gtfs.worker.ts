import { expose } from 'comlink'
import {
  GtfsSqlJs,
  Agency,
  Route,
  Trip,
  StopTimeWithRealtime,
  StopTimeUpdate,
  Alert,
  VehiclePosition,
  TripUpdate,
  Stop,
  AgencyFilters,
  RouteFilters,
  TripFilters,
  StopFilters,
  StopTimeFilters,
  StopTimeUpdateFilters,
  AlertFilters,
  VehiclePositionFilters,
  TripUpdateFilters,
  ShapeFilters,
  GeoJsonFeatureCollection
} from 'gtfs-sqljs'
import { createSqlJsAdapter } from 'gtfs-sqljs/adapters/sql-js'

export interface ProgressInfo {
  phase: 'checking_cache' | 'loading_from_cache' | 'downloading' | 'extracting' | 'creating_schema' | 'inserting_data' | 'creating_indexes' | 'analyzing' | 'loading_realtime' | 'saving_cache' | 'complete'
  currentFile: string | null
  filesCompleted: number
  totalFiles: number
  rowsProcessed: number
  totalRows: number
  bytesDownloaded?: number
  totalBytes?: number
  percentComplete: number
  message: string
}

// Extended Trip filters that includes date (converted to serviceIds internally)
export interface ExtendedTripFilters extends Omit<TripFilters, 'serviceIds'> {
  date?: string
  serviceIds?: string | string[]
}

// Extended StopTime filters that includes date (converted to serviceIds internally)
export interface ExtendedStopTimeFilters extends Omit<StopTimeFilters, 'serviceIds'> {
  date?: string
  serviceIds?: string | string[]
}

export interface GtfsWorkerAPI {
  // Lifecycle methods
  loadGtfs: (gtfsUrl: string, gtfsRtUrls: string[], onProgress: (progress: ProgressInfo) => void) => Promise<void>
  clearData: () => Promise<void>

  // Query methods - matching gtfs-sqljs interface
  getAgencies: (filters?: AgencyFilters) => Promise<Agency[]>
  getRoutes: (filters?: RouteFilters) => Promise<Route[]>
  getTrips: (filters?: ExtendedTripFilters) => Promise<Trip[]>
  getStops: (filters?: StopFilters) => Promise<Stop[]>
  getStopTimes: (filters?: ExtendedStopTimeFilters) => Promise<StopTimeWithRealtime[]>
  getStopTimeUpdates: (filters?: StopTimeUpdateFilters) => Promise<StopTimeUpdate[]>
  getAlerts: (filters?: AlertFilters) => Promise<Alert[]>
  getVehiclePositions: (filters?: VehiclePositionFilters) => Promise<VehiclePosition[]>
  getTripUpdates: (filters?: TripUpdateFilters) => Promise<TripUpdate[]>

  // Realtime methods
  fetchRealtimeData: () => Promise<void>
  getActiveServiceIds: (date: string) => Promise<string[]>
  getLastRealtimeFetchTimestamp: () => number | null

  // Database methods
  getDatabase: () => Promise<ArrayBuffer | null>

  // Stop list methods
  buildOrderedStopList: (tripIds: string[]) => Promise<Stop[]>

  // Shape methods
  getShapesToGeojson: (filters?: ShapeFilters, precision?: number) => Promise<GeoJsonFeatureCollection>
}

class GtfsWorker implements GtfsWorkerAPI {
  private gtfs: GtfsSqlJs | null = null

  async loadGtfs(
    gtfsUrl: string,
    gtfsRtUrls: string[],
    onProgress: (progress: ProgressInfo) => void
  ): Promise<void> {
    try {
      // Clear existing data before loading new GTFS
      if (this.gtfs) {
        await this.clearData()
      }

      const adapter = await createSqlJsAdapter({
        locateFile: (filename: string) => {
          if (filename.endsWith('.wasm')) {
            // WASM files are at the base path, not relative to worker location
            const base = import.meta.env.BASE_URL || '/'
            return new URL(filename, new URL(base, self.location.origin)).href
          }
          return filename
        }
      })

      this.gtfs = await GtfsSqlJs.fromZip(gtfsUrl, {
        adapter,
        realtimeFeedUrls: gtfsRtUrls,
        stalenessThreshold: 120,
        skipFiles: ['fare_attributes.txt'],
        onProgress: (progress) => {
          // Forward progress to main thread
          onProgress(progress as ProgressInfo)
        }
      })

      // Fetch initial realtime data
      if (gtfsRtUrls.length > 0) {
        await this.gtfs.fetchRealtimeData()
      }
    } catch (error) {
      throw new Error(`Failed to load GTFS: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  async clearData(): Promise<void> {
    if (this.gtfs) {
      await this.gtfs.close()
      this.gtfs = null
    }
  }

  async getAgencies(filters?: AgencyFilters): Promise<Agency[]> {
    if (!this.gtfs) {
      throw new Error('GTFS not loaded')
    }
    return await this.gtfs.getAgencies(filters)
  }

  async getRoutes(filters?: RouteFilters): Promise<Route[]> {
    if (!this.gtfs) {
      throw new Error('GTFS not loaded')
    }
    return await this.gtfs.getRoutes(filters)
  }

  async getTrips(filters?: ExtendedTripFilters): Promise<Trip[]> {
    if (!this.gtfs) {
      throw new Error('GTFS not loaded')
    }

    // Convert date to serviceIds if provided
    if (filters?.date && !filters.serviceIds) {
      const serviceIds = await this.gtfs.getActiveServiceIds(filters.date)
      const { date, ...restFilters } = filters
      return await this.gtfs.getTrips({ ...restFilters, serviceIds })
    }

    return await this.gtfs.getTrips(filters)
  }

  async getStopTimes(filters?: ExtendedStopTimeFilters): Promise<StopTimeWithRealtime[]> {
    if (!this.gtfs) {
      throw new Error('GTFS not loaded')
    }

    // Convert date to serviceIds if provided
    if (filters?.date && !filters.serviceIds) {
      const serviceIds = await this.gtfs.getActiveServiceIds(filters.date)
      const { date, ...restFilters } = filters
      return await this.gtfs.getStopTimes({ ...restFilters, serviceIds }) as StopTimeWithRealtime[]
    }

    return await this.gtfs.getStopTimes(filters) as StopTimeWithRealtime[]
  }

  async getStopTimeUpdates(filters?: StopTimeUpdateFilters): Promise<StopTimeUpdate[]> {
    if (!this.gtfs) {
      throw new Error('GTFS not loaded')
    }
    return await this.gtfs.getStopTimeUpdates(filters)
  }

  async getStops(filters?: StopFilters): Promise<Stop[]> {
    if (!this.gtfs) {
      throw new Error('GTFS not loaded')
    }
    return await this.gtfs.getStops(filters)
  }

  async getAlerts(filters?: AlertFilters): Promise<Alert[]> {
    if (!this.gtfs) {
      throw new Error('GTFS not loaded')
    }
    return await this.gtfs.getAlerts(filters)
  }

  async getVehiclePositions(filters?: VehiclePositionFilters): Promise<VehiclePosition[]> {
    if (!this.gtfs) {
      throw new Error('GTFS not loaded')
    }
    return await this.gtfs.getVehiclePositions(filters)
  }

  async getTripUpdates(filters?: TripUpdateFilters): Promise<TripUpdate[]> {
    if (!this.gtfs) {
      throw new Error('GTFS not loaded')
    }
    return await this.gtfs.getTripUpdates(filters)
  }

  async getActiveServiceIds(date: string): Promise<string[]> {
    if (!this.gtfs) {
      throw new Error('GTFS not loaded')
    }
    return await this.gtfs.getActiveServiceIds(date)
  }

  async fetchRealtimeData(): Promise<void> {
    if (!this.gtfs) {
      throw new Error('GTFS not loaded')
    }
    await this.gtfs.fetchRealtimeData()
  }

  getLastRealtimeFetchTimestamp(): number | null {
    if (!this.gtfs) {
      return null
    }
    return this.gtfs.getLastRealtimeFetchTimestamp()
  }

  async getDatabase(): Promise<ArrayBuffer | null> {
    if (!this.gtfs) {
      return null
    }
    return await this.gtfs.export()
  }

  async buildOrderedStopList(tripIds: string[]): Promise<Stop[]> {
    if (!this.gtfs) {
      throw new Error('GTFS not loaded')
    }
    return await this.gtfs.buildOrderedStopList(tripIds)
  }

  async getShapesToGeojson(filters?: ShapeFilters, precision?: number): Promise<GeoJsonFeatureCollection> {
    if (!this.gtfs) {
      throw new Error('GTFS not loaded')
    }
    return await this.gtfs.getShapesToGeojson(filters, precision)
  }
}

const worker = new GtfsWorker()
expose(worker)
