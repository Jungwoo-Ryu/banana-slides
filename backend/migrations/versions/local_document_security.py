"""Remove retired parsing settings and preserve locally stored parsed artifacts."""
import os
from pathlib import Path

from alembic import op
import sqlalchemy as sa

revision = 'local_document_security'
down_revision = 'sola_azure_only'
branch_labels = None
depends_on = None


def _upload_root():
    configured = op.get_context().config.attributes.get('upload_folder')
    if configured:
        return Path(configured)
    from services.file_parser_service import _resolve_upload_folder
    return _resolve_upload_folder()


def _relocate(root, source_name, destination_name):
    """Move artifact directories without overwriting existing files; safe to retry."""
    source, destination = root / source_name, root / destination_name
    if not source.exists():
        return
    if source.is_symlink() or destination.is_symlink():
        raise RuntimeError('Parsed artifact roots must not be symbolic links.')
    if not destination.exists():
        os.rename(source, destination)
        return
    children = list(source.iterdir())
    if any((destination / child.name).exists() or (destination / child.name).is_symlink() for child in children):
        raise RuntimeError('Conflicting parsed artifact directories; no existing files were overwritten.')
    for child in children:
        os.rename(child, destination / child.name)
    source.rmdir()


def _rewrite_paths(old_url, new_url, old_folder, new_folder):
    connection = op.get_bind()
    inspector = sa.inspect(connection)
    for name in inspector.get_table_names():
        if name == 'alembic_version':
            continue
        columns = [c for c in inspector.get_columns(name) if isinstance(c['type'], (sa.String, sa.Text))]
        table = sa.table(name, *(sa.column(c['name'], c['type']) for c in columns))
        for column in table.c:
            for old, new in ((old_url, new_url), (old_folder, new_folder),
                             (old_folder.replace('/', '\\'), new_folder.replace('/', '\\'))):
                connection.execute(table.update().where(column.contains(old, autoescape=True)).values({
                    column.name: sa.func.replace(column, old, new),
                }))


def upgrade():
    _relocate(_upload_root(), 'mineru_files', 'parsed_files')
    _rewrite_paths('/files/mineru/', '/files/parsed/', 'mineru_files/', 'parsed_files/')
    connection = op.get_bind()
    for table, name in (('settings', 'mineru_api_base'), ('reference_files', 'mineru_batch_id')):
        if name in {c['name'] for c in sa.inspect(connection).get_columns(table)}:
            with op.batch_alter_table(table) as batch:
                batch.drop_column(name)
    connection.execute(sa.text("UPDATE projects SET export_extractor_method='configured'"))
    connection.execute(sa.text("UPDATE projects SET export_inpaint_method='local' WHERE export_inpaint_method IS NULL OR export_inpaint_method NOT IN ('local', 'generative')"))


def downgrade():
    # Restore only empty configuration columns, never former credentials or services.
    _relocate(_upload_root(), 'parsed_files', 'mineru_files')
    _rewrite_paths('/files/parsed/', '/files/mineru/', 'parsed_files/', 'mineru_files/')
    with op.batch_alter_table('settings') as batch:
        batch.add_column(sa.Column('mineru_api_base', sa.String(255), nullable=True))
    with op.batch_alter_table('reference_files') as batch:
        batch.add_column(sa.Column('mineru_batch_id', sa.String(100), nullable=True))
