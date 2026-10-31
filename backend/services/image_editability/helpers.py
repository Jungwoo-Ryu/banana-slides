"""
Auxiliary Functions and Tool Methods

Pure function, does not depend on any specific accomplishment
"""
import logging
import tempfile
from typing import List, Optional
import numpy as np
import cv2
from PIL import Image

from .data_models import EditableElement, BBox

logger = logging.getLogger(__name__)


def collect_bboxes_from_elements(elements: List[EditableElement]) -> List[tuple]:
    """
    Collection of current level elements bbox List (not recurred to sub-elements)）

    Args:
        elements: List of Elements

    Returns:
        bbox List of Divisions [(x0, y0, x1, y1), ...]
    """
    bboxes = []
    for elem in elements:
        bbox_tuple = elem.bbox.to_tuple()
        bboxes.append(bbox_tuple)
        logger.debug(f"Elements {elem.element_id} ({elem.element_type}): bbox={bbox_tuple}")
    return bboxes


def crop_element_from_image(
    source_image_path: str,
    bbox: BBox
) -> str:
    """
    Cut Element Area From Source Pictures

    Args:
        source_image_path: Source Picture Path
        bbox: Crop Area

    Returns:
        Temporary file path for images after cropping
    """
    img = Image.open(source_image_path)

    # Crop
    crop_box = (int(bbox.x0), int(bbox.y0), int(bbox.x1), int(bbox.y1))
    cropped = img.crop(crop_box)

    # Save to temporary file
    with tempfile.NamedTemporaryFile(suffix='.png', delete=False) as tmp:
        cropped.save(tmp.name)
        return tmp.name


def should_recurse_into_element(
    element: EditableElement,
    parent_image_size: tuple,
    min_image_size: int,
    min_image_area: int,
    max_child_coverage_ratio: float
) -> bool:
    """
    Determines whether the element should be recalculated

    Args:
        element: Elements to be judged
        parent_image_size: Parentage Dimensions (width, height)
        min_image_size: Minimum Image Dimensions
        min_image_area: Minimum picture area
        max_child_coverage_ratio: Maximum subchart overwrite ratio
    """
    # If sub-elements (e.g. table cells) already exist, do not recur
    if element.children:
        logger.debug(f"  Elements {element.element_id} Existing {len(element.children)} It’s a sub-element. It’s not going back.")
        return False

    # Recursively only for graphics and chart types
    if element.element_type not in ['image', 'figure', 'chart', 'table']:
        return False

    # Check if the size is big enough.
    bbox = element.bbox
    if bbox.width < min_image_size or bbox.height < min_image_size:
        logger.debug(f"  Elements {element.element_id} It’s too small. ({bbox.width}x{bbox.height})，Not Recursive")
        return False

    if bbox.area < min_image_area:
        logger.debug(f"  Elements {element.element_id} It’s too small. ({bbox.area})，Not Recursive")
        return False

    # Check if the sub-graphs occupy the vast majority of the parent chart.
    parent_width, parent_height = parent_image_size
    parent_area = parent_width * parent_height
    coverage_ratio = bbox.area / parent_area if parent_area > 0 else 0

    if coverage_ratio > max_child_coverage_ratio:
        logger.info(f"  Elements {element.element_id} Size of parent map {coverage_ratio*100:.1f}% (>{max_child_coverage_ratio*100:.0f}%)，Not Recursive")
        return False

    return True


def should_extract_subject(
    slide_image_bgr: np.ndarray,
    bbox: BBox,
    ring_width: int = 5,
    color_tolerance: int = 20,
    rect_area_threshold: float = 0.70,
) -> Optional[bool]:
    """
    Judgement. ROI Whether it is"Icon"（Is it worth sending into the main map model?"Photos"（Keep original rectangle crop）。

    Sampling with ring + flood fill Yes. ROI Internal Recognition"Infiltration Slide Background"，The rest will be considered as the main cover.：
      - Maximum contour of the subject approximates 4 Top Point AND Area ROI ≥ rect_area_threshold → Photos (False)
      - Otherwise considered icon (True)
      - Detected conditions not met (sidesides) / It’s too small. / No background match. seed / It’s all background.）→ None

    Back:
        True  - icon, should be sent to the main map model
        False - Photos, keep the original rectangle crop
        None  - Uncertain, keep the original rectangle crop
    """
    if slide_image_bgr is None or slide_image_bgr.size == 0:
        return None

    page_h, page_w = slide_image_bgr.shape[:2]
    x0 = max(0, int(bbox.x0))
    y0 = max(0, int(bbox.y0))
    x1 = min(page_w, int(bbox.x1))
    y1 = min(page_h, int(bbox.y1))
    if x1 - x0 < 8 or y1 - y0 < 8:
        return None

    rx0 = max(0, x0 - ring_width)
    ry0 = max(0, y0 - ring_width)
    rx1 = min(page_w, x1 + ring_width)
    ry1 = min(page_h, y1 + ring_width)
    if rx0 == x0 and ry0 == y0 and rx1 == x1 and ry1 == y1:
        return None

    ring = slide_image_bgr[ry0:ry1, rx0:rx1]
    ring_mask = np.ones(ring.shape[:2], dtype=bool)
    ring_mask[(y0 - ry0):(y1 - ry0), (x0 - rx0):(x1 - rx0)] = False
    ring_pixels = ring[ring_mask]
    if len(ring_pixels) < 16:
        return None
    bg_color = np.median(ring_pixels, axis=0)

    roi = slide_image_bgr[y0:y1, x0:x1].copy()
    rh, rw = roi.shape[:2]

    border_step = max(1, min(rh, rw) // 32)
    seeds: list[tuple[int, int]] = []
    for x in range(0, rw, border_step):
        seeds.append((x, 0))
        seeds.append((x, rh - 1))
    for y in range(0, rh, border_step):
        seeds.append((0, y))
        seeds.append((rw - 1, y))

    bg_int = bg_color.astype(np.int16)
    matched_seeds: list[tuple[int, int]] = []
    for sx, sy in seeds:
        diff = np.abs(roi[sy, sx].astype(np.int16) - bg_int).max()
        if diff <= color_tolerance:
            matched_seeds.append((sx, sy))

    if not matched_seeds:
        return None

    flood_mask = np.zeros((rh + 2, rw + 2), dtype=np.uint8)
    diff = (color_tolerance, color_tolerance, color_tolerance)
    flood_flags = 4 | (1 << 8) | cv2.FLOODFILL_MASK_ONLY
    for sx, sy in matched_seeds:
        if flood_mask[sy + 1, sx + 1] == 0:
            cv2.floodFill(
                roi, flood_mask, (sx, sy), newVal=0,
                loDiff=diff, upDiff=diff, flags=flood_flags,
            )

    bg_mask = flood_mask[1:-1, 1:-1]
    subject_mask = np.where(bg_mask == 0, 255, 0).astype(np.uint8)

    roi_area = rh * rw
    subject_area = int(np.count_nonzero(subject_mask))
    if subject_area == 0 or subject_area < roi_area * 0.05:
        return None

    contours, _ = cv2.findContours(subject_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return None

    main_contour = max(contours, key=cv2.contourArea)
    main_area = cv2.contourArea(main_contour)
    if main_area <= 0:
        return None

    perimeter = cv2.arcLength(main_contour, True)
    epsilon = 0.02 * perimeter
    approx = cv2.approxPolyDP(main_contour, epsilon, True)
    if len(approx) == 4 and (main_area / roi_area) >= rect_area_threshold:
        return False

    return True
