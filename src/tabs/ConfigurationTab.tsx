import { Box, TextField, Button, Typography, Paper, Stack, Grid, Divider, Chip } from '@mui/material'
import { useState, useEffect } from 'react'
import { AppConfig, saveConfig } from '../utils/configStorage'
import { Agency, Alert, VehiclePosition, TripUpdate } from 'gtfs-sqljs'

interface PresetConfig {
  name: string
  gtfsUrl: string
  gtfsRtUrls: string[]
}

interface ConfigurationTabProps {
  config: AppConfig
  setConfig: (config: AppConfig) => void
  presets: PresetConfig[]
  loading: boolean
  error: string | null
  loadGtfs: () => void
  downloadDatabase: () => void
  gtfsLoaded: boolean
  agencies: Agency[]
  routesCount: number
  vehicles: VehiclePosition[]
  alerts: Alert[]
  realtimeLastUpdated: number
  tripUpdates: TripUpdate[]
}

export default function ConfigurationTab({
  config,
  setConfig,
  presets,
  loading,
  error,
  loadGtfs,
  downloadDatabase,
  gtfsLoaded,
  agencies,
  routesCount,
  vehicles,
  alerts,
  realtimeLastUpdated,
  tripUpdates
}: ConfigurationTabProps) {
  const [currentTime, setCurrentTime] = useState(new Date())

  // Update time every second
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date())
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  const formatDateTime = (date: Date, timezone?: string) => {
    const options: Intl.DateTimeFormatOptions = {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      timeZone: timezone
    }
    const formatted = new Intl.DateTimeFormat('en-CA', options).format(date)
    return formatted.replace(',', '')
  }
  const updateConfig = (updates: Partial<AppConfig>) => {
    const newConfig = { ...config, ...updates }
    setConfig(newConfig)
    saveConfig(updates)
  }

  const handlePresetClick = (preset: PresetConfig) => {
    updateConfig({
      gtfsUrl: preset.gtfsUrl,
      gtfsRtUrls: preset.gtfsRtUrls
    })
    // Trigger load immediately
    setTimeout(() => loadGtfs(), 100)
  }

  const handleAddRtUrl = () => {
    updateConfig({
      gtfsRtUrls: [...config.gtfsRtUrls, '']
    })
  }

  const handleRemoveRtUrl = (index: number) => {
    const newUrls = config.gtfsRtUrls.filter((_, i) => i !== index)
    updateConfig({ gtfsRtUrls: newUrls })
  }

  const handleUpdateRtUrl = (index: number, value: string) => {
    const newUrls = [...config.gtfsRtUrls]
    newUrls[index] = value
    updateConfig({ gtfsRtUrls: newUrls })
  }

  return (
    <Box sx={{ p: 3 }}>
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          Quick Presets
        </Typography>
        <Stack direction="row" spacing={2} flexWrap="wrap" gap={1}>
          {presets.map((preset) => (
            <Button
              key={preset.name}
              variant="outlined"
              onClick={() => handlePresetClick(preset)}
              disabled={loading}
              color="error"
            >
              {preset.name}
            </Button>
          ))}
          <Button
            variant="outlined"
            onClick={() => handlePresetClick({
              name: 'Car Jaune (1er déc.)',
              gtfsUrl: '/car-jaune-1er-dec-2025.zip',
              gtfsRtUrls: []
            })}
            disabled={loading}
            color="error"
          >
            Car Jaune (1er déc.)
          </Button>
        </Stack>
      </Paper>

      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom sx={{ mb: 2 }}>
          GTFS Configuration
        </Typography>

        <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 2 }}>
          {/* Left side: Configuration form */}
          <Box sx={{ flex: '1 1 50%' }}>
            <TextField
              fullWidth
              label="Static GTFS URL"
              value={config.gtfsUrl}
              onChange={(e) => updateConfig({ gtfsUrl: e.target.value })}
              disabled={loading}
              margin="normal"
            />

            <Typography variant="subtitle1" sx={{ mt: 3, mb: 1 }}>
              GTFS-RT URLs
            </Typography>

            {config.gtfsRtUrls.map((url, index) => (
              <Box key={index} sx={{ display: 'flex', gap: 1, mb: 1 }}>
                <TextField
                  fullWidth
                  value={url}
                  onChange={(e) => handleUpdateRtUrl(index, e.target.value)}
                  disabled={loading}
                  placeholder="GTFS-RT URL"
                />
                <Button
                  variant="outlined"
                  color="error"
                  onClick={() => handleRemoveRtUrl(index)}
                  disabled={loading}
                >
                  Remove
                </Button>
              </Box>
            ))}

            <Stack direction="row" spacing={2} sx={{ mt: 2 }}>
              <Button
                variant="outlined"
                onClick={handleAddRtUrl}
                disabled={loading}
                color="error"
              >
                Add RT URL
              </Button>

              <Button
                variant="contained"
                color="error"
                onClick={loadGtfs}
                disabled={loading}
              >
                {loading ? 'Loading...' : 'Reload GTFS'}
              </Button>
            </Stack>
          </Box>

          {/* Right side: Currently loaded info */}
          <Box sx={{ flex: '1 1 50%' }}>
            <Box sx={{ p: 2, bgcolor: 'grey.50', borderRadius: 1, height: '100%' }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 'bold', mb: 2 }}>
                Currently Loaded
              </Typography>
              {gtfsLoaded ? (
                <>
                  <Box sx={{ mb: 2 }}>
                    <Typography variant="caption" color="text.secondary">GTFS URL</Typography>
                    <Typography variant="body2" sx={{ fontFamily: 'monospace', wordBreak: 'break-all', mt: 0.5 }}>
                      {config.gtfsUrl}
                    </Typography>
                  </Box>
                  {agencies.length > 0 && (
                    <Box sx={{ mb: 2 }}>
                      <Typography variant="caption" color="text.secondary">Agencies</Typography>
                      {agencies.map(agency => (
                        <Box key={agency.agency_id} sx={{ mt: 1 }}>
                          <Typography variant="body2" sx={{ fontWeight: 'medium' }}>
                            {agency.agency_name}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {agency.agency_id}
                          </Typography>
                        </Box>
                      ))}
                    </Box>
                  )}
                  <Box>
                    <Typography variant="caption" color="text.secondary">GTFS-RT URLs</Typography>
                    {config.gtfsRtUrls.filter(url => url.trim() !== '').length > 0 ? (
                      config.gtfsRtUrls.filter(url => url.trim() !== '').map((url, index) => (
                        <Typography key={index} variant="body2" sx={{ fontFamily: 'monospace', wordBreak: 'break-all', mt: 0.5 }}>
                          {url}
                        </Typography>
                      ))
                    ) : (
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                        None
                      </Typography>
                    )}
                  </Box>
                </>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  No GTFS data loaded
                </Typography>
              )}
            </Box>
          </Box>
        </Box>
      </Paper>

      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          Actions
        </Typography>

        {gtfsLoaded && (
          <Button
            variant="outlined"
            color="error"
            onClick={downloadDatabase}
          >
            Download Database
          </Button>
        )}

        {error && (
          <Box sx={{ mt: 2, p: 2, bgcolor: 'error.light', borderRadius: 1 }}>
            <Typography color="error.dark">{error}</Typography>
          </Box>
        )}
      </Paper>

      {gtfsLoaded && (
        <Paper sx={{ p: 3, mb: 3 }}>
          <Typography variant="h6" gutterBottom>
            System Information
          </Typography>

          {/* Data Statistics */}
          <Box sx={{ mb: 3 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 'bold', mb: 2 }}>
              Dataset Overview
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={6} sm={3}>
                <Paper variant="outlined" sx={{ p: 2, textAlign: 'center' }}>
                  <Typography variant="h4" color="error.main">{agencies.length}</Typography>
                  <Typography variant="caption" color="text.secondary">Agencies</Typography>
                </Paper>
              </Grid>
              <Grid item xs={6} sm={3}>
                <Paper variant="outlined" sx={{ p: 2, textAlign: 'center' }}>
                  <Typography variant="h4" color="error.main">{routesCount}</Typography>
                  <Typography variant="caption" color="text.secondary">Routes</Typography>
                </Paper>
              </Grid>
              <Grid item xs={6} sm={3}>
                <Paper variant="outlined" sx={{ p: 2, textAlign: 'center' }}>
                  <Typography variant="h4" color="error.main">{vehicles.length}</Typography>
                  <Typography variant="caption" color="text.secondary">Vehicle Positions</Typography>
                </Paper>
              </Grid>
              <Grid item xs={6} sm={3}>
                <Paper variant="outlined" sx={{ p: 2, textAlign: 'center' }}>
                  <Typography variant="h4" color="error.main">{alerts.length}</Typography>
                  <Typography variant="caption" color="text.secondary">Active Alerts</Typography>
                </Paper>
              </Grid>
            </Grid>
          </Box>

          <Divider sx={{ my: 3 }} />

          {/* Agencies */}
          {agencies.length > 0 && (
            <>
              <Box sx={{ mb: 3 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 'bold', mb: 2 }}>
                  Agencies
                </Typography>
                {agencies.map(agency => (
                  <Box key={agency.agency_id} sx={{ mb: 1.5, p: 1.5, bgcolor: 'grey.50', borderRadius: 1 }}>
                    <Typography variant="body1" sx={{ fontWeight: 'medium' }}>
                      {agency.agency_name}
                    </Typography>
                    <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                      <Chip label={`ID: ${agency.agency_id}`} size="small" variant="outlined" />
                      {agency.agency_timezone && (
                        <Chip label={`Timezone: ${agency.agency_timezone}`} size="small" variant="outlined" color="error" />
                      )}
                    </Stack>
                  </Box>
                ))}
              </Box>

              <Divider sx={{ my: 3 }} />
            </>
          )}

          {/* Time Information */}
          <Box sx={{ mb: 3 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 'bold', mb: 2 }}>
              Time Information
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <Box sx={{ p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
                  <Typography variant="caption" color="text.secondary">Browser Time</Typography>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace', mt: 0.5 }}>
                    {formatDateTime(currentTime)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                    {Intl.DateTimeFormat().resolvedOptions().timeZone}
                  </Typography>
                </Box>
              </Grid>
              {agencies.length > 0 && agencies[0].agency_timezone && (
                <Grid item xs={12} sm={6}>
                  <Box sx={{ p: 2, bgcolor: 'error.50', borderRadius: 1 }}>
                    <Typography variant="caption" color="text.secondary">Agency Time</Typography>
                    <Typography variant="body2" sx={{ fontFamily: 'monospace', mt: 0.5 }}>
                      {formatDateTime(currentTime, agencies[0].agency_timezone)}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                      {agencies[0].agency_timezone}
                    </Typography>
                  </Box>
                </Grid>
              )}
              <Grid item xs={12} sm={6}>
                <Box sx={{ p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
                  <Typography variant="caption" color="text.secondary">UTC Time</Typography>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace', mt: 0.5 }}>
                    {formatDateTime(currentTime, 'UTC')}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                    UTC
                  </Typography>
                </Box>
              </Grid>
            </Grid>
          </Box>

          {/* GTFS-RT Last Updates */}
          {(vehicles.length > 0 || alerts.length > 0 || tripUpdates.length > 0) && (
            <>
              <Divider sx={{ my: 3 }} />
              <Box>
                <Typography variant="subtitle1" sx={{ fontWeight: 'bold', mb: 2 }}>
                  GTFS-RT Last Updates
                </Typography>
                <Grid container spacing={2}>
                  {/* Latest Vehicle Update */}
                  {vehicles.length > 0 && (() => {
                    const latestVehicle = vehicles.reduce((latest, v) =>
                      (v.timestamp && (!latest.timestamp || v.timestamp > latest.timestamp)) ? v : latest
                    , vehicles[0])
                    if (!latestVehicle.timestamp) return null
                    const timestampMs = latestVehicle.timestamp * 1000
                    const secondsAgo = Math.floor((Date.now() - timestampMs) / 1000)
                    return (
                      <Grid item xs={12} sm={6} md={4}>
                        <Box sx={{ p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
                          <Typography variant="caption" color="text.secondary">Latest Vehicle Position</Typography>
                          <Typography variant="body2" sx={{ fontFamily: 'monospace', mt: 0.5 }}>
                            {formatDateTime(new Date(timestampMs))}
                          </Typography>
                          <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                            {secondsAgo}s ago
                          </Typography>
                        </Box>
                      </Grid>
                    )
                  })()}

                  {/* Latest Alert Update */}
                  {alerts.length > 0 && (() => {
                    const latestAlert = alerts.reduce((latest, a) => {
                      const aTime = a.active_period?.[0]?.start || 0
                      const latestTime = latest.active_period?.[0]?.start || 0
                      return aTime > latestTime ? a : latest
                    }, alerts[0])
                    const timestamp = latestAlert.active_period?.[0]?.start
                    if (!timestamp) return null
                    const timestampMs = timestamp * 1000
                    const secondsAgo = Math.floor((Date.now() - timestampMs) / 1000)
                    return (
                      <Grid item xs={12} sm={6} md={4}>
                        <Box sx={{ p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
                          <Typography variant="caption" color="text.secondary">Latest Alert</Typography>
                          <Typography variant="body2" sx={{ fontFamily: 'monospace', mt: 0.5 }}>
                            {formatDateTime(new Date(timestampMs))}
                          </Typography>
                          <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                            {secondsAgo}s ago
                          </Typography>
                        </Box>
                      </Grid>
                    )
                  })()}

                  {/* Latest Trip Update */}
                  {tripUpdates.length > 0 && (() => {
                    const latestTripUpdate = tripUpdates.reduce((latest, t) =>
                      (t.timestamp && (!latest.timestamp || t.timestamp > latest.timestamp)) ? t : latest
                    , tripUpdates[0])
                    if (!latestTripUpdate.timestamp) return null
                    const timestampMs = latestTripUpdate.timestamp * 1000
                    const secondsAgo = Math.floor((Date.now() - timestampMs) / 1000)
                    return (
                      <Grid item xs={12} sm={6} md={4}>
                        <Box sx={{ p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
                          <Typography variant="caption" color="text.secondary">Latest Trip Update</Typography>
                          <Typography variant="body2" sx={{ fontFamily: 'monospace', mt: 0.5 }}>
                            {formatDateTime(new Date(timestampMs))}
                          </Typography>
                          <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                            {secondsAgo}s ago
                          </Typography>
                        </Box>
                      </Grid>
                    )
                  })()}
                </Grid>
              </Box>
            </>
          )}
        </Paper>
      )}

      {gtfsLoaded && (vehicles.length > 0 || alerts.length > 0 || tripUpdates.length > 0) && (
        <Paper sx={{ p: 3, mb: 3 }}>
          <Typography variant="h6" gutterBottom>
            GTFS-RT Data
          </Typography>

          <Grid container spacing={2}>
            {/* Vehicles */}
            {vehicles.length > 0 && (
              <Grid item xs={12} md={4}>
                <Paper variant="outlined" sx={{ p: 2 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 1 }}>
                    Vehicle Positions ({vehicles.length})
                  </Typography>
                  {vehicles.slice(0, 3).map((vehicle, index) => (
                    <Box key={index} sx={{ mb: 1.5, p: 1, bgcolor: 'grey.50', borderRadius: 1 }}>
                      <Typography variant="body2" sx={{ fontWeight: 'medium' }}>
                        {vehicle.vehicle_label || vehicle.vehicle_id || 'Unknown'}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Trip: {vehicle.trip_id || 'N/A'}
                      </Typography>
                      {vehicle.timestamp && (
                        <Typography variant="caption" display="block" color="text.secondary">
                          {Math.floor((Date.now() - vehicle.timestamp * 1000) / 1000)}s ago
                        </Typography>
                      )}
                    </Box>
                  ))}
                  {vehicles.length > 3 && (
                    <Typography variant="caption" color="text.secondary">
                      + {vehicles.length - 3} more
                    </Typography>
                  )}
                </Paper>
              </Grid>
            )}

            {/* Alerts */}
            {alerts.length > 0 && (
              <Grid item xs={12} md={4}>
                <Paper variant="outlined" sx={{ p: 2 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 1 }}>
                    Active Alerts ({alerts.length})
                  </Typography>
                  {alerts.slice(0, 3).map((alert, index) => (
                    <Box key={index} sx={{ mb: 1.5, p: 1, bgcolor: 'error.50', borderRadius: 1 }}>
                      <Typography variant="body2" sx={{ fontWeight: 'medium' }}>
                        {alert.header_text || 'Alert'}
                      </Typography>
                      {alert.description_text && (
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                          {alert.description_text.substring(0, 50)}{alert.description_text.length > 50 ? '...' : ''}
                        </Typography>
                      )}
                    </Box>
                  ))}
                  {alerts.length > 3 && (
                    <Typography variant="caption" color="text.secondary">
                      + {alerts.length - 3} more
                    </Typography>
                  )}
                </Paper>
              </Grid>
            )}

            {/* Trip Updates */}
            {tripUpdates.length > 0 && (
              <Grid item xs={12} md={4}>
                <Paper variant="outlined" sx={{ p: 2 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 1 }}>
                    Trip Updates ({tripUpdates.length})
                  </Typography>
                  {tripUpdates.slice(0, 3).map((update, index) => (
                    <Box key={index} sx={{ mb: 1.5, p: 1, bgcolor: 'grey.50', borderRadius: 1 }}>
                      <Typography variant="body2" sx={{ fontWeight: 'medium' }}>
                        Trip: {update.trip_id || 'Unknown'}
                      </Typography>
                      {update.vehicle_id && (
                        <Typography variant="caption" color="text.secondary">
                          Vehicle: {update.vehicle_id}
                        </Typography>
                      )}
                      {update.timestamp && (
                        <Typography variant="caption" display="block" color="text.secondary">
                          {Math.floor((Date.now() - update.timestamp * 1000) / 1000)}s ago
                        </Typography>
                      )}
                    </Box>
                  ))}
                  {tripUpdates.length > 3 && (
                    <Typography variant="caption" color="text.secondary">
                      + {tripUpdates.length - 3} more
                    </Typography>
                  )}
                </Paper>
              </Grid>
            )}
          </Grid>
        </Paper>
      )}

      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          Display Settings
        </Typography>

        <TextField
          fullWidth
          type="number"
          label="Number of upcoming departures"
          value={config.upcomingDeparturesCount}
          onChange={(e) => updateConfig({ upcomingDeparturesCount: parseInt(e.target.value) || 10 })}
          margin="normal"
          inputProps={{ min: 1, max: 100 }}
        />

        <TextField
          fullWidth
          type="number"
          label="Update interval (seconds, 0 = disabled)"
          value={config.updateInterval}
          onChange={(e) => updateConfig({ updateInterval: parseInt(e.target.value) || 0 })}
          margin="normal"
          inputProps={{ min: 0, max: 300 }}
          helperText="How often to refresh real-time data (0 to disable auto-refresh)"
        />
      </Paper>
    </Box>
  )
}
