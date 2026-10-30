from app.services.confidence.engine import compute_field_confidence, band_for_confidence, compute_overall_confidence
from app.models import ConfidenceBand


def test_high_confidence_band():
    score = compute_field_confidence(0.97, 0.95, has_value=True)
    assert score > 90
    assert band_for_confidence(score, True) == ConfidenceBand.HIGH


def test_missing_value_is_verify_band():
    score = compute_field_confidence(0.0, 0.0, has_value=False)
    assert score == 0.0
    assert band_for_confidence(score, False) == ConfidenceBand.VERIFY


def test_low_confidence_band():
    score = compute_field_confidence(0.5, 0.4, has_value=True)
    assert band_for_confidence(score, True) == ConfidenceBand.VERIFY


def test_overall_confidence_average():
    assert compute_overall_confidence([90, 80, 70]) == 80.0
    assert compute_overall_confidence([]) == 0.0
