"""Lazy service exports keep runtime configuration ahead of SDK imports."""
def __getattr__(name):
    if name in ('AIService', 'ProjectContext'):
        from . import ai_service
        return getattr(ai_service, name)
    if name == 'FileService':
        from .file_service import FileService
        return FileService
    if name == 'ExportService':
        from .export_service import ExportService
        return ExportService
    raise AttributeError(name)
