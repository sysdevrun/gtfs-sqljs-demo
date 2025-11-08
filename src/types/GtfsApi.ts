import {
  Stop,
  Trip,
  StopTimeWithRealtime,
  StopFilters,
  TripFilters,
  StopTimeFilters
} from 'gtfs-sqljs'

/**
 * Interface representing the subset of GTFS API methods used by components
 * This allows both GtfsSqlJs and GtfsApiAdapter to be used interchangeably
 */
export interface GtfsApi {
  getStops(filters?: StopFilters): Stop[]
  getTrips(filters?: TripFilters): Trip[]
  getStopTimes(filters?: StopTimeFilters): StopTimeWithRealtime[]
}
