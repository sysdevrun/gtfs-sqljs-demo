// Extended types for gtfs-sqljs v0.1.0
// The package now includes arrival_time and departure_time in realtime data
// These are UNIX timestamps (absolute time), not HH:MM:SS strings

import { StopTimeRealtime as BaseStopTimeRealtime } from 'gtfs-sqljs'

export interface ExtendedStopTimeRealtime extends BaseStopTimeRealtime {
  arrival_time?: number      // UNIX timestamp (absolute time)
  departure_time?: number    // UNIX timestamp (absolute time)
}
