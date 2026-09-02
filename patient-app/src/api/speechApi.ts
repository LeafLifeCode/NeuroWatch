export type SpeechTestRequest = {
  patient_id: string
  test_id: string
  timestamp: string
}

export type SpeechTestResult = {
  patient_id: string
  test_id: string
  status: 'stable' | 'attention'
  deviation_score: number
  speech_rate: number
  pause_score: number
  message: string
  audio_received: boolean
  audio_filename: string
  audio_content_type: string
  audio_size_bytes: number
}

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000'
const useMockResponses = import.meta.env.VITE_USE_MOCK_SPEECH !== 'false' && import.meta.env.VITE_USE_MOCK_API !== 'false'

function isSpeechTestResult(value: unknown): value is SpeechTestResult {
  if (!value || typeof value !== 'object') return false
  const result = value as Record<string, unknown>
  return typeof result.patient_id === 'string'
    && (result.status === 'stable' || result.status === 'attention')
    && typeof result.deviation_score === 'number'
    && typeof result.speech_rate === 'number'
    && typeof result.pause_score === 'number'
    && typeof result.message === 'string'
    && typeof result.audio_received === 'boolean'
    && typeof result.audio_filename === 'string'
    && typeof result.audio_content_type === 'string'
    && typeof result.audio_size_bytes === 'number'
}

  export async function submitSpeechTest(request: SpeechTestRequest, audioBlob?: Blob | null): Promise<SpeechTestResult> {
  if (useMockResponses) {
    await new Promise((resolve) => window.setTimeout(resolve, 1100))
    return {
      patient_id: request.patient_id,
      test_id: request.test_id,
      status: 'stable',
      deviation_score: 0.18,
      speech_rate: 105,
      pause_score: 0.12,
      message: 'No significant change from personal baseline.',
      audio_received: false,
      audio_filename: '',
      audio_content_type: '',
      audio_size_bytes: 0,
    }
  }

  if (!audioBlob || audioBlob.size === 0) throw new Error('The recording is empty. Please record again before submitting.')

  const formData = new FormData()
  const extension = audioBlob.type.includes('ogg') ? 'ogg' : 'webm'
  formData.append('audio', audioBlob, `speech-test.${extension}`)
  formData.append('patient_id', request.patient_id)
  formData.append('test_id', request.test_id)
  formData.append('timestamp', request.timestamp)

  let response: Response
  try {
    response = await fetch(`${apiBaseUrl}/api/speech-test`, {
      method: 'POST',
      body: formData,
    })
  } catch {
    throw new Error('The monitoring service is unavailable. Please try again later.')
  }

  if (!response.ok) throw new Error(`The monitoring request failed (${response.status}).`)
  const payload: unknown = await response.json()
  if (!isSpeechTestResult(payload)) throw new Error('The monitoring service returned an invalid response.')
  return payload
}

export type SOSAlertResponse = {
  id: number
  patient_id: string
  patient_name: string
  timestamp: string
  status: 'active' | 'resolved'
  message: string
  resolved_at?: string | null
}

export async function sendSosAlert(patientId: string, message?: string): Promise<SOSAlertResponse> {
  let response: Response
  try {
    response = await fetch(`${apiBaseUrl}/api/patients/${encodeURIComponent(patientId)}/sos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: message || 'Emergency assistance requested.' }),
    })
  } catch {
    throw new Error('Could not reach the emergency monitoring service. Please check network connection.')
  }

  if (!response.ok) {
    throw new Error(`Emergency alert failed (${response.status}).`)
  }
  return (await response.json()) as SOSAlertResponse
}
