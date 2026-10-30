"""
Real (non-demo) field extraction provider.

Takes real OCR line spans (English, Hindi, or Kannada), translates
non-English lines to English via the translation layer (keeping the
original-script text for the audit trail), then classifies each line into
one of the LogicRed student-record schema fields using multilingual label
matching. Never invents a value: a line that doesn't match a known label is
simply not mapped to any field.
"""
import re
from typing import List, Optional

from ..ocr.base import OCRSpan
from ..translation.translator import translate_line
from .base import ExtractionProvider, ExtractedFieldResult

ALL_FIELDS = [
    "apaar_id", "student_name", "student_id", "dob", "gender",
    "institution_id", "institution_name", "program", "branch",
    "year_of_admission", "admission_category", "approved_intake",
    "actual_enrolment", "supernumerary_seat", "nri_category", "oci_status",
    "foreign_national", "nationality", "email", "mobile", "consent_given",
]

# Label keywords as they may appear on a scanned admission form / student list
# (English + Hindi). Translation is the second pass for other scripts.
FIELD_LABELS: dict[str, List[str]] = {
    "apaar_id": ["apaar id", "apaar no", "apaar", "आपार"],
    "student_name": ["student name", "name of student", "candidate name", "name", "छात्र का नाम", "नाम"],
    "student_id": ["student id", "enrolment no", "enrollment no", "roll no", "registration no", "reg no", "अनुक्रमांक"],
    "dob": ["date of birth", "dob", "जन्म तिथि"],
    "gender": ["gender", "sex", "लिंग"],
    "institution_id": ["institution id", "aicte id", "aicte approval", "institute id"],
    "institution_name": ["institution name", "institute name", "institution", "college", "संस्थान"],
    "program": ["program", "programme", "course", "पाठ्यक्रम"],
    "branch": ["branch", "specialisation", "specialization", "stream", "शाखा"],
    "year_of_admission": ["year of admission", "admission year", "प्रवेश वर्ष"],
    "admission_category": ["admission category", "category", "quota", "श्रेणी"],
    "approved_intake": ["approved intake", "sanctioned intake", "intake", "स्वीकृत सीटें"],
    "actual_enrolment": ["actual enrolment", "actual enrollment", "enrolment", "enrollment"],
    "supernumerary_seat": ["supernumerary", "supernumerary seat"],
    "nri_category": ["nri", "nri category"],
    "oci_status": ["oci", "oci status", "overseas citizen"],
    "foreign_national": ["foreign national", "fn status", "fn"],
    "nationality": ["nationality", "राष्ट्रीयता"],
    "email": ["email", "e-mail", "ईमेल"],
    "mobile": ["mobile", "phone", "contact no", "मोबाइल"],
    "consent_given": ["consent", "consent given", "सहमति"],
}

_LABEL_SPLIT = re.compile(r"^(.*?)(?:no\.?|[:;।])\s*(.*)$", re.IGNORECASE)


def _match_field(label_text: str) -> Optional[str]:
    normalized = label_text.strip().lower()
    best_field, best_len = None, 0
    for field, keywords in FIELD_LABELS.items():
        for kw in keywords:
            if normalized.startswith(kw) and len(kw) > best_len:
                best_field, best_len = field, len(kw)
    return best_field


def _split_label_value(line: str) -> tuple[Optional[str], str]:
    m = _LABEL_SPLIT.match(line)
    if not m:
        return None, line.strip()
    label_part, value_part = m.group(1).strip(), m.group(2).strip(" :;।.-\u200c")
    if not value_part:
        return None, line.strip()
    field = _match_field(label_part)
    return field, value_part


class RegexExtractionProvider(ExtractionProvider):
    """Deterministic, explainable multilingual extraction — no LLM call, no
    hallucination risk. This is the default real-pipeline extractor; swap in
    LLMExtractionProvider for higher recall on unusual document layouts once
    an LLM_API_KEY is configured."""

    name = "regex"

    def extract_fields(
        self, ocr_spans: List[OCRSpan], scenario_tag: Optional[str] = None
    ) -> List[ExtractedFieldResult]:
        found: dict[str, ExtractedFieldResult] = {}

        for span in ocr_spans:
            raw_text = span["text"]
            translated = translate_line(raw_text)
            field = _match_field(translated["translated_text"])
            if field is None:
                # Try splitting on ':'/'No.' first, in case the label and
                # value were OCR'd as one continuous line.
                field, value = _split_label_value(translated["translated_text"])
            else:
                _, value = _split_label_value(translated["translated_text"])

            if field is None or field in found:
                continue  # unmapped line, or field already captured (first match wins)

            was_translated = translated["detected_lang"] not in (None, "en")
            extraction_confidence = span["confidence"] * (0.93 if was_translated else 0.98)

            found[field] = {
                "field_name": field,
                "value": value or None,
                "ocr_confidence": round(span["confidence"], 3),
                "extraction_confidence": round(max(0.0, min(1.0, extraction_confidence)), 3),
                "source_page": span["page"],
                "source_bbox": span["bbox"],
                # Audit trail always keeps the ORIGINAL regional-language text,
                # never just the translation, per product policy.
                "source_text": translated["original_text"],
                "review_reason": (
                    f"Translated from {translated['detected_lang']} for extraction; "
                    "original text preserved for audit." if was_translated else None
                ),
            }

        results: List[ExtractedFieldResult] = []
        for field in ALL_FIELDS:
            if field in found:
                results.append(found[field])
            else:
                results.append({
                    "field_name": field, "value": None, "ocr_confidence": 0.0,
                    "extraction_confidence": 0.0, "source_page": None, "source_bbox": None,
                    "source_text": None, "review_reason": "No matching label found in document.",
                })
        return results
