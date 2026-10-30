"""
Real OCR provider: OpenCV preprocessing + Tesseract multi-script OCR.

Pipeline per page:
  1. Rasterize (PDF -> image via pdf2image, or load image directly)
  2. Preprocess (OpenCV): grayscale -> deskew (Hough line transform) ->
     denoise -> CLAHE contrast enhancement -> adaptive threshold
  3. OCR (pytesseract, lang="eng+hin+kan") using image_to_data so every text
     span carries a real per-word confidence and bounding box
  4. Word-level spans are grouped into line-level spans (grouped by TSV
     block/par/line indices) so downstream field extraction sees coherent
     "label: value" lines, matching the OCRSpan contract.

Requires system packages: tesseract-ocr, tesseract-ocr-hin, tesseract-ocr-kan,
poppler-utils (for PDF rasterization). See backend/README or .env.example.
"""
import logging
import os
from typing import List, Optional

import cv2
import numpy as np
import pytesseract
from PIL import Image

from .base import OCRProvider, OCRSpan

logger = logging.getLogger(__name__)

CANDIDATE_LANGS = ["eng", "hin", "kan"]


def _ocr_with_lang(processed: np.ndarray, lang: str) -> dict:
    return pytesseract.image_to_data(
        processed, lang=lang, output_type=pytesseract.Output.DICT, config="--psm 6"
    )


def _score(data: dict) -> float:
    confs = [float(c) for c in data["conf"] if str(c).strip() not in ("", "-1") and float(c) >= 0]
    if not confs:
        return -1.0
    # Reward both average confidence and how much text was actually found —
    # a language model that "gives up" with a handful of high-confidence
    # tokens should not beat one that reads the whole page.
    return (sum(confs) / len(confs)) * min(1.0, len(confs) / 20)


def _best_language_pass(processed: np.ndarray) -> dict:
    """Land record documents are typically single-script per page. Running
    all Indic language models simultaneously (lang='eng+hin+kan') makes
    Tesseract hallucinate cross-script noise on every line. Instead we OCR
    once per candidate language and keep whichever pass actually read the
    page best — this is what 'multilingual document recognition' means in
    practice: detect-then-read, not read-all-scripts-at-once."""
    best_data, best_score = None, -1.0
    for lang in CANDIDATE_LANGS:
        try:
            data = _ocr_with_lang(processed, lang)
        except pytesseract.TesseractNotFoundError:
            raise
        except Exception as e:  # noqa: BLE001
            logger.warning("OCR pass failed for lang=%s: %s", lang, e)
            continue
        score = _score(data)
        if score > best_score:
            best_data, best_score = data, score
    return best_data or {"text": [], "conf": [], "left": [], "top": [], "width": [], "height": [],
                          "block_num": [], "par_num": [], "line_num": []}


def _load_pages(file_path: str) -> List[np.ndarray]:
    """Returns a list of BGR numpy images, one per page."""
    ext = os.path.splitext(file_path)[1].lower()
    if ext == ".pdf":
        from pdf2image import convert_from_path

        pil_pages = convert_from_path(file_path, dpi=300)
        return [cv2.cvtColor(np.array(p.convert("RGB")), cv2.COLOR_RGB2BGR) for p in pil_pages]
    pil_img = Image.open(file_path).convert("RGB")
    return [cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)]


