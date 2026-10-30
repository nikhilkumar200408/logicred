from ...config import settings
from .base import OCRProvider, OCRSpan
from .demo_provider import DemoOCRProvider


def get_ocr_provider() -> OCRProvider:
    if settings.OCR_PROVIDER == "tesseract":
        from .tesseract_provider import TesseractOCRProvider

        return TesseractOCRProvider()
    if settings.OCR_PROVIDER == "paddleocr":
        from .paddleocr_provider import PaddleOCRProvider

        return PaddleOCRProvider()
    return DemoOCRProvider()
