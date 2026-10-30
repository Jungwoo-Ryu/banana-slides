"""
Mask Image Generation Tool
Used from the border frame（bbox）Generate black and white mask images
"""
import logging
from typing import List, Tuple, Union, Callable
from PIL import Image, ImageDraw

logger = logging.getLogger(__name__)


# ============== Bbox Tool Functions ==============

def normalize_bbox(bbox: Union[Tuple, List, dict]) -> Tuple[int, int, int, int]:
    """
    Formatting bbox Standardise as (x1, y1, x2, y2) bar group format

    Supported Input Formats：
    - Divisions/List: (x1, y1, x2, y2)
    - dictionaries: {"x1": x1, "y1": y1, "x2": x2, "y2": y2}
    - dictionaries: {"x": x, "y": y, "width": w, "height": h}
    """
    if isinstance(bbox, dict):
        if 'x1' in bbox:
            return (bbox['x1'], bbox['y1'], bbox['x2'], bbox['y2'])
        elif 'x' in bbox:
            return (bbox['x'], bbox['y'],
                   bbox['x'] + bbox['width'],
                   bbox['y'] + bbox['height'])
        else:
            raise ValueError(f"Unidentified bbox Dictionary Format: {bbox}")
    elif isinstance(bbox, (tuple, list)) and len(bbox) == 4:
        return tuple(bbox)
    else:
        raise ValueError(f"Unidentified bbox Format: {bbox}")


def normalize_bboxes(bboxes: List[Union[Tuple, List, dict]]) -> List[Tuple[int, int, int, int]]:
    """Batch standardization bbox List"""
    result = []
    for bbox in bboxes:
        try:
            result.append(normalize_bbox(bbox))
        except ValueError as e:
            logger.warning(str(e))
    return result


def merge_two_boxes(box1: Tuple, box2: Tuple) -> Tuple[int, int, int, int]:
    """Merge two bbox For the smallest of them. bbox"""
    return (
        min(box1[0], box2[0]),
        min(box1[1], box2[1]),
        max(box1[2], box2[2]),
        max(box1[3], box2[3])
    )


def _iterative_merge(
    bboxes: List[Tuple[int, int, int, int]],
    should_merge_fn: Callable[[Tuple, Tuple], bool]
) -> List[Tuple[int, int, int, int]]:
    """
    Generic iterative consolidation algorithm

    Args:
        bboxes: Standardized bbox List
        should_merge_fn: Two judges. bbox Whether functions should be merged

    Returns:
        Merged bbox List
    """
    if not bboxes:
        return []
    if len(bboxes) == 1:
        return list(bboxes)

    normalized = list(bboxes)
    merged = True

    while merged:
        merged = False
        new_boxes = []
        used = set()

        for i, box1 in enumerate(normalized):
            if i in used:
                continue

            current_box = box1

            for j, box2 in enumerate(normalized):
                if j <= i or j in used:
                    continue

                if should_merge_fn(current_box, box2):
                    current_box = merge_two_boxes(current_box, box2)
                    used.add(j)
                    merged = True

            new_boxes.append(current_box)
            used.add(i)

        normalized = new_boxes

    return normalized


