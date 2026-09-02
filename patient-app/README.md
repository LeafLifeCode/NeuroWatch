# NeuroWatch Patient App

Standalone mobile-first patient frontend for the NeuroWatch hackathon prototype. This app uses mock data and mock speech analysis by default. It does not diagnose stroke or implement real audio upload, authentication, or a database.

## Run

```powershell
cd patient-app
npm install
npm run dev
```

Open the Vite URL shown in the terminal, usually `http://127.0.0.1:5174` when the caregiver app already uses port 5173.

## Speech API preparation

The speech flow is isolated in `src/api/speechApi.ts`. Mock responses are enabled by default. The checked-in development `.env` uses `VITE_USE_MOCK_SPEECH=false` and a Vite proxy to the FastAPI backend, allowing this app to run on port 5174 beside the caregiver app on port 5173. For another environment, set `VITE_API_BASE_URL` to an absolute backend URL.

Speech recording uses the browser `MediaRecorder` API. If microphone permission is denied, the browser does not support recording, or the permission prompt times out, `VITE_USE_MOCK_RECORDING_FALLBACK=true` provides a mock recording so the prototype flow remains testable. Set it to `false` to show the real microphone error instead.
