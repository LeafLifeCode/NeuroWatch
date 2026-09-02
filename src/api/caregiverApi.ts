export type PatientApiData = {
  patient_id: string
  name: string
  status: 'stable' | 'attention' | 'alert'
  last_check_in: string
  speech_trend: string
  cognitive_trend: string
  alerts: number
}

export type AssessmentHistoryItemApiData = {
  patient_id: string
  test_id: string
  timestamp: string
  status: 'stable' | 'attention'
  deviation_score: number
  speech_rate: number
  pause_score: number
  message: string
}

export type SOSAlertApiData = {
  id: number
  patient_id: string
  patient_name: string
  timestamp: string
  status: 'active' | 'resolved'
  message: string
  resolved_at?: string | null
}

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000'

export async function fetchPatients(): Promise<PatientApiData[]> {
  try {
    const response = await fetch(`${apiBaseUrl}/api/patients`, {
      headers: { Accept: 'application/json' },
    })
    if (!response.ok) {
      throw new Error(`Failed to fetch patients (${response.status})`)
    }
    const data: unknown = await response.json()
    if (!Array.isArray(data)) {
      throw new Error('Invalid response payload from backend')
    }
    return data as PatientApiData[]
  } catch (error) {
    console.warn('Backend API request for patients failed, error:', error)
    throw error
  }
}

export async function fetchPatientHistory(patientId: string): Promise<AssessmentHistoryItemApiData[]> {
  try {
    const response = await fetch(`${apiBaseUrl}/api/patients/${encodeURIComponent(patientId)}/history`, {
      headers: { Accept: 'application/json' },
    })
    if (!response.ok) {
      throw new Error(`Failed to fetch history for patient ${patientId} (${response.status})`)
    }
    const data: unknown = await response.json()
    if (!Array.isArray(data)) {
      throw new Error('Invalid response payload from backend')
    }
    return data as AssessmentHistoryItemApiData[]
  } catch (error) {
    console.warn(`Backend API request for patient ${patientId} history failed, error:`, error)
    throw error
  }
}

export async function fetchActiveAlerts(): Promise<SOSAlertApiData[]> {
  try {
    const response = await fetch(`${apiBaseUrl}/api/alerts`, {
      headers: { Accept: 'application/json' },
    })
    if (!response.ok) {
      throw new Error(`Failed to fetch active alerts (${response.status})`)
    }
    const data: unknown = await response.json()
    if (!Array.isArray(data)) {
      throw new Error('Invalid response payload for alerts')
    }
    return data as SOSAlertApiData[]
  } catch (error) {
    console.warn('Backend API request for active alerts failed:', error)
    throw error
  }
}

export async function resolveAlert(alertId: number): Promise<SOSAlertApiData> {
  const response = await fetch(`${apiBaseUrl}/api/alerts/${alertId}/resolve`, {
    method: 'PATCH',
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) {
    throw new Error(`Failed to resolve alert ${alertId} (${response.status})`)
  }
  return (await response.json()) as SOSAlertApiData
}
