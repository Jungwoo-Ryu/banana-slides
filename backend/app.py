import sys
if sys.platform == 'win32':
    if sys.stdout is not None and hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    if sys.stderr is not None and hasattr(sys.stderr, 'reconfigure'):
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')

"""
Simplified Flask Application Entry Point
"""
import os
import logging
from pathlib import Path
from dotenv import load_dotenv
from sqlalchemy import event
from sqlalchemy.engine import Engine
import sqlite3
from sqlalchemy.exc import SQLAlchemyError
from flask_migrate import Migrate

if __name__ == '__main__':
    sys.modules.setdefault('app', sys.modules[__name__])

# Load environment variables from project root .env file
_project_root = Path(__file__).parent.parent
_env_file = _project_root / '.env'
load_dotenv(dotenv_path=_env_file, override=False)
from services.http_transport import configure_tls
configure_tls()

from flask import Flask
from flask_cors import CORS
from models import db
from config import Config, DEFAULT_BACKEND_PORT, DEFAULT_FRONTEND_PORT
from controllers.material_controller import material_bp, material_global_bp
from controllers.reference_file_controller import reference_file_bp
from controllers.settings_controller import settings_bp
from controllers import project_bp, page_bp, template_bp, user_template_bp, user_style_template_bp, export_bp, file_bp, style_bp, template_assets_bp, page_template_bp, template_mode_bp


# Enable SQLite WAL mode for all connections
@event.listens_for(Engine, "connect")
def set_sqlite_pragma(dbapi_conn, connection_record):
    """
    Enable WAL mode and related PRAGMAs for each SQLite connection.
    Registered once at import time to avoid duplicate handlers when
    create_app() is called multiple times.
    """
    # Only apply to SQLite connections
    if not isinstance(dbapi_conn, sqlite3.Connection):
        return

    cursor = dbapi_conn.cursor()
    try:
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.execute("PRAGMA busy_timeout=60000")  # 60 seconds timeout
    finally:
        cursor.close()


