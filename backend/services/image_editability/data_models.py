"""
Data Model - Photo-editing service core data structure
"""
from typing import Dict, Any, List, Optional, Tuple
from dataclasses import dataclass, field


@dataclass
class BBox:
    """Border Border Coordinates"""
    x0: float
    y0: float
    x1: float
    y1: float

    @property
    def width(self) -> float:
        return self.x1 - self.x0

    @property
    def height(self) -> float:
        return self.y1 - self.y0

    @property
    def area(self) -> float:
        return self.width * self.height

    def to_tuple(self) -> Tuple[float, float, float, float]:
        """Convert to meta-format (x0, y0, x1, y1)"""
        return (self.x0, self.y0, self.x1, self.y1)

    def to_dict(self) -> Dict[str, float]:
        """Convert to Dictionary Format"""
        return {
            'x0': self.x0,
            'y0': self.y0,
            'x1': self.x1,
            'y1': self.y1
        }

    def scale(self, scale_x: float, scale_y: float) -> 'BBox':
        """Scale bbox"""
        return BBox(
            x0=self.x0 * scale_x,
            y0=self.y0 * scale_y,
            x1=self.x1 * scale_x,
            y1=self.y1 * scale_y
        )

    def translate(self, offset_x: float, offset_y: float) -> 'BBox':
        """Diverse bbox"""
        return BBox(
            x0=self.x0 + offset_x,
            y0=self.y0 + offset_y,
            x1=self.x1 + offset_x,
            y1=self.y1 + offset_y
        )

    def expand(self, px: float, max_w: float, max_h: float) -> 'BBox':
        """Spread around. px Pixels，clamp Present. [0, max_w] × [0, max_h]。"""
        return BBox(
            x0=max(0.0, self.x0 - px),
            y0=max(0.0, self.y0 - px),
            x1=min(float(max_w), self.x1 + px),
            y1=min(float(max_h), self.y1 + px),
        )


@dataclass
class EditableElement:
    """Editable Elements"""
    element_id: str  # Unique ID
    element_type: str  # text, image, table, figure, equation Wait.
    bbox: BBox  # In the parent container（EditableImage）Position in the Coordinate System
    bbox_global: BBox  # In root picture (top floor) EditableImage）Location in the coordinates system (expected storage, avoid frontend)/Re-calculate after-use）
    content: Optional[str] = None  # Text content、HTML Tables etc.
    image_path: Optional[str] = None  # Picture Path（MinerU Extracted）

    # Whether to be determined as an icon by the Catalog（True=icon / False=photo / None=Undecided or non-pictural elements）
    # Only image Type elements run into categories；icon It’ll be light at the page source. BBox Spread out to avoid the edges.
    is_icon: Optional[bool] = None

    # Recursive sub-elements (if a picture or chart is present, there may be sub-elements)）
    children: List['EditableElement'] = field(default_factory=list)

    # It’s a subgraph. inpaint Background (if this element is a recalcitrant image)/Chart）
    inpainted_background_path: Optional[str] = None

    # Metadata
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        """Convert to Dictionary (Sequencable)）"""
        result = {
            'element_id': self.element_id,
            'element_type': self.element_type,
            'bbox': self.bbox.to_dict(),
            'bbox_global': self.bbox_global.to_dict(),
            'content': self.content,
            'image_path': self.image_path,
            'inpainted_background_path': self.inpainted_background_path,
            'is_icon': self.is_icon,
            'metadata': self.metadata,
            'children': [child.to_dict() for child in self.children]
        }
        return result


@dataclass
class EditableImage:
    """Editable Photo Structure"""
    image_id: str  # Unique ID
    image_path: str  # Original Image Path
    width: int  # Image width
    height: int  # Image Height

    # All extracted elements
    elements: List[EditableElement] = field(default_factory=list)

    # Inpaint Background chart after (elimination of all elements)）
    clean_background: Optional[str] = None

    # Recursive Level
    depth: int = 0

    # Parent Picture ID（If it’s a subgraph,）
    parent_id: Optional[str] = None

    # Metadata
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        """Convert to Dictionary (Sequencable)）"""
        return {
            'image_id': self.image_id,
            'image_path': self.image_path,
            'width': self.width,
            'height': self.height,
            'elements': [elem.to_dict() for elem in self.elements],
            'clean_background': self.clean_background,
            'depth': self.depth,
            'parent_id': self.parent_id,
            'metadata': self.metadata
        }

