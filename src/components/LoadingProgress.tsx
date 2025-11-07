import { ProgressInfo } from '../gtfs.worker'

interface LoadingProgressProps {
  progress: ProgressInfo | null
}

const LoadingProgress = ({ progress }: LoadingProgressProps) => {
  if (!progress) return null

  const getPhaseLabel = (phase: string): string => {
    const labels: Record<string, string> = {
      downloading: 'Downloading GTFS Data',
      extracting: 'Extracting Archive',
      creating_schema: 'Creating Database Schema',
      inserting_data: 'Importing Data',
      creating_indexes: 'Creating Indexes',
      analyzing: 'Optimizing Database',
      complete: 'Complete'
    }
    return labels[phase] || phase
  }

  const getPhaseColor = (phase: string): string => {
    const colors: Record<string, string> = {
      downloading: 'bg-blue-500',
      extracting: 'bg-indigo-500',
      creating_schema: 'bg-purple-500',
      inserting_data: 'bg-pink-500',
      creating_indexes: 'bg-red-500',
      analyzing: 'bg-orange-500',
      complete: 'bg-green-500'
    }
    return colors[phase] || 'bg-gray-500'
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-2xl p-8 max-w-md w-full mx-4">
        <div className="mb-6">
          <h3 className="text-2xl font-bold text-gray-800 mb-2">
            {getPhaseLabel(progress.phase)}
          </h3>
          <p className="text-sm text-gray-600">{progress.message}</p>
        </div>

        {/* Progress Bar */}
        <div className="mb-6">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium text-gray-700">Progress</span>
            <span className="text-sm font-bold text-gray-900">
              {progress.percentComplete.toFixed(1)}%
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
            <div
              className={`h-full ${getPhaseColor(progress.phase)} transition-all duration-300 ease-out rounded-full`}
              style={{ width: `${progress.percentComplete}%` }}
            >
              <div className="h-full w-full bg-gradient-to-r from-transparent to-white opacity-20 animate-pulse" />
            </div>
          </div>
        </div>

        {/* Detailed Stats */}
        <div className="space-y-3">
          {progress.currentFile && (
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-600">Current File:</span>
              <span className="font-medium text-gray-900 truncate ml-2">
                {progress.currentFile}
              </span>
            </div>
          )}

          {progress.totalFiles > 0 && (
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-600">Files Processed:</span>
              <span className="font-medium text-gray-900">
                {progress.filesCompleted} / {progress.totalFiles}
              </span>
            </div>
          )}

          {progress.totalRows > 0 && (
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-600">Rows Imported:</span>
              <span className="font-medium text-gray-900">
                {progress.rowsProcessed.toLocaleString()} / {progress.totalRows.toLocaleString()}
              </span>
            </div>
          )}
        </div>

        {/* Phase Indicator */}
        <div className="mt-6 pt-6 border-t border-gray-200">
          <div className="flex items-center justify-center space-x-2">
            <div className={`w-3 h-3 rounded-full ${getPhaseColor(progress.phase)} animate-pulse`} />
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              {progress.phase.replace(/_/g, ' ')}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default LoadingProgress
