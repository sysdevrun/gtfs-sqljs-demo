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
  TripUpdateFilters
} from 'gtfs-sqljs'

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
  getAgencies: (filters?: AgencyFilters) => Agency[]
  getRoutes: (filters?: RouteFilters) => Route[]
  getTrips: (filters?: ExtendedTripFilters) => Trip[]
  getStops: (filters?: StopFilters) => Stop[]
  getStopTimes: (filters?: ExtendedStopTimeFilters) => StopTimeWithRealtime[]
  getStopTimeUpdates: (filters?: StopTimeUpdateFilters) => StopTimeUpdate[]
  getAlerts: (filters?: AlertFilters) => Alert[]
  getVehiclePositions: (filters?: VehiclePositionFilters) => VehiclePosition[]
  getTripUpdates: (filters?: TripUpdateFilters) => TripUpdate[]

  // Realtime methods
  fetchRealtimeData: () => Promise<void>
  getActiveServiceIds: (date: string) => string[]

  // Database methods
  getDatabase: () => Uint8Array | null

  // Stop list methods
  buildOrderedStopList: (tripIds: string[]) => Stop[]
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

      this.gtfs = await GtfsSqlJs.fromZip(gtfsUrl, {
        realtimeFeedUrls: gtfsRtUrls,
        stalenessThreshold: 120,
        skipFiles: ['shapes.txt', 'fare_attributes.txt'],
        locateFile: (filename: string) => {
          if (filename.endsWith('.wasm')) {
            // WASM files are at the base path, not relative to worker location
            const base = import.meta.env.BASE_URL || '/'
            return new URL(filename, new URL(base, self.location.origin)).href
          }
          return filename
        },
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
      // Close the database connection if possible
      const db = this.gtfs.getDatabase()
      if (db && typeof db.close === 'function') {
        db.close()
      }
      this.gtfs = null
    }
  }

  getAgencies(filters?: AgencyFilters): Agency[] {
    if (!this.gtfs) {
      throw new Error('GTFS not loaded')
    }
    return this.gtfs.getAgencies(filters)
  }

  getRoutes(filters?: RouteFilters): Route[] {
    if (!this.gtfs) {
      throw new Error('GTFS not loaded')
    }
    return this.gtfs.getRoutes(filters)
  }

  getTrips(filters?: ExtendedTripFilters): Trip[] {
    if (!this.gtfs) {
      throw new Error('GTFS not loaded')
    }

    // Convert date to serviceIds if provided
    if (filters?.date && !filters.serviceIds) {
      const serviceIds = this.gtfs.getActiveServiceIds(filters.date)
      const { date, ...restFilters } = filters
      return this.gtfs.getTrips({ ...restFilters, serviceIds })
    }

    return this.gtfs.getTrips(filters)
  }

  getStopTimes(filters?: ExtendedStopTimeFilters): StopTimeWithRealtime[] {
    if (!this.gtfs) {
      throw new Error('GTFS not loaded')
    }

    // Convert date to serviceIds if provided
    if (filters?.date && !filters.serviceIds) {
      const serviceIds = this.gtfs.getActiveServiceIds(filters.date)
      const { date, ...restFilters } = filters
      return this.gtfs.getStopTimes({ ...restFilters, serviceIds }) as StopTimeWithRealtime[]
    }

    return this.gtfs.getStopTimes(filters) as StopTimeWithRealtime[]
  }

  getStopTimeUpdates(filters?: StopTimeUpdateFilters): StopTimeUpdate[] {
    if (!this.gtfs) {
      throw new Error('GTFS not loaded')
    }
    return this.gtfs.getStopTimeUpdates(filters)
  }

  getStops(filters?: StopFilters): Stop[] {
    if (!this.gtfs) {
      throw new Error('GTFS not loaded')
    }
    return this.gtfs.getStops(filters)
  }

  getAlerts(filters?: AlertFilters): Alert[] {
    if (!this.gtfs) {
      throw new Error('GTFS not loaded')
    }
    return this.gtfs.getAlerts(filters)
  }

  getVehiclePositions(filters?: VehiclePositionFilters): VehiclePosition[] {
    if (!this.gtfs) {
      throw new Error('GTFS not loaded')
    }
    return this.gtfs.getVehiclePositions(filters)
  }

  getTripUpdates(filters?: TripUpdateFilters): TripUpdate[] {
    if (!this.gtfs) {
      throw new Error('GTFS not loaded')
    }
    return this.gtfs.getTripUpdates(filters)
  }

  getActiveServiceIds(date: string): string[] {
    if (!this.gtfs) {
      throw new Error('GTFS not loaded')
    }
    return this.gtfs.getActiveServiceIds(date)
  }

  async fetchRealtimeData(): Promise<void> {
    if (!this.gtfs) {
      throw new Error('GTFS not loaded')
    }
    await this.gtfs.fetchRealtimeData()
  }

  getDatabase(): Uint8Array | null {
    if (!this.gtfs) {
      return null
    }
    const db = this.gtfs.getDatabase()
    return db.export()
  }

  buildOrderedStopList(tripIds: string[]): Stop[] {
    if (!this.gtfs) {
      throw new Error('GTFS not loaded')
    }
    return this.gtfs.buildOrderedStopList(tripIds)
  }
}

const worker = new GtfsWorker()
expose(worker)
