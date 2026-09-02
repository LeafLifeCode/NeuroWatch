"""Tests for SOS Emergency Alert backend endpoints and repository."""

import unittest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.pool import StaticPool
from sqlalchemy.orm import sessionmaker

from app.database import Base, get_db, SOSAlertModel
from app.main import app
from app.repositories.speech_tests import SpeechTestRepository


class SOSAlertTests(unittest.TestCase):
    """Test suite for patient SOS alerts and caregiver resolution."""

    def setUp(self) -> None:
        """Set up thread-safe in-memory SQLite database and test client."""
        self.engine = create_engine(
            "sqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine)
        self.SessionLocal = sessionmaker(bind=self.engine)

        def override_get_db():
            db = self.SessionLocal()
            try:
                yield db
            finally:
                db.close()

        app.dependency_overrides[get_db] = override_get_db
        self.client = TestClient(app)

        # Seed valid patient NW-1024
        db = self.SessionLocal()
        SpeechTestRepository.create_patient(db, "NW-1024", "Ravi Kumar")
        db.close()

    def tearDown(self) -> None:
        """Clean up dependency overrides."""
        app.dependency_overrides.clear()

    def test_sos_creation_valid_patient(self) -> None:
        """Test that a valid patient can trigger an SOS alert."""
        response = self.client.post(
            "/api/patients/NW-1024/sos",
            json={"message": "Severe dizziness reported."},
        )
        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertEqual(body["patient_id"], "NW-1024")
        self.assertEqual(body["patient_name"], "Ravi Kumar")
        self.assertEqual(body["status"], "active")
        self.assertEqual(body["message"], "Severe dizziness reported.")
        self.assertIsNone(body["resolved_at"])

    def test_sos_rejection_nonexistent_patient(self) -> None:
        """Test that SOS request for nonexistent patient returns 404."""
        response = self.client.post(
            "/api/patients/NW-UNKNOWN-999/sos",
            json={"message": "Help needed."},
        )
        self.assertEqual(response.status_code, 404)
        self.assertIn("not found", response.json()["detail"].lower())

    def test_sos_persistence_in_sqlite(self) -> None:
        """Test that created SOS alert is persisted in SQLite database."""
        response = self.client.post(
            "/api/patients/NW-1024/sos",
            json={"message": "Fall detected."},
        )
        self.assertEqual(response.status_code, 200)
        alert_id = response.json()["id"]

        db = self.SessionLocal()
        saved = db.query(SOSAlertModel).filter(SOSAlertModel.id == alert_id).first()
        self.assertIsNotNone(saved)
        self.assertEqual(saved.patient_id, "NW-1024")
        self.assertEqual(saved.message, "Fall detected.")
        self.assertEqual(saved.status, "active")
        db.close()

    def test_active_alert_retrieval(self) -> None:
        """Test retrieving active SOS alerts via GET /api/alerts."""
        # Create 2 SOS alerts
        self.client.post("/api/patients/NW-1024/sos", json={"message": "Alert 1"})
        self.client.post("/api/patients/NW-1024/sos", json={"message": "Alert 2"})

        response = self.client.get("/api/alerts")
        self.assertEqual(response.status_code, 200)
        alerts = response.json()
        self.assertGreaterEqual(len(alerts), 2)
        messages = [a["message"] for a in alerts]
        self.assertIn("Alert 1", messages)
        self.assertIn("Alert 2", messages)

    def test_alert_resolution(self) -> None:
        """Test resolving an SOS alert via PATCH /api/alerts/{alert_id}/resolve."""
        create_res = self.client.post("/api/patients/NW-1024/sos", json={"message": "Needs review."})
        alert_id = create_res.json()["id"]

        resolve_res = self.client.patch(f"/api/alerts/{alert_id}/resolve")
        self.assertEqual(resolve_res.status_code, 200)
        body = resolve_res.json()
        self.assertEqual(body["status"], "resolved")
        self.assertIsNotNone(body["resolved_at"])

    def test_resolved_alert_excluded_from_active_list(self) -> None:
        """Test that resolved alerts no longer appear in GET /api/alerts."""
        create_res = self.client.post("/api/patients/NW-1024/sos", json={"message": "Temporary alert."})
        alert_id = create_res.json()["id"]

        # Resolve it
        self.client.patch(f"/api/alerts/{alert_id}/resolve")

        # Fetch active alerts
        active_res = self.client.get("/api/alerts")
        self.assertEqual(active_res.status_code, 200)
        active_ids = [a["id"] for a in active_res.json()]
        self.assertNotIn(alert_id, active_ids)


if __name__ == "__main__":
    unittest.main()
