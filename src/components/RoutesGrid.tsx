import { Route } from 'gtfs-sqljs'
import { getContrastColor } from './utils'

interface RoutesGridProps {
  routes: Route[]
  selectedRoute: string | null
  setSelectedRoute: (routeId: string) => void
}

export default function RoutesGrid({ routes, selectedRoute, setSelectedRoute }: RoutesGridProps) {
  return (
    <div className="bg-white rounded-xl shadow-md p-6 mb-8">
      <h2 className="text-xl font-semibold text-gray-800 mb-4">Routes</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {routes.map((route: Route) => {
          const bgColor = route.route_color ? `#${route.route_color}` : '#3b82f6'
          const textColor = route.route_text_color
            ? `#${route.route_text_color}`
            : getContrastColor(bgColor)
          const isSelected = selectedRoute === route.route_id

          return (
            <button
              key={route.route_id}
              onClick={() => setSelectedRoute(route.route_id)}
              style={{ backgroundColor: bgColor, color: textColor }}
              className={`p-4 rounded-lg font-semibold transition-all hover:scale-105 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${
                isSelected ? 'ring-4 ring-blue-500 shadow-xl scale-105' : 'shadow-md'
              }`}
            >
              <div className="text-lg">{route.route_short_name || route.route_id}</div>
              <div className="text-xs mt-1 opacity-90 line-clamp-2">
                {route.route_long_name}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
