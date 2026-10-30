"""
Deterministic DEMO extraction provider.

Maps OCR evidence spans onto the LogicRed student-record schema. This
simulates what an LLM structured-extraction call would produce, without
requiring an LLM_API_KEY. It NEVER invents values: any field with no
corresponding OCR evidence is returned as value=None (missing).
"""
import re
from typing import List, Optional

from ..ocr.base import OCRSpan
from .base import ExtractionProvider, ExtractedFieldResult

# Position-ordered field mapping for each demo scenario. `None` means that
# OCR span is evidence for something other than a schema field (e.g. a note,
# or a cross-record area value used only by the validation engine).
SCENARIO_FIELD_ORDER: dict[str, List[Optional[str]]] = {
    "clean": ['apaar_id', 'student_name', 'student_id', 'dob', 'institution_id', 'institution_name', 'program', 'year_of_admission', 'approved_intake', 'supernumerary_seat', 'nri_category', 'oci_status', 'foreign_national', 'consent_given'],
    "poor_scan": ['apaar_id', 'student_name', 'student_id', 'institution_id', 'program', 'year_of_admission'],
    "invalid_apaar": ['apaar_id', 'student_name', 'student_id', 'dob', 'institution_id', 'institution_name', 'program', 'year_of_admission', 'approved_intake', 'supernumerary_seat', 'nri_category', 'oci_status', 'foreign_national', 'consent_given'],
    "intake_exceeded": ['apaar_id', 'student_name', 'student_id', 'dob', 'institution_id', 'institution_name', 'program', 'year_of_admission', 'approved_intake', 'supernumerary_seat', 'nri_category', 'oci_status', 'foreign_national', 'consent_given'],
    "conflicting_category": ['apaar_id', 'student_name', 'student_id', 'dob', 'institution_id', 'institution_name', 'program', 'year_of_admission', 'approved_intake', 'supernumerary_seat', 'nri_category', 'oci_status', 'foreign_national', 'consent_given', 'oci_status', 'foreign_national'],
}

ALL_FIELDS = [
    "apaar_id", "student_name", "student_id", "dob", "gender",
    "institution_id", "institution_name", "program", "branch",
    "year_of_admission", "admission_category", "approved_intake",
    "actual_enrolment", "supernumerary_seat", "nri_category", "oci_status",
    "foreign_national", "nationality", "email", "mobile", "consent_given",
]


_LABEL_PREFIX = re.compile(r"^[^:]*?(?:No\.|:)\s*")


def _clean_value(raw_text: str) -> str:
    """Strip the leading label (e.g. 'Owner:', 'Survey No.') to get the raw
    value, regardless of whether the OCR text used a colon or 'No.' style
    label."""
    m = _LABEL_PREFIX.match(raw_text)
    if m:
        return raw_text[m.end():].strip()
    return raw_text.strip()


def _extraction_confidence(ocr_confidence: float, corrupted: bool) -> float:
    """Simulate an LLM's confidence in interpreting the OCR text. LLM
    confidence is typically close to but not identical to OCR confidence;
    heavily corrupted text degrades it further."""
    base = ocr_confidence * 0.98
    if corrupted:
        base *= 0.85
    return round(max(0.0, min(1.0, base)), 3)


def _looks_corrupted(text: str) -> bool:
    return bool(re.search(r"[_?]", text)) or "illegible" in text.lower()


class DemoExtractionProvider(ExtractionProvider):
    name = "demo"

    def extract_fields(
        self, ocr_spans: List[OCRSpan], scenario_tag: Optional[str] = None
    ) -> List[ExtractedFieldResult]:
        tag = scenario_tag or "clean"
        field_order = SCENARIO_FIELD_ORDER.get(tag, SCENARIO_FIELD_ORDER["clean"])

        results: dict[str, ExtractedFieldResult] = {}

        for idx, span in enumerate(ocr_spans):
            field_name = field_order[idx] if idx < len(field_order) else None
            if field_name is None:
                continue

            corrupted = _looks_corrupted(span["text"])
            value = _clean_value(span["text"])
            if corrupted:
                # Heavily corrupted values are too unreliable to present as a
                # confident extracted value - keep the raw OCR text as
                # low-confidence evidence rather than fabricating a "clean"
                # guess.
                review_reason = "Low-quality scan / illegible handwriting"
            else:
                review_reason = None

            if "illegible" in value.lower() or value.strip() in ("", "?"):
                value = None  # never hallucinate a value we can't support
                review_reason = review_reason or "Field illegible in source document"

            results[field_name] = {
                "field_name": field_name,
                "value": value,
                "ocr_confidence": round(span["confidence"], 3),
                "extraction_confidence": _extraction_confidence(span["confidence"], corrupted),
                "source_page": span["page"],
                "source_bbox": span["bbox"],
                "source_text": span["text"],
                "review_reason": review_reason,
            }

        # Any schema field with no OCR evidence at all -> explicitly missing
        final: List[ExtractedFieldResult] = []
        for field_name in ALL_FIELDS:
            if field_name in results:
                final.append(results[field_name])
            else:
                final.append(
                    {
                        "field_name": field_name,
                        "value": None,
                        "ocr_confidence": 0.0,
                        "extraction_confidence": 0.0,
                        "source_page": None,
                        "source_bbox": None,
                        "source_text": None,
                        "review_reason": "No evidence found in source document",
                    }
                )
        return final
