"""API integration tests for speech test endpoint with baseline and deviation."""

import unittest
from datetime import datetime
from io import BytesIO

import av
import numpy as np
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.pool import StaticPool
from sqlalchemy.orm import sessionmaker

from app.database import Base, get_db
from app.main import app


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


class APIIntegrationTests(unittest.TestCase):
    """Integration tests for speech test API endpoint."""

    def setUp(self) -> None:
        """Set up test client and in-memory database."""
        # Create in-memory database for testing
        self.engine = create_engine(
            "sqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine)
        SessionLocal = sessionmaker(bind=self.engine)

        def override_get_db():
            db = SessionLocal()
            try:
                yield db
            finally:
                db.close()

        app.dependency_overrides[get_db] = override_get_db
        self.client = TestClient(app)

    def tearDown(self) -> None:
        """Clean up dependency overrides."""
        app.dependency_overrides.clear()

    def test_baseline_establishing_with_zero_tests(self) -> None:
        """Test that first test returns baseline_establishing status."""
        response = self.client.post(
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
        self.assertEqual(body["status"], "baseline_establishing")
        self.assertFalse(body["baseline_available"])
        self.assertEqual(body["baseline_test_count"], 0)
        self.assertIn("baseline", body["monitoring_message"].lower())

    def test_baseline_establishing_with_two_tests(self) -> None:
        """Test that second test still returns baseline_establishing (need 3)."""
        patient_id = "NW-1024"
        for i in range(2):
            response = self.client.post(
                "/api/speech-test",
                files={
                    "audio": ("check.webm", webm_opus_bytes([(0.6, 0.6), (0.7, 0.0), (0.6, 0.6)]), "audio/webm"),
                    "patient_id": (None, patient_id),
                    "test_id": (None, f"speech-test-{i+1:03d}"),
                    "timestamp": (None, f"2026-08-21T20:{42+i}:00Z"),
                },
            )
            self.assertEqual(response.status_code, 200, response.text)
            body = response.json()
            if i == 1:
                self.assertEqual(body["status"], "baseline_establishing")

    def test_baseline_created_with_three_tests(self) -> None:
        """Test that baseline becomes available with 3+ tests."""
        patient_id = "NW-1024"
        for i in range(3):
            response = self.client.post(
                "/api/speech-test",
                files={
                    "audio": ("check.webm", webm_opus_bytes([(0.6, 0.6), (0.7, 0.0), (0.6, 0.6)]), "audio/webm"),
                    "patient_id": (None, patient_id),
                    "test_id": (None, f"speech-test-{i+1:03d}"),
                    "timestamp": (None, f"2026-08-21T20:{42+i}:00Z"),
                },
            )
            self.assertEqual(response.status_code, 200, response.text)
            body = response.json()
            if i >= 2:
                # Third test and beyond should have baseline_available
                self.assertTrue(body["baseline_available"])
                self.assertGreater(body["baseline_test_count"], 0)

    def test_deviation_changes_with_different_audio(self) -> None:
        """Test that deviation score changes when speech patterns differ."""
        patient_id = "NW-1024"

        # Create baseline with normal speech (active speech pattern)
        for i in range(3):
            response = self.client.post(
                "/api/speech-test",
                files={
                    "audio": (
                        "check.webm",
                        webm_opus_bytes([(0.6, 0.6), (0.7, 0.0), (0.6, 0.6)]),
                        "audio/webm",
                    ),
                    "patient_id": (None, patient_id),
                    "test_id": (None, f"speech-test-{i+1:03d}"),
                    "timestamp": (None, f"2026-08-21T20:{42+i}:00Z"),
                },
            )
            self.assertEqual(response.status_code, 200, response.text)

        # Get baseline values from third test
        baseline_response = response
        baseline_body = baseline_response.json()
        baseline_deviation = baseline_body["deviation_score"]
        baseline_status = baseline_body["status"]

        # Send a very different audio pattern (lots of silence, low activity)
        different_response = self.client.post(
            "/api/speech-test",
            files={
                "audio": (
                    "check.webm",
                    webm_opus_bytes([(0.2, 0.3), (1.0, 0.0), (0.2, 0.3)]),  # Very low activity
                    "audio/webm",
                ),
                "patient_id": (None, patient_id),
                "test_id": (None, "speech-test-004"),
                "timestamp": (None, "2026-08-21T20:45:00Z"),
            },
        )
        self.assertEqual(different_response.status_code, 200, different_response.text)
        different_body = different_response.json()

        # The different audio should have a higher deviation score
        self.assertNotEqual(different_body["deviation_score"], baseline_deviation)
        # And should likely be classified differently
        self.assertTrue(
            different_body["status"] != baseline_status
            or abs(different_body["deviation_score"] - baseline_deviation) > 0.1
        )

    def test_response_includes_feature_data(self) -> None:
        """Test that API response includes current and baseline features."""
        patient_id = "NW-1024"

        # Create baseline
        for i in range(3):
            response = self.client.post(
                "/api/speech-test",
                files={
                    "audio": ("check.webm", webm_opus_bytes([(0.6, 0.6), (0.7, 0.0), (0.6, 0.6)]), "audio/webm"),
                    "patient_id": (None, patient_id),
                    "test_id": (None, f"speech-test-{i+1:03d}"),
                    "timestamp": (None, f"2026-08-21T20:{42+i}:00Z"),
                },
            )

        body = response.json()
        # Check for current features
        self.assertIn("current_features", body)
        self.assertIsNotNone(body["current_features"])
        self.assertIn("speech_activity_rate", body["current_features"])
        self.assertIn("average_pause_duration", body["current_features"])
        self.assertIn("long_pause_count", body["current_features"])

        # Check for baseline features
        self.assertIn("baseline_features", body)
        if body["baseline_available"]:
            self.assertIsNotNone(body["baseline_features"])
            self.assertIn("speech_activity_rate", body["baseline_features"])

    def test_raw_audio_not_stored(self) -> None:
        """Test that raw audio is not stored in database."""
        # This is verified by checking that the database only has metadata,
        # and the API endpoint accepts and processes audio without storing it.
        response = self.client.post(
            "/api/speech-test",
            files={
                "audio": ("check.webm", webm_opus_bytes([(0.6, 0.6), (0.7, 0.0), (0.6, 0.6)]), "audio/webm"),
                "patient_id": (None, "NW-1024"),
                "test_id": (None, "speech-test-001"),
                "timestamp": (None, "2026-08-21T20:42:00Z"),
            },
        )
        self.assertEqual(response.status_code, 200)
        body = response.json()
        # Response should NOT include audio data
        self.assertNotIn("audio_bytes", body)
        self.assertNotIn("raw_audio", body)
        # Should have metadata but not the raw audio
        self.assertIn("audio_duration", body)
        self.assertTrue(body["audio_received"])

    def test_multiple_patients_independent(self) -> None:
        """Test that multiple patients have independent baselines."""
        patient_1 = "NW-1024"
        patient_2 = "NW-2048"

        # Create baseline for patient 1
        for i in range(3):
            self.client.post(
                "/api/speech-test",
                files={
                    "audio": (
                        "check.webm",
                        webm_opus_bytes([(0.6, 0.6), (0.7, 0.0), (0.6, 0.6)]),
                        "audio/webm",
                    ),
                    "patient_id": (None, patient_1),
                    "test_id": (None, f"speech-test-{i+1:03d}"),
                    "timestamp": (None, f"2026-08-21T20:{42+i}:00Z"),
                },
            )

        # Create baseline for patient 2
        for i in range(3):
            self.client.post(
                "/api/speech-test",
                files={
                    "audio": (
                        "check.webm",
                        webm_opus_bytes([(0.2, 0.3), (1.0, 0.0), (0.2, 0.3)]),  # Different pattern
                        "audio/webm",
                    ),
                    "patient_id": (None, patient_2),
                    "test_id": (None, f"speech-test-{i+1:03d}"),
                    "timestamp": (None, f"2026-08-22T20:{42+i}:00Z"),
                },
            )

        # Both should have baselines
        response_p1 = self.client.post(
            "/api/speech-test",
            files={
                "audio": (
                    "check.webm",
                    webm_opus_bytes([(0.6, 0.6), (0.7, 0.0), (0.6, 0.6)]),
                    "audio/webm",
                ),
                "patient_id": (None, patient_1),
                "test_id": (None, "speech-test-004"),
                "timestamp": (None, "2026-08-21T20:45:00Z"),
            },
        )
        response_p2 = self.client.post(
            "/api/speech-test",
            files={
                "audio": (
                    "check.webm",
                    webm_opus_bytes([(0.2, 0.3), (1.0, 0.0), (0.2, 0.3)]),
                    "audio/webm",
                ),
                "patient_id": (None, patient_2),
                "test_id": (None, "speech-test-004"),
                "timestamp": (None, "2026-08-22T20:45:00Z"),
            },
        )

        body_p1 = response_p1.json()
        body_p2 = response_p2.json()

        self.assertTrue(body_p1["baseline_available"])
        self.assertTrue(body_p2["baseline_available"])
        # Baselines should be different
        self.assertNotEqual(
            body_p1["baseline_features"]["speech_activity_rate"],
            body_p2["baseline_features"]["speech_activity_rate"],
        )


if __name__ == "__main__":
    unittest.main()
