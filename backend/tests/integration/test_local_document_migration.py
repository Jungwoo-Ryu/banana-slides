"""Upgrade old saved document links without losing their local image files."""
import importlib.util
import sqlite3
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config

BACKEND = Path(__file__).resolve().parents[2]


def test_existing_projects_and_parsed_files_survive_upgrade(tmp_path):
    database = tmp_path / 'migration.db'
    uploads = tmp_path / 'uploads'
    old_file = uploads / 'mineru_files' / 'extract-1' / 'chart.png'
    old_file.parent.mkdir(parents=True)
    old_file.write_bytes(b'preserved image bytes')
    cfg = Config(str(BACKEND / 'alembic.ini'))
    cfg.set_main_option('script_location', str(BACKEND / 'migrations'))
    cfg.set_main_option('sqlalchemy.url', f'sqlite:///{database}')
    cfg.attributes['upload_folder'] = str(uploads)
    command.upgrade(cfg, 'sola_azure_only')
    with sqlite3.connect(database) as db:
        db.execute("INSERT INTO projects (id, creation_type, status, template_style, export_extractor_method, export_inpaint_method, created_at, updated_at) VALUES ('project-1', 'idea', 'DRAFT', 'Keep design', 'mineru', 'baidu', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)")
        db.execute("INSERT INTO reference_files (id, project_id, filename, file_path, file_size, file_type, parse_status, markdown_content, mineru_batch_id, created_at, updated_at) VALUES ('reference-1', 'project-1', 'notes.pdf', 'notes.pdf', 123, 'pdf', 'completed', '![](/files/mineru/extract-1/chart.png)', 'old-job', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)")
        db.execute('UPDATE reference_files SET file_path=?', (r'C:\uploads\mineru_files\extract-1\notes.pdf',))
    command.upgrade(cfg, 'head')
    command.upgrade(cfg, 'head')
    assert (uploads / 'parsed_files' / 'extract-1' / 'chart.png').read_bytes() == b'preserved image bytes'
    assert not old_file.exists()
    with sqlite3.connect(database) as db:
        assert db.execute('SELECT template_style, export_extractor_method, export_inpaint_method FROM projects').fetchone() == ('Keep design', 'configured', 'local')
        assert db.execute('SELECT markdown_content, parse_status FROM reference_files').fetchone() == ('![](/files/parsed/extract-1/chart.png)', 'completed')
        assert db.execute('SELECT file_path FROM reference_files').fetchone()[0] == r'C:\uploads\parsed_files\extract-1\notes.pdf'
        assert 'mineru_batch_id' not in {row[1] for row in db.execute('PRAGMA table_info(reference_files)')}
        assert 'mineru_api_base' not in {row[1] for row in db.execute('PRAGMA table_info(settings)')}


def test_artifact_migration_never_overwrites_a_conflicting_directory(tmp_path):
    spec = importlib.util.spec_from_file_location('artifact_migration', BACKEND / 'migrations/versions/local_document_security.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    for folder, contents in [('mineru_files', b'original'), ('parsed_files', b'existing')]:
        file = tmp_path / folder / 'extract-1' / 'chart.png'
        file.parent.mkdir(parents=True)
        file.write_bytes(contents)
    with pytest.raises(RuntimeError, match='Conflicting'):
        module._relocate(tmp_path, 'mineru_files', 'parsed_files')
    assert (tmp_path / 'mineru_files/extract-1/chart.png').read_bytes() == b'original'
    assert (tmp_path / 'parsed_files/extract-1/chart.png').read_bytes() == b'existing'
