import { Agency } from 'gtfs-sqljs'

interface AgenciesListProps {
  agencies: Agency[]
}

export default function AgenciesList({ agencies }: AgenciesListProps) {
  return (
    <div className="bg-white rounded-xl shadow-md p-6 mb-8">
      <h2 className="text-xl font-semibold text-gray-800 mb-4">Agencies</h2>
      <div className="space-y-3">
        {agencies.map((agency: Agency) => (
          <div
            key={agency.agency_id}
            className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-100"
          >
            <div className="font-semibold text-gray-900">{agency.agency_name}</div>
            {agency.agency_url && (
              <a
                href={agency.agency_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-600 hover:text-blue-800 hover:underline"
              >
                Visit Website →
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
