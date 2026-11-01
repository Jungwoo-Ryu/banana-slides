"""Runtime configuration; secrets belong to the environment or mounted secret files."""
import os
from pathlib import Path


def secret(name: str) -> str:
    path = os.getenv(f'{name}_FILE', '').strip()
    if path:
        return Path(path).read_text(encoding='utf-8').strip()
    return os.getenv(name, '').strip()


def setting(name: str, default=None):
    # Never consult persisted settings for credentials.
    if name.endswith(('_API_KEY', '_TOKEN', '_SECRET')):
        return secret(name) or default
    try:
        from flask import current_app, has_app_context
        if has_app_context():
            value = current_app.config.get(name)
            if value is not None and value != '':
                return value
    except ImportError:
        pass
    return os.getenv(name) or default
