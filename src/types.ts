// Extended types for gtfs-sqljs v0.1.0
// The package now includes arrival_time and departure_time in realtime data,
// but the TypeScript definitions haven't been updated yet

import { StopTimeRealtime as BaseStopTimeRealtime } from 'gtfs-sqljs'

export interface ExtendedStopTimeRealtime extends BaseStopTimeRealtime {
  arrival_time?: string
  departure_time?: string
}
