"""Settings model"""
import json
from datetime import datetime, timezone
from . import db


def _utcnow_naive():
    return datetime.now(timezone.utc).replace(tzinfo=None)


class Settings(db.Model):
    """
    Settings model - stores global application settings
    """
    __tablename__ = 'settings'

    id = db.Column(db.Integer, primary_key=True, default=1)
    image_resolution = db.Column(db.String(20), nullable=True)     # Image Clarity: 1K, 2K, 4K (NULL=use .env)
    image_aspect_ratio = db.Column(db.String(10), nullable=True)   # Image Scale: 16:9, 4:3, 1:1 (NULL=use .env)
    image_quality = db.Column(db.String(10), nullable=True)        # Image quality slot: auto/low/medium/high/xhigh/max (NULL=use .env)
    max_description_workers = db.Column(db.Integer, nullable=True)  # Description of the maximum number of work-lines generated (NULL=use .env)
    max_image_workers = db.Column(db.Integer, nullable=True)        # Maximum number of worklines for image generation (NULL=use .env)

    # Add： Large models and MinerU Relevant visual configuration (can be edited in settings page)）
    mineru_api_base = db.Column(db.String(255), nullable=True)  # MinerU Service address (overrided) Config.MINERU_API_BASE）
    output_language = db.Column(db.String(10), nullable=True)  # Output language preference (ko, en, auto)(NULL=use .env)

    # Reasoning settings (separate controls for text and image generation）
    text_max_output_tokens = db.Column(db.Integer, nullable=True)  # NULL = environment/default 32768
    enable_image_quality_control = db.Column(db.Boolean, nullable=False, default=False)  # Whether or not to open a visual inspection before creating a picture library

    # Description of generation mode: streaming / parallel (NULL=Default streaming)
    description_generation_mode = db.Column(db.String(20), nullable=True)

    # Description of extra field configuration: JSON array such as ["Visual assets", "Layout and emphasis"] (NULL=Default DEFAULT_EXTRA_FIELDS)
    description_extra_fields = db.Column(db.Text, nullable=True)
    image_prompt_extra_fields = db.Column(db.Text, nullable=True)  # JSON array: Which extra fields are brought into the script prompt


    design_system_prompt = db.Column(db.Text, nullable=True)





    created_at = db.Column(db.DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at = db.Column(db.DateTime, nullable=False, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    def _val(self, attr, defaults):
        """Return DB value, falling back to .env default when None."""
        v = getattr(self, attr)
        return v if v is not None else defaults.get(attr)

    # Field Compacts：SLIDE_TEXT（Word-by-word）/ Visual assets（What do you mean?）/ Layout and emphasis（How?）/ Speaker notes（What do you mean?）
    DEFAULT_EXTRA_FIELDS = ['Visual assets', 'Layout and emphasis', 'Speaker notes']
    DEFAULT_IMAGE_PROMPT_FIELDS = ['Visual assets', 'Layout and emphasis']  # Speaker notes Default not to import pictures generation

    # Old Field Name → New field name. Stock data does not migrate, and behaviour is maintained on this map.
    LEGACY_FIELD_EQUIV = {
        'Visual elements': 'Visual assets',
        'Visual focus': 'Layout and emphasis',
        'Page layout': 'Layout and emphasis',
        'Layout suggestions': 'Layout and emphasis',
    }

    # Input compatibility only: names persisted by releases before the English schema.
    LEGACY_INPUT_FIELDS = {
        "\u914d\u56fe\u4e0e\u7d20\u6750": "Visual assets",
        "\u7248\u5f0f\u4e0e\u91cd\u70b9": "Layout and emphasis",
        "\u6f14\u8bb2\u8005\u5907\u6ce8": "Speaker notes",
        "\u89c6\u89c9\u5143\u7d20": "Visual elements",
        "\u89c6\u89c9\u7126\u70b9": "Visual focus",
        "\u6392\u7248\u5e03\u5c40": "Page layout",
        "\u6392\u7248\u5efa\u8bae": "Layout suggestions"
}

    def get_description_extra_fields(self):
        """Return parsed extra fields list."""
        if self.description_extra_fields:
            try:
                fields = json.loads(self.description_extra_fields)
                if isinstance(fields, list):
                    return list(dict.fromkeys(self.LEGACY_INPUT_FIELDS.get(name, name) for name in fields))
            except (json.JSONDecodeError, TypeError):
                pass
        return list(self.DEFAULT_EXTRA_FIELDS)

    def get_image_prompt_extra_fields(self):
        """Return parsed list of extra fields to include in image prompts."""
        if self.image_prompt_extra_fields:
            try:
                fields = json.loads(self.image_prompt_extra_fields)
                if isinstance(fields, list):
                    return list(dict.fromkeys(self.LEGACY_INPUT_FIELDS.get(name, name) for name in fields))
            except (json.JSONDecodeError, TypeError):
                pass
        return list(self.DEFAULT_IMAGE_PROMPT_FIELDS)

    def to_dict(self):
        from services.settings_service import serialize_settings
        return serialize_settings(self)

    @staticmethod
    def get_settings():
        """
        Get or create the single settings instance.

        Returns the ORM object as-is from the database.  ``.env``
        defaults for ``None`` fields are merged only at serialisation
        time in ``to_dict()``, so this method has no write side-effects.
        """
        settings = Settings.query.first()

        if settings is None:
            settings = Settings(id=1)
            db.session.add(settings)
            db.session.commit()

        return settings

    def __repr__(self):
        return f'<Settings id={self.id}>'

# Map both historical spellings and translated legacy names to current prompt roles.
for _old, _english in Settings.LEGACY_INPUT_FIELDS.items():
    Settings.LEGACY_FIELD_EQUIV[_old] = Settings.LEGACY_FIELD_EQUIV.get(_english, _english)
