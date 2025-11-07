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
