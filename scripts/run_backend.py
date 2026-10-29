"""No-debug, single-process server used by the local launcher."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
from app import create_app, _acquire_instance_lock, _reconcile_orphaned_tasks_on_startup
from waitress import serve
import os

if __name__ == '__main__':
    app = create_app()
    if not _acquire_instance_lock(app):
        raise RuntimeError('이 저장소를 사용하는 백엔드가 이미 실행 중입니다.')
    _reconcile_orphaned_tasks_on_startup(app)
    serve(app, host='127.0.0.1', port=int(os.getenv('BACKEND_PORT', '5011')),
          threads=8, max_request_body_size=200 * 1024 * 1024)