def _deskew(gray: np.ndarray) -> np.ndarray:
    """Detects document rotation via Hough line transform and corrects it
    back to a zero-degree vertical orientation."""
    edges = cv2.Canny(gray, 50, 150, apertureSize=3)
    lines = cv2.HoughLinesP(edges, 1, np.pi / 180, threshold=150, minLineLength=gray.shape[1] // 3, maxLineGap=20)
    if lines is None or len(lines) == 0:
        return gray

    angles = []
    for line in lines:
        x1, y1, x2, y2 = line.reshape(4)
        angle = np.degrees(np.arctan2(y2 - y1, x2 - x1))
        # Keep near-horizontal lines only (text baselines), reject verticals/noise
        if -45 < angle < 45:
            angles.append(angle)

    if not angles:
        return gray

    median_angle = float(np.median(angles))
    if abs(median_angle) < 0.1:
        return gray

    (h, w) = gray.shape[:2]
    center = (w // 2, h // 2)
    rotation_matrix = cv2.getRotationMatrix2D(center, median_angle, 1.0)
    return cv2.warpAffine(
        gray, rotation_matrix, (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE
    )


def preprocess_image(bgr_image: np.ndarray) -> np.ndarray:
    """OpenCV preprocessing: grayscale -> deskew -> denoise -> CLAHE contrast
    enhancement -> adaptive threshold. Returns a binarized image ready for
    Tesseract, which is far more robust on low-quality scanned registers
    than raw OCR on the original scan."""
    gray = cv2.cvtColor(bgr_image, cv2.COLOR_BGR2GRAY)
    gray = _deskew(gray)
    denoised = cv2.fastNlMeansDenoising(gray, h=10, templateWindowSize=7, searchWindowSize=21)
    clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8))
    enhanced = clahe.apply(denoised)
    # Adaptive thresholding — required per spec, and genuinely the right
    # choice for real scans with uneven scanner/lighting shadows across the
    # page (unlike a single global Otsu threshold). A light median blur
    # first removes salt-and-pepper scan speckle so adaptive thresholding
    # doesn't binarize noise into false "words".
    smoothed = cv2.medianBlur(enhanced, 3)
    binarized = cv2.adaptiveThreshold(
        smoothed, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, blockSize=41, C=15
    )
    return binarized


def _group_words_into_lines(data: dict) -> List[OCRSpan]:
    """pytesseract.image_to_data returns one row per detected word. Group
    words sharing the same (block_num, par_num, line_num) into a single
    line-level OCRSpan, which is what the extraction layer expects (a
    'Label: value' line)."""
    lines: dict[tuple, dict] = {}
    n = len(data["text"])
    for i in range(n):
        text = data["text"][i].strip()
        conf = data["conf"][i]
        try:
            conf = float(conf)
        except (TypeError, ValueError):
            conf = -1.0
        if not text or conf < 0:
            continue

        key = (data["block_num"][i], data["par_num"][i], data["line_num"][i])
        x, y, w, h = data["left"][i], data["top"][i], data["width"][i], data["height"][i]
        if key not in lines:
            lines[key] = {"words": [], "confs": [], "x1": x, "y1": y, "x2": x + w, "y2": y + h}
        entry = lines[key]
        entry["words"].append(text)
        entry["confs"].append(conf)
        entry["x1"] = min(entry["x1"], x)
        entry["y1"] = min(entry["y1"], y)
        entry["x2"] = max(entry["x2"], x + w)
        entry["y2"] = max(entry["y2"], y + h)

    spans: List[OCRSpan] = []
    for entry in lines.values():
        spans.append(
            {
                "text": " ".join(entry["words"]),
                "confidence": round(sum(entry["confs"]) / len(entry["confs"]) / 100.0, 3),
                "page": 1,  # overwritten by caller with the real page index
                "bbox": [float(entry["x1"]), float(entry["y1"]), float(entry["x2"]), float(entry["y2"])],
            }
        )
    return spans


class TesseractOCRProvider(OCRProvider):
    name = "tesseract"

    def extract(self, file_path: str, scenario_tag: Optional[str] = None) -> List[OCRSpan]:
        try:
            pages = _load_pages(file_path)
        except Exception as e:  # noqa: BLE001
            logger.warning("Failed to load pages from %s: %s", file_path, e)
            return []

        all_spans: List[OCRSpan] = []
        for page_index, page_bgr in enumerate(pages, start=1):
            processed = preprocess_image(page_bgr)
            try:
                data = _best_language_pass(processed)
            except pytesseract.TesseractNotFoundError:
                logger.error("Tesseract binary not found — install tesseract-ocr + langpacks (see .env.example).")
                return []
            except Exception as e:  # noqa: BLE001
                logger.warning("OCR failed on page %s of %s: %s", page_index, file_path, e)
                continue

            page_spans = _group_words_into_lines(data)
            for span in page_spans:
                span["page"] = page_index
            all_spans.extend(page_spans)

        return all_spans
