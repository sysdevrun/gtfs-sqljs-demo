import { useEffect, useState } from 'react'
import { Box, Typography, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from '@mui/material'
import { Alert, VehiclePosition, TripUpdate, StopTimeUpdate } from 'gtfs-sqljs'
import type { Remote } from 'comlink'
import type { GtfsWorkerAPI } from '../gtfs.worker'

// Helper function to format time as HH:MM:SS
const formatTime = (timestamp: number): string => {
  const date = new Date(timestamp * 1000)
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const seconds = String(date.getSeconds()).padStart(2, '0')
  return `${hours}:${minutes}:${seconds}`
}

// Helper function to format active period
const formatActivePeriod = (start?: number, end?: number): string => {
  if (!start && !end) return '-'
  const parts = []
  if (start) parts.push(`From ${new Date(start * 1000).toLocaleString()}`)
  if (end) parts.push(`Until ${new Date(end * 1000).toLocaleString()}`)
  return parts.join(' ')
}

// Helper function to format relative time
const formatRelativeTime = (timestamp: number): string => {
  const now = Math.floor(Date.now() / 1000)
  const seconds = now - timestamp

  if (seconds < 60) return `${seconds} seconds ago`
  if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`
  return `${Math.floor(seconds / 86400)} days ago`
}

// Helper function to format schedule relationship
const formatScheduleRelationship = (rel?: number): string => {
  if (rel === undefined) return '-'
  switch (rel) {
    case 0: return 'SCHEDULED'
    case 1: return 'ADDED'
    case 2: return 'UNSCHEDULED'
    case 3: return 'CANCELED'
    default: return String(rel)
  }
}

interface RealtimeDataTabProps {
  workerApi: Remote<GtfsWorkerAPI> | null
  realtimeLastUpdated: number
}

export default function RealtimeDataTab({ workerApi, realtimeLastUpdated }: RealtimeDataTabProps) {
  const [tripUpdates, setTripUpdates] = useState<TripUpdate[]>([])
  const [stopTimeUpdates, setStopTimeUpdates] = useState<StopTimeUpdate[]>([])
  const [vehiclePositions, setVehiclePositions] = useState<VehiclePosition[]>([])
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [initialLoading, setInitialLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      if (!workerApi) return

      try {
        const [trips, stopTimes, vehicles, serviceAlerts] = await Promise.all([
          workerApi.getTripUpdates(),
          workerApi.getStopTimeUpdates(),
          workerApi.getVehiclePositions(),
          workerApi.getAlerts()
        ])

        setTripUpdates(trips)
        setStopTimeUpdates(stopTimes)
        setVehiclePositions(vehicles)
        setAlerts(serviceAlerts)
      } catch (error) {
        console.error('Error fetching GTFS-RT data:', error)
      } finally {
        setInitialLoading(false)
      }
    }

    fetchData()
  }, [workerApi, realtimeLastUpdated])

  if (initialLoading) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography>Loading GTFS-RT data...</Typography>
      </Box>
    )
  }

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>
        GTFS-RT Data
      </Typography>
      {realtimeLastUpdated > 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Last updated: {new Date(realtimeLastUpdated).toLocaleString()}
        </Typography>
      )}

      {/* Trip Updates */}
      <Paper sx={{ mb: 4 }}>
        <Box sx={{ p: 2, bgcolor: 'primary.main', color: 'white' }}>
          <Typography variant="h6">Trip Updates ({tripUpdates.length})</Typography>
        </Box>
        <TableContainer sx={{ maxHeight: 400 }}>
          <Table stickyHeader size="small">
            <TableHead>
              <TableRow>
                <TableCell>Trip ID</TableCell>
                <TableCell>Route ID</TableCell>
                <TableCell>Vehicle ID</TableCell>
                <TableCell>Vehicle Label</TableCell>
                <TableCell>Delay (s)</TableCell>
                <TableCell>Schedule Rel.</TableCell>
                <TableCell>Timestamp</TableCell>
                <TableCell>Stop Time Updates</TableCell>
                <TableCell>Last Updated</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {tripUpdates.map((tu, idx) => (
                <TableRow key={idx} hover>
                  <TableCell>{tu.trip_id}</TableCell>
                  <TableCell>{tu.route_id || '-'}</TableCell>
                  <TableCell>{tu.vehicle?.id || '-'}</TableCell>
                  <TableCell>{tu.vehicle?.label || '-'}</TableCell>
                  <TableCell>{tu.delay ?? '-'}</TableCell>
                  <TableCell>{formatScheduleRelationship(tu.schedule_relationship)}</TableCell>
                  <TableCell>{tu.timestamp ? formatTime(tu.timestamp) : '-'}</TableCell>
                  <TableCell>{tu.stop_time_update?.length || 0}</TableCell>
                  <TableCell>{formatRelativeTime(tu.rt_last_updated)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* Stop Time Updates */}
      <Paper sx={{ mb: 4 }}>
        <Box sx={{ p: 2, bgcolor: 'primary.main', color: 'white' }}>
          <Typography variant="h6">Stop Time Updates ({stopTimeUpdates.length})</Typography>
        </Box>
        <TableContainer sx={{ maxHeight: 400 }}>
          <Table stickyHeader size="small">
            <TableHead>
              <TableRow>
                <TableCell>Trip ID</TableCell>
                <TableCell>Stop Sequence</TableCell>
                <TableCell>Stop ID</TableCell>
                <TableCell>Arrival Delay (s)</TableCell>
                <TableCell>Arrival Time</TableCell>
                <TableCell>Departure Delay (s)</TableCell>
                <TableCell>Departure Time</TableCell>
                <TableCell>Schedule Relationship</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {stopTimeUpdates.map((stu, idx) => (
                <TableRow key={idx} hover>
                  <TableCell>{stu.trip_id || '-'}</TableCell>
                  <TableCell>{stu.stop_sequence ?? '-'}</TableCell>
                  <TableCell>{stu.stop_id || '-'}</TableCell>
                  <TableCell>{stu.arrival?.delay ?? '-'}</TableCell>
                  <TableCell>{stu.arrival?.time ? formatTime(stu.arrival.time) : '-'}</TableCell>
                  <TableCell>{stu.departure?.delay ?? '-'}</TableCell>
                  <TableCell>{stu.departure?.time ? formatTime(stu.departure.time) : '-'}</TableCell>
                  <TableCell>{stu.schedule_relationship ?? '-'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* Vehicle Positions */}
      <Paper sx={{ mb: 4 }}>
        <Box sx={{ p: 2, bgcolor: 'primary.main', color: 'white' }}>
          <Typography variant="h6">Vehicle Positions ({vehiclePositions.length})</Typography>
        </Box>
        <TableContainer sx={{ maxHeight: 400 }}>
          <Table stickyHeader size="small">
            <TableHead>
              <TableRow>
                <TableCell>Trip ID</TableCell>
                <TableCell>Route ID</TableCell>
                <TableCell>Vehicle ID</TableCell>
                <TableCell>Latitude</TableCell>
                <TableCell>Longitude</TableCell>
                <TableCell>Bearing</TableCell>
                <TableCell>Speed (m/s)</TableCell>
                <TableCell>Stop ID</TableCell>
                <TableCell>Current Stop Seq.</TableCell>
                <TableCell>Current Status</TableCell>
                <TableCell>Timestamp</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {vehiclePositions.map((vp, idx) => (
                <TableRow key={idx} hover>
                  <TableCell>{vp.trip_id}</TableCell>
                  <TableCell>{vp.route_id || '-'}</TableCell>
                  <TableCell>{vp.vehicle?.id || '-'}</TableCell>
                  <TableCell>{vp.position?.latitude?.toFixed(5) || '-'}</TableCell>
                  <TableCell>{vp.position?.longitude?.toFixed(5) || '-'}</TableCell>
                  <TableCell>{vp.position?.bearing ?? '-'}</TableCell>
                  <TableCell>{vp.position?.speed ?? '-'}</TableCell>
                  <TableCell>{vp.stop_id || '-'}</TableCell>
                  <TableCell>{vp.current_stop_sequence ?? '-'}</TableCell>
                  <TableCell>{vp.current_status ?? '-'}</TableCell>
                  <TableCell>{vp.timestamp ? formatTime(vp.timestamp) : '-'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* Alerts */}
      <Paper sx={{ mb: 4 }}>
        <Box sx={{ p: 2, bgcolor: 'warning.main', color: 'white' }}>
          <Typography variant="h6">Service Alerts ({alerts.length})</Typography>
        </Box>
        <TableContainer sx={{ maxHeight: 400 }}>
          <Table stickyHeader size="small">
            <TableHead>
              <TableRow>
                <TableCell>Header</TableCell>
                <TableCell>Description</TableCell>
                <TableCell>ID</TableCell>
                <TableCell>Cause</TableCell>
                <TableCell>Effect</TableCell>
                <TableCell>Active Period</TableCell>
                <TableCell>URL</TableCell>
                <TableCell>Last Updated</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {alerts.map((alert, idx) => (
                <TableRow key={idx} hover>
                  <TableCell>
                    {typeof alert.header_text === 'string'
                      ? alert.header_text
                      : alert.header_text?.translation?.[0]?.text || '-'}
                  </TableCell>
                  <TableCell>
                    {typeof alert.description_text === 'string'
                      ? alert.description_text
                      : alert.description_text?.translation?.[0]?.text || '-'}
                  </TableCell>
                  <TableCell>{alert.id || '-'}</TableCell>
                  <TableCell>{alert.cause ?? '-'}</TableCell>
                  <TableCell>{alert.effect ?? '-'}</TableCell>
                  <TableCell>
                    {alert.active_period?.[0]
                      ? formatActivePeriod(alert.active_period[0].start, alert.active_period[0].end)
                      : '-'}
                  </TableCell>
                  <TableCell>
                    {alert.url ? (
                      typeof alert.url === 'string' ? (
                        <a href={alert.url} target="_blank" rel="noopener noreferrer">Link</a>
                      ) : (
                        <a href={alert.url?.translation?.[0]?.text} target="_blank" rel="noopener noreferrer">Link</a>
                      )
                    ) : '-'}
                  </TableCell>
                  <TableCell>{formatRelativeTime(alert.rt_last_updated)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Box>
  )
}
