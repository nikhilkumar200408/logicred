from ...config import settings
from .base import ExtractionProvider, ExtractedFieldResult
from .demo_provider import DemoExtractionProvider, ALL_FIELDS


def get_extraction_provider() -> ExtractionProvider:
    if settings.EXTRACTION_PROVIDER == "llm" and settings.LLM_API_KEY:
        from .llm_provider import LLMExtractionProvider

        return LLMExtractionProvider()
    if settings.EXTRACTION_PROVIDER == "regex":
        from .regex_provider import RegexExtractionProvider

        return RegexExtractionProvider()
    return DemoExtractionProvider()
