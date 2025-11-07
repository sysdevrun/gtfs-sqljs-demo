import { expose } from 'comlink'
import {
  GtfsSqlJs,
  Agency,
  Route,
  Trip,
  StopTimeWithRealtime,
  Alert,
  VehiclePosition,
  TripUpdate
} from 'gtfs-sqljs'

export interface ProgressInfo {
  phase: 'downloading' | 'extracting' | 'creating_schema' | 'inserting_data' | 'creating_indexes' | 'analyzing' | 'complete'
  currentFile: string | null
  filesCompleted: number
  totalFiles: number
  rowsProcessed: number
  totalRows: number
  percentComplete: number
  message: string
}

export interface GtfsWorkerAPI {
  loadGtfs: (gtfsUrl: string, gtfsRtUrls: string[], onProgress: (progress: ProgressInfo) => void) => Promise<void>
  clearData: () => Promise<void>
  getAgencies: () => Agency[]
  getRoutes: () => Route[]
  getTrips: (routeId: string, date: string) => Trip[]
  getStopTimes: (tripId: string) => StopTimeWithRealtime[]
  getAlerts: () => Alert[]
  getVehiclePositions: () => VehiclePosition[]
  getTripUpdates: () => TripUpdate[]
  fetchRealtimeData: () => Promise<void>
  getDatabase: () => Uint8Array | null
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
        skipFiles: ['shapes.txt'],
        locateFile: (filename: string) => {
          if (filename.endsWith('.wasm')) {
            // In production build, WASM files are in the root
            // In dev mode, they're served from public
            return new URL(filename, self.location.href).href
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

  getAgencies(): Agency[] {
    if (!this.gtfs) {
      throw new Error('GTFS not loaded')
    }
    return this.gtfs.getAgencies()
  }

  getRoutes(): Route[] {
    if (!this.gtfs) {
      throw new Error('GTFS not loaded')
    }
    return this.gtfs.getRoutes()
  }

  getTrips(routeId: string, date: string): Trip[] {
    if (!this.gtfs) {
      throw new Error('GTFS not loaded')
    }
    return this.gtfs.getTrips({
      routeId,
      date,
      includeRealtime: true
    })
  }

  getStopTimes(tripId: string): StopTimeWithRealtime[] {
    if (!this.gtfs) {
      throw new Error('GTFS not loaded')
    }
    return this.gtfs.getStopTimes({
      tripId,
      includeRealtime: true
    }) as StopTimeWithRealtime[]
  }

  getAlerts(): Alert[] {
    if (!this.gtfs) {
      throw new Error('GTFS not loaded')
    }
    return this.gtfs.getAlerts({ activeOnly: true })
  }

  getVehiclePositions(): VehiclePosition[] {
    if (!this.gtfs) {
      throw new Error('GTFS not loaded')
    }
    return this.gtfs.getVehiclePositions()
  }

  getTripUpdates(): TripUpdate[] {
    if (!this.gtfs) {
      throw new Error('GTFS not loaded')
    }
    return this.gtfs.getTripUpdates()
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
}

const worker = new GtfsWorker()
expose(worker)
