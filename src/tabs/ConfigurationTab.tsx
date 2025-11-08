import { Box, TextField, Button, Typography, Paper, Stack } from '@mui/material'
import { AppConfig, saveConfig } from '../utils/configStorage'
import { Agency, Alert, VehiclePosition } from 'gtfs-sqljs'

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
  realtimeLastUpdated
}: ConfigurationTabProps) {
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
    if (config.gtfsRtUrls.length > 1) {
      const newUrls = config.gtfsRtUrls.filter((_, i) => i !== index)
      updateConfig({ gtfsRtUrls: newUrls })
    }
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
        </Stack>
      </Paper>

      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          GTFS Configuration
        </Typography>

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
              disabled={loading || config.gtfsRtUrls.length === 1}
            >
              Remove
            </Button>
          </Box>
        ))}

        <Button
          variant="outlined"
          onClick={handleAddRtUrl}
          disabled={loading}
          sx={{ mt: 1 }}
          color="error"
        >
          Add RT URL
        </Button>
      </Paper>

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

      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>
          Actions
        </Typography>

        <Stack direction="row" spacing={2}>
          <Button
            variant="contained"
            color="error"
            onClick={loadGtfs}
            disabled={loading}
          >
            {loading ? 'Loading...' : 'Reload GTFS'}
          </Button>

          {gtfsLoaded && (
            <Button
              variant="outlined"
              color="error"
              onClick={downloadDatabase}
            >
              Download Database
            </Button>
          )}
        </Stack>

        {error && (
          <Box sx={{ mt: 2, p: 2, bgcolor: 'error.light', borderRadius: 1 }}>
            <Typography color="error.dark">{error}</Typography>
          </Box>
        )}
      </Paper>

      {gtfsLoaded && (
        <Paper sx={{ p: 3, mb: 3 }}>
          <Typography variant="h6" gutterBottom>
            Debug Data
          </Typography>

          <Box sx={{ fontFamily: 'monospace', fontSize: '0.9rem' }}>
            {/* Agency Timezone */}
            {agencies.length > 0 && (
              <Box sx={{ mb: 2 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 1 }}>
                  Agency Timezone:
                </Typography>
                <Typography>
                  {agencies[0].agency_timezone || 'Not specified'}
                </Typography>
              </Box>
            )}

            {/* Current Times */}
            <Box sx={{ mb: 2 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 1 }}>
                Time Information:
              </Typography>
              <Typography>Browser timezone: {Intl.DateTimeFormat().resolvedOptions().timeZone}</Typography>
              <Typography>Browser current time: {new Date().toLocaleString()}</Typography>
              {agencies.length > 0 && agencies[0].agency_timezone && (
                <Typography>
                  Agency time: {new Date().toLocaleString('en-US', { timeZone: agencies[0].agency_timezone })}
                </Typography>
              )}
              <Typography>UTC time: {new Date().toISOString()}</Typography>
            </Box>

            {/* Agencies */}
            <Box sx={{ mb: 2 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 1 }}>
                Agencies ({agencies.length}):
              </Typography>
              {agencies.map(agency => (
                <Typography key={agency.agency_id}>
                  - {agency.agency_name} ({agency.agency_id})
                  {agency.agency_timezone && ` - ${agency.agency_timezone}`}
                </Typography>
              ))}
            </Box>

            {/* Routes */}
            <Box sx={{ mb: 2 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 1 }}>
                Number of routes:
              </Typography>
              <Typography>{routesCount}</Typography>
            </Box>

            {/* Real-time Updates */}
            <Box sx={{ mb: 2 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 1 }}>
                Real-time Data:
              </Typography>
              <Typography>Vehicle positions: {vehicles.length}</Typography>
              {vehicles.length > 0 && vehicles[0].timestamp && (
                <Typography>
                  Latest vehicle update: {Math.floor((Date.now() - vehicles[0].timestamp * 1000) / 1000)}s ago
                </Typography>
              )}
              <Typography>Active alerts: {alerts.length}</Typography>
              {realtimeLastUpdated > 0 && (
                <Typography>
                  Last realtime fetch: {Math.floor((Date.now() - realtimeLastUpdated) / 1000)}s ago
                </Typography>
              )}
            </Box>
          </Box>
        </Paper>
      )}
    </Box>
  )
}