def create_app():
    """Application factory"""
    app = Flask(__name__)
    
    # Load configuration from Config class
    app.config.from_object(Config)

    # Desktop DATABASE_PATH must win over any DATABASE_URL left in .env.
    db_path_env = os.environ.get('DATABASE_PATH')
    if db_path_env:
        db_path_env = os.path.abspath(db_path_env.strip())

    # Allow DATABASE_URL env var to override config at runtime (supports test isolation)
    database_url_env = os.getenv('DATABASE_URL')
    if database_url_env and not db_path_env:
        app.config['SQLALCHEMY_DATABASE_URI'] = database_url_env

    # Ensure instance directory exists for the default SQLite path in Config
    backend_dir = os.path.dirname(os.path.abspath(__file__))
    instance_dir = os.path.join(backend_dir, 'instance')
    os.makedirs(instance_dir, exist_ok=True)

    # Ensure upload folder exists
    project_root = os.path.dirname(backend_dir)
    upload_folder = os.path.join(project_root, 'uploads')
    os.makedirs(upload_folder, exist_ok=True)
    app.config['UPLOAD_FOLDER'] = upload_folder
    
    # Desktop environment overrides (set by Electron python-manager)
    upload_folder_env = os.environ.get('UPLOAD_FOLDER')
    export_folder_env = os.environ.get('EXPORT_FOLDER')

    if db_path_env:
        os.makedirs(os.path.dirname(db_path_env), exist_ok=True)
        app.config['SQLALCHEMY_DATABASE_URI'] = f'sqlite:///{Path(db_path_env).as_posix()}'
    if upload_folder_env:
        os.makedirs(upload_folder_env, exist_ok=True)
        app.config['UPLOAD_FOLDER'] = upload_folder_env
    if export_folder_env:
        os.makedirs(export_folder_env, exist_ok=True)
        app.config['EXPORT_FOLDER'] = export_folder_env

    # CORS configuration (parse from environment)
    raw_cors = os.getenv('CORS_ORIGINS', f'http://localhost:{DEFAULT_FRONTEND_PORT}')
    if raw_cors.strip() == '*':
        cors_origins = '*'
    else:
        cors_origins = [o.strip() for o in raw_cors.split(',') if o.strip()]
    app.config['CORS_ORIGINS'] = cors_origins
    
    # Initialize logging (log to stdout so Docker can capture it)
    log_level = getattr(logging, app.config['LOG_LEVEL'], logging.INFO)
    logging.basicConfig(
        level=log_level,
        format="%(asctime)s [%(levelname)s] %(name)s - %(message)s",
        handlers=[logging.StreamHandler(sys.stdout)],
    )
    
    # 设置第三方库的日志级别，避免过多的DEBUG日志
    logging.getLogger('sqlalchemy.engine').setLevel(logging.WARNING)
    logging.getLogger('httpcore').setLevel(logging.WARNING)
    logging.getLogger('httpx').setLevel(logging.WARNING)
    logging.getLogger('urllib3').setLevel(logging.WARNING)
    werkzeug_log_level = app.config.get('WERKZEUG_LOG_LEVEL', 'INFO')
    if isinstance(werkzeug_log_level, str):
        werkzeug_log_level = werkzeug_log_level.strip()
        werkzeug_log_level = (
            int(werkzeug_log_level)
            if werkzeug_log_level.isdigit()
            else werkzeug_log_level.upper()
        )
    werkzeug_logger = logging.getLogger('werkzeug')
    try:
        werkzeug_logger.setLevel(werkzeug_log_level)
    except (ValueError, TypeError):
        werkzeug_logger.setLevel(logging.INFO)
    logging.getLogger('volcenginesdkarkruntime').setLevel(logging.WARNING)

    # Initialize extensions
    db.init_app(app)
    CORS(app, origins=cors_origins)
    # Database migrations (Alembic via Flask-Migrate)
    Migrate(app, db)
    
    # Register blueprints
    app.register_blueprint(project_bp)
    app.register_blueprint(page_bp)
    app.register_blueprint(template_bp)
    app.register_blueprint(user_template_bp)
    app.register_blueprint(user_style_template_bp)
    app.register_blueprint(template_assets_bp)
    app.register_blueprint(page_template_bp)
    app.register_blueprint(template_mode_bp)
    app.register_blueprint(export_bp)
    app.register_blueprint(file_bp)
    app.register_blueprint(material_bp)
    app.register_blueprint(material_global_bp)
    app.register_blueprint(reference_file_bp, url_prefix='/api/reference-files')
    app.register_blueprint(settings_bp)
    app.register_blueprint(style_bp)

    with app.app_context():
        if os.getenv('BANANA_SKIP_AUTO_MIGRATE') == '1':
            # Explicit isolated-test mode; normal/custom data paths always migrate.
            db.create_all()
        else:
            from alembic import command as alembic_command
            from alembic.config import Config as AlembicConfig
            alembic_config = AlembicConfig(os.path.join(backend_dir, 'alembic.ini'))
            alembic_config.set_main_option('script_location', os.path.join(backend_dir, 'migrations'))
            alembic_config.set_main_option('sqlalchemy.url', app.config['SQLALCHEMY_DATABASE_URI'])
            try:
                alembic_command.upgrade(alembic_config, 'head')
            except Exception as error:
                raise RuntimeError('DB 업데이트에 실패했습니다. 실행 로그를 확인하고 기존 DB를 백업한 뒤 다시 시도하세요.') from error
        # Load settings from database and sync to app.config
        _load_settings_to_config(app)

    @app.route('/health')
    def health_check():
        return {'status': 'ok', 'message': 'Banana Slides API 실행 중'}

    # Output language endpoint
    @app.route('/api/output-language', methods=['GET'])
    def get_output_language():
        """
        获取用户的输出语言偏好（从数据库 Settings 读取）
        返回: zh, ja, en, auto
        """
        from models import Settings
        try:
            settings = Settings.get_settings()
            return {'data': {'language': settings.output_language or Config.OUTPUT_LANGUAGE}}
        except SQLAlchemyError as db_error:
            logging.warning(f"Failed to load output language from settings: {db_error}")
            return {'data': {'language': Config.OUTPUT_LANGUAGE}}  # 默认中文

    # Root endpoint
    @app.route('/')
    def index():
        return {
            'name': 'Banana Slides API',
            'version': '1.0.0',
            'description': 'AI-powered PPT generation service',
            'endpoints': {
                'health': '/health',
                'api_docs': '/api',
                'projects': '/api/projects'
            }
        }
    
    return app


def _load_settings_to_config(app):
    from models import Settings
    from services.settings_service import sync_settings
    sync_settings(app, Settings.get_settings())


def _compute_worktree_port(base_port: int) -> int:
    """Compute a deterministic port from the worktree directory name.

    Uses MD5 of the project root basename so each worktree gets a unique,
    stable port pair (backend 51xx, frontend 31xx) without manual config.
    """
    import hashlib
    basename = _project_root.name
    offset = int(hashlib.md5(basename.encode()).hexdigest()[:8], 16) % 500
    return base_port + offset


def _reconcile_orphaned_tasks_on_startup(target_app=None) -> None:
    """清理上一个进程遗留的后台任务。

    后台任务只存在于进程内，重启后数据库里的 PENDING/PROCESSING 记录
    永远不会再推进，前端却会一直显示"进行中"。这里在服务真正启动前
    统一标记为中断（只在启动入口调用，不在 create_app/import 时调用，
    避免测试、脚本或第二个实例误判其它进程正在跑的任务）。
    """
    try:
        from services.task_watchdog import reconcile_orphaned_tasks
        # 需要应用上下文才能查询数据库
        target_app = target_app or globals().get('app')
        with target_app.app_context():
            reconciled = reconcile_orphaned_tasks()
        if reconciled:
            logging.getLogger(__name__).info(
                f"Reconciled {reconciled} orphaned background task(s) at startup"
            )
    except Exception as reconcile_error:  # pragma: no cover - never block startup
        logging.getLogger(__name__).warning(
            f"Orphaned task reconciliation failed: {reconcile_error}"
        )


