"""
OCR provider interface. Any OCR engine (PaddleOCR, Tesseract, cloud OCR, etc.)
can be plugged in by implementing OCRProvider.extract().

This abstraction is what lets LogicRed add more OCR engines / Indian
languages later without touching the rest of the pipeline.
"""
from abc import ABC, abstractmethod
from typing import List, TypedDict


class OCRSpan(TypedDict):
    text: str
    confidence: float  # 0-1
    page: int
    bbox: List[float]  # [x1, y1, x2, y2]


class OCRProvider(ABC):
    name: str = "base"

    @abstractmethod
    def extract(self, file_path: str, scenario_tag: str | None = None) -> List[OCRSpan]:
        """Return a list of OCR text spans with confidence + location evidence."""
        raise NotImplementedError
