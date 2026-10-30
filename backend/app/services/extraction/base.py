"""
Extraction provider interface. Converts raw OCR evidence spans into
structured land-record fields. A real provider (see llm_provider.py) calls an
LLM with strict JSON schema output; the demo provider is fully deterministic.

Contract every implementation MUST follow:
  - never invent a value that is not grounded in OCR evidence
  - missing information must be returned as value=None, never guessed
  - every field must carry ocr_confidence, extraction_confidence, and the
    exact source evidence (page, bbox, source_text) that produced it
"""
from abc import ABC, abstractmethod
from typing import List, Optional, TypedDict

from ..ocr.base import OCRSpan


class ExtractedFieldResult(TypedDict):
    field_name: str
    value: Optional[str]
    ocr_confidence: float
    extraction_confidence: float
    source_page: Optional[int]
    source_bbox: Optional[List[float]]
    source_text: Optional[str]
    review_reason: Optional[str]


class ExtractionProvider(ABC):
    name: str = "base"

    @abstractmethod
    def extract_fields(
        self, ocr_spans: List[OCRSpan], scenario_tag: Optional[str] = None
    ) -> List[ExtractedFieldResult]:
        raise NotImplementedError
