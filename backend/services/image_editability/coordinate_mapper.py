"""
Coordinate Map Tool - Process coordinate conversion between father and son pictures
"""
from typing import Tuple
from .data_models import BBox


class CoordinateMapper:
    """Coordinate Map Tool - Process coordinate conversion between father and son pictures"""

    @staticmethod
    def local_to_global(
        local_bbox: BBox,
        parent_bbox: BBox,
        local_image_size: Tuple[int, int],
        parent_image_size: Tuple[int, int]
    ) -> BBox:
        """
        Converts the local coordinates of the sub-graph to the global coordinates of the parent (or root) map

        Args:
            local_bbox: It’s in the sub-graph coordinates. bbox
            parent_bbox: Position of the child in the parent chart
            local_image_size: Subgraph Dimensions (width, height)
            parent_image_size: Parentage Dimensions (width, height)

        Returns:
            It’s in the parent chart coordinate system. bbox
        """
        # Calculate scale of scaling (real pixels of the sub-graph) vs The child is in the parent chart. bbox Dimensions）
        scale_x = parent_bbox.width / local_image_size[0]
        scale_y = parent_bbox.height / local_image_size[1]

        # Zoom to Parent Chart first bbox Size
        scaled_bbox = local_bbox.scale(scale_x, scale_y)

        # Move to parent chart bbox Location
        global_bbox = scaled_bbox.translate(parent_bbox.x0, parent_bbox.y0)

        return global_bbox

    @staticmethod
    def global_to_local(
        global_bbox: BBox,
        parent_bbox: BBox,
        local_image_size: Tuple[int, int],
        parent_image_size: Tuple[int, int]
    ) -> BBox:
        """
        Converts the overall coordinates of the parent chart to the local coordinates of the child map (reverse map)）

        Args:
            global_bbox: In the parent chart coordinate system bbox
            parent_bbox: Position of the child in the parent chart
            local_image_size: Subgraph Dimensions (width, height)
            parent_image_size: Parentage Dimensions (width, height)

        Returns:
            It’s in the sub-chart coordinates. bbox
        """
        # Move first (relative to parent_bbox The original.）
        translated_bbox = global_bbox.translate(-parent_bbox.x0, -parent_bbox.y0)

        # Zoom
        scale_x = local_image_size[0] / parent_bbox.width
        scale_y = local_image_size[1] / parent_bbox.height

        local_bbox = translated_bbox.scale(scale_x, scale_y)

        return local_bbox

