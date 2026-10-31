"""
Export Service - handles PPTX and PDF export
Based on demo.py create_pptx_from_images()
"""
import math
import os
import json
import logging
import random
import re
import tempfile
import time
import base64
import hashlib
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple
from textwrap import dedent
from dataclasses import dataclass, field
from pptx import Presentation
from pptx.util import Inches
from pptx.oxml.xmlchemy import OxmlElement
from pptx.oxml.ns import qn
from PIL import Image
import io
import tempfile
import img2pdf
import fitz  # PyMuPDF
from utils.pptx_math import latex_to_display_text, looks_like_latex_math
logger = logging.getLogger(__name__)

# Number of elements for each processing phase of construction reporting on page progress (and heart beats as watchdog)）
ELEMENT_PROGRESS_INTERVAL = 50


class ExportError(Exception):
    """
    Errors during export

    When fail_fast=True, any export error raises this exception.
    Include detailed error information and help tips。
    """
    def __init__(
        self,
        message: str,
        error_type: str = 'unknown',
        details: Dict[str, Any] = None,
        help_text: str = None,
        error_code: str = 'EXPORT_FAILED',
        stage: str = None,
    ):
        """
        Args:
            message: Error message
            error_type: Error Type (style_extraction, text_render, image_add, inpaint, config, service)
            details: Structured error details
            help_text: Helptip Text
        """
        super().__init__(message)
        self.message = message
        self.error_type = error_type
        self.details = details or {}
        self.help_text = help_text or self._get_default_help_text(error_type)
        self.error_code = error_code
        self.stage = stage or self.details.get('stage') or 'export'

    def _get_default_help_text(self, error_type: str) -> str:
        """Return the default help hint by error type"""
        help_texts = {
            'style_extraction': 'Style extraction failed. Check the configured OCR and text-style adapters.',
            'text_render': 'Text rendering failed. Check fonts, encoding and special characters.',
            'image_add': 'The image file may be corrupted or unavailable. Regenerate the slide image.',
            'inpaint': 'Background restoration failed. Check the configured inpainting adapter.',
            'config': 'Check the project export settings and provider configuration.',
            'service': 'The configured service is unavailable. Check its connection and try again.',
        }
        return help_texts.get(error_type, 'Check the export settings. Enable partial results only if you want to continue despite export errors.')

    def to_dict(self) -> Dict[str, Any]:
        """Convert to Dictionary Format"""
        return {
            'message': self.message,
            'error_type': self.error_type,
            'error_code': self.error_code,
            'stage': self.stage,
            'details': self.details,
            'help_text': self.help_text
        }


@dataclass
class ExportWarnings:
    """
    Warning information collected during export

    To track which operations were not performed as intended and feed back to the front end
    """
    # Style Ripping Failed Elements
    style_extraction_failed: List[Dict[str, Any]] = field(default_factory=list)

    # Text render failed elements
    text_render_failed: List[Dict[str, Any]] = field(default_factory=list)

    # Failed to add pictures
    image_add_failed: List[Dict[str, Any]] = field(default_factory=list)

    # JSON Parsing failed (still failed after retesting)）
    json_parse_failed: List[Dict[str, Any]] = field(default_factory=list)

    # Other Warnings
    other_warnings: List[str] = field(default_factory=list)

    def add_style_extraction_failed(self, element_id: str, reason: str):
        """Record style extraction failed"""
        self.style_extraction_failed.append({
            'element_id': element_id,
            'reason': reason
        })

    def add_text_render_failed(self, text: str, reason: str):
        """Failed to record text rendering"""
        self.text_render_failed.append({
            'text': text[:50] + '...' if len(text) > 50 else text,
            'reason': reason
        })

    def add_image_failed(self, path: str, reason: str):
        """Failed to record picture addition"""
        self.image_add_failed.append({
            'path': path,
            'reason': reason
        })

    def add_json_parse_failed(self, context: str, reason: str):
        """Records JSON Parsing failed"""
        self.json_parse_failed.append({
            'context': context,
            'reason': reason
        })

    def add_warning(self, message: str):
        """Add Other Warnings"""
        self.other_warnings.append(message)

    def has_warnings(self) -> bool:
        """Is there a warning?"""
        return bool(
            self.style_extraction_failed or
            self.text_render_failed or
            self.image_add_failed or
            self.json_parse_failed or
            self.other_warnings
        )

    def to_summary(self) -> List[str]:
        """Generate a summary of warnings (suitable for front-end presentations)）"""
        summary = []

        if self.style_extraction_failed:
            summary.append(f"{len(self.style_extraction_failed)} Failed to extract text element styles")

        if self.text_render_failed:
            summary.append(f"{len(self.text_render_failed)} Failed to render text elements")

        if self.image_add_failed:
            summary.append(f"{len(self.image_add_failed)} Failed to add a picture")

        if self.json_parse_failed:
            summary.append(f"{len(self.json_parse_failed)} Numbers AI Reply Parsing Failed")

        for warning in self.other_warnings[:5]:  # Maximum Display 5 Other Warnings
            summary.append(f"{warning}")

        if len(self.other_warnings) > 5:
            summary.append(f"  ...And... {len(self.other_warnings) - 5} Other Warnings")

        return summary

    def to_dict(self) -> Dict[str, Any]:
        """Convert to Dictionary (Details)）"""
        return {
            'style_extraction_failed': self.style_extraction_failed,
            'text_render_failed': self.text_render_failed,
            'image_add_failed': self.image_add_failed,
            'json_parse_failed': self.json_parse_failed,
            'other_warnings': self.other_warnings,
            'total_warnings': (
                len(self.style_extraction_failed) +
                len(self.text_render_failed) +
                len(self.image_add_failed) +
                len(self.json_parse_failed) +
                len(self.other_warnings)
            )
        }


def _get_page_size_inches(aspect_ratio: str = '16:9', base: float = 10.0) -> Tuple[float, float]:
    """Return (width, height) in inches for a given aspect ratio string."""
    try:
        w, h = (float(x) for x in aspect_ratio.split(':'))
        if not (math.isfinite(w) and math.isfinite(h) and w > 0 and h > 0):
            raise ValueError(f"invalid dimensions: {w}:{h}")
    except (ValueError, AttributeError) as e:
        logger.warning(f"Invalid aspect ratio '{aspect_ratio}', falling back to 16:9: {e}")
        w, h = 16.0, 9.0
    if w >= h:
        return base, base * h / w
    else:
        return base * w / h, base