def create_mask_from_bboxes(
    image_size: Tuple[int, int],
    bboxes: List[Union[Tuple[int, int, int, int], dict]],
    mask_color: Tuple[int, int, int] = (255, 255, 255),
    background_color: Tuple[int, int, int] = (0, 0, 0),
    expand_pixels: int = 0
) -> Image.Image:
    """
    Create mask image from the boundary box list

    Args:
        image_size: Image Dimensions (width, height)
        bboxes: Boundary Border List, each element can be：
                - bar group format: (x1, y1, x2, y2) of which (x1,y1) It’s the top left corner.，(x2,y2) It’s the lower right corner.
                - Dictionary Format: {"x": x, "y": y, "width": w, "height": h}
                - Dictionary Format: {"x1": x1, "y1": y1, "x2": x2, "y2": y2}
        mask_color: The colour of the mask area (default white), indicating the area to be removed
        background_color: Background area colour (default black) for reserved area
        expand_pixels: Expand pixels to allow a slight expansion of the masked area (for better elimination)）

    Returns:
        PIL Image Object，RGB Mask Image for Mode
    """
    try:
        # Create Black Background Image
        mask = Image.new('RGB', image_size, background_color)
        draw = ImageDraw.Draw(mask)

        logger.info(f"Create mask image, dimensions: {image_size}, bbox Number: {len(bboxes)}")

        # Draw Every bbox For White Area
        bbox_list = []  # For recording all bbox Coordinates
        for i, bbox in enumerate(bboxes):
            # Parsing different formats bbox
            if isinstance(bbox, dict):
                if 'x1' in bbox and 'y1' in bbox and 'x2' in bbox and 'y2' in bbox:
                    # Format: {"x1": x1, "y1": y1, "x2": x2, "y2": y2}
                    x1 = bbox['x1']
                    y1 = bbox['y1']
                    x2 = bbox['x2']
                    y2 = bbox['y2']
                elif 'x' in bbox and 'y' in bbox and 'width' in bbox and 'height' in bbox:
                    # Format: {"x": x, "y": y, "width": w, "height": h}
                    x1 = bbox['x']
                    y1 = bbox['y']
                    x2 = x1 + bbox['width']
                    y2 = y1 + bbox['height']
                else:
                    logger.warning(f"Unidentified bbox Dictionary Format: {bbox}")
                    continue
            elif isinstance(bbox, (tuple, list)) and len(bbox) == 4:
                # Format: (x1, y1, x2, y2)
                x1, y1, x2, y2 = bbox
            else:
                logger.warning(f"Unidentified bbox Format: {bbox}")
                continue

            # Record original coordinates
            x1_orig, y1_orig, x2_orig, y2_orig = x1, y1, x2, y2

            # Apply Extension or Shrink
            if expand_pixels > 0:
                # Extension
                x1 = max(0, x1 - expand_pixels)
                y1 = max(0, y1 - expand_pixels)
                x2 = min(image_size[0], x2 + expand_pixels)
                y2 = min(image_size[1], y2 + expand_pixels)
            elif expand_pixels < 0:
                # Shrink (inward contraction)）
                shrink = abs(expand_pixels)
                x1 = x1 + shrink
                y1 = y1 + shrink
                x2 = x2 - shrink
                y2 = y2 - shrink
                # Ensure that contraction remains effective (the width and height must be greater) 0）
                if x2 <= x1 or y2 <= y1:
                    logger.warning(f"bbox {i+1} It’s not working after the contraction.: ({x1}, {y1}, {x2}, {y2})，Skip")
                    continue

            # Make sure the coordinates are within the image.
            x1 = max(0, min(x1, image_size[0]))
            y1 = max(0, min(y1, image_size[1]))
            x2 = max(0, min(x2, image_size[0]))
            y2 = max(0, min(y2, image_size[1]))

            # Check again for validity.
            if x2 <= x1 or y2 <= y1:
                logger.warning(f"bbox {i+1} Final Coordinate Invalid: ({x1}, {y1}, {x2}, {y2})，Skip")
                continue

            # Draw a rectangle
            draw.rectangle([x1, y1, x2, y2], fill=mask_color)
            width = x2 - x1
            height = y2 - y1
            if expand_pixels > 0:
                bbox_list.append(f"  [{i+1}] Original: ({x1_orig}, {y1_orig}, {x2_orig}, {y2_orig}) -> After Extension: ({x1}, {y1}, {x2}, {y2}) Dimensions: {width}x{height}")
            elif expand_pixels < 0:
                bbox_list.append(f"  [{i+1}] Original: ({x1_orig}, {y1_orig}, {x2_orig}, {y2_orig}) -> After contracting,: ({x1}, {y1}, {x2}, {y2}) Dimensions: {width}x{height}")
            else:
                bbox_list.append(f"  [{i+1}] ({x1}, {y1}, {x2}, {y2}) Dimensions: {width}x{height}")
            logger.debug(f"bbox {i+1}: ({x1}, {y1}, {x2}, {y2}) Dimensions: {width}x{height}")

        # Output All bbox Details
        if bbox_list:
            logger.info(f"Added. {len(bbox_list)} individual bbox It’s... mask:")
            for bbox_info in bbox_list:
                logger.info(bbox_info)

        logger.info(f"Mask image creation complete")
        return mask

    except Exception as e:
        logger.error(f"Failed to create mask image: {str(e)}", exc_info=True)
        raise