def _port_available(port: int) -> bool:
    """检查端口是否可绑定。

    如果端口已被占用（例如另一个实例正在跑），启动会在 app.run 处失败；
    此时不应该执行任务对账，否则会把那个实例正在跑的任务误判为中断。
    探测选项与 werkzeug 服务器保持一致（SO_REUSEADDR），
    否则 TIME_WAIT 会被误判为"端口被占用"，导致刚重启时跳过对账。
    """
    import socket

    probe = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    probe.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    try:
        probe.bind(('0.0.0.0', port))
        return True
    except OSError:
        return False
    finally:
        probe.close()


_instance_lock_handle = None


def _acquire_instance_lock(target_app=None) -> bool:
    """独占当前数据根，防止第二个实例把第一个实例的任务判为中断。

    返回 True 表示本进程拿到了锁（可以执行启动对账）。锁文件随进程存活，
    无法创建/加锁时返回 True（退回原来的行为，不影响启动）。
    """
    global _instance_lock_handle
    if _instance_lock_handle is not None:
        return True

    target_app = target_app or globals().get('app')
    root = target_app.config.get('UPLOAD_FOLDER') or os.path.dirname(os.path.abspath(__file__))
    lock_path = os.path.join(root, '.backend-instance.lock')
    try:
        handle = open(lock_path, 'a+')
    except OSError as lock_error:
        logging.getLogger(__name__).warning(
            f"Could not open instance lock {lock_path}: {lock_error}"
        )
        return True

    try:
        if os.name == 'nt':  # pragma: no cover - Windows
            import msvcrt

            handle.seek(0)
            msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl

            fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        handle.close()
        return False

    try:
        handle.seek(0)
        handle.truncate()
        handle.write(f"{os.getpid()}\n")
        handle.flush()
    except OSError:  # pragma: no cover - 写 pid 失败不影响锁
        pass

    _instance_lock_handle = handle  # 保持打开：锁随进程存在
    return True


if __name__ == '__main__':
    app = create_app()
    # Run development server
    if os.getenv("IN_DOCKER", "0") == "1":
        port = 5000  # Docker 容器内部固定使用 5000 端口
    elif os.getenv('BACKEND_PORT'):
        port = int(os.getenv('BACKEND_PORT'))
    else:
        port = DEFAULT_BACKEND_PORT
    debug = os.getenv('FLASK_ENV', 'production') == 'development'

    if port == 0:
        from werkzeug.serving import make_server

        server = make_server('127.0.0.1', 0, app, threaded=True)
        port = server.server_port
        print(f"LISTENING_ON:{port}", flush=True)

        if _acquire_instance_lock(app):
            _reconcile_orphaned_tasks_on_startup()
        else:
            logging.getLogger(__name__).warning(
                "Another backend instance owns this data root; skipped task reconciliation"
            )

        logging.info(
            "\n"
            "╔══════════════════════════════════════╗\n"
            "║   🍌 Banana Slides API Server 🍌   ║\n"
            "╚══════════════════════════════════════╝\n"
            f"Server starting on: http://localhost:{port}\n"
            f"Output Language: {Config.OUTPUT_LANGUAGE}\n"
            f"Environment: {os.getenv('FLASK_ENV', 'development')}\n"
            "Debug mode: False\n"
            f"API Base URL: http://localhost:{port}/api\n"
            f"Database: {app.config['SQLALCHEMY_DATABASE_URI']}\n"
            f"Uploads: {app.config['UPLOAD_FOLDER']}"
        )

        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
        finally:
            server.server_close()
        raise SystemExit(0)
    
    logging.info(
        "\n"
        "╔══════════════════════════════════════╗\n"
        "║   🍌 Banana Slides API Server 🍌   ║\n"
        "╚══════════════════════════════════════╝\n"
        f"Server starting on: http://localhost:{port}\n"
        f"Output Language: {Config.OUTPUT_LANGUAGE}\n"
        f"Environment: {os.getenv('FLASK_ENV', 'development')}\n"
        f"Debug mode: {debug}\n"
        f"API Base URL: http://localhost:{port}/api\n"
        f"Database: {app.config['SQLALCHEMY_DATABASE_URI']}\n"
        f"Uploads: {app.config['UPLOAD_FOLDER']}"
    )

    # Using absolute paths for database, so WSL path issues should not occur
    if _acquire_instance_lock(app) and _port_available(port):
        _reconcile_orphaned_tasks_on_startup()
    else:
        logging.getLogger(__name__).warning(
            f"Port {port} busy or another instance owns the data root; "
            "skipped orphaned task reconciliation"
        )
    app.run(host='127.0.0.1', port=port, debug=debug, use_reloader=debug)
