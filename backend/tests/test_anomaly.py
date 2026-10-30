from app.services.anomaly.engine import compute_anomaly_score


def test_no_issues_low_score():
    results = [{"rule": "r1", "status": "PASS", "severity": "LOW", "message": "ok", "affected_field": None}]
    score, level, reasons = compute_anomaly_score(results, low_confidence_field_count=0)
    assert score == 0
    assert level == "LOW"


def test_high_severity_warnings_raise_score():
    results = [
        {"rule": "dup", "status": "WARNING", "severity": "HIGH", "message": "duplicate found", "affected_field": "apaar_id"},
        {"rule": "intake", "status": "WARNING", "severity": "HIGH", "message": "intake exceeded", "affected_field": "approved_intake"},
    ]
    score, level, reasons = compute_anomaly_score(results, low_confidence_field_count=3)
    assert score > 30
    assert level in ("MEDIUM", "HIGH")
    assert len(reasons) == 3
    assert all("fraud" not in r.lower() for r in reasons)
