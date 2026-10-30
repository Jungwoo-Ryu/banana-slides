"""
Project model
"""
import uuid
from datetime import datetime
from . import db


class Project(db.Model):
    """
    Project model - represents a PPT project
    """
    __tablename__ = 'projects'

    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_title = db.Column(db.String(255), nullable=True)
    idea_prompt = db.Column(db.Text, nullable=True)
    outline_text = db.Column(db.Text, nullable=True)  # Outline text entered by the user (for outline Type）
    description_text = db.Column(db.Text, nullable=True)  # Description text entered by user (used for description Type）
    extra_requirements = db.Column(db.Text, nullable=True)  # Extra requirements, applied to each page AI Phrasing
    outline_requirements = db.Column(db.Text, nullable=True)  # Outline generation requirements
    description_requirements = db.Column(db.Text, nullable=True)  # Page Description Generation Requirements
    creation_type = db.Column(db.String(20), nullable=False, default='idea')  # idea|outline|descriptions
    template_image_path = db.Column(db.String(500), nullable=True)
    template_style = db.Column(db.Text, nullable=True)  # Style description text (no template pattern)）
    template_mode = db.Column(
        db.String(10), nullable=False, server_default='single', default='single'
    )  # 'single' | 'multi'，Only UI Render branch, without prejudice to page-level field reading and writing
    # Export Settings
    export_extractor_method = db.Column(db.String(50), nullable=True, default='configured')  # Component extraction method: mineru, hybrid
    export_inpaint_method = db.Column(db.String(50), nullable=True, default='local')  # How to get background maps: generative, baidu, hybrid
    export_allow_partial = db.Column(db.Boolean, nullable=True, default=False)  # Whether to allow the return of semi-finished products (continue rather than stop when an error occurs)）
    enable_icon_subject_extraction = db.Column(db.Boolean, nullable=True, default=True)  # Whether to walk a 100-degree smart map of a small size icon
    image_aspect_ratio = db.Column(db.String(10), nullable=False, server_default='16:9', default='16:9')
    status = db.Column(db.String(50), nullable=False, default='DRAFT')
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    # Usage 'select' Strategy support eager loading，While remaining flexible.
    pages = db.relationship('Page', back_populates='project', lazy='select',
                           cascade='all, delete-orphan', order_by='Page.order_index')
    tasks = db.relationship('Task', back_populates='project', lazy='select',
                           cascade='all, delete-orphan')
    materials = db.relationship('Material', back_populates='project', lazy='select',
                           cascade='all, delete-orphan')
    template_assets = db.relationship(
        'ProjectTemplateAsset',
        back_populates='project',
        lazy='select',
        cascade='all, delete-orphan',
        order_by='ProjectTemplateAsset.sort_order',
    )

    def to_dict(self, include_pages=False):
        """Convert to dictionary"""
        # Format created_at and updated_at with UTC timezone indicator for proper frontend parsing
        created_at_str = None
        if self.created_at:
            created_at_str = self.created_at.isoformat() + 'Z' if not self.created_at.tzinfo else self.created_at.isoformat()

        updated_at_str = None
        if self.updated_at:
            updated_at_str = self.updated_at.isoformat() + 'Z' if not self.updated_at.tzinfo else self.updated_at.isoformat()

        data = {
            'project_id': self.id,
            'project_title': self.project_title,
            'idea_prompt': self.idea_prompt,
            'outline_text': self.outline_text,
            'description_text': self.description_text,
            'extra_requirements': self.extra_requirements,
            'outline_requirements': self.outline_requirements,
            'description_requirements': self.description_requirements,
            'creation_type': self.creation_type,
            'template_image_url': f'/files/{self.id}/template/{self.template_image_path.split("/")[-1]}' if self.template_image_path else None,
            'template_style': self.template_style,
            'template_mode': self.template_mode or 'single',
            'export_extractor_method': self.export_extractor_method or 'configured',
            'export_inpaint_method': self.export_inpaint_method or 'local',
            'export_allow_partial': self.export_allow_partial or False,
            'enable_icon_subject_extraction': True if self.enable_icon_subject_extraction is None else bool(self.enable_icon_subject_extraction),
            'image_aspect_ratio': self.image_aspect_ratio,
            'status': self.status,
            'created_at': created_at_str,
            'updated_at': updated_at_str,
        }

        if include_pages:
            # pages It’s a list. It’s not necessary. order_by（Already relationship definition）
            data['pages'] = [page.to_dict() for page in self.pages]

        return data

    def __repr__(self):
        return f'<Project {self.id}: {self.status}>'
