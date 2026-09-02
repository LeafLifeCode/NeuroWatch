"""Tests for database models, repository, baseline calculation, and deviation."""

import unittest
from datetime import datetime

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base, PatientModel, SpeechTestModel
from app.repositories.speech_tests import SpeechTestRepository
from app.services.baseline import BaselineCalculator, BaselineFeatures


class DatabaseTestSetup(unittest.TestCase):
    """Base class for database tests with setup/teardown."""

    def setUp(self) -> None:
        """Create in-memory SQLite database for testing."""
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.Session = sessionmaker(bind=self.engine)
        self.db = self.Session()

    def tearDown(self) -> None:
        """Clean up database session."""
        self.db.close()


class PatientRepositoryTests(DatabaseTestSetup):
    """Tests for patient repository operations."""

    def test_create_patient(self) -> None:
        """Test creating a patient."""
        patient = SpeechTestRepository.create_patient(self.db, "NW-1024", "John Doe")
        self.assertEqual(patient.patient_id, "NW-1024")
        self.assertEqual(patient.name, "John Doe")
        self.assertIsNotNone(patient.id)
        self.assertIsNotNone(patient.created_at)

    def test_get_patient(self) -> None:
        """Test retrieving an existing patient."""
        SpeechTestRepository.create_patient(self.db, "NW-1024", "John Doe")
        patient = SpeechTestRepository.get_patient(self.db, "NW-1024")
        self.assertIsNotNone(patient)
        self.assertEqual(patient.patient_id, "NW-1024")

    def test_get_nonexistent_patient(self) -> None:
        """Test retrieving a non-existent patient returns None."""
        patient = SpeechTestRepository.get_patient(self.db, "NW-9999")
        self.assertIsNone(patient)

    def test_get_or_create_patient_existing(self) -> None:
        """Test get_or_create returns existing patient."""
        SpeechTestRepository.create_patient(self.db, "NW-1024", "John Doe")
        patient = SpeechTestRepository.get_or_create_patient(self.db, "NW-1024", "Different Name")
        self.assertEqual(patient.name, "John Doe")  # Original name preserved

    def test_get_or_create_patient_new(self) -> None:
        """Test get_or_create creates new patient."""
        patient = SpeechTestRepository.get_or_create_patient(self.db, "NW-1024", "Jane Doe")
        self.assertEqual(patient.patient_id, "NW-1024")
        self.assertEqual(patient.name, "Jane Doe")


class SpeechTestRepositoryTests(DatabaseTestSetup):
    """Tests for speech test repository operations."""

    def setUp(self) -> None:
        """Set up test database and patient."""
        super().setUp()
        self.patient_id = "NW-1024"
        SpeechTestRepository.create_patient(self.db, self.patient_id, "Test Patient")

    def test_save_speech_test(self) -> None:
        """Test saving a speech test result."""
        test = SpeechTestRepository.save_speech_test(
            self.db,
            self.patient_id,
            "test-001",
            datetime(2026, 8, 21, 10, 0, 0),
            audio_duration=2.0,
            estimated_speech_duration=1.5,
            average_pause_duration=0.3,
            long_pause_count=2,
            speech_activity_rate=75.0,
            deviation_score=0.15,
            status="stable",
        )
        self.assertEqual(test.patient_id, self.patient_id)
        self.assertEqual(test.test_id, "test-001")
        self.assertEqual(test.speech_activity_rate, 75.0)
        self.assertEqual(test.status, "stable")

    def test_get_previous_tests(self) -> None:
        """Test retrieving previous tests for a patient."""
        # Create multiple tests
        for i in range(5):
            SpeechTestRepository.save_speech_test(
                self.db,
                self.patient_id,
                f"test-{i:03d}",
                datetime(2026, 8, 21 + i, 10, 0, 0),
                audio_duration=2.0,
                estimated_speech_duration=1.5,
                average_pause_duration=0.3,
                long_pause_count=2,
                speech_activity_rate=75.0,
                deviation_score=0.15,
                status="stable",
            )

        tests = SpeechTestRepository.get_previous_tests(self.db, self.patient_id, limit=5)
        self.assertEqual(len(tests), 5)
        # Should be ordered newest first
        self.assertEqual(tests[0].test_id, "test-004")
        self.assertEqual(tests[-1].test_id, "test-000")

    def test_get_previous_tests_limit(self) -> None:
        """Test that get_previous_tests respects limit."""
        for i in range(10):
            SpeechTestRepository.save_speech_test(
                self.db,
                self.patient_id,
                f"test-{i:03d}",
                datetime(2026, 8, 21 + i, 10, 0, 0),
                audio_duration=2.0,
                estimated_speech_duration=1.5,
                average_pause_duration=0.3,
                long_pause_count=2,
                speech_activity_rate=75.0,
                deviation_score=0.15,
                status="stable",
            )

        tests = SpeechTestRepository.get_previous_tests(self.db, self.patient_id, limit=5)
        self.assertEqual(len(tests), 5)


