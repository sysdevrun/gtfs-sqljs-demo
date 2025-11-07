import { GtfsSqlJs } from 'gtfs-sqljs'

interface PresetConfig {
  name: string
  gtfsUrl: string
  gtfsRtUrls: string[]
}

interface ConfigurationPanelProps {
  presets: PresetConfig[]
  gtfsUrl: string
  setGtfsUrl: (url: string) => void
  gtfsRtUrls: string[]
  setGtfsRtUrls: (urls: string[]) => void
  newRtUrl: string
  setNewRtUrl: (url: string) => void
  loading: boolean
  error: string | null
  autoRefresh: boolean
  setAutoRefresh: (refresh: boolean) => void
  gtfs: GtfsSqlJs | null
  loadGtfs: () => void
  loadPreset: (preset: PresetConfig) => void
  addRtUrl: () => void
  removeRtUrl: (url: string) => void
  downloadDatabase: () => void
}

export default function ConfigurationPanel({
  presets,
  gtfsUrl,
  setGtfsUrl,
  gtfsRtUrls,
  setGtfsRtUrls,
  newRtUrl,
  setNewRtUrl,
  loading,
  error,
  autoRefresh,
  setAutoRefresh,
  gtfs,
  loadGtfs,
  loadPreset,
  addRtUrl,
  removeRtUrl,
  downloadDatabase
}: ConfigurationPanelProps) {
  return (
    <div className="bg-white rounded-xl shadow-md p-6 mb-8">
      <h2 className="text-xl font-semibold text-gray-800 mb-4">Configuration</h2>

      {/* Preset Selection */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Quick Presets
        </label>
        <div className="flex flex-wrap gap-2">
          {presets.map((preset) => (
            <button
              key={preset.name}
              onClick={() => loadPreset(preset)}
              disabled={loading}
              className="px-4 py-2 bg-indigo-100 text-indigo-700 rounded-lg font-medium hover:bg-indigo-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              {preset.name}
            </button>
          ))}
        </div>
      </div>

      {/* GTFS URL */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          GTFS URL
        </label>
        <input
          type="text"
          value={gtfsUrl}
          onChange={(e) => setGtfsUrl(e.target.value)}
          disabled={loading}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
        />
      </div>

      {/* GTFS-RT URLs */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          GTFS-RT URLs
        </label>
        <div className="space-y-2 mb-2">
          {gtfsRtUrls.map((url, index) => (
            <div key={index} className="flex gap-2">
              <input
                type="text"
                value={url}
                onChange={(e) => {
                  const newUrls = [...gtfsRtUrls]
                  newUrls[index] = e.target.value
                  setGtfsRtUrls(newUrls)
                }}
                disabled={loading}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
              />
              <button
                onClick={() => removeRtUrl(url)}
                disabled={loading || gtfsRtUrls.length === 1}
                className="px-4 py-2 bg-red-100 text-red-700 rounded-lg font-medium hover:bg-red-200 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors"
                title="Remove URL"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={newRtUrl}
            onChange={(e) => setNewRtUrl(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && addRtUrl()}
            placeholder="Add new GTFS-RT URL..."
            disabled={loading}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
          />
          <button
            onClick={addRtUrl}
            disabled={loading || !newRtUrl.trim()}
            className="px-4 py-2 bg-green-100 text-green-700 rounded-lg font-medium hover:bg-green-200 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors"
          >
            Add URL
          </button>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={loadGtfs}
          disabled={loading}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? 'Loading...' : 'Reload'}
        </button>
        <button
          onClick={() => setAutoRefresh(!autoRefresh)}
          className={`px-6 py-2 rounded-lg font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors ${
            autoRefresh
              ? 'bg-green-600 text-white hover:bg-green-700 focus:ring-green-500'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300 focus:ring-gray-500'
          }`}
        >
          {autoRefresh ? '✓ Auto-Refresh' : 'Auto-Refresh Off'}
        </button>
        {gtfs && (
          <button
            onClick={downloadDatabase}
            className="px-6 py-2 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 transition-colors"
          >
            Download Database
          </button>
        )}
      </div>
      {error && (
        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-800 text-sm">{error}</p>
        </div>
      )}
    </div>
  )
}
