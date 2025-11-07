import { Route } from 'gtfs-sqljs'
import { getContrastColor } from './utils'

interface RouteLabelProps {
  route: Route
  className?: string
}

export default function RouteLabel({ route, className = '' }: RouteLabelProps) {
  const bgColor = route.route_color ? `#${route.route_color}` : '#3b82f6'
  const textColor = route.route_text_color
    ? `#${route.route_text_color}`
    : getContrastColor(bgColor)

  return (
    <span
      style={{ backgroundColor: bgColor, color: textColor }}
      className={`px-2 py-1 rounded text-sm font-semibold inline-block ${className}`}
    >
      {route.route_short_name}
    </span>
  )
}