class ExportService:
    """Service for exporting presentations"""

    PPTX_TRANSITION_EFFECTS = {
        'fade',
        'page_turn',
        'push',
        'wipe',
        'split',
        'blinds',
        'checker',
        'wheel',
    }

    @staticmethod
    def _apply_slide_transition(slide, effect: str) -> None:
        """Add a PowerPoint slide transition node to a slide XML element."""
        transition = OxmlElement('p:transition')
        transition.set('spd', 'med')

        if effect == 'fade':
            transition.append(OxmlElement('p:fade'))
        elif effect == 'page_turn':
            cover = OxmlElement('p:cover')
            cover.set('dir', 'l')
            transition.append(cover)
        elif effect == 'push':
            push = OxmlElement('p:push')
            push.set('dir', 'l')
            transition.append(push)
        elif effect == 'wipe':
            wipe = OxmlElement('p:wipe')
            wipe.set('dir', 'l')
            transition.append(wipe)
        elif effect == 'split':
            split = OxmlElement('p:split')
            split.set('orient', 'horz')
            split.set('dir', 'out')
            transition.append(split)
        elif effect == 'blinds':
            blinds = OxmlElement('p:blinds')
            blinds.set('dir', 'vert')
            transition.append(blinds)
        elif effect == 'checker':
            checker = OxmlElement('p:checker')
            checker.set('dir', 'horz')
            transition.append(checker)
        elif effect == 'wheel':
            wheel = OxmlElement('p:wheel')
            wheel.set('spokes', '1')
            transition.append(wheel)
        else:
            return

        slide_element = slide._element
        existing = slide_element.find(qn('p:transition'))
        if existing is not None:
            slide_element.remove(existing)

        clr_map_ovr = slide_element.find(qn('p:clrMapOvr'))
        if clr_map_ovr is not None:
            insert_at = slide_element.index(clr_map_ovr) + 1
        else:
            c_sld = slide_element.find(qn('p:cSld'))
            insert_at = slide_element.index(c_sld) + 1 if c_sld is not None else 0

        slide_element.insert(insert_at, transition)

    # NOTE: clean background Generating function moved to decoupling InpaintProvider Achieved
    # - DefaultInpaintProvider: Based on mask Reshaping of precise areas（Volcengine）
    # - GenerativeEditInpaintProvider: Edit repainting based on large generating models（Gemini Wait.）
    # Usage: from services.image_editability import InpaintProviderFactory

    @staticmethod
    def _classify_external_failure(message: str) -> Dict[str, Any]:
        """Classify an upstream failure without collapsing every case into a timeout."""
        lowered = str(message or '').lower()

        classifications = (
            (
                'unsupported_model',
                (
                    'Image input is not supported', 'does not support image', 'support image input',
                    'unsupported image', 'image_url is only supported',
                ),
                'MODEL_UNSUPPORTED',
                'Picture Identification Model does not support image input',
                False,
            ),
            (
                'configuration_missing',
                (
                    'api key is required', 'api_key is required',
                    'google_api_key (from database settings or environment) is required',
                    'openai_api_key (from database settings or environment) is required',
                    'not configured', 'missing api key', 'Unconfigured', 'Missing api key',
                ),
                'CONFIGURATION_MISSING',
                'Missing image recognition service configuration',
                False,
            ),
            (
                'authentication',
                (
                    '401', '403', 'unauthorized', 'forbidden', 'authentication',
                    'invalid api key', 'invalid_api_key', 'api key not valid',
                    'token expired', 'Login Expired',
                ),
                'AUTHENTICATION',
                'Image Identification Service authentication failed or login expired',
                False,
            ),
            (
                'rate_limit',
                ('429', 'rate limit', 'too many requests', 'qps request limit', 'I’ve been asking too often.'),
                'RATE_LIMIT',
                'Picture recognition service trigger limit stream',
                True,
            ),
            (
                'timeout',
                ('timeout', 'timed out', 'deadline exceeded', 'gateway timeout'),
                'TIMEOUT',
                'Photo recognition service request timed out',
                True,
            ),
            (
                'network',
                (
                    'ssl', 'connection aborted', 'connection reset', 'connection error',
                    'network error', 'unexpected_eof', 'eof occurred', 'chunkedencoding',
                    'remote end closed', 'max retries exceeded', 'connection refused',
                ),
                'NETWORK',
                'Interrupt the network when connecting to photo recognition services',
                True,
            ),
            (
                'invalid_response',
                (
                    'json', 'Could not initialise Bonobo', 'invalid control character', 'empty response',
                    'Empty Response', 'expected dict',
                ),
                'INVALID_RESPONSE',
                'Image Identification Model returns undefeated content',
                True,
            ),
            (
                'incomplete_response',
                ('Full result not returned', 'missing result', 'incomplete'),
                'INCOMPLETE_RESPONSE',
                'Image Identification Model returns incomplete',
                True,
            ),
            (
                'upstream_service',
                ('500', '502', '503', '504', 'service unavailable', 'bad gateway'),
                'UPSTREAM_SERVICE',
                'Photo recognition service is temporarily unavailable',
                True,
            ),
        )

        for reason, needles, code_suffix, summary, retryable in classifications:
            if any(needle in lowered for needle in needles):
                return {
                    'reason': reason,
                    'code_suffix': code_suffix,
                    'summary': summary,
                    'retryable': retryable,
                }

        return {
            'reason': 'unknown',
            'code_suffix': 'FAILED',
            'summary': 'Image Identification Service Call Failed',
            'retryable': False,
        }

    @staticmethod
    def _safe_technical_message(message: str) -> str:
        """Keep a short diagnostic hint while removing common credential shapes."""
        text = str(message or '').strip()
        text = re.sub(
            r'(?i)(authorization|api[_ -]?key|access[_ -]?token|refresh[_ -]?token)'
            r'(\s*[:=]\s*)(?:bearer\s+)?[^\s,;]+',
            r'\1\2***',
            text,
        )
        text = re.sub(r'(?i)\bbearer\s+[a-z0-9._~+/=-]+', 'Bearer ***', text)
        text = re.sub(r'\b(?:sk|AIza|ya29\.)[-_A-Za-z0-9.]{12,}\b', '***', text)
        return text[:500]

    @staticmethod
    def _style_extractor_context(text_attribute_extractor: Any) -> Dict[str, Any]:
        ai_service = getattr(text_attribute_extractor, 'ai_service', None)
        provider = getattr(ai_service, 'caption_provider', None)
        model = getattr(ai_service, 'caption_model', None) or getattr(provider, 'model', None)
        context: Dict[str, Any] = {}
        if provider is not None:
            context['provider'] = provider.__class__.__name__
        if model:
            context['model'] = str(model)
        timeout_seconds = getattr(provider, 'request_timeout_seconds', None)
        max_attempts = getattr(provider, 'max_attempts', None)
        if timeout_seconds is not None:
            context['request_timeout_seconds'] = timeout_seconds
        if max_attempts is not None:
            context['max_attempts'] = max_attempts
        return context

    @staticmethod
    def _build_style_extraction_error(
        message: str,
        *,
        element_id: Optional[str] = None,
        text_content: Optional[str] = None,
        page_idx: Optional[int] = None,
        text_attribute_extractor: Any = None,
        operation: str = 'style_extraction',
    ) -> ExportError:
        classification = ExportService._classify_external_failure(message)
        details: Dict[str, Any] = {
            'stage': 'style_extraction',
            'operation': operation,
            'reason': classification['reason'],
            'retryable': classification['retryable'],
            'technical_message': ExportService._safe_technical_message(message),
            **ExportService._style_extractor_context(text_attribute_extractor),
        }
        if element_id:
            details['element_id'] = element_id
        if text_content:
            details['text_content'] = text_content[:50]
        if page_idx is not None:
            details['page'] = page_idx + 1

        reason = classification['reason']
        if reason == 'unsupported_model':
            help_text = (
                'Current Image Style Extracts caption/image_caption Model does not support image input。'
                'Please change the settings to a model that supports visual input, or check OpenAI Under Format image caption provider / model Configuration。'
            )
        elif reason == 'configuration_missing':
            help_text = (
                'Picture recognition service lacks the necessary configuration. Check in settings image caption provider、Models and API Key，'
                'Re-export after saving and verifying configuration。'
            )
        elif reason == 'authentication':
            help_text = (
                'The authentication information for the picture recognition service is invalid or expired. Check the settings. image caption provider，'
                'If used Codex，Re-entry, please. OpenAI Account number。'
            )
        elif reason == 'rate_limit':
            help_text = (
                'The photo recognition service is currently requesting too often. The system has been automatically retrying; please export it again later，'
                'or reduce the number of exported pages at a time。'
            )
        elif reason in {'timeout', 'network', 'upstream_service'}:
            help_text = (
                'Picture recognition service does not have a stable response at the text style extraction stage. Please try again later；'
                'Check the network, agents and... image caption provider Status。'
                'If you just want to get the editable results first, you can do it.「Item Settings -> Export Settings」Centre Opens「Return semi-finished」。'
            )
        elif reason in {'invalid_response', 'incomplete_response'}:
            help_text = (
                'The image recognition model returns a structured result that is incomplete or unable to resolve. Try again, or switch to a more stable visual model；'
                'It can also be turned on.「Return semi-finished」To Skip Failed Styles。'
            )
        else:
            help_text = (
                'Text style extraction relies on visual models to analyse text screenshots. Check image caption provider、Model name and API Permissions；'
                'If you just want to get the edit results first, you can do it.「Item Settings -> Export Settings」Centre Opens「Return semi-finished」。'
            )

        return ExportError(
            message=f"Text Style Ripping Failed：{classification['summary']}",
            error_type='style_extraction',
            details=details,
            help_text=help_text,
            error_code=f"EXPORT_STYLE_{classification['code_suffix']}",
            stage='style_extraction',
        )

    @staticmethod
    def _build_unexpected_export_error(message: str, stage: str) -> ExportError:
        classification = ExportService._classify_external_failure(message)
        is_external = classification['reason'] != 'unknown'
        summary = classification['summary'] if is_external else 'Internal error in export process'
        details = {
            'stage': stage or 'export',
            'reason': classification['reason'],
            'retryable': classification['retryable'],
            'technical_message': ExportService._safe_technical_message(message),
        }
        if classification['reason'] == 'configuration_missing':
            help_text = (
                'Please fill in settings image caption provider、Models and API Key，Re-export after saving and verifying configuration。'
            )
        else:
            help_text = (
                'Check the corresponding service according to the failure phase and try again.，'
                'Yes.「Item Settings -> Export Settings」Centre Opens「Return semi-finished」。'
            )
        return ExportError(
            message=f"Edit Export In“{stage or 'Export'}”Stage failure：{summary}",
            error_type='service' if is_external else 'unknown',
            details=details,
            help_text=help_text,
            error_code=f"EXPORT_{classification['code_suffix']}" if is_external else 'EXPORT_INTERNAL_ERROR',
            stage=stage or 'export',
        )

    @staticmethod
    def _build_text_render_error(
        message: str,
        *,
        text: str,
        bbox: List[int],
        element_kind: str,
    ) -> ExportError:
        return ExportError(
            message=f"Content writing failed： cannot be added{element_kind}",
            error_type='text_render',
            details={
                'stage': 'text_render',
                'element_kind': element_kind,
                'text': text[:50],
                'bbox': bbox,
                'retryable': False,
                'technical_message': ExportService._safe_technical_message(message),
            },
            help_text='Check the special characters, formulae or fonts in the failed element; also open「Return semi-finished」Skip this element。',
            error_code='EXPORT_TEXT_RENDER_FAILED',
            stage='text_render',
        )

    @staticmethod
    def create_pptx_from_images(
        image_paths: List[str],
        output_file: str = None,
        aspect_ratio: str = '16:9',
        transition_effects: Optional[List[str]] = None,
    ) -> bytes:
        """
        Create PPTX file from image paths
        Based on demo.py create_pptx_from_images()

        Args:
            image_paths: List of absolute paths to images
            output_file: Optional output file path (if None, returns bytes)

        Returns:
            PPTX file as bytes if output_file is None
        """
        # Create presentation
        prs = Presentation()

        # Set author/date metadata for exported PPTX
        try:
            core = prs.core_properties
            now = datetime.now(timezone.utc)
            core.author = "banana-slides"
            core.last_modified_by = "banana-slides"
            core.created = now
            core.modified = now
            core.last_printed = None
        except Exception as e:
            logger.warning(f"Failed to set core properties: {e}")

        # Set slide dimensions based on aspect ratio
        page_w, page_h = _get_page_size_inches(aspect_ratio)
        prs.slide_width = Inches(page_w)
        prs.slide_height = Inches(page_h)

        valid_transition_effects = [
            effect for effect in (transition_effects or [])
            if effect in ExportService.PPTX_TRANSITION_EFFECTS
        ]
        transition_effect_queue: List[str] = []

        # Add each image as a slide
        for image_path in image_paths:
            if not os.path.exists(image_path):
                logger.warning(f"Image not found: {image_path}")
                continue

            # Add blank slide layout (layout 6 is typically blank)
            blank_slide_layout = prs.slide_layouts[6]
            slide = prs.slides.add_slide(blank_slide_layout)

            # Add image to fill entire slide
            slide.shapes.add_picture(
                image_path,
                left=0,
                top=0,
                width=prs.slide_width,
                height=prs.slide_height
            )

            if valid_transition_effects:
                if not transition_effect_queue:
                    transition_effect_queue = valid_transition_effects[:]
                    random.shuffle(transition_effect_queue)
                ExportService._apply_slide_transition(
                    slide,
                    transition_effect_queue.pop(),
                )

        # Save or return bytes
        if output_file:
            prs.save(output_file)
            return None
        else:
            # Save to bytes
            pptx_bytes = io.BytesIO()
            prs.save(pptx_bytes)
            pptx_bytes.seek(0)
            return pptx_bytes.getvalue()

    @staticmethod
    def create_pdf_from_images(image_paths: List[str], output_file: str = None, aspect_ratio: str = '16:9') -> Optional[bytes]:
        """
        Create PDF file from image paths using img2pdf (low memory usage)

        Args:
            image_paths: List of absolute paths to images
            output_file: Optional output file path (if None, returns bytes)

        Returns:
            PDF file as bytes if output_file is None, otherwise None
        """
        # Validate images exist and log warnings for missing files
        valid_paths = []
        for p in image_paths:
            if os.path.exists(p):
                valid_paths.append(p)
            else:
                logger.warning(f"Image not found and will be skipped for PDF export: {p}")

        if not valid_paths:
            raise ValueError("No valid images found for PDF export")

        try:
            logger.info(f"Using img2pdf for PDF export ({len(valid_paths)} pages, low memory mode)")

            page_w, page_h = _get_page_size_inches(aspect_ratio)
            layout_fun = img2pdf.get_layout_fun(
                pagesize=(img2pdf.in_to_pt(page_w), img2pdf.in_to_pt(page_h)),
                fit=img2pdf.FitMode.fill,
            )

            # Convert images to PDF
            pdf_bytes = img2pdf.convert(valid_paths, layout_fun=layout_fun)

            # Add metadata
            pdf_bytes = ExportService._add_pdf_metadata(pdf_bytes)

            if output_file:
                with open(output_file, "wb") as f:
                    f.write(pdf_bytes)
                return None
            else:
                return pdf_bytes
        except (img2pdf.ImageOpenError, ValueError, IOError) as e:
            logger.warning(f"img2pdf conversion failed: {e}. Falling back to Pillow (high memory usage).")
            return ExportService.create_pdf_from_images_pillow(valid_paths, output_file, aspect_ratio)

    @staticmethod
    def _add_pdf_metadata(pdf_bytes: bytes) -> bytes:
        """Add author metadata to PDF (including XMP for Windows compatibility)"""
        try:
            doc = fitz.open(stream=pdf_bytes, filetype="pdf")

            doc.set_metadata({
                "author": "banana-slides",
                "producer": "banana-slides",
                "creator": "banana-slides"
            })

            now = datetime.now(timezone.utc)
            iso_time = now.isoformat()

            content_hash = hashlib.md5(pdf_bytes[:1024]).hexdigest()

            xmp = dedent(f'''\
                <?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>
                <x:xmpmeta xmlns:x="adobe:ns:meta/">
                  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
                    <rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/">
                      <dc:creator><rdf:Seq><rdf:li>banana-slides</rdf:li></rdf:Seq></dc:creator>
                    </rdf:Description>
                    <rdf:Description rdf:about="" xmlns:pdf="http://ns.adobe.com/pdf/1.3/">
                      <pdf:Producer>banana-slides</pdf:Producer>
                    </rdf:Description>
                    <rdf:Description rdf:about="" xmlns:xmp="http://ns.adobe.com/xap/1.0/">
                      <xmp:CreatorTool>banana-slides</xmp:CreatorTool>
                      <xmp:CreateDate>{iso_time}</xmp:CreateDate>
                      <xmp:MetadataDate>{iso_time}</xmp:MetadataDate>
                    </rdf:Description>
                    <rdf:Description rdf:about="" xmlns:xmpMM="http://ns.adobe.com/xap/1.0/mm/">
                      <xmpMM:DocumentID>uuid:{content_hash}</xmpMM:DocumentID>
                    </rdf:Description>
                  </rdf:RDF>
                </x:xmpmeta>
                <?xpacket end="w"?>''')
            doc.set_xml_metadata(xmp)

            return doc.tobytes()
        except Exception as e:
            logger.warning(f"Failed to add PDF metadata: {e}")
            return pdf_bytes

    @staticmethod
    def create_pdf_from_images_pillow(image_paths: List[str], output_file: str = None, aspect_ratio: str = '16:9') -> Optional[bytes]:
        """
        Create PDF file from image paths using Pillow (original method)

        Note: This method loads all images into memory at once.
        For large projects (50+ pages with 20MB/page), use create_pdf_from_images instead.

        Args:
            image_paths: List of absolute paths to images
            output_file: Optional output file path (if None, returns bytes)

        Returns:
            PDF file as bytes if output_file is None, otherwise None
        """
        images = []
        page_w, page_h = _get_page_size_inches(aspect_ratio)

        # Load all images
        for image_path in image_paths:
            if not os.path.exists(image_path):
                logger.warning(f"Image not found: {image_path}")
                continue

            img = Image.open(image_path)

            # Convert to RGB if necessary (PDF requires RGB)
            if img.mode != 'RGB':
                img = img.convert('RGB')

            # Set DPI so PDF page matches target dimensions
            img.info['dpi'] = (img.width / page_w, img.height / page_h)

            images.append(img)

        if not images:
            raise ValueError("No valid images found for PDF export")

        # Save as PDF
        if output_file:
            images[0].save(
                output_file,
                save_all=True,
                append_images=images[1:],
                format='PDF'
            )
            return None
        else:
            # Save to bytes
            pdf_bytes = io.BytesIO()
            images[0].save(
                pdf_bytes,
                save_all=True,
                append_images=images[1:],
                format='PDF'
            )
            pdf_bytes.seek(0)
            return ExportService._add_pdf_metadata(pdf_bytes.getvalue())

    @staticmethod
    def _add_mineru_text_to_slide(builder, slide, text_item: Dict[str, Any], scale_x: float = 1.0, scale_y: float = 1.0):
        """
        Add text item from MinerU to slide

        Args:
            builder: PPTXBuilder instance
            slide: Target slide
            text_item: Text item from MinerU content_list
            scale_x: X-axis scale factor
            scale_y: Y-axis scale factor
        """
        text = text_item.get('text', '').strip()
        if not text:
            return

        bbox = text_item.get('bbox')
        if not bbox or len(bbox) != 4:
            logger.warning(f"Invalid bbox for text item: {text_item}")
            return

        original_bbox = bbox.copy()

        # Apply scale factors to bbox
        x0, y0, x1, y1 = bbox
        bbox = [
            int(x0 * scale_x),
            int(y0 * scale_y),
            int(x1 * scale_x),
            int(y1 * scale_y)
        ]

        if scale_x != 1.0 or scale_y != 1.0:
            logger.debug(f"Text bbox scaled: {original_bbox} -> {bbox} (scale: {scale_x:.3f}x{scale_y:.3f})")

        # Determine text level (only used for styling like bold, NOT for font size)
        # Font size is purely calculated from bbox dimensions
        item_type = text_item.get('type', 'text')
        text_level = text_item.get('text_level')

        # Map to level for styling purposes (bold titles)
        if item_type == 'title' or text_level == 1:
            level = 'title'  # Will be bold
        else:
            level = 'default'

        # Add text element
        # Note: text_level is only used for bold styling, not font size calculation
        try:
            builder.add_text_element(
                slide=slide,
                text=text,
                bbox=bbox,
                text_level=level  # For styling (bold) only, not font size
            )
        except Exception as e:
            logger.error(f"Failed to add text element: {str(e)}")

    @staticmethod
    def _add_table_cell_elements_to_slide(
        builder,
        slide,
        cell_elements: List[Dict[str, Any]],
        scale_x: float = 1.0,
        scale_y: float = 1.0
    ):
        """
        Add table cell elements as individual text boxes to slide
        These cell elements already have the right global dimension. bbox Coordinates

        Args:
            builder: PPTXBuilder instance
            slide: Target slide
            cell_elements: List of EditableElement (table_cell type)
            scale_x: X-axis scale factor
            scale_y: Y-axis scale factor
        """
        from pptx.util import Pt
        from pptx.dml.color import RGBColor

        logger.info(f"Start adding table cell elements, all {len(cell_elements)} individual")

        for cell_elem in cell_elements:
            text = cell_elem.get('content', '')
            bbox_global = cell_elem.get('bbox_global', {})

            if not text.strip():
                continue

            # bbox_global It’s already global coordinates, using and applying scaling directly.
            x0 = bbox_global.get('x0', 0)
            y0 = bbox_global.get('y0', 0)
            x1 = bbox_global.get('x1', 0)
            y1 = bbox_global.get('y1', 0)

            # Build bbox List [x0, y0, x1, y1] and apply scaling
            bbox = [
                int(x0 * scale_x),
                int(y0 * scale_y),
                int(x1 * scale_x),
                int(y1 * scale_y)
            ]

            try:
                # Use Existing add_text_element Method to add text boxes (no borders added)）
                builder.add_text_element(
                    slide=slide,
                    text=text,
                    bbox=bbox,
                    text_level=None,
                    align='center'
                )

                logger.debug(f"  Add Cells: '{text[:10]}...' at bbox {bbox}")

            except Exception as e:
                logger.warning(f"Failed to add cell: {e}")

        logger.info(f"✓ Table cells added, complete {len(cell_elements)} individual")

    @staticmethod
    def _add_mineru_image_to_slide(
        builder,
        slide,
        image_item: Dict[str, Any],
        mineru_dir: Path,
        scale_x: float = 1.0,
        scale_y: float = 1.0
    ):
        """
        Add image or table item from MinerU to slide

        Args:
            builder: PPTXBuilder instance
            slide: Target slide
            image_item: Image/table item from MinerU content_list
            mineru_dir: MinerU result directory
            scale_x: X-axis scale factor
            scale_y: Y-axis scale factor
        """
        bbox = image_item.get('bbox')
        if not bbox or len(bbox) != 4:
            logger.warning(f"Invalid bbox for image item: {image_item}")
            return

        original_bbox = bbox.copy()

        # Apply scale factors to bbox
        x0, y0, x1, y1 = bbox
        bbox = [
            int(x0 * scale_x),
            int(y0 * scale_y),
            int(x1 * scale_x),
            int(y1 * scale_y)
        ]

        if scale_x != 1.0 or scale_y != 1.0:
            logger.debug(f"Item bbox scaled: {original_bbox} -> {bbox} (scale: {scale_x:.3f}x{scale_y:.3f})")

        # Check if this is a table with Sub-elements (cells from Baidu OCR)
        item_type = image_item.get('element_type') or image_item.get('type', 'image')
        children = image_item.get('children', [])

        logger.debug(f"Processing {item_type} element, has {len(children)} children")

        if children and item_type == 'table':
            # Add editable table from child elements (cells)
            try:
                # Filter only table_cell elements
                cell_elements = [child for child in children if child.get('element_type') == 'table_cell']

                if cell_elements:
                    logger.info(f"Add Editable Tables（{len(cell_elements)}Cells）")
                    ExportService._add_table_cell_elements_to_slide(
                        builder=builder,
                        slide=slide,
                        cell_elements=cell_elements,
                        scale_x=scale_x,
                        scale_y=scale_y
                    )
                    return  # Table added successfully
            except Exception as e:
                logger.exception("Failed to add table cells, falling back to image")
                # Fall through to add as image instead

        # Check if this is a table with HTML data (legacy)
        html_table = image_item.get('html_table')
        if html_table and item_type == 'table':
            # Add editable table from HTML
            try:
                builder.add_table_element(
                    slide=slide,
                    html_table=html_table,
                    bbox=bbox
                )
                logger.info(f"Added editable table at bbox {bbox}")
                return  # Table added successfully
            except Exception as e:
                logger.error(f"Failed to add table: {str(e)}, falling back to image")
                # Fall through to add as image instead

        # Add as image (either image type or table fallback)
        img_path_str = image_item.get('img_path', '')
        if not img_path_str:
            logger.warning(f"No img_path in item: {image_item}")
            return

        # Try to find the image file
        # MinerU may store images in 'images/' subdirectory
        possible_paths = [
            mineru_dir / img_path_str,
            mineru_dir / 'images' / Path(img_path_str).name,
            mineru_dir / Path(img_path_str).name,
        ]

        image_path = None
        for path in possible_paths:
            if path.exists():
                image_path = str(path)
                break

        if not image_path:
            logger.warning(f"Image file not found: {img_path_str}")
            # Add placeholder
            builder.add_image_placeholder(slide, bbox)
            return

        # Add image element
        try:
            builder.add_image_element(
                slide=slide,
                image_path=image_path,
                bbox=bbox
            )
        except Exception as e:
            logger.error(f"Failed to add image element: {str(e)}")

    @staticmethod
    def _collect_text_elements_for_extraction(
        elements: List,  # List[EditableElement]
        depth: int = 0
    ) -> List[tuple]:
        """
        Recursively collect all text elements that need to extract styles

        Args:
            elements: EditableElement List
            depth: Current Recursive Depth

        Returns:
            List of segments, each group being as (element_id, image_path, text_content)
        """
        text_items = []

        for elem in elements:
            elem_type = elem.element_type

            # Text type elements need to extract styles
            if elem_type in ['text', 'title', 'table_cell', 'list', 'paragraph', 'header', 'footer', 'heading', 'table_caption', 'image_caption']:
                if elem.content and elem.image_path and os.path.exists(elem.image_path):
                    text = elem.content.strip()
                    if text:
                        text_items.append((elem.element_id, elem.image_path, text))

            # Recursive processing sub-elements
            if hasattr(elem, 'children') and elem.children:
                child_items = ExportService._collect_text_elements_for_extraction(
                    elements=elem.children,
                    depth=depth + 1
                )
                text_items.extend(child_items)

        return text_items

    @staticmethod
    def _batch_extract_text_styles(
        text_items: List[tuple],
        text_attribute_extractor,
        max_workers: int = 8
    ) -> Dict[str, Any]:
        """
        Batch parallel extract text styles (separate area-by-area analysis)）

        This method analyses the cropping area of each paragraph of text separately。
        The method was tested to be more effective and is still in use.。

        Options：_batch_extract_text_styles_with_full_image One-time analysis of all text in the entire chart。

        Args:
            text_items: List of segments, each group being as (element_id, image_path, text_content)
            text_attribute_extractor: Text Properties Ripper
            max_workers: Parallel Numbers

        Returns:
            dictionaries，key Yes. element_id，value Yes. TextStyleResult
        """
        from concurrent.futures import ThreadPoolExecutor, as_completed

        if not text_items or not text_attribute_extractor:
            return {}

        logger.info(f"Parallel extraction {len(text_items)} Styles for individual text elements (symmetrically): {max_workers}）...")

        results = {}

        def extract_single(item):
            element_id, image_path, text_content = item
            try:
                style = text_attribute_extractor.extract(
                    image=image_path,
                    text_content=text_content
                )
                return element_id, style
            except Exception as e:
                logger.warning(f"Failed to extract text style [{element_id}]: {e}")
                return element_id, None

        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            futures = {executor.submit(extract_single, item): item[0] for item in text_items}

            for future in as_completed(futures):
                element_id, style = future.result()
                if style is not None:
                    results[element_id] = style

        logger.info(f"✓ Text style extraction completed, successful {len(results)}/{len(text_items)} individual")
        return results

    @staticmethod
    def _collect_text_elements_for_batch_extraction(
        elements: List,  # List[EditableElement]
        depth: int = 0
    ) -> List[Dict[str, Any]]:
        """
        Recursive collection of all text elements that require batch extraction styles (new format, including bbox）

        Args:
            elements: EditableElement List
            depth: Current Recursive Depth

        Returns:
            Dictionary list, each of which contains element_id, bbox, content
        """
        text_items = []

        for elem in elements:
            elem_type = elem.element_type

            # Text type elements need to extract styles
            if elem_type in ['text', 'title', 'table_cell', 'list', 'paragraph', 'header', 'footer', 'heading', 'table_caption', 'image_caption']:
                if elem.content:
                    text = elem.content.strip()
                    if text:
                        # Use global coordinates bbox_global
                        bbox = elem.bbox_global if hasattr(elem, 'bbox_global') and elem.bbox_global else elem.bbox
                        text_items.append({
                            'element_id': elem.element_id,
                            'bbox': [bbox.x0, bbox.y0, bbox.x1, bbox.y1],
                            'content': text
                        })

            # Recursive processing sub-elements
            if hasattr(elem, 'children') and elem.children:
                child_items = ExportService._collect_text_elements_for_batch_extraction(
                    elements=elem.children,
                    depth=depth + 1
                )
                text_items.extend(child_items)

        return text_items

    @staticmethod
    def _batch_extract_text_styles_with_full_image(
        editable_images: List,  # List[EditableImage]
        text_attribute_extractor,
        max_workers: int = 4
    ) -> Dict[str, Any]:
        """
        【New Logic】Extract all text styles from the full chart batch

        New method： Here. caption model Provide full graphics, and after extraction, all text bbox and content，
        Allows the model to analyse the style properties of all text at once (colour, bold, alignment, etc.)）。

        Advantages： Models can see global information and analyse more accurately。

        Args:
            editable_images: EditableImage List, one for each PPT Page
            text_attribute_extractor: Text Properties Ripper (required) extract_batch_with_full_image Methodology）
            max_workers: Number of simultaneous pages

        Returns:
            dictionaries，key Yes. element_id，value Yes. TextStyleResult
        """
        from concurrent.futures import ThreadPoolExecutor, as_completed

        if not editable_images or not text_attribute_extractor:
            return {}

        # Check if the extractor supports batch extraction
        if not hasattr(text_attribute_extractor, 'extract_batch_with_full_image'):
            logger.warning("Ripper does not support extract_batch_with_full_image Method, back to old logic.")
            # Back to the old logic.
            all_text_items = []
            for editable_img in editable_images:
                text_items = ExportService._collect_text_elements_for_extraction(editable_img.elements)
                all_text_items.extend(text_items)
            return ExportService._batch_extract_text_styles(
                text_items=all_text_items,
                text_attribute_extractor=text_attribute_extractor,
                max_workers=max_workers * 2
            )

        logger.info(f"【New Logic】Use full-chart batch analysis {len(editable_images)} Text Style for Pages...")

        all_results = {}

        def process_single_page(editable_img, page_idx):
            """Text Style Ripping for Processing Single Pages"""
            try:
                # Collects all text elements of the page
                text_elements = ExportService._collect_text_elements_for_batch_extraction(
                    editable_img.elements
                )

                if not text_elements:
                    logger.info(f"  Page {page_idx + 1}: No text elements")
                    return {}

                logger.info(f"  Page {page_idx + 1}: Analysis {len(text_elements)} Text elements...")

                # Use original picture path as full map
                full_image_path = editable_img.image_path

                # Call for batch extraction methods
                page_results = text_attribute_extractor.extract_batch_with_full_image(
                    full_image=full_image_path,
                    text_elements=text_elements
                )

                logger.info(f"  Page {page_idx + 1}: Successfully extracted {len(page_results)} Styles for individual elements")
                return page_results

            except Exception as e:
                logger.error(f"Page {page_idx + 1} Text Style Ripping Failed: {e}", exc_info=True)
                return {}

        # Combine all pages
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            futures = {
                executor.submit(process_single_page, img, idx): idx
                for idx, img in enumerate(editable_images)
            }

            for future in as_completed(futures):
                page_idx = futures[future]
                try:
                    page_results = future.result()
                    all_results.update(page_results)
                except Exception as e:
                    logger.error(f"Page {page_idx + 1} Process failed: {e}")

        total_elements = sum(
            len(ExportService._collect_text_elements_for_batch_extraction(img.elements))
            for img in editable_images
        )
        logger.info(f"✓ Full batch text style extraction completed, successful {len(all_results)}/{total_elements} individual")

        return all_results

    @staticmethod
    def _batch_extract_text_styles_hybrid(
        editable_images: List,  # List[EditableImage]
        text_attribute_extractor,
        max_workers: int = 8,
        fail_fast: bool = False,
        on_progress=None,  # Optional：(done, total, label) -> None，For progress reporting and heartbeats.
    ) -> Tuple[Dict[str, Any], List[Tuple[str, str]]]:
        """
        【Mixed Policy】Combining global recognition and individual tailor identification advantages

        Policy：
        - Global recognition (total analysis)： Access is_bold、is_italic、is_underline、text_alignment
          Because these properties need to look at the overall layout and context in order to be accurate.
        - Individual cropping recognition： capture font_color
          Because the color requires an accurate look at local pixels to be accurate.

        Args:
            editable_images: EditableImage List, one for each PPT Page
            text_attribute_extractor: Text Properties Ripper
            max_workers: Parallel Numbers
            fail_fast: Whether or not to throw the error immediately
            on_progress: Optional Backtracking (done, total, label)，Call every identification mission completed

        Returns:
            (results, failed_extractions):
            - results: dictionaries，key Yes. element_id，value Yes. TextStyleResult（Consolidated Results）
            - failed_extractions: Failed list, each as (element_id, error_reason)
        """
        from concurrent.futures import ThreadPoolExecutor, as_completed
        from services.image_editability.text_attribute_extractors import TextStyleResult

        if not editable_images or not text_attribute_extractor:
            return {}, []

        # Check if the extractor supports batch extraction
        if not hasattr(text_attribute_extractor, 'extract_batch_with_full_image'):
            logger.warning("The extractor does not support the mix policy, retreating to single crop recognition")
            all_text_items = []
            for editable_img in editable_images:
                text_items = ExportService._collect_text_elements_for_extraction(editable_img.elements)
                all_text_items.extend(text_items)
            results = ExportService._batch_extract_text_styles(
                text_items=all_text_items,
                text_attribute_extractor=text_attribute_extractor,
                max_workers=max_workers
            )
            return results, []  # Revert method does not collect failed information for now.

        logger.info(f"【Mixed Policy】Start analysis. {len(editable_images)} Text Style for Pages...")
        logger.info(f"  - Global recognition: is_bold, is_italic, is_underline, text_alignment")
        logger.info(f"  - Individual Recognition: font_color")

        # Step 1: Collect all text elements
        all_text_items = []  # For individual crop recognition (element_id, image_path, content)
        page_text_elements = {}  # For global recognition {page_idx: [text_elements]}

        for page_idx, editable_img in enumerate(editable_images):
            # Collect data for individual shear identification
            text_items = ExportService._collect_text_elements_for_extraction(editable_img.elements)
            all_text_items.extend(text_items)

            # Collection of data for global identification
            batch_elements = ExportService._collect_text_elements_for_batch_extraction(editable_img.elements)
            if batch_elements:
                page_text_elements[page_idx] = {
                    'image_path': editable_img.image_path,
                    'elements': batch_elements
                }

        if not all_text_items:
            return {}, []

        # Step 2: Two identifications in parallel.
        global_results = {}  # Global recognition results
        local_results = {}   # Single Crop Identification Results

        def extract_global_for_page(page_idx, page_data):
            """Global recognition of single pages and retrying at the page level for abnormal or missing results。"""
            max_global_attempts = 3
            expected_element_ids = {
                element['element_id'] for element in page_data['elements']
            }
            best_results = {}
            had_model_response = False
            last_exception = None

            for attempt in range(1, max_global_attempts + 1):
                if attempt > 1:
                    time.sleep(1)
                try:
                    raw_results = text_attribute_extractor.extract_batch_with_full_image(
                        full_image=page_data['image_path'],
                        text_elements=page_data['elements']
                    )
                    if raw_results is not None and not isinstance(raw_results, dict):
                        raise ValueError("Expected dict or None from style extractor")
                    results = {
                        key: value for key, value in raw_results.items()
                        if value is not None
                    } if raw_results is not None else {}
                    had_model_response = True
                    best_results.update(results)
                    missing_element_ids = expected_element_ids - set(best_results.keys())

                    logger.info(
                        "Global Recognition Page %s Page %s/%s It’s done again.: expected=%s returned=%s accumulated=%s missing=%s",
                        page_idx + 1,
                        attempt,
                        max_global_attempts,
                        len(expected_element_ids),
                        len(results),
                        len(best_results),
                        len(missing_element_ids),
                    )

                    if not missing_element_ids:
                        return page_idx, best_results, None

                    last_exception = None
                    logger.warning(
                        "Global Recognition Page %s Page %s/%s Once returns incomplete, try again: missing_sample=%s",
                        page_idx + 1,
                        attempt,
                        max_global_attempts,
                        list(missing_element_ids)[:5],
                    )
                except Exception as e:
                    last_exception = str(e)
                    logger.warning(
                        "Global Recognition Page %s Page %s/%s Once failed, try again.: %s",
                        page_idx + 1,
                        attempt,
                        max_global_attempts,
                        e,
                    )

            logger.error(
                "Global Recognition Page %s It’s exhausting.: expected=%s returned=%s last_error=%s",
                page_idx + 1,
                len(expected_element_ids),
                len(best_results),
                last_exception or "Global recognition did not return the full result",
            )
            page_error = last_exception if (not best_results or not had_model_response) else None
            return page_idx, best_results, page_error

        # Can not open message
        failed_extractions = []  # [(element_id, reason), ...]

        def extract_local_single(item):
            """Individual crop recognition"""
            element_id, image_path, text_content = item
            try:
                style = text_attribute_extractor.extract(
                    image=image_path,
                    text_content=text_content
                )
                # Check for real success: style must exist and not be an error result
                # (CaptionModelTextAttributeExtractor returns TextStyleResult(confidence=0.0, metadata={'error':...}) on failure)
                is_error = style and style.confidence == 0.0 and style.metadata.get('error')
                if style and not is_error:
                    return element_id, style, None
                else:
                    error_msg = style.metadata.get('error', 'Style Ripback Empty') if style else "Style Ripback Empty"
                    if fail_fast:
                        raise ExportService._build_style_extraction_error(
                            error_msg,
                            element_id=element_id,
                            text_content=text_content,
                            text_attribute_extractor=text_attribute_extractor,
                            operation='local_element_style',
                        )
                    return element_id, None, error_msg
            except ExportError:
                raise  # Throw again ExportError
            except Exception as e:
                logger.warning(f"Individual recognition failed [{element_id}]: {e}")
                if fail_fast:
                    raise ExportService._build_style_extraction_error(
                        str(e),
                        element_id=element_id,
                        text_content=text_content,
                        text_attribute_extractor=text_attribute_extractor,
                        operation='local_element_style',
                    )
                return element_id, None, str(e)

        # Also execute global and individual crop recognition
        logger.info(f"  Complementary execution: Global recognition {len(page_text_elements)} Page + Individual Recognition {len(all_text_items)} An element...")

        total_tasks = len(page_text_elements) + len(all_text_items)
        completed_tasks = 0

        def notify_progress(label: str):
            nonlocal completed_tasks
            completed_tasks += 1
            if on_progress:
                try:
                    on_progress(completed_tasks, total_tasks, label)
                except Exception as exc:
                    logger.debug(f"Style extract progress correction failed: {exc}")

        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            # Commit global recognition task
            global_futures = {
                executor.submit(extract_global_for_page, idx, data): ('global', idx)
                for idx, data in page_text_elements.items()
            }

            # Submit single crop recognition task
            local_futures = {
                executor.submit(extract_local_single, item): ('local', item[0])
                for item in all_text_items
            }

            # Collect global recognition results
            for future in as_completed(global_futures):
                task_type, page_idx = global_futures[future]
                notify_progress(f"Global Identification No. {page_idx + 1} Page")
                try:
                    _, page_results, page_error = future.result()
                    global_results.update(page_results)
                    expected_element_ids = {
                        element['element_id'] for element in page_text_elements[page_idx]['elements']
                    }
                    missing_element_ids = expected_element_ids - set(page_results.keys())
                    if page_error:
                        if fail_fast:
                            raise ExportService._build_style_extraction_error(
                                page_error,
                                page_idx=page_idx,
                                text_attribute_extractor=text_attribute_extractor,
                                operation='global_page_style',
                            )
                        failed_extractions.extend(
                            (element_id, f"Global recognition failed: {page_error}")
                            for element_id in expected_element_ids
                        )
                    elif missing_element_ids:
                        reason = "Global recognition did not return the full result"
                        if fail_fast:
                            raise ExportService._build_style_extraction_error(
                                reason,
                                page_idx=page_idx,
                                text_attribute_extractor=text_attribute_extractor,
                                operation='global_page_style',
                            )
                        failed_extractions.extend((element_id, reason) for element_id in missing_element_ids)
                except Exception as e:
                    logger.error(f"Global recognition of tasks failed: {e}")
                    if fail_fast:
                        if isinstance(e, ExportError):
                            raise
                        raise ExportService._build_style_extraction_error(
                            str(e),
                            page_idx=page_idx,
                            text_attribute_extractor=text_attribute_extractor,
                            operation='global_page_style',
                        ) from e
                    expected_element_ids = [
                        element['element_id'] for element in page_text_elements[page_idx]['elements']
                    ]
                    failed_extractions.extend(
                        (element_id, f"Global recognition failed: {e}")
                        for element_id in expected_element_ids
                    )

            # Collect a single crop identification result
            for future in as_completed(local_futures):
                task_type, element_id = local_futures[future]
                notify_progress("Individual element recognition")
                try:
                    elem_id, style, error = future.result()
                    if style is not None:
                        local_results[elem_id] = style
                    if error:
                        failed_extractions.append((elem_id, error))
                except Exception as e:
                    logger.error(f"Failed to recognize task on an individual basis: {e}")
                    if fail_fast:
                        raise
                    failed_extractions.append((element_id, str(e)))

        # Step 3: Merge Results
        # Prefer layout properties identified globally, using single recognized colour properties
        merged_results = {}

        all_element_ids = set(global_results.keys()) | set(local_results.keys())

        for element_id in all_element_ids:
            global_style = global_results.get(element_id)
            local_style = local_results.get(element_id)

            if global_style and local_style:
                # Mixed： Colour identified individually (includes) colored_segments），Layout with global recognition
                merged_results[element_id] = TextStyleResult(
                    font_color_rgb=local_style.font_color_rgb,  # Individually Recognized Colours
                    colored_segments=local_style.colored_segments,  # Single recognized multi-coloured clips
                    is_bold=global_style.is_bold,              # Global recognized bold
                    is_italic=global_style.is_italic,          # Italics recognized globally
                    is_underline=global_style.is_underline,    # Underlined global recognition
                    text_alignment=global_style.text_alignment, # Global Recognized Alignment
                    confidence=0.9,
                    metadata={
                        'source': 'hybrid',
                        'color_source': 'local',
                        'layout_source': 'global'
                    }
                )
            elif local_style:
                # Only a single result.
                merged_results[element_id] = local_style
            elif global_style:
                # Only global recognition.
                merged_results[element_id] = global_style

        logger.info(f"✓ Mixed strategy complete.: Global recognition {len(global_results)} individual, Individual Recognition {len(local_results)} individual, Merge {len(merged_results)} individual, Failed {len(failed_extractions)} individual")

        return merged_results, failed_extractions

    @staticmethod
    def create_editable_pptx_with_recursive_analysis(
        image_paths: List[str] = None,
        output_file: str = None,
        slide_width_pixels: int = 1920,
        slide_height_pixels: int = 1080,
        max_depth: int = 2,
        max_workers: int = 8,
        editable_images: List = None,  # Optional： Directly imported analysed EditableImage List
        text_attribute_extractor = None,  # Optional： Text Properties Ripper, to extract colours, bold, italics, etc.
        progress_callback = None,  # Optional： progress correction function (step, message, percent) -> None
        heartbeat_callback = None,  # Optional： Heart beatback (step) -> None，For elemental fine particle size survival detection (no library)）
        export_extractor_method: str = 'hybrid',  # Component extraction method: mineru, hybrid
        export_inpaint_method: str = 'hybrid',  # Background repair method: generative, baidu, hybrid
        enable_icon_subject_extraction: bool = False,  # Whether to walk a 100-degree smart map of a small size icon
        fail_fast: bool = True  # Whether to stop immediately in case of a mistake（False Then collect the warning and continue.）
    ) -> Tuple[Optional[bytes], ExportWarnings]:
        """
        Create Editable Using Recursive Pictures to Edit Service PPTX

        It’s a new architecture approach. ImageEditabilityService Perform recursive face analysis。

        Two ways to use it：
        1. Import image_paths：Automatically analyze pictures and generate them PPTX
        2. Import editable_images：Direct use of analysed results (avoidance of analysis)）

        Configure (e. g. MinerU token）Automatically from Flask app.config Access。

        Args:
            image_paths: Picture path list (optional, with editable_images Two or one.）
            output_file: Output file path (optional)）
            slide_width_pixels: Target Slide Width
            slide_height_pixels: Target Slide Height
            max_depth: Maximum Recursive Depth
            max_workers: Combination Number
            editable_images: Analysed EditableImage List (optional, with image_paths Two or one.）
            text_attribute_extractor: Text Properties Ripper (optional) to extract text colours, bold, italics, etc.
                It’s possible. TextAttributeExtractorFactory.create_caption_model_extractor() Create
            heartbeat_callback: Heart beat echo (optional). Every element/It’s done once with submissions.，
                Used to inform external watchdogs that the mission is still in progress (without creating a database to write)）
            export_extractor_method: Component extraction method ('mineru' or 'hybrid'，Default 'hybrid')
            export_inpaint_method: Background repair method ('generative', 'baidu', 'hybrid'，Default 'hybrid')
            fail_fast: Whether to stop immediately in case of error (default) True）。Set as False collect warning and continue to export。

        Returns:
            (pptx_bytes, warnings): Divisions, including PPTX Bytestream and Warning Information
            - pptx_bytes: PPTX File bytes (if) output_file Yes. None），Otherwise... None
            - warnings: ExportWarnings Object, with all warning messages
        """
        from services.image_editability import ServiceConfig, ImageEditabilityService
        from utils.pptx_builder import PPTXBuilder

        # Initialisation Warning Collector
        warnings = ExportWarnings()

        # Auxiliary function： Report progress
        def report_progress(step: str, message: str, percent: int):
            logger.info(f"[Progress {percent}%] {step}: {message}")
            if progress_callback:
                try:
                    progress_callback(step, message, percent)
                except Exception as e:
                    logger.warning(f"Progress correction failed: {e}")

        # Auxiliary function： heart beat only (element level, avoid writing a database once for each element)）
        def beat(step: str):
            if heartbeat_callback:
                try:
                    heartbeat_callback(step)
                except Exception as e:
                    logger.debug(f"Heart beat back failed.: {e}")

        # Direct use if analytical results are provided; otherwise, analysis is required
        if editable_images is not None:
            logger.info(f"Use provided {len(editable_images)} analysis results to create PPTX")
            report_progress("Ready.", f"Use available analysis（{len(editable_images)} Page）", 10)
        else:
            if not image_paths:
                raise ValueError("Must provide image_paths or editable_images One.")

            total_pages = len(image_paths)
            logger.info(f"Starts creating editable by retrievable analysis PPTX，Total {total_pages} Page")
            report_progress("Here we go.", f"Prepare for analysis. {total_pages} Page Slide...", 0)

            # 1. Create ImageEditabilityService（Configure Automatically From Flask config Fetch, use project export settings）
            logger.info(
                f"Use Export Settings: extractor={export_extractor_method}, "
                f"inpaint={export_inpaint_method}, "
                f"icon_subject_extraction={enable_icon_subject_extraction}"
            )
            config = ServiceConfig.from_defaults(
                max_depth=max_depth,
                extractor_method=export_extractor_method,
                inpaint_method=export_inpaint_method,
                enable_icon_subject_extraction=enable_icon_subject_extraction,
            )
            editability_service = ImageEditabilityService(config)

            # 2. and handle all pages, generate EditableImage Structure
            report_progress("Board Analysis", f"Start analysis. {total_pages} A picture (single number of rounds): {max_workers}）...", 5)
            from concurrent.futures import ThreadPoolExecutor, as_completed

            editable_images = []
            completed_count = 0
            with ThreadPoolExecutor(max_workers=max_workers) as executor:
                futures = {
                    executor.submit(editability_service.make_image_editable, img_path): idx
                    for idx, img_path in enumerate(image_paths)
                }

                results = [None] * len(image_paths)
                for future in as_completed(futures):
                    idx = futures[future]
                    try:
                        results[idx] = future.result()
                        completed_count += 1
                        beat("Board Analysis")
                        # Board Analysis % 5% - 40% Progress
                        percent = 5 + int(35 * completed_count / total_pages)
                        report_progress("Board Analysis", f"Completed {completed_count}/{total_pages} Page analysis", percent)
                    except Exception as e:
                        logger.error(f"Processing pictures {image_paths[idx]} Failed: {e}")
                        raise

                editable_images = results

        # 2.5. Use a hybrid policy to extract styles for all text elements (if a extractor is provided)）
        # Mixed policy： global recognition (bold)/Italic/Underline/Alignment）+ Individual shear recognition (colour)）
        text_styles_cache = {}
        if text_attribute_extractor:
            report_progress("Style Ripping", "Start extracting text styles (mixed policy)）...", 45)

            # Number of statistical text elements
            total_text_count = sum(
                len(ExportService._collect_text_elements_for_extraction(img.elements))
                for img in editable_images
            )

            if total_text_count > 0:
                report_progress("Style Ripping", f"Mixed strategy analysis {total_text_count} Text elements...", 50)

                def style_progress(done: int, total: int, label: str):
                    """The heartbeat and progress of the style extraction phase (each) 10 A library of elements once written）。"""
                    beat("Style Ripping")
                    if done % 10 == 0 or done >= total:
                        percent = 50 + int(20 * done / max(total, 1))
                        report_progress("Style Ripping", f"{label}（{done}/{total}）", min(percent, 70))

                text_styles_cache, failed_extractions = ExportService._batch_extract_text_styles_hybrid(
                    editable_images=editable_images,
                    text_attribute_extractor=text_attribute_extractor,
                    max_workers=max_workers * 2,
                    fail_fast=fail_fast,
                    on_progress=style_progress
                )

                # Recording failed elements of style extraction (details)）
                for element_id, reason in failed_extractions:
                    warnings.add_style_extraction_failed(element_id, reason)

                # Record summary information
                extracted_count = len(text_styles_cache)
                failed_count = len(failed_extractions)
                if failed_count > 0:
                    logger.warning(f"Style Ripping: {failed_count}/{total_text_count} An element failed")

                report_progress("Style Ripping", f"Completed {extracted_count}/{total_text_count} Text Style Ripping（{failed_count} A failure.）", 70)

        report_progress("Build PPTX", "Start Build Editable PPTX Documentation...", 75)

        # 4. Create PPTX Builder
        builder = PPTXBuilder()
        builder.create_presentation()
        builder.setup_presentation_size(slide_width_pixels, slide_height_pixels)

        # 5. Build slides for each page
        total_pages = len(editable_images)
        for page_idx, editable_img in enumerate(editable_images):
            # Build PPTX Jim. 75% - 95% Progress
            percent = 75 + int(20 * page_idx / total_pages)
            report_progress("Build PPTX", f"Build No. {page_idx + 1}/{total_pages} Page...", percent)
            logger.info(f"  Build No. {page_idx + 1}/{total_pages} Page...")

            # Elemental heartbeats on the page/Progress： page elements can also be seen to be advancing when they are many (e.g., intensive tables)
            page_element_count = 0

            def on_element(_page_idx=page_idx, _percent=percent):
                nonlocal page_element_count
                page_element_count += 1
                beat("Build PPTX")
                if page_element_count % ELEMENT_PROGRESS_INTERVAL == 0:
                    report_progress(
                        "Build PPTX",
                        f"Build No. {_page_idx + 1}/{total_pages} Page"
                        f"（Processed {page_element_count} An element）...",
                        _percent,
                    )

            # Create a blank slide
            slide = builder.add_blank_slide()

            # Add background graph (reference original realization, use) slide.shapes.add_picture）
            if editable_img.clean_background and os.path.exists(editable_img.clean_background):
                logger.info(f"    Add clean background: {editable_img.clean_background}")
                try:
                    slide.shapes.add_picture(
                        editable_img.clean_background,
                        left=0,
                        top=0,
                        width=builder.prs.slide_width,
                        height=builder.prs.slide_height
                    )
                except Exception as e:
                    logger.error(f"Failed to add background: {e}")
            else:
                # Back to original.
                logger.info(f"    Use original graph as background: {editable_img.image_path}")
                try:
                    slide.shapes.add_picture(
                        editable_img.image_path,
                        left=0,
                        top=0,
                        width=builder.prs.slide_width,
                        height=builder.prs.slide_height
                    )
                except Exception as e:
                    logger.error(f"Failed to add background: {e}")

            # Add all elements (regression)）
            # Calculate scaling： Map the original picture coordinates to the unified slide coordinates
            # The background map has been scaled to the slide size, so the element coordinates need to be scaled accordingly.
            scale_x = slide_width_pixels / editable_img.width
            scale_y = slide_height_pixels / editable_img.height
            logger.info(f"    Number of elements: {len(editable_img.elements)}, Picture Dimensions: {editable_img.width}x{editable_img.height}, "
                       f"Slide Size: {slide_width_pixels}x{slide_height_pixels}, Scale: {scale_x:.3f}x{scale_y:.3f}")

            ExportService._add_editable_elements_to_slide(
                builder=builder,
                slide=slide,
                elements=editable_img.elements,
                scale_x=scale_x,
                scale_y=scale_y,
                depth=0,
                text_styles_cache=text_styles_cache,  # Use pre-extracted style cache
                warnings=warnings,  # Collect Warnings
                fail_fast=fail_fast,  # Pass fail_fast Parameters
                on_element=on_element  # Elementary heart rate/Progress
            )

            logger.info(f"    ✓ Page {page_idx + 1} Page completed. Added. {len(editable_img.elements)} An element")

        # 5. Save or return bytes
        report_progress("Save File", "Saving PPTX Documentation...", 95)
        if output_file:
            builder.save(output_file)
            report_progress("Completed", f"Editable PPTX Saved", 100)
            logger.info(f"✓ Editable PPTX Saved: {output_file}")

            # Output Warning Summary
            if warnings.has_warnings():
                logger.warning(f"Export complete, but yes {len(warnings.to_summary())} A warning.")

            return None, warnings
        else:
            pptx_bytes = builder.to_bytes()
            report_progress("Completed", f"Editable PPTX Generated", 100)
            logger.info(f"✓ Editable PPTX Generated（{len(pptx_bytes)} Bytes）")

            # Output Warning Summary
            if warnings.has_warnings():
                logger.warning(f"Export complete, but yes {len(warnings.to_summary())} A warning.")

            return pptx_bytes, warnings

    @staticmethod
    def _add_editable_elements_to_slide(
        builder,
        slide,
        elements: List,  # List[EditableElement]
        scale_x: float = 1.0,
        scale_y: float = 1.0,
        depth: int = 0,
        text_styles_cache: Dict[str, Any] = None,  # Pre-extracted text style cache，key Yes. element_id
        warnings: 'ExportWarnings' = None,  # Warning Collector
        fail_fast: bool = False,  # Whether to stop immediately in case of a mistake
        on_element=None,  # Optional： One call per element processed (with a recoiled sub-element) for a heartbeat/Progress on page
    ):
        """
        Recursively. EditableElement Add to Slide

        Args:
            builder: PPTXBuilder Examples
            slide: Slide Object
            elements: EditableElement List
            scale_x: X Axis Zoom Factor
            scale_y: Y Axis Zoom Factor
            depth: Current Recursive Depth
            text_styles_cache: Pre-extracted text style cache (optional), by _batch_extract_text_styles Generate
            on_element: Optional callback, once called each element after processing (also triggered at re-entry)）

        Note:
            elem.image_path It’s an absolute path. No extra directory parameters.
        """
        if text_styles_cache is None:
            text_styles_cache = {}

        def choose_formula_text(text: str, text_style: Any = None) -> Optional[str]:
            candidates = [text]
            if text_style and getattr(text_style, 'colored_segments', None):
                styled_text = ''.join(seg.text for seg in text_style.colored_segments).strip()
                if styled_text and styled_text not in candidates:
                    candidates.append(styled_text)

            def score(candidate: str) -> int:
                if not looks_like_latex_math(candidate):
                    return -1
                return (
                    len(re.findall(r"\\[A-Za-z]+", candidate)) * 10
                    + candidate.count("\\") * 4
                    + len(re.findall(r"[_^]\s*(?:\{[^{}]+\}|[A-Za-z0-9+\-=()*])", candidate)) * 3
                    + len(re.findall(r"[∀∃∈∉≤≥≠≈∑∏∫∞∂∇πΠΣ√]", candidate)) * 2
                    - len(re.findall(r"\b[A-Za-z]{5,}\b", candidate)) * 2
                )

            scored = [(score(candidate), candidate) for candidate in candidates if candidate]
            scored = [item for item in scored if item[0] >= 0]
            if not scored:
                return None
            return max(scored, key=lambda item: item[0])[1]

        def add_text_or_formula(elem, text, bbox_list, text_level='default', align='left'):
            text_style = text_styles_cache.get(elem.element_id)
            if text_style:
                logger.debug(f"{'  ' * depth}  Use cache text styles: color={text_style.font_color_rgb}, bold={text_style.is_bold}")

            formula_text = choose_formula_text(text, text_style)
            if formula_text:
                if builder.add_math_element(
                    slide=slide,
                    latex=formula_text,
                    bbox=bbox_list,
                    text_style=text_style
                ):
                    return

                fallback_text = latex_to_display_text(formula_text)
                builder.add_text_element(
                    slide=slide,
                    text=fallback_text,
                    bbox=bbox_list,
                    text_level=text_level,
                    align=align,
                    text_style=text_style,
                    allow_math_conversion=False
                )
                if warnings:
                    warnings.add_text_render_failed(
                        formula_text,
                        'Formula does not support original conversion, readable text is used back'
                    )
                return

            builder.add_text_element(
                slide=slide,
                text=text,
                bbox=bbox_list,
                text_level=text_level,
                align=align,
                text_style=text_style
            )

        for elem in elements:
            elem_type = elem.element_type

            # Use local or global coordinates depending on depth
            # depth=0: Top element, use local coordinates（bbox）
            # depth>0: Sub-elements, need global coordinates（bbox_global）
            if depth == 0:
                bbox = elem.bbox  # Use local coordinates for top elements
            else:
                bbox = elem.bbox_global if hasattr(elem, 'bbox_global') and elem.bbox_global else elem.bbox

            # Convert BBox Object as List and Apply Scale
            bbox_list = [
                int(bbox.x0 * scale_x),
                int(bbox.y0 * scale_y),
                int(bbox.x1 * scale_x),
                int(bbox.y1 * scale_y)
            ]

            logger.info(f"{'  ' * depth}  Add Elements: type={elem_type}, bbox={bbox_list}, content={elem.content[:30] if elem.content else None}, image_path={elem.image_path}, Usage{'Global' if depth > 0 else 'Local'}Coordinates")

            # Add elements according to type (references to original achieved)_add_mineru_text_to_slide and_add_mineru_image_to_slide）
            if elem_type in ['text', 'title', 'list', 'paragraph', 'header', 'footer', 'heading', 'table_caption', 'image_caption', 'equation', 'interline_equation', 'inline_equation']:
                # Add text (reference)_add_mineru_text_to_slide）
                if elem.content:
                    text = elem.content.strip()
                    if text:
                        try:
                            # Set Text Level
                            level = 'title' if elem_type in ['title', 'heading'] else 'default'

                            add_text_or_formula(elem, text, bbox_list, text_level=level)
                        except Exception as e:
                            logger.warning(f"Failed to add text elements: {e}")
                            if fail_fast:
                                raise ExportService._build_text_render_error(
                                    str(e),
                                    text=text,
                                    bbox=bbox_list,
                                    element_kind='Text Elements',
                                )
                            if warnings:
                                warnings.add_text_render_failed(text, str(e))

            elif elem_type == 'table_cell':
                # Add table cells (text boxes with borders)）
                if elem.content:
                    text = elem.content.strip()
                    if text:
                        try:
                            # The table cells have been uniformly processed above. bbox_global And scale
                            # Direct Use bbox_list That’s fine.
                            add_text_or_formula(
                                elem,
                                text,
                                bbox_list,
                                text_level=None,
                                align='center'
                            )

                        except Exception as e:
                            logger.warning(f"Failed to add cell: {e}")
                            if fail_fast:
                                raise ExportService._build_text_render_error(
                                    str(e),
                                    text=text,
                                    bbox=bbox_list,
                                    element_kind='Table Cells',
                                )
                            if warnings:
                                warnings.add_text_render_failed(text, str(e))

            elif elem_type == 'table':
                # If the table has sub-elements (cells), use inpainted Background + Cells
                if elem.children and elem.inpainted_background_path:
                    logger.info(f"{'  ' * depth}    There’s a form. {len(elem.children)} cells, using editable format")

                    # Add first inpainted Background (clean table frame)）
                    if os.path.exists(elem.inpainted_background_path):
                        try:
                            builder.add_image_element(
                                slide=slide,
                                image_path=elem.inpainted_background_path,
                                bbox=bbox_list
                            )
                        except Exception as e:
                            logger.error(f"Failed to add table background: {e}")

                    # Recursive Add Cells
                    ExportService._add_editable_elements_to_slide(
                        builder=builder,
                        slide=slide,
                        elements=elem.children,
                        scale_x=scale_x,
                        scale_y=scale_y,
                        depth=depth + 1,
                        text_styles_cache=text_styles_cache,
                        warnings=warnings,
                        fail_fast=fail_fast,
                        on_element=on_element
                    )
                else:
                    # No sub-elements, add whole table pictures
                    # elem.image_path It’s an absolute path.
                    if elem.image_path and os.path.exists(elem.image_path):
                        try:
                            builder.add_image_element(
                                slide=slide,
                                image_path=elem.image_path,
                                bbox=bbox_list
                            )
                        except Exception as e:
                            logger.error(f"Failed to add table image: {e}")
                    else:
                        logger.warning(f"Table image not found: {elem.image_path}")
                        builder.add_image_placeholder(slide, bbox_list)

            elif elem_type in ['image', 'figure', 'chart']:
                # Check if retrogressive rendering should be used
                should_use_recursive_render = False

                if elem.children and elem.inpainted_background_path:
                    # Check if any child is present in most of the parent’s area.
                    parent_area = (bbox.x1 - bbox.x0) * (bbox.y1 - bbox.y0)
                    max_child_coverage_ratio = 0.85  # threshold
                    has_dominant_child = False

                    for child in elem.children:
                        if hasattr(child, 'bbox_global') and child.bbox_global:
                            child_bbox = child.bbox_global
                        else:
                            child_bbox = child.bbox

                        child_area = child_bbox.area
                        coverage_ratio = child_area / parent_area if parent_area > 0 else 0

                        if coverage_ratio > max_child_coverage_ratio:
                            logger.info(f"{'  ' * depth}    Sub-elements {child.element_id} Size of parent element {coverage_ratio*100:.1f}% (>{max_child_coverage_ratio*100:.0f}%)，Skip Recursive Rendering, use the original image")
                            has_dominant_child = True
                            break

                    should_use_recursive_render = not has_dominant_child

                # If there are sub-elements and they should be rendered
                if should_use_recursive_render:
                    logger.debug(f"{'  ' * depth}    There are elements. {len(elem.children)} Sub-Elements, Recursive Add")

                    # Add first inpainted Background
                    if os.path.exists(elem.inpainted_background_path):
                        try:
                            builder.add_image_element(slide, elem.inpainted_background_path, bbox_list)
                        except Exception as e:
                            logger.error(f"Failed to add inpainted background: {e}")

                    # Recursive Add Sub-Element
                    ExportService._add_editable_elements_to_slide(
                        builder=builder,
                        slide=slide,
                        elements=elem.children,
                        scale_x=scale_x,
                        scale_y=scale_y,
                        depth=depth + 1,
                        text_styles_cache=text_styles_cache,
                        warnings=warnings,
                        fail_fast=fail_fast,
                        on_element=on_element
                    )
                else:
                    # No sub-elements or sub-elements overrepresented. Add the original figure.
                    # elem.image_path It’s an absolute path.
                    if elem.image_path and os.path.exists(elem.image_path):
                        try:
                            builder.add_image_element(
                                slide=slide,
                                image_path=elem.image_path,
                                bbox=bbox_list
                            )
                        except Exception as e:
                            logger.error(f"Failed to add image: {e}")
                    else:
                        logger.warning(f"Image file not found: {elem.image_path}")
                        builder.add_image_placeholder(slide, bbox_list)

            else:
                # Other types
                logger.debug(f"{'  ' * depth}  Skip unknown type: {elem_type}")

            if on_element:
                try:
                    on_element()
                except Exception as e:
                    logger.debug(f"Element progress correction failed: {e}")

