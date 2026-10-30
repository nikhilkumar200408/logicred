"""
LLM-backed structured extraction provider. Used when LLM_PROVIDER is set to
"anthropic" (or another supported provider) and LLM_API_KEY is present.

The LLM is prompted to return STRICT JSON matching the student-record schema and
explicitly instructed to:
  - never invent a value not present in the OCR text
  - mark fields as null when missing
  - return a confidence 0-1 for every field based on how clearly the OCR text
    supports that value

This keeps the extraction contract identical to DemoExtractionProvider so the
rest of the pipeline (confidence engine, validation engine, etc.) is provider
agnostic.
"""
import json
from typing import List, Optional

from ...config import settings
from ..ocr.base import OCRSpan
from .base import ExtractionProvider, ExtractedFieldResult
from .demo_provider import ALL_FIELDS

SYSTEM_PROMPT = """You are a structured data extraction engine for AICTE student
admission records. You will be given raw OCR text spans (each with a confidence
score, page number, and text). Extract the following fields ONLY if directly
supported by the OCR text: apaar_id, student_name, student_id, dob, gender,
institution_id, institution_name, program, branch, year_of_admission,
admission_category, approved_intake, actual_enrolment, supernumerary_seat,
nri_category, oci_status, foreign_national, nationality, email, mobile,
consent_given.

Rules:
- NEVER invent or guess a value. If a field is not clearly present, return null.
- For every field, return a confidence between 0 and 1 reflecting how
  confident you are that the extracted value is correct, given OCR noise.
- Return ONLY valid JSON, no markdown fences, no commentary, in this shape:
  {"fields": [{"field_name": str, "value": str|null, "confidence": float,
  "source_page": int|null, "source_text": str|null}]}
"""


class LLMExtractionProvider(ExtractionProvider):
    name = "llm"

    def extract_fields(
        self, ocr_spans: List[OCRSpan], scenario_tag: Optional[str] = None
    ) -> List[ExtractedFieldResult]:
        if not settings.LLM_API_KEY:
            raise RuntimeError(
                "LLM_API_KEY is not set. Set LLM_PROVIDER=demo in .env to use "
                "the deterministic offline extraction provider instead."
            )

        import requests  # local import: only needed for the real provider

        user_content = (
            "OCR spans (JSON):\n"
            + json.dumps(ocr_spans, indent=2)
            + "\n\nExtract the student-record fields per the rules above."
        )

        response = requests.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": settings.LLM_API_KEY,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json={
                "model": "claude-sonnet-4-6",
                "max_tokens": 2000,
                "system": SYSTEM_PROMPT,
                "messages": [{"role": "user", "content": user_content}],
            },
            timeout=30,
        )
        response.raise_for_status()
        data = response.json()
        text = "".join(
            block.get("text", "") for block in data.get("content", []) if block.get("type") == "text"
        )
        parsed = json.loads(text)

        by_name = {f["field_name"]: f for f in parsed.get("fields", [])}
        results: List[ExtractedFieldResult] = []
        for field_name in ALL_FIELDS:
            f = by_name.get(field_name, {})
            conf = float(f.get("confidence", 0.0))
            results.append(
                {
                    "field_name": field_name,
                    "value": f.get("value"),
                    "ocr_confidence": conf,
                    "extraction_confidence": conf,
                    "source_page": f.get("source_page"),
                    "source_bbox": None,
                    "source_text": f.get("source_text"),
                    "review_reason": None if f.get("value") else "No evidence found in source document",
                }
            )
        return results