def create_inverse_mask_from_bboxes(
    image_size: Tuple[int, int],
    bboxes: List[Union[Tuple[int, int, int, int], dict]],
    expand_pixels: int = 0
) -> Image.Image:
    """
    Create a reverse mask (reserve) bbox Regional, elimination of other regions）

    Args:
        image_size: Image Dimensions (width, height)
        bboxes: Border Box List
        expand_pixels: Expand pixels

    Returns:
        PIL Image Object, Inverse Mask Image
    """
    # Just change the color.
    return create_mask_from_bboxes(
        image_size,
        bboxes,
        mask_color=(0, 0, 0),  # bbox Area Black (Reserved)）
        background_color=(255, 255, 255),  # Background is white (elimination)）
        expand_pixels=expand_pixels
    )


def create_mask_from_image_and_bboxes(
    image: Image.Image,
    bboxes: List[Union[Tuple[int, int, int, int], dict]],
    expand_pixels: int = 0
) -> Image.Image:
    """
    Create a mask from the image and boundary frame (facility function)）

    Args:
        image: Original Image
        bboxes: Border Box List
        expand_pixels: Expand pixels

    Returns:
        Mask Image
    """
    return create_mask_from_bboxes(
        image.size,
        bboxes,
        expand_pixels=expand_pixels
    )


def visualize_mask_overlay(
    original_image: Image.Image,
    mask_image: Image.Image,
    alpha: float = 0.5
) -> Image.Image:
    """
    Add a mask stack to the original image for visualization

    Args:
        original_image: Original Image
        mask_image: Mask Image
        alpha: Mask Transparency (0.0-1.0)

    Returns:
        Overlayed Image
    """
    try:
        # Make sure both images are the same size.
        if original_image.size != mask_image.size:
            logger.warning(f"The image size doesn’t match. Resize the mask.: {mask_image.size} -> {original_image.size}")
            mask_image = mask_image.resize(original_image.size, Image.LANCZOS)

        # Convert to RGBA
        if original_image.mode != 'RGBA':
            original_rgba = original_image.convert('RGBA')
        else:
            original_rgba = original_image.copy()

        # Create a black translucent mask for visualization
        mask_rgba = Image.new('RGBA', original_image.size, (0, 0, 0, 0))
        draw = ImageDraw.Draw(mask_rgba)

        # Walk through mask images and draw white areas into black and translucent
        mask_array = mask_image.load()
        mask_rgba_array = mask_rgba.load()

        for y in range(mask_image.size[1]):
            for x in range(mask_image.size[0]):
                pixel = mask_array[x, y]
                # If white (or close to white), set to black and translucent
                if isinstance(pixel, tuple):
                    brightness = sum(pixel) / len(pixel)
                else:
                    brightness = pixel

                if brightness > 200:  # Close to white.
                    mask_rgba_array[x, y] = (0, 0, 0, int(128 * alpha))

        # superstition
        result = Image.alpha_composite(original_rgba, mask_rgba)
        return result.convert('RGB')

    except Exception as e:
        logger.error(f"Visible mask stacking failed: {str(e)}", exc_info=True)
        return original_image


