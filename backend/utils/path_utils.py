"""
Path utilities for handling MinerU file paths and prefix matching
"""
import os
import logging
from pathlib import Path
from typing import Optional, Union

logger = logging.getLogger(__name__)


def _is_path_within(path: Path, root: Path) -> bool:
    try:
        real_root = os.path.realpath(root)
        return os.path.commonpath([os.path.realpath(path), real_root]) == real_root
    except ValueError:
        return False


def _default_project_root() -> Path:
    current_file = Path(__file__).resolve()
    backend_dir = current_file.parent.parent
    return backend_dir.parent


def _resolve_mineru_root(
    project_root: Optional[Path] = None,
    upload_folder: Optional[Union[os.PathLike, str]] = None
) -> Path:
    if upload_folder is not None:
        upload_root = Path(upload_folder)
    elif project_root is not None:
        upload_root = project_root / 'uploads'
    else:
        upload_root = None
        try:
            from flask import current_app, has_app_context
            if has_app_context() and hasattr(current_app, 'config'):
                configured_upload_folder = current_app.config.get('UPLOAD_FOLDER')
                if (
                    isinstance(configured_upload_folder, (str, os.PathLike))
                    and str(configured_upload_folder)
                ):
                    upload_root = Path(configured_upload_folder)
        except (RuntimeError, ImportError, TypeError, AttributeError):
            pass

        if upload_root is None:
            env_upload_folder = os.getenv('UPLOAD_FOLDER')
            if env_upload_folder:
                upload_root = Path(env_upload_folder)

        if upload_root is None:
            upload_root = _default_project_root() / 'uploads'

    if not upload_root.is_absolute():
        root = project_root or _default_project_root()
        upload_root = (root / upload_root).resolve()
        try:
            upload_root.relative_to(root)
        except ValueError as exc:
            raise ValueError("Relative UPLOAD_FOLDER must stay within the project root") from exc

    return upload_root.resolve() / 'mineru_files'


def convert_mineru_path_to_local(
    mineru_path: str,
    project_root: Optional[Path] = None,
    upload_folder: Optional[Union[os.PathLike, str]] = None,
) -> Optional[Path]:
    """
    Yes, sir. /files/mineru/{extract_id}/{rel_path} Convert the format path to the local filesystem path

    Args:
        mineru_path: MinerU URL Path, formatted as /files/mineru/{extract_id}/{rel_path}
        project_root: Item root directory path (if None，Autocalculate）
        upload_folder: Upload root directory; priority at upload project_root/uploads

    Returns:
        Local filesystem path（Path object) returns if conversion fails None
    """
    try:
        if not mineru_path.startswith('/files/mineru/'):
            return None

        # Remove '/files/mineru/' prefix
        rel_path = mineru_path[len('/files/mineru/'):].lstrip('/\\')

        mineru_root = _resolve_mineru_root(project_root, upload_folder)
        local_path = Path(os.path.realpath(mineru_root / rel_path))
        if not _is_path_within(local_path, mineru_root):
            logger.warning(f"Path traversal attempt blocked for MinerU path: {mineru_path}")
            return None

        return local_path
    except Exception as e:
        logger.warning(f"Failed to convert MinerU path to local: {mineru_path}, error: {str(e)}")
        return None


def find_mineru_file_with_prefix(
    mineru_path: str,
    project_root: Optional[Path] = None,
    upload_folder: Optional[Union[os.PathLike, str]] = None,
) -> Optional[Path]:
    """
    Find MinerU File, support prefix matching

    First try direct path matching, and if you fail try prefix matching。
    Prefix matches logic： if the file name looks like a prefix+Extension (prefix length) >= 5），
    Finds files starting with this prefix in a directory。

    Args:
        mineru_path: MinerU URL Path, formatted as /files/mineru/{extract_id}/{rel_path}
        project_root: Item root directory path (if None，Autocalculate）
        upload_folder: Upload root directory; priority at upload project_root/uploads

    Returns:
        File Path Found（Path object) returns if not found None
    """
    # First try direct path conversion
    local_path = convert_mineru_path_to_local(mineru_path, project_root, upload_folder)

    if local_path is None:
        return None
    mineru_root = _resolve_mineru_root(project_root, upload_folder)

    # Direct file matching
    if local_path.exists() and local_path.is_file():
        if not _is_path_within(local_path, mineru_root):
            return None
        return local_path

    # Try prefix match using the generic function
    matched_path = find_file_with_prefix(local_path)
    if matched_path and _is_path_within(matched_path, mineru_root):
        return Path(os.path.realpath(matched_path))
    return None


def find_file_with_prefix(file_path: Path) -> Optional[Path]:
    """
    Find files, support prefix matching

    First check if the file exists, and if not, try prefix matching。
    Prefix matches logic： if the file name looks like a prefix+Extension (prefix length) >= 5），
    Finds files starting with this prefix in a directory。

    Args:
        file_path: File path to search for（Path Object）

    Returns:
        File Path Found（Path object) returns if not found None
    """
    # Direct file matching
    if file_path.exists() and file_path.is_file():
        return file_path

    # Try prefix match if not found and filename looks like a prefix with extension
    filename = file_path.name
    dirpath = file_path.parent

    if '.' in filename and dirpath.exists() and dirpath.is_dir():
        prefix, ext = os.path.splitext(filename)
        if len(prefix) >= 5:
            try:
                for fname in os.listdir(dirpath):
                    fp, fe = os.path.splitext(fname)
                    if fp.lower().startswith(prefix.lower()) and fe.lower() == ext.lower():
                        matched_path = dirpath / fname
                        if matched_path.is_file():
                            logger.debug(f"Prefix match found: {file_path} -> {matched_path}")
                            return matched_path
            except OSError as e:
                logger.warning(f"Failed to list directory {dirpath}: {str(e)}")

    return None
