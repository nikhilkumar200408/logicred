"""
Confidence Engine.

Combines OCR confidence, extraction confidence, and (once available)
validation outcomes into a single 0-100 field-level confidence score and a
band: HIGH / REVIEW / VERIFY. Thresholds are configurable via .env
(CONFIDENCE_HIGH_THRESHOLD, CONFIDENCE_REVIEW_THRESHOLD).
"""
from ...config import settings
from ...models import ConfidenceBand


def compute_field_confidence(ocr_confidence: float, extraction_confidence: float,
                              has_value: bool) -> float:
    """Returns a 0-100 confidence score for a single field."""
    if not has_value:
        return 0.0
    # Weighted blend: extraction confidence reflects how well the value was
    # *interpreted*, OCR confidence reflects how well it was *read*.
    score = (ocr_confidence * 0.55 + extraction_confidence * 0.45) * 100
    return round(max(0.0, min(100.0, score)), 1)


def band_for_confidence(score: float, has_value: bool) -> ConfidenceBand:
    if not has_value:
        return ConfidenceBand.VERIFY
    if score >= settings.CONFIDENCE_HIGH_THRESHOLD:
        return ConfidenceBand.HIGH
    if score >= settings.CONFIDENCE_REVIEW_THRESHOLD:
        return ConfidenceBand.REVIEW
    return ConfidenceBand.VERIFY


def compute_overall_confidence(field_scores: list[float]) -> float:
    if not field_scores:
        return 0.0
    return round(sum(field_scores) / len(field_scores), 1)