def merge_vertical_nearby_bboxes(
    bboxes: List[Tuple[int, int, int, int]],
    vertical_gap_ratio: float = 0.8,
    horizontal_overlap_ratio: float = 0.3
) -> List[Tuple[int, int, int, int]]:
    """
    Merge a very small boundary frame with a very small top-down space (for text line merging)）

    Merge policy (based on original bbox Judge, avoid the snowball effect.）：
    - Press y After sorting the coordinates, make sure each pair is adjacent to the original. bbox Whether or not to merge
    - If the vertical spacing is less than the average row height vertical_gap_ratio Double
    - And at least horizontally. horizontal_overlap_ratio Overlap
    - , mark it as possible to merge, and eventually consolidate the merger.

    Args:
        bboxes: Border Box List [(x1, y1, x2, y2), ...]
        vertical_gap_ratio: Vertical spacing threshold, ratio to average row height, default 0.8
        horizontal_overlap_ratio: Horizontal overlap ratio threshold, default 0.3

    Returns:
        Consolidated Border List
    """
    if not bboxes or len(bboxes) <= 1:
        return list(bboxes) if bboxes else []

    normalized = normalize_bboxes(bboxes)
    if not normalized:
        return []

    # Press y Coordinate Sorting (up to down)）
    normalized.sort(key=lambda b: b[1])

    # Compute Original bbox Average row height
    avg_height = sum(b[3] - b[1] for b in normalized) / len(normalized)
    max_vertical_gap = avg_height * vertical_gap_ratio

    def get_horizontal_overlap(box1, box2):
        """Count two bbox Proportion of overlaps in horizontal direction (relative to smaller width)）"""
        overlap_start = max(box1[0], box2[0])
        overlap_end = min(box1[2], box2[2])
        overlap = max(0, overlap_end - overlap_start)
        min_width = min(box1[2] - box1[0], box2[2] - box2[0])
        return overlap / min_width if min_width > 0 else 0

    def should_merge_adjacent(box1, box2):
        """Judge the two adjacent (by y Sorted) Original bbox Whether or not to merge"""
        # Vertical Space = box2 Top - box1 Bottom
        v_gap = box2[1] - box1[3]

        # If the vertical space is too long, don’t merge
        if v_gap > max_vertical_gap:
            return False

        # Check horizontal overlap
        h_overlap = get_horizontal_overlap(box1, box2)
        if h_overlap >= horizontal_overlap_ratio:
            return True

        # There’s no overlap, but it’s very close and it’s combined.
        if h_overlap <= 0:
            h_gap = max(0, max(box2[0] - box1[2], box1[0] - box2[2]))
            if h_gap < avg_height:
                return True

        return False

    # Step 1： Based on original bbox To determine which adjacent pairs should be merged.
    merge_with_next = []
    for i in range(len(normalized) - 1):
        merge_with_next.append(should_merge_adjacent(normalized[i], normalized[i + 1]))

    # Step 2： Merge by tag
    result = []
    current_box = normalized[0]

    for i in range(len(merge_with_next)):
        if merge_with_next[i]:
            # Merge with Next
            current_box = merge_two_boxes(current_box, normalized[i + 1])
        else:
            # Do not merge, save current, start new group
            result.append(current_box)
            current_box = normalized[i + 1]

    # Add Last
    result.append(current_box)

    logger.info(f"Merge adjacent text lines bbox：{len(bboxes)} -> {len(result)}")
    return result


def merge_overlapping_bboxes(
    bboxes: List[Tuple[int, int, int, int]],
    merge_threshold: int = 10
) -> List[Tuple[int, int, int, int]]:
    """
    Merge overlapping or adjacent boundary frames

    Args:
        bboxes: Border Box List [(x1, y1, x2, y2), ...]
        merge_threshold: Merge threshold (pixels), merge at a boundary frame distance less than this value

    Returns:
        Consolidated Border List
    """
    if not bboxes:
        return []

    normalized = normalize_bboxes(bboxes)
    if not normalized:
        return []

    def should_merge(box1, box2):
        x1, y1, x2, y2 = box1
        bx1, by1, bx2, by2 = box2
        return (x1 - merge_threshold <= bx2 and bx1 <= x2 + merge_threshold and
                y1 - merge_threshold <= by2 and by1 <= y2 + merge_threshold)

    result = _iterative_merge(normalized, should_merge)
    logger.info(f"Merge Borders：{len(bboxes)} -> {len(result)}")
    return result

