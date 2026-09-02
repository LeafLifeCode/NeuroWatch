# NeuroWatch Backend

Initial FastAPI backend for the NeuroWatch hackathon prototype. This API uses mock in-memory data only. It does not implement authentication, a database, speech processing, or medical diagnosis.

## Setup

From the `backend` directory:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

If PowerShell script execution is restricted, activate the environment from Command Prompt with `.venv\\Scripts\\activate.bat`, or run the Python commands through `.venv\\Scripts\\python.exe` directly.

## Run

```powershell
uvicorn app.main:app --reload
```

The API is available at `http://127.0.0.1:8000`. Interactive API documentation is at `http://127.0.0.1:8000/docs`.

## Endpoints

- `GET /health`
- `POST /api/speech-test`
- `GET /api/patients`
- `GET /api/patients/{patient_id}/history`

The development CORS policy allows the local Vite frontend at `http://127.0.0.1:5173` and `http://localhost:5173`.

`POST /api/speech-test` expects `multipart/form-data` with these fields:

- `audio`: uploaded audio file
- `patient_id`: patient identifier
- `test_id`: client-generated test identifier
- `timestamp`: ISO 8601 timestamp

The endpoint reads the upload in memory, verifies it is non-empty, decodes it with PyAV, and returns file metadata plus prototype signal-derived speech features. It does not store, transcribe, or clinically analyze the audio.

## Analysis architecture

The speech pipeline in `app/services/speech_analysis.py` is split into replaceable interfaces:

1. `AudioPreprocessor` prepares uploaded bytes and content metadata.
2. `SpeechFeatureExtractor` returns prototype speech rate, pause, and transcription-score fields.
3. `BaselineComparator` compares features with a patient's personal baseline.
4. `MonitoringStatusClassifier` maps the comparison to `stable`, `attention`, or `significant_change`.

The default preprocessor uses PyAV to decode browser WebM/Opus into mono NumPy PCM. The default feature extractor uses short-window RMS energy to estimate active speech and internal silences. Speech rate is an activity-based estimate because no transcription or reliable phoneme/word segmentation is implemented. All resulting values are prototype speech-monitoring features, not clinically validated measurements.

## Audio library plan

The active Python 3.10 environment includes `numpy`, `scipy`, and PyAV (`av==17.1.0`). FFmpeg is not installed or required by this PyAV setup. No ML framework, model, or transcription service is used.

- PyAV is the selected decoder for browser WebM/Opus and provides decoded audio frames without a separate FFmpeg command-line installation.
- NumPy is used for mono conversion, duration calculation, RMS energy, and silence windows.
- SciPy is available for future signal-processing improvements but is not required by the current extractor.
- `soundfile`, `pydub`, `librosa`, and `SpeechRecognition` are not used in this implementation.

The next implementation step should evaluate feature quality on representative recordings before adding any decoder changes, model, or external speech service.
