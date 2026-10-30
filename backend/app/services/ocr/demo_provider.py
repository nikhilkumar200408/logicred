"""
Deterministic DEMO OCR provider.

Produces realistic OCR evidence (text + confidence + page + bbox) for each of
the synthetic demo scenarios (clean, poor scan, invalid APAAR, intake exceeded, conflicting category), WITHOUT calling
any external OCR engine. This lets judges run the full pipeline with zero
setup. Swap OCR_PROVIDER=paddleocr in .env to use the real PaddleOCR provider
once that dependency is installed (see services/ocr/paddleocr_provider.py stub).
"""
import random
from typing import List

from .base import OCRProvider, OCRSpan

# Scenario -> list of (field label text as it would appear on the scanned
# document, OCR confidence, page, bbox). This simulates what PaddleOCR would
# return after preprocessing a scanned admission form.

SCENARIO_OCR: dict[str, List[OCRSpan]] = {
    "clean": [
        {"text": "APAAR ID: 123456789012", "confidence": 0.97, "page": 1, "bbox": [80, 120, 420, 150]},
        {"text": "Student Name: Aarav Sharma", "confidence": 0.97, "page": 1, "bbox": [80, 160, 420, 190]},
        {"text": "Student ID: 21BTCS012", "confidence": 0.96, "page": 1, "bbox": [80, 200, 420, 230]},
        {"text": "Date of Birth: 14-08-2003", "confidence": 0.95, "page": 1, "bbox": [80, 240, 420, 270]},
        {"text": "Institution ID: 1-1234567890", "confidence": 0.96, "page": 1, "bbox": [80, 280, 420, 310]},
        {"text": "Institution Name: Sample Institute of Technology", "confidence": 0.95, "page": 1, "bbox": [80, 320, 420, 350]},
        {"text": "Program: B.Tech CSE", "confidence": 0.96, "page": 1, "bbox": [80, 360, 420, 390]},
        {"text": "Year of Admission: 2025", "confidence": 0.97, "page": 1, "bbox": [80, 400, 420, 430]},
        {"text": "Approved Intake: 120", "confidence": 0.96, "page": 1, "bbox": [80, 440, 420, 470]},
        {"text": "Supernumerary: No", "confidence": 0.94, "page": 1, "bbox": [80, 480, 420, 510]},
        {"text": "NRI: No", "confidence": 0.94, "page": 1, "bbox": [80, 520, 420, 550]},
        {"text": "OCI: No", "confidence": 0.94, "page": 1, "bbox": [80, 560, 420, 590]},
        {"text": "Foreign National: No", "confidence": 0.94, "page": 1, "bbox": [80, 600, 420, 630]},
        {"text": "Consent: Yes", "confidence": 0.95, "page": 1, "bbox": [80, 640, 420, 670]},
    ],
    "poor_scan": [
        {"text": "APAAR ID: 2345_6789O123", "confidence": 0.42, "page": 1, "bbox": [80, 120, 420, 150]},
        {"text": "Student Name: Rohan V?rma", "confidence": 0.55, "page": 1, "bbox": [80, 160, 420, 190]},
        {"text": "Student ID: 21BTCS0_4", "confidence": 0.5, "page": 1, "bbox": [80, 200, 420, 230]},
        {"text": "Institution ID: 1-1234567890", "confidence": 0.9, "page": 1, "bbox": [80, 240, 420, 270]},
        {"text": "Program: B.Tech CSE", "confidence": 0.88, "page": 1, "bbox": [80, 280, 420, 310]},
        {"text": "Year of Admission: 2025", "confidence": 0.9, "page": 1, "bbox": [80, 320, 420, 350]},
    ],
    "invalid_apaar": [
        {"text": "APAAR ID: 12345", "confidence": 0.97, "page": 1, "bbox": [80, 120, 420, 150]},
        {"text": "Student Name: Neha Gupta", "confidence": 0.97, "page": 1, "bbox": [80, 160, 420, 190]},
        {"text": "Student ID: 21BTCS345", "confidence": 0.96, "page": 1, "bbox": [80, 200, 420, 230]},
        {"text": "Date of Birth: 14-08-2003", "confidence": 0.95, "page": 1, "bbox": [80, 240, 420, 270]},
        {"text": "Institution ID: 1-1234567890", "confidence": 0.96, "page": 1, "bbox": [80, 280, 420, 310]},
        {"text": "Institution Name: Sample Institute of Technology", "confidence": 0.95, "page": 1, "bbox": [80, 320, 420, 350]},
        {"text": "Program: B.Tech CSE", "confidence": 0.96, "page": 1, "bbox": [80, 360, 420, 390]},
        {"text": "Year of Admission: 2025", "confidence": 0.97, "page": 1, "bbox": [80, 400, 420, 430]},
        {"text": "Approved Intake: 120", "confidence": 0.96, "page": 1, "bbox": [80, 440, 420, 470]},
        {"text": "Supernumerary: No", "confidence": 0.94, "page": 1, "bbox": [80, 480, 420, 510]},
        {"text": "NRI: No", "confidence": 0.94, "page": 1, "bbox": [80, 520, 420, 550]},
        {"text": "OCI: No", "confidence": 0.94, "page": 1, "bbox": [80, 560, 420, 590]},
        {"text": "Foreign National: No", "confidence": 0.94, "page": 1, "bbox": [80, 600, 420, 630]},
        {"text": "Consent: Yes", "confidence": 0.95, "page": 1, "bbox": [80, 640, 420, 670]},
    ],
    "intake_exceeded": [
        {"text": "APAAR ID: 345678901234", "confidence": 0.97, "page": 1, "bbox": [80, 120, 420, 150]},
        {"text": "Student Name: Karan Mehta", "confidence": 0.97, "page": 1, "bbox": [80, 160, 420, 190]},
        {"text": "Student ID: 21BTCS234", "confidence": 0.96, "page": 1, "bbox": [80, 200, 420, 230]},
        {"text": "Date of Birth: 14-08-2003", "confidence": 0.95, "page": 1, "bbox": [80, 240, 420, 270]},
        {"text": "Institution ID: 1-1234567890", "confidence": 0.96, "page": 1, "bbox": [80, 280, 420, 310]},
        {"text": "Institution Name: Sample Institute of Technology", "confidence": 0.95, "page": 1, "bbox": [80, 320, 420, 350]},
        {"text": "Program: B.Tech CSE", "confidence": 0.96, "page": 1, "bbox": [80, 360, 420, 390]},
        {"text": "Year of Admission: 2025", "confidence": 0.97, "page": 1, "bbox": [80, 400, 420, 430]},
        {"text": "Approved Intake: 1", "confidence": 0.96, "page": 1, "bbox": [80, 440, 420, 470]},
        {"text": "Supernumerary: No", "confidence": 0.94, "page": 1, "bbox": [80, 480, 420, 510]},
        {"text": "NRI: No", "confidence": 0.94, "page": 1, "bbox": [80, 520, 420, 550]},
        {"text": "OCI: No", "confidence": 0.94, "page": 1, "bbox": [80, 560, 420, 590]},
        {"text": "Foreign National: No", "confidence": 0.94, "page": 1, "bbox": [80, 600, 420, 630]},
        {"text": "Consent: Yes", "confidence": 0.95, "page": 1, "bbox": [80, 640, 420, 670]},
    ],
    "conflicting_category": [
        {"text": "APAAR ID: 456789012345", "confidence": 0.97, "page": 1, "bbox": [80, 120, 420, 150]},
        {"text": "Student Name: Li Wei", "confidence": 0.97, "page": 1, "bbox": [80, 160, 420, 190]},
        {"text": "Student ID: 21BTCS345", "confidence": 0.96, "page": 1, "bbox": [80, 200, 420, 230]},
        {"text": "Date of Birth: 14-08-2003", "confidence": 0.95, "page": 1, "bbox": [80, 240, 420, 270]},
        {"text": "Institution ID: 1-1234567890", "confidence": 0.96, "page": 1, "bbox": [80, 280, 420, 310]},
        {"text": "Institution Name: Sample Institute of Technology", "confidence": 0.95, "page": 1, "bbox": [80, 320, 420, 350]},
        {"text": "Program: B.Tech CSE", "confidence": 0.96, "page": 1, "bbox": [80, 360, 420, 390]},
        {"text": "Year of Admission: 2025", "confidence": 0.97, "page": 1, "bbox": [80, 400, 420, 430]},
        {"text": "Approved Intake: 120", "confidence": 0.96, "page": 1, "bbox": [80, 440, 420, 470]},
        {"text": "Supernumerary: No", "confidence": 0.94, "page": 1, "bbox": [80, 480, 420, 510]},
        {"text": "NRI: No", "confidence": 0.94, "page": 1, "bbox": [80, 520, 420, 550]},
        {"text": "OCI: No", "confidence": 0.94, "page": 1, "bbox": [80, 560, 420, 590]},
        {"text": "Foreign National: No", "confidence": 0.94, "page": 1, "bbox": [80, 600, 420, 630]},
        {"text": "Consent: Yes", "confidence": 0.95, "page": 1, "bbox": [80, 640, 420, 670]},
        {"text": "OCI: Yes", "confidence": 0.93, "page": 1, "bbox": [80, 680, 420, 710]},
        {"text": "Foreign National: Yes", "confidence": 0.93, "page": 1, "bbox": [80, 720, 420, 750]},
    ],
}


class DemoOCRProvider(OCRProvider):
    name = "demo"

    def extract(self, file_path: str, scenario_tag: str | None = None) -> List[OCRSpan]:
        tag = scenario_tag or "clean"
        spans = SCENARIO_OCR.get(tag, SCENARIO_OCR["clean"])
        # Return a deep-ish copy so downstream mutation never corrupts the template
        return [dict(s) for s in spans]

    @staticmethod
    def available_scenarios() -> List[str]:
        return list(SCENARIO_OCR.keys())