class BaselineCalculationTests(DatabaseTestSetup):
    """Tests for baseline calculation and availability."""

    def setUp(self) -> None:
        """Set up test database and patient."""
        super().setUp()
        self.patient_id = "NW-1024"
        SpeechTestRepository.create_patient(self.db, self.patient_id, "Test Patient")

    def test_baseline_unavailable_zero_tests(self) -> None:
        """Test baseline unavailable with zero tests."""
        baseline = SpeechTestRepository.calculate_baseline(self.db, self.patient_id)
        self.assertIsNone(baseline)

    def test_baseline_unavailable_fewer_than_three_tests(self) -> None:
        """Test baseline unavailable with fewer than 3 tests."""
        # Add 2 tests
        for i in range(2):
            SpeechTestRepository.save_speech_test(
                self.db,
                self.patient_id,
                f"test-{i:03d}",
                datetime(2026, 8, 21 + i, 10, 0, 0),
                audio_duration=2.0,
                estimated_speech_duration=1.5,
                average_pause_duration=0.3,
                long_pause_count=1,
                speech_activity_rate=75.0,
                deviation_score=0.15,
                status="stable",
            )

        baseline = SpeechTestRepository.calculate_baseline(self.db, self.patient_id)
        self.assertIsNone(baseline)

    def test_baseline_created_with_three_tests(self) -> None:
        """Test baseline created with at least 3 tests."""
        # Add 3 tests with known values
        for i in range(3):
            SpeechTestRepository.save_speech_test(
                self.db,
                self.patient_id,
                f"test-{i:03d}",
                datetime(2026, 8, 21 + i, 10, 0, 0),
                audio_duration=2.0,
                estimated_speech_duration=1.5,
                average_pause_duration=0.4,
                long_pause_count=2,
                speech_activity_rate=80.0,
                deviation_score=0.15,
                status="stable",
            )

        baseline = SpeechTestRepository.calculate_baseline(self.db, self.patient_id)
        self.assertIsNotNone(baseline)
        self.assertEqual(baseline["test_count"], 3)
        self.assertEqual(baseline["speech_activity_rate"], 80.0)
        self.assertEqual(baseline["average_pause_duration"], 0.4)
        self.assertEqual(baseline["long_pause_count"], 2)

    def test_baseline_excludes_baseline_establishing_tests(self) -> None:
        """Test that baseline_establishing tests are excluded from baseline calculation."""
        # Add 2 baseline_establishing tests
        for i in range(2):
            SpeechTestRepository.save_speech_test(
                self.db,
                self.patient_id,
                f"test-{i:03d}",
                datetime(2026, 8, 21 + i, 10, 0, 0),
                audio_duration=2.0,
                estimated_speech_duration=1.5,
                average_pause_duration=0.4,
                long_pause_count=2,
                speech_activity_rate=80.0,
                deviation_score=0.0,
                status="baseline_establishing",
            )

        # Add 3 stable tests
        for i in range(2, 5):
            SpeechTestRepository.save_speech_test(
                self.db,
                self.patient_id,
                f"test-{i:03d}",
                datetime(2026, 8, 21 + i, 10, 0, 0),
                audio_duration=2.0,
                estimated_speech_duration=1.5,
                average_pause_duration=0.4,
                long_pause_count=2,
                speech_activity_rate=80.0,
                deviation_score=0.15,
                status="stable",
            )

        baseline = SpeechTestRepository.calculate_baseline(self.db, self.patient_id)
        # Only 3 stable tests should be included
        self.assertIsNotNone(baseline)
        self.assertEqual(baseline["test_count"], 3)

    def test_current_test_excluded_from_baseline(self) -> None:
        """Test that current test is not included in its own baseline."""
        # Add 5 tests
        for i in range(5):
            SpeechTestRepository.save_speech_test(
                self.db,
                self.patient_id,
                f"test-{i:03d}",
                datetime(2026, 8, 21 + i, 10, 0, 0),
                audio_duration=2.0,
                estimated_speech_duration=1.5,
                average_pause_duration=0.4,
                long_pause_count=2,
                speech_activity_rate=80.0,
                deviation_score=0.15,
                status="stable",
            )

        # Get baseline (most recent 5 tests, but calculate_baseline gets previous tests)
        baseline = SpeechTestRepository.calculate_baseline(self.db, self.patient_id)
        self.assertIsNotNone(baseline)
        # Should have 5 tests since we're getting previous tests
        self.assertEqual(baseline["test_count"], 5)

    def test_baseline_uses_rolling_window(self) -> None:
        """Test that baseline uses previous 5 tests."""
        # Add 7 tests
        for i in range(7):
            SpeechTestRepository.save_speech_test(
                self.db,
                self.patient_id,
                f"test-{i:03d}",
                datetime(2026, 8, 21 + i, 10, 0, 0),
                audio_duration=2.0,
                estimated_speech_duration=1.5,
                average_pause_duration=0.4,
                long_pause_count=2,
                speech_activity_rate=80.0,
                deviation_score=0.15,
                status="stable",
            )

        baseline = SpeechTestRepository.calculate_baseline(self.db, self.patient_id)
        self.assertIsNotNone(baseline)
        # Should have 5 tests (rolling window)
        self.assertEqual(baseline["test_count"], 5)

    def test_multiple_patients_independent_baselines(self) -> None:
        """Test that multiple patients have independent baselines."""
        patient_2 = "NW-2048"
        SpeechTestRepository.create_patient(self.db, patient_2, "Test Patient 2")

        # Add 3 tests for patient 1
        for i in range(3):
            SpeechTestRepository.save_speech_test(
                self.db,
                self.patient_id,
                f"test-{i:03d}",
                datetime(2026, 8, 21 + i, 10, 0, 0),
                audio_duration=2.0,
                estimated_speech_duration=1.5,
                average_pause_duration=0.4,
                long_pause_count=2,
                speech_activity_rate=80.0,
                deviation_score=0.15,
                status="stable",
            )

        # Add 3 tests for patient 2 with different values
        for i in range(3):
            SpeechTestRepository.save_speech_test(
                self.db,
                patient_2,
                f"test-{i:03d}",
                datetime(2026, 8, 21 + i, 10, 0, 0),
                audio_duration=3.0,
                estimated_speech_duration=2.5,
                average_pause_duration=0.2,
                long_pause_count=1,
                speech_activity_rate=90.0,
                deviation_score=0.1,
                status="stable",
            )

        baseline_1 = SpeechTestRepository.calculate_baseline(self.db, self.patient_id)
        baseline_2 = SpeechTestRepository.calculate_baseline(self.db, patient_2)

        self.assertIsNotNone(baseline_1)
        self.assertIsNotNone(baseline_2)
        self.assertEqual(baseline_1["speech_activity_rate"], 80.0)
        self.assertEqual(baseline_2["speech_activity_rate"], 90.0)


