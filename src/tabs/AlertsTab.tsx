import { Box, Card, CardContent, Typography, Chip, Stack, Paper } from '@mui/material'
import { Alert as GtfsAlert, Route } from 'gtfs-sqljs'

interface AlertsTabProps {
  alerts: GtfsAlert[]
  routes: Route[]
}

export default function AlertsTab({ alerts, routes }: AlertsTabProps) {
  const getRouteById = (routeId: string): Route | undefined => {
    return routes.find(r => r.route_id === routeId)
  }

  const formatTimestamp = (timestamp: number | undefined): string => {
    if (!timestamp) return 'N/A'
    return new Date(timestamp * 1000).toLocaleString()
  }

  const getAffectedRoutes = (alert: GtfsAlert): Route[] => {
    const affectedRoutes: Route[] = []

    if (alert.informed_entity) {
      alert.informed_entity.forEach(entity => {
        if (entity.route_id) {
          const route = getRouteById(entity.route_id)
          if (route && !affectedRoutes.find(r => r.route_id === route.route_id)) {
            affectedRoutes.push(route)
          }
        }
      })
    }

    return affectedRoutes
  }

  const activeAlerts = alerts.filter(alert => {
    const now = Math.floor(Date.now() / 1000)
    const isActive = (!alert.active_period || alert.active_period.length === 0) ||
      alert.active_period.some(period => {
        const start = period.start || 0
        const end = period.end || Infinity
        return now >= start && now <= end
      })
    return isActive
  })

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" gutterBottom>
        Active Alerts ({activeAlerts.length})
      </Typography>

      {activeAlerts.length === 0 ? (
        <Paper sx={{ p: 3 }}>
          <Typography color="text.secondary">No active alerts</Typography>
        </Paper>
      ) : (
        <Stack spacing={2}>
          {activeAlerts.map((alert, idx) => {
            const affectedRoutes = getAffectedRoutes(alert)

            return (
              <Card key={idx} elevation={2}>
                <CardContent>
                  {alert.header_text && (
                    <Typography variant="h6" gutterBottom color="error">
                      {typeof alert.header_text === 'string'
                        ? alert.header_text
                        : alert.header_text.translation?.[0]?.text || ''}
                    </Typography>
                  )}

                  {alert.description_text && (
                    <Typography variant="body1" paragraph>
                      {typeof alert.description_text === 'string'
                        ? alert.description_text
                        : alert.description_text.translation?.[0]?.text || ''}
                    </Typography>
                  )}

                  {affectedRoutes.length > 0 && (
                    <Box sx={{ mt: 2 }}>
                      <Typography variant="subtitle2" gutterBottom>
                        Affected Routes:
                      </Typography>
                      <Stack direction="row" spacing={1} flexWrap="wrap" gap={1}>
                        {affectedRoutes.map(route => (
                          <Chip
                            key={route.route_id}
                            label={route.route_short_name || route.route_long_name}
                            size="medium"
                            sx={{
                              backgroundColor: route.route_color ? `#${route.route_color}` : undefined,
                              color: route.route_text_color ? `#${route.route_text_color}` : undefined,
                              fontSize: '1rem',
                              fontWeight: 'bold',
                              px: 1
                            }}
                          />
                        ))}
                      </Stack>
                    </Box>
                  )}

                  {alert.active_period && alert.active_period.length > 0 && (
                    <Box sx={{ mt: 2 }}>
                      <Typography variant="caption" color="text.secondary">
                        Active from {formatTimestamp(alert.active_period[0].start)} to {formatTimestamp(alert.active_period[0].end)}
                      </Typography>
                    </Box>
                  )}

                  {alert.url && (
                    <Box sx={{ mt: 2 }}>
                      <Typography variant="body2">
                        <a
                          href={typeof alert.url === 'string' ? alert.url : alert.url.translation?.[0]?.text || ''}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          More information
                        </a>
                      </Typography>
                    </Box>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </Stack>
      )}
    </Box>
  )
}
