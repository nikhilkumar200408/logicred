"""
Anomaly Engine.

Produces a simple, explainable 0-100 "potential inconsistency" score from:
  - number and severity of validation warnings/failures
  - number of low-confidence fields
  - cross-record inconsistencies (duplicate survey, area mismatch, etc.)

This is deliberately NOT a fraud detector. Output language always uses
"potential inconsistency" terminology, per product policy.
"""
from typing import List, Tuple

SEVERITY_WEIGHTS = {"LOW": 5, "MEDIUM": 15, "HIGH": 25}


def compute_anomaly_score(
    validation_results: List[dict], low_confidence_field_count: int
) -> Tuple[int, str, List[str]]:
    score = 0
    reasons: List[str] = []

    for v in validation_results:
        if v["status"] in ("WARNING", "FAIL"):
            weight = SEVERITY_WEIGHTS.get(v["severity"], 5)
            score += weight
            reasons.append(f"{v['message']}")

    if low_confidence_field_count:
        contribution = min(low_confidence_field_count * 6, 24)
        score += contribution
        reasons.append(
            f"{low_confidence_field_count} field(s) have low extraction confidence and require verification."
        )

    score = min(score, 100)

    if score >= 60:
        level = "HIGH"
    elif score >= 30:
        level = "MEDIUM"
    else:
        level = "LOW"

    if not reasons:
        reasons.append("No significant inconsistencies detected.")

    return score, level, reasons
