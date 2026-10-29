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
    ai_provider_format = db.Column(db.String(20), nullable=True)   # AI提供商格式: openai, gemini (NULL=use .env)
    api_base_url = db.Column(db.String(500), nullable=True)        # API基础URL
    image_resolution = db.Column(db.String(20), nullable=True)     # 图像清晰度: 1K, 2K, 4K (NULL=use .env)
    image_aspect_ratio = db.Column(db.String(10), nullable=True)   # 图像比例: 16:9, 4:3, 1:1 (NULL=use .env)
    image_quality = db.Column(db.String(10), nullable=True)        # 图像质量档位: auto/low/medium/high/xhigh/max (NULL=use .env)
    max_description_workers = db.Column(db.Integer, nullable=True)  # 描述生成最大工作线程数 (NULL=use .env)
    max_image_workers = db.Column(db.Integer, nullable=True)        # 图像生成最大工作线程数 (NULL=use .env)

    # 新增：大模型与 MinerU 相关可视化配置（可在设置页中编辑）
    text_model = db.Column(db.String(100), nullable=True)  # 文本大模型名称（覆盖 Config.TEXT_MODEL）
    image_model = db.Column(db.String(100), nullable=True)  # 图片大模型名称（覆盖 Config.IMAGE_MODEL）
    mineru_api_base = db.Column(db.String(255), nullable=True)  # MinerU 服务地址（覆盖 Config.MINERU_API_BASE）
    image_caption_model = db.Column(db.String(100), nullable=True)  # 图片识别模型（覆盖 Config.IMAGE_CAPTION_MODEL）
    output_language = db.Column(db.String(10), nullable=True)  # 输出语言偏好（zh, en, ja, auto）(NULL=use .env)
    
    # 推理模式配置（分别控制文本和图像生成）
    enable_text_reasoning = db.Column(db.Boolean, nullable=False, default=False)  # 文本生成是否开启推理
    text_max_output_tokens = db.Column(db.Integer, nullable=True)  # NULL = environment/default 32768
    text_thinking_budget = db.Column(db.Integer, nullable=False, default=1024)  # 文本推理思考负载 (1-8192)
    enable_image_reasoning = db.Column(db.Boolean, nullable=False, default=False)  # 图像生成是否开启推理
    image_thinking_budget = db.Column(db.Integer, nullable=False, default=1024)  # 图像推理思考负载 (1-8192)
    enable_image_quality_control = db.Column(db.Boolean, nullable=False, default=False)  # 生成图片落库前是否开启视觉质检
    
    # 描述生成模式: streaming / parallel (NULL=默认 streaming)
    description_generation_mode = db.Column(db.String(20), nullable=True)

    # 描述额外字段配置: JSON 数组如 ["配图与素材", "版式与重点"] (NULL=默认 DEFAULT_EXTRA_FIELDS)
    description_extra_fields = db.Column(db.Text, nullable=True)
    image_prompt_extra_fields = db.Column(db.Text, nullable=True)  # JSON array: 哪些额外字段传入文生图 prompt

    # 百度 API 配置

    # ElevenLabs TTS 配置
    elevenlabs_enabled = db.Column(db.Boolean, nullable=False, default=False)
    elevenlabs_voice_id = db.Column(db.String(100), nullable=True)

    # 每种模型类型的提供商配置（source 可选 gemini/openai/lazyllm厂商名，NULL=使用全局配置）
    text_model_source = db.Column(db.String(50), nullable=True)           # 文本模型提供商 (gemini, openai, qwen, doubao, deepseek, ...)
    image_model_source = db.Column(db.String(50), nullable=True)          # 图片模型提供商
    image_caption_model_source = db.Column(db.String(50), nullable=True)  # 图片识别模型提供商

    # Per-model API 凭证（当 source 为 gemini/openai 时使用，NULL=使用全局 api_key/api_base_url）
    text_api_base_url = db.Column(db.String(500), nullable=True)
    image_api_base_url = db.Column(db.String(500), nullable=True)
    image_caption_api_base_url = db.Column(db.String(500), nullable=True)

    # OpenAI image API protocol: auto (default), images (force images.generate), chat (force chat.completions)
    openai_image_api_protocol = db.Column(db.String(10), nullable=True)

    # OpenAI Codex OAuth credentials

    created_at = db.Column(db.DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at = db.Column(db.DateTime, nullable=False, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    def _val(self, attr, defaults):
        """Return DB value, falling back to .env default when None."""
        v = getattr(self, attr)
        return v if v is not None else defaults.get(attr)

    # 字段契约：页面文字（逐字上屏）/ 配图与素材（放什么）/ 版式与重点（怎么排）/ 演讲者备注（怎么讲）
    DEFAULT_EXTRA_FIELDS = ['配图与素材', '版式与重点', '演讲者备注']
    DEFAULT_IMAGE_PROMPT_FIELDS = ['配图与素材', '版式与重点']  # 演讲者备注默认不传入图片生成

    # 旧字段名 → 新字段名。存量数据不迁移，靠此映射保持行为不回退
    LEGACY_FIELD_EQUIV = {
        '视觉元素': '配图与素材',
        '视觉焦点': '版式与重点',
        '排版布局': '版式与重点',
        '排版建议': '版式与重点',
    }

    def get_description_extra_fields(self):
        """Return parsed extra fields list."""
        if self.description_extra_fields:
            try:
                fields = json.loads(self.description_extra_fields)
                if isinstance(fields, list):
                    return fields
            except (json.JSONDecodeError, TypeError):
                pass
        return list(self.DEFAULT_EXTRA_FIELDS)

    def get_image_prompt_extra_fields(self):
        """Return parsed list of extra fields to include in image prompts."""
        if self.image_prompt_extra_fields:
            try:
                fields = json.loads(self.image_prompt_extra_fields)
                if isinstance(fields, list):
                    return fields
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
