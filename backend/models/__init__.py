"""Database models package"""
from flask_sqlalchemy import SQLAlchemy

# Create SQLAlchemy Example, Configure SQLite Connection Options
db = SQLAlchemy(
    engine_options={
        'connect_args': {
            'check_same_thread': False,  # Allow cross-line (only) SQLite）
            'timeout': 30,  # Database lockout timeout (sec)）- SQLite Specific
        },
        'pool_pre_ping': True,  # Check before connecting to make sure the connection works
        'pool_recycle': 3600,  # 1 Hourly recovery connection, release file handles
        'pool_size': 10,
        'max_overflow': 50,
        'pool_timeout': 30,  # Timeout to retrieve connection (seconds)）
    }
)

from .project import Project
from .page import Page
from .task import Task
from .user_template import UserTemplate
from .page_image_version import PageImageVersion
from .material import Material
from .reference_file import ReferenceFile
from .settings import Settings
from .user_style_template import UserStyleTemplate
from .project_template_asset import ProjectTemplateAsset

__all__ = ['db', 'Project', 'Page', 'Task', 'UserTemplate', 'PageImageVersion', 'Material', 'ReferenceFile', 'Settings', 'UserStyleTemplate', 'ProjectTemplateAsset']
