"""
Dynamic translation layer for OCR output.

Detects non-Latin (Devanagari/Kannada) text in an OCR span and translates it
to English for the extraction/validation pipeline, while the ORIGINAL
regional-language text is always preserved alongside it for the audit trail
(never discarded — see TranslatedSpan.original_text).

Uses deep-translator's GoogleTranslator (requires outbound internet access
in the deployment environment). If translation is disabled or the network
call fails, the pipeline degrades gracefully: the original text is kept
as-is and field extraction falls back to matching regional-language label
keywords directly (see extraction/regex_provider.py LABELS_HI / LABELS_KN).
"""
import logging
import re
from typing import Optional, TypedDict

from ...config import settings

logger = logging.getLogger(__name__)

DEVANAGARI_RE = re.compile(r"[\u0900-\u097F]")
KANNADA_RE = re.compile(r"[\u0C80-\u0CFF]")


class TranslatedSpan(TypedDict):
    original_text: str
    translated_text: str
    detected_lang: Optional[str]  # "hi" | "kn" | "en" | None


def detect_script(text: str) -> Optional[str]:
    if DEVANAGARI_RE.search(text):
        return "hi"
    if KANNADA_RE.search(text):
        return "kn"
    if text.strip():
        return "en"
    return None


_translator_cache: dict = {}


def _get_translator(source: str):
    if source not in _translator_cache:
        from deep_translator import GoogleTranslator

        _translator_cache[source] = GoogleTranslator(source=source, target="en")
    return _translator_cache[source]


def translate_line(text: str) -> TranslatedSpan:
    lang = detect_script(text)
    if not settings.TRANSLATE_ENABLED or lang in (None, "en"):
        return {"original_text": text, "translated_text": text, "detected_lang": lang}

    try:
        translator = _get_translator(lang)
        translated = translator.translate(text)
        if not translated:
            raise ValueError("empty translation result")
        return {"original_text": text, "translated_text": translated, "detected_lang": lang}
    except Exception as e:  # noqa: BLE001
        # Network unavailable / API error — degrade gracefully. The regional
        # text is preserved untouched; the regex extraction provider also
        # knows the native-script field labels so extraction can still work.
        logger.warning("Translation unavailable for %r (%s); using original text.", text[:40], e)
        return {"original_text": text, "translated_text": text, "detected_lang": lang}
