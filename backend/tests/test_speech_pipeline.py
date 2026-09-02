import unittest
from datetime import datetime
from io import BytesIO

import av
import numpy as np
from fastapi.testclient import TestClient

from app.main import app
from app.services.speech_analysis import (
    BaselineComparison,
    EnergySpeechFeatureExtractor,
    PreparedAudio,
    SpeechFeatures,
    analyze_speech,
)


def webm_opus_bytes(segments: list[tuple[float, float]], sample_rate: int = 16_000) -> bytes:
    """Encode tone/silence segments into a valid WebM/Opus test payload."""
    samples: list[np.ndarray] = []
    for duration, amplitude in segments:
        count = int(sample_rate * duration)
        time = np.arange(count, dtype=np.float32) / sample_rate
        samples.append((amplitude * np.sin(2 * np.pi * 440 * time)).astype(np.float32))
    pcm = np.concatenate(samples)
    output = BytesIO()
    with av.open(output, mode="w", format="webm") as container:
        stream = container.add_stream("libopus", rate=sample_rate)
        stream.layout = "mono"
        stream.sample_rate = sample_rate
        frame = av.AudioFrame.from_ndarray(pcm.reshape(1, -1), format="flt", layout="mono")
        frame.sample_rate = sample_rate
        for packet in stream.encode(frame):
            container.mux(packet)
        for packet in stream.encode():
            container.mux(packet)
    return output.getvalue()


class RecordingPreprocessor:
    def prepare(self, audio_bytes: bytes, content_type: str) -> PreparedAudio:
        return PreparedAudio(np.ones(4, dtype=np.float32), 4, 1, 1.0, content_type)


class RecordingExtractor:
    def extract(self, audio: PreparedAudio) -> SpeechFeatures:
        return SpeechFeatures(1.0, 0.5, 111, 0.55, 2, 0.0)


class RecordingComparator:
    def compare(self, patient_id: str, features: SpeechFeatures) -> BaselineComparison:
        return BaselineComparison(deviation_score=0.29, status="attention")


class SpeechPipelineTests(unittest.TestCase):
    def test_pipeline_interfaces_can_be_replaced(self) -> None:
        features, comparison = analyze_speech(
            b"audio", "audio/webm", "NW-1024",
            preprocessor=RecordingPreprocessor(),
            feature_extractor=RecordingExtractor(),
            baseline_comparator=RecordingComparator(),
        )
        self.assertEqual(features.speech_rate, 111)
        self.assertEqual(comparison.status, "attention")

    def test_webm_opus_decodes_and_duration_is_extracted(self) -> None:
        decoded = __import__("app.services.speech_analysis", fromlist=["PyAVAudioPreprocessor"]).PyAVAudioPreprocessor().prepare(webm_opus_bytes([(1.0, 0.5)]), "audio/webm")
        self.assertEqual(decoded.channel_count, 1)
        self.assertGreater(decoded.duration, 0.9)
        self.assertLess(decoded.duration, 1.2)
        self.assertGreater(decoded.samples.size, 10_000)

    def test_energy_features_detect_internal_silence_and_long_pause(self) -> None:
        audio = __import__("app.services.speech_analysis", fromlist=["PyAVAudioPreprocessor"]).PyAVAudioPreprocessor().prepare(webm_opus_bytes([(0.7, 0.7), (0.8, 0.0), (0.7, 0.7)]), "audio/webm")
        features = EnergySpeechFeatureExtractor().extract(audio)
        self.assertGreater(features.audio_duration, 2.0)
        self.assertGreater(features.estimated_speech_duration, 1.0)
        self.assertGreater(features.average_pause_duration, 0.6)
        self.assertEqual(features.long_pause_count, 1)
        self.assertNotEqual(features.speech_rate, 105)

    def test_empty_and_invalid_audio_are_rejected(self) -> None:
        from app.services.speech_analysis import PyAVAudioPreprocessor
        preprocessor = PyAVAudioPreprocessor()
        with self.assertRaises(ValueError):
            preprocessor.prepare(b"", "audio/webm")
        with self.assertRaises(ValueError):
            preprocessor.prepare(b"not-an-audio-container", "audio/webm")

    def test_multipart_endpoint_returns_decoded_prototype_features(self) -> None:
        client = TestClient(app)
        response = client.post(
            "/api/speech-test",
            files={
                "audio": ("check.webm", webm_opus_bytes([(0.6, 0.6), (0.7, 0.0), (0.6, 0.6)]), "audio/webm"),
                "patient_id": (None, "NW-1024"),
                "test_id": (None, "speech-test-001"),
                "timestamp": (None, "2026-08-21T20:42:00Z"),
            },
        )
        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertTrue(body["audio_received"])
        self.assertGreater(body["audio_duration"], 1.0)
        self.assertGreaterEqual(body["long_pause_count"], 1)
        self.assertNotEqual(body["speech_rate"], 105)
        self.assertNotEqual(body["average_pause_duration"], 0.42)
        self.assertIn("not clinically validated", body["message"])


if __name__ == "__main__":
    unittest.main()
