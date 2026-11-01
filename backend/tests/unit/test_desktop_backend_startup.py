import json
import os
import socket
import sqlite3
import subprocess
import sys
import time
import urllib.request
from pathlib import Path


def _free_port():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def _start_desktop_backend(tmp_path, db_path):
    backend_dir = Path(__file__).resolve().parents[2]
    port = _free_port()
    uploads_dir = tmp_path / "uploads"
    exports_dir = tmp_path / "exports"
    run_cwd = tmp_path / "cwd"
    run_cwd.mkdir()
    log_path = tmp_path / "backend.log"
    log_file = log_path.open("w", encoding="utf-8")

    env = os.environ.copy()
    env.update(
        {
            "PYTHONPATH": str(backend_dir),
            "DATABASE_PATH": str(db_path),
            "UPLOAD_FOLDER": str(uploads_dir),
            "EXPORT_FOLDER": str(exports_dir),
            "BACKEND_PORT": str(port),
            "FLASK_ENV": "production",
            "USE_MOCK_AI": "true",
            "GOOGLE_API_KEY": env.get("GOOGLE_API_KEY", "mock-api-key-for-testing"),
        }
    )

    proc = subprocess.Popen(
        [sys.executable, str(backend_dir / "app.py")],
        cwd=run_cwd,
        env=env,
        stdout=log_file,
        stderr=subprocess.STDOUT,
        text=True,
    )
    log_file.close()
    return port, proc, log_path


def _read_backend_log(log_path):
    return log_path.read_text(encoding="utf-8", errors="replace") if log_path.exists() else ""


def _wait_for_health(proc, port, db_path, log_path):
    deadline = time.time() + 20
    while time.time() < deadline:
        if proc.poll() is not None:
            raise AssertionError(f"backend exited early with code {proc.returncode}\n{_read_backend_log(log_path)}")
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{port}/health", timeout=1) as response:
                assert response.status == 200
                assert db_path.exists()
                return
        except Exception:
            time.sleep(0.25)
    raise AssertionError(f"backend did not become healthy on port {port}\n{_read_backend_log(log_path)}")


def _stop_backend(proc):
    proc.terminate()
    try:
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.wait(timeout=5)


def test_desktop_backend_starts_from_non_backend_cwd_with_database_path(tmp_path):
    db_path = tmp_path / "data" / "database.db"
    port, proc, log_path = _start_desktop_backend(tmp_path, db_path)
    try:
        _wait_for_health(proc, port, db_path, log_path)
    finally:
        _stop_backend(proc)


def test_old_database_migrates_without_losing_projects_or_templates(tmp_path):
    backend_dir = Path(__file__).resolve().parents[2]
    db_path = tmp_path / "database.db"
    env = os.environ.copy()
    env['DATABASE_URL'] = f'sqlite:///{db_path}'
    # Build a valid historical schema, rather than stamping incomplete tables.
    migrated = subprocess.run([sys.executable, '-m', 'alembic', 'upgrade', '819293cce08c'],
        cwd=backend_dir, env=env, capture_output=True, text=True, timeout=60)
    assert migrated.returncode == 0, migrated.stderr
    with sqlite3.connect(db_path) as conn:
        conn.execute("INSERT INTO settings (id, image_resolution, image_aspect_ratio, max_description_workers, max_image_workers, created_at, updated_at) VALUES (1, '2K', '16:9', 3, 1, '2026-01-01', '2026-01-01')")
        conn.execute("INSERT INTO projects (id, idea_prompt, creation_type, status, created_at, updated_at) VALUES ('old-project', 'Keep this idea', 'idea', 'DRAFT', '2026-01-01', '2026-01-01')")
        conn.execute("INSERT INTO user_templates (id, name, file_path, created_at, updated_at) VALUES ('old-template', 'Keep this template', 'templates/old.png', '2026-01-01', '2026-01-01')")
    port, proc, log_path = _start_desktop_backend(tmp_path, db_path)
    try:
        _wait_for_health(proc, port, db_path, log_path)
        request = urllib.request.Request(f'http://127.0.0.1:{port}/api/settings',
            data=json.dumps({'design_system_prompt':'Keep this design', 'image_resolution':'2K'}).encode(),
            headers={'Content-Type':'application/json'}, method='PUT')
        with urllib.request.urlopen(request, timeout=5) as response:
            assert json.load(response)['success']
        with urllib.request.urlopen(f'http://127.0.0.1:{port}/api/projects?limit=5&offset=0', timeout=5) as response:
            assert json.load(response)['data']['total'] == 1
        with urllib.request.urlopen(f'http://127.0.0.1:{port}/api/user-templates', timeout=5) as response:
            assert json.load(response)['success']
        with sqlite3.connect(db_path) as conn:
            columns = {row[1] for row in conn.execute('PRAGMA table_info(settings)')}
            assert not columns.intersection({'api_key', 'ai_provider_format', 'enable_text_reasoning'})
            assert conn.execute('SELECT design_system_prompt FROM settings WHERE id=1').fetchone()[0] == 'Keep this design'
            assert conn.execute("SELECT name FROM user_templates WHERE id='old-template'").fetchone()[0] == 'Keep this template'
    finally:
        _stop_backend(proc)