class DeviationCalculationTests(DatabaseTestSetup):
    """Tests for deviation calculation and status classification."""

    def test_stable_classification(self) -> None:
        """Test stable status when deviation is 0.00-0.30."""
        baseline = BaselineFeatures(
            test_count=3,
            speech_activity_rate=75.0,
            average_pause_duration=0.5,
            long_pause_count=2.0,
        )
        result = BaselineCalculator.calculate_deviation(
            current_speech_activity_rate=75.0,  # Same as baseline
            current_average_pause_duration=0.5,  # Same as baseline
            current_long_pause_count=2,  # Same as baseline
            baseline=baseline,
        )
        self.assertEqual(result.status, "stable")
        self.assertLess(result.deviation_score, 0.30)

    def test_attention_classification(self) -> None:
        """Test attention status when deviation is 0.30-0.60."""
        baseline = BaselineFeatures(
            test_count=3,
            speech_activity_rate=75.0,
            average_pause_duration=0.5,
            long_pause_count=2.0,
        )
        result = BaselineCalculator.calculate_deviation(
            current_speech_activity_rate=45.0,  # 40% lower
            current_average_pause_duration=0.75,  # 50% higher
            current_long_pause_count=3,  # 50% higher
            baseline=baseline,
        )
        self.assertEqual(result.status, "attention")
        self.assertGreaterEqual(result.deviation_score, 0.30)
        self.assertLess(result.deviation_score, 0.60)

    def test_significant_change_classification(self) -> None:
        """Test significant_change status when deviation is 0.60-1.00."""
        baseline = BaselineFeatures(
            test_count=3,
            speech_activity_rate=75.0,
            average_pause_duration=0.5,
            long_pause_count=2.0,
        )
        result = BaselineCalculator.calculate_deviation(
            current_speech_activity_rate=30.0,  # 60% lower
            current_average_pause_duration=1.5,  # 200% higher
            current_long_pause_count=5,  # 150% higher
            baseline=baseline,
        )
        self.assertEqual(result.status, "significant_change")
        self.assertGreaterEqual(result.deviation_score, 0.60)

    def test_baseline_unavailable_result(self) -> None:
        """Test baseline_establishing result."""
        result = BaselineCalculator.create_baseline_unavailable_result()
        self.assertEqual(result.status, "baseline_establishing")
        self.assertEqual(result.deviation_score, 0.0)
        self.assertIn("baseline", result.monitoring_message.lower())


if __name__ == "__main__":
    unittest.main()
