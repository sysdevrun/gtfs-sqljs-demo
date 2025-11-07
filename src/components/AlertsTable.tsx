import { Alert, Route, EntitySelector } from 'gtfs-sqljs'
import { getContrastColor, formatDate } from './utils'

interface AlertsTableProps {
  alerts: Alert[]
  getRouteById: (routeId: string) => Route | undefined
}

export default function AlertsTable({ alerts, getRouteById }: AlertsTableProps) {
  return (
    <div className="bg-white rounded-xl shadow-md p-6 mb-8">
      <h2 className="text-xl font-semibold text-gray-800 mb-4">Active Alerts</h2>
      {alerts.length === 0 ? (
        <p className="text-gray-500 text-center py-8">No active alerts</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b-2 border-gray-200">
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">
                  Header
                </th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">
                  Description
                </th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">
                  Routes
                </th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">
                  Period
                </th>
              </tr>
            </thead>
            <tbody>
              {alerts.map((alert: Alert, idx: number) => {
                const affectedRoutes = alert.informed_entity
                  ?.map((entity: EntitySelector) => entity.route_id)
                  .filter((routeId): routeId is string => Boolean(routeId))
                  .map((routeId: string) => getRouteById(routeId))
                  .filter((route): route is Route => Boolean(route)) || []

                const activePeriod = alert.active_period?.[0]

                return (
                  <tr
                    key={alert.id || idx}
                    className={`border-b border-gray-100 hover:bg-orange-50 transition-colors ${
                      idx % 2 === 0 ? 'bg-gray-50' : 'bg-white'
                    }`}
                  >
                    <td className="py-3 px-4 text-sm font-medium text-gray-900">
                      {alert.header_text?.translation?.[0]?.text || 'N/A'}
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-700">
                      {alert.description_text?.translation?.[0]?.text || 'N/A'}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex flex-wrap gap-1">
                        {affectedRoutes.map((route: Route) => {
                          const bgColor = route.route_color
                            ? `#${route.route_color}`
                            : '#3b82f6'
                          const textColor = route.route_text_color
                            ? `#${route.route_text_color}`
                            : getContrastColor(bgColor)
                          return (
                            <span
                              key={route.route_id}
                              style={{ backgroundColor: bgColor, color: textColor }}
                              className="px-2 py-1 rounded text-xs font-semibold"
                            >
                              {route.route_short_name}
                            </span>
                          )
                        })}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-xs text-gray-600">
                      <div>{formatDate(activePeriod?.start)}</div>
                      <div className="text-gray-500">to</div>
                      <div>{formatDate(activePeriod?.end)}</div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
