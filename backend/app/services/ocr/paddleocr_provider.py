"""
Real PaddleOCR provider (P0 architecture is provider-agnostic; this is the
production implementation used when OCR_PROVIDER=paddleocr in .env).

This module intentionally imports paddleocr lazily so that the demo build
does NOT require the (large) PaddleOCR/PaddlePaddle dependency to run.
Install with: pip install paddlepaddle paddleocr
"""
from typing import List

from .base import OCRProvider, OCRSpan


class PaddleOCRProvider(OCRProvider):
    name = "paddleocr"

    def __init__(self, lang: str = "en"):
        try:
            from paddleocr import PaddleOCR  # type: ignore
        except ImportError as e:
            raise RuntimeError(
                "paddleocr is not installed. Run "
                "`pip install paddlepaddle paddleocr` to enable the real OCR "
                "provider, or set OCR_PROVIDER=demo in .env."
            ) from e
        self._engine = PaddleOCR(use_angle_cls=True, lang=lang, show_log=False)

    def extract(self, file_path: str, scenario_tag: str | None = None) -> List[OCRSpan]:
        # PyMuPDF is used upstream (document_service) to rasterize PDF pages to
        # images before they reach this method; file_path here is an image.
        result = self._engine.ocr(file_path, cls=True)
        spans: List[OCRSpan] = []
        for page_idx, page in enumerate(result or [], start=1):
            for line in page or []:
                bbox_pts, (text, conf) = line
                xs = [p[0] for p in bbox_pts]
                ys = [p[1] for p in bbox_pts]
                spans.append(
                    {
                        "text": text,
                        "confidence": float(conf),
                        "page": page_idx,
                        "bbox": [min(xs), min(ys), max(xs), max(ys)],
                    }
                )
        return spans
