export const getContrastColor = (hexColor: string) => {
  if (!hexColor) return '#000000'
  const hex = hexColor.replace('#', '')
  const r = parseInt(hex.substr(0, 2), 16)
  const g = parseInt(hex.substr(2, 2), 16)
  const b = parseInt(hex.substr(4, 2), 16)
  const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000
  return yiq >= 128 ? '#000000' : '#FFFFFF'
}

export const formatDate = (timestamp?: number) => {
  if (!timestamp) return 'N/A'
  return new Date(timestamp * 1000).toLocaleString()
}

export const timeToSeconds = (timeString: string): number => {
  const [hours, minutes, seconds] = timeString.split(':').map(Number)
  return hours * 3600 + minutes * 60 + seconds
}

export const secondsToTime = (totalSeconds: number): string => {
  if (totalSeconds < 0) totalSeconds = 0
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

export const unixTimestampToTime = (timestamp: number, timezone: string): string => {
  const date = new Date(timestamp * 1000)

  // Use the agency's timezone
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  })
  return formatter.format(date)
}

export const computeDelayFromTimestamp = (scheduledTime: string, realtimeTimestamp: number, timezone: string): number => {
  // Get scheduled time in seconds since midnight
  const scheduledSeconds = timeToSeconds(scheduledTime)

  // Get realtime as seconds since midnight in the agency's timezone
  const date = new Date(realtimeTimestamp * 1000)
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  })
  const timeStr = formatter.format(date)
  const realtimeSecondsOfDay = timeToSeconds(timeStr)

  // Handle day wrap-around for GTFS times >= 24:00:00
  let delay = realtimeSecondsOfDay - scheduledSeconds

  // If scheduled time is >= 24:00:00 (next day), adjust
  if (scheduledSeconds >= 86400) {
    // Scheduled time is for next day
    delay = (realtimeSecondsOfDay + 86400) - scheduledSeconds
  } else if (delay > 43200) {
    // If delay seems too large (>12 hours), realtime might be next day
    delay -= 86400
  } else if (delay < -43200) {
    // If delay seems too negative, scheduled might be next day
    delay += 86400
  }

  return delay
}

export const computeDelay = (scheduledTime: string, realtimeTime: string): number => {
  return timeToSeconds(realtimeTime) - timeToSeconds(scheduledTime)
}

export const applyDelayToTime = (timeString: string, delaySeconds?: number) => {
  if (!delaySeconds) return timeString
  const totalSeconds = timeToSeconds(timeString) + delaySeconds
  return secondsToTime(totalSeconds)
}

export const formatDelay = (delaySeconds: number): string => {
  const delayMinutes = Math.floor(Math.abs(delaySeconds) / 60)
  const delaySign = delaySeconds > 0 ? '+' : ''
  return `${delaySign}${delayMinutes}min`
}

export const getVehicleStatus = (status: number) => {
  switch (status) {
    case 0: return 'Incoming'
    case 1: return 'Stopped'
    case 2: return 'In Transit'
    default: return 'Unknown'
  }
}

export const getVehicleStatusColor = (status: number) => {
  switch (status) {
    case 0: return 'text-yellow-600 bg-yellow-50'
    case 1: return 'text-red-600 bg-red-50'
    case 2: return 'text-green-600 bg-green-50'
    default: return 'text-gray-600 bg-gray-50'
  }
}

export const formatTimeAgo = (timestamp: number): string => {
  const seconds = Math.floor((Date.now() - timestamp) / 1000)

  if (seconds < 60) return `${seconds} second${seconds !== 1 ? 's' : ''} ago`

  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`

  const days = Math.floor(hours / 24)
  return `${days} day${days !== 1 ? 's' : ''} ago`
}

export const formatDistance = (meters: number): string => {
  if (meters < 1000) {
    return `${Math.round(meters)} m`
  }
  return `${(meters / 1000).toFixed(1)} km`
}
