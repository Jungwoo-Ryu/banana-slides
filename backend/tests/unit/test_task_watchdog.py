"""Real. API Level-validation of the survival of the backstage mission。

Background (client feedback)： Desktop Editable PPTX It’s stuck. "88% Build No. 17/24 Page"，
Show again after restarting application 88%。The reason is that the back-office mission is only in the process.，
It’s in the database. PENDING/PROCESSING The record will never move forward after the process is restarted.，
The status interface only reads back to the database, so the front end keeps using the zombie mission."Ongoing"。
"""
import json
import threading
import time
import uuid
from datetime import datetime, timedelta

from sqlalchemy import update

from models import Project, Task, db
from services.task_manager import task_manager
from services.task_watchdog import (
    INTERRUPTED_ERROR_CODE,
    STALLED_ERROR_CODE,
    evaluate_task_liveness,
    get_orphan_grace_seconds,
    mark_task_interrupted,
    progress_age_seconds,
    reconcile_orphaned_tasks,
    task_watchdog,
)


def _create_project(app):
    with app.app_context():
        project = Project(
            id=str(uuid.uuid4()),
            creation_type='idea',
            idea_prompt='watchdog test',
            status='DRAFT',
        )
        db.session.add(project)
        db.session.commit()
        return project.id


def _create_export_task(app, project_id, *, status='PROCESSING', percent=88,
                        heartbeat_age_seconds=None, created_age_seconds=None,
                        step='Build No. 17/24 Page...'):
    with app.app_context():
        task = Task(
            id=str(uuid.uuid4()),
            project_id=project_id,
            task_type='EXPORT_EDITABLE_PPTX',
            status=status,
        )
        if created_age_seconds is not None:
            task.created_at = datetime.utcnow() - timedelta(seconds=created_age_seconds)
        progress = {
            'total': 100,
            'completed': percent,
            'failed': 0,
            'current_step': step,
            'percent': percent,
            'messages': [
                '[Build PPTX] Build No. 16/24 Page...',
                f'[Build PPTX] {step}',
            ],
        }
        if heartbeat_age_seconds is not None:
            progress['heartbeat_at'] = (
                datetime.utcnow() - timedelta(seconds=heartbeat_age_seconds)
            ).isoformat()
        # Write it directly. JSON Simulation"Progress of writing at a certain point in the past"（set_progress The heart beats at the current time.）
        task.progress = json.dumps(progress)
        db.session.add(task)
        db.session.commit()
        return task.id


def _get_task_status(client, project_id, task_id):
    response = client.get(f'/api/projects/{project_id}/tasks/{task_id}')
    assert response.status_code == 200, response.get_data(as_text=True)
    payload = response.get_json()
    assert payload['success'] is True
    return payload['data']


def test_status_endpoint_fails_task_left_over_from_previous_process(client, app):
    """Legacy after restart PROCESSING The record has to be made. FAILED，Instead of continuing to show 88%。"""
    project_id = _create_project(app)
    task_id = _create_export_task(
        app, project_id, heartbeat_age_seconds=3.5 * 3600,
    )

    data = _get_task_status(client, project_id, task_id)

    assert data['status'] == 'FAILED'
    assert data['progress']['error_code'] == INTERRUPTED_ERROR_CODE
    # The last real progress must be kept so that users can understand where the card is.
    assert data['progress']['percent'] == 88
    assert data['progress']['current_step'] == 'Build No. 17/24 Page...'
    assert 'Interrupt' in data['error_message']
    assert data['progress']['help_text']
    assert data['progress']['error_stage'] == 'task_watchdog'
    assert data['completed_at'] is not None


def test_status_endpoint_keeps_task_with_fresh_heartbeat(client, app):
    """No miscalculation when the heartbeat is fresh (covering another process running and creating)/Window between registrations）。"""
    project_id = _create_project(app)
    task_id = _create_export_task(app, project_id, heartbeat_age_seconds=5)

    data = _get_task_status(client, project_id, task_id)

    assert data['status'] == 'PROCESSING'
    assert data['progress']['percent'] == 88
    assert data['error_message'] is None


def test_status_endpoint_fails_stalled_task_owned_by_this_process(client, app, monkeypatch):
    """It’s still in the process."Run!"But without a heartbeat for a long time, they’re supposed to be stuck.。"""
    monkeypatch.setenv('TASK_STALL_TIMEOUT_SECONDS', '1')
    project_id = _create_project(app)
    task_id = _create_export_task(app, project_id, heartbeat_age_seconds=0)

    # Simulate this process to hold the task worker
    with task_manager.lock:
        task_manager.active_tasks[task_id] = object()
    task_watchdog.touch(task_id, 'Build PPTX')
    try:
        time.sleep(1.2)
        data = _get_task_status(client, project_id, task_id)

        assert data['status'] == 'FAILED'
        assert data['progress']['error_code'] == STALLED_ERROR_CODE
        assert 'Hold it!' in data['error_message']
        assert 'Build PPTX' in data['error_message']
    finally:
        with task_manager.lock:
            task_manager.active_tasks.pop(task_id, None)
        task_watchdog.forget(task_id)


def test_status_endpoint_keeps_active_task_with_fresh_heartbeat(client, app, monkeypatch):
    """The mission that’s moving forward will not be accidentally killed.。"""
    monkeypatch.setenv('TASK_STALL_TIMEOUT_SECONDS', '1')
    project_id = _create_project(app)
    task_id = _create_export_task(app, project_id, heartbeat_age_seconds=0)

    with task_manager.lock:
        task_manager.active_tasks[task_id] = object()
    task_watchdog.touch(task_id, 'Build PPTX')
    try:
        data = _get_task_status(client, project_id, task_id)
        assert data['status'] == 'PROCESSING'
    finally:
        with task_manager.lock:
            task_manager.active_tasks.pop(task_id, None)
        task_watchdog.forget(task_id)


def test_reconcile_orphaned_tasks_only_touches_stale_rows(app):
    """Start reconciliation： old heart beats fail, new heart beats remain intact。"""
    project_id = _create_project(app)
    stale_id = _create_export_task(app, project_id, heartbeat_age_seconds=7200)
    fresh_id = _create_export_task(app, project_id, heartbeat_age_seconds=3)

    with app.app_context():
        reconciled = reconcile_orphaned_tasks()
        assert reconciled == 1
        stale = Task.query.get(stale_id)
        fresh = Task.query.get(fresh_id)
        assert stale.status == 'FAILED'
        assert stale.get_progress()['error_code'] == INTERRUPTED_ERROR_CODE
        assert fresh.status == 'PROCESSING'


def test_progress_age_seconds_falls_back_to_created_at(app):
    """Nothing. heartbeat_at Tasks (other types) to go bottom with creation time。"""
    project_id = _create_project(app)
    task_id = _create_export_task(
        app, project_id, created_age_seconds=600, heartbeat_age_seconds=None,
    )
    with app.app_context():
        age = progress_age_seconds(Task.query.get(task_id))
    assert age is not None
    assert 590 <= age <= 620


def test_watchdog_tracks_and_forgets_heartbeats():
    task_id = f'watchdog-{uuid.uuid4()}'
    assert task_watchdog.seconds_since_touch(task_id) is None

    task_watchdog.touch(task_id, 'Build PPTX')
    assert task_watchdog.seconds_since_touch(task_id) is not None
    assert task_watchdog.last_step(task_id) == 'Build PPTX'
    assert task_id in task_watchdog.tracked_ids()

    # No, I don’t. step The heart beat should be kept at the top.
    task_watchdog.touch(task_id)
    assert task_watchdog.last_step(task_id) == 'Build PPTX'

    task_watchdog.forget(task_id)
    assert task_watchdog.seconds_since_touch(task_id) is None
    assert task_id not in task_watchdog.tracked_ids()


def test_evaluate_task_liveness_ignores_finished_tasks(app):
    """Completed/Failed tasks do not participate in reconciliation。"""
    project_id = _create_project(app)
    task_id = _create_export_task(
        app, project_id, status='COMPLETED', heartbeat_age_seconds=7200,
    )
    with app.app_context():
        task = Task.query.get(task_id)
        assert evaluate_task_liveness(task) is False
        assert task.status == 'COMPLETED'


def test_running_task_that_writes_progress_is_never_marked_stalled(client, app, monkeypatch):
    """The mission we’re moving forward can’t be miskilled.（S1 Return）。

    Only the export task will be called visible touch_task；Other task types (live charts, video export, template analysis, etc.)）
    Write database progress only."Writing progress"It has to be equal to"A heartbeat."。
    """
    monkeypatch.setenv('TASK_STALL_TIMEOUT_SECONDS', '1')
    project_id = _create_project(app)
    task_id = _create_export_task(app, project_id, heartbeat_age_seconds=0)

    stop = threading.Event()

    def worker(tid):
        with app.app_context():
            for index in range(40):
                if stop.is_set():
                    return
                task = Task.query.get(tid)
                if task is None:
                    return
                task.set_progress({
                    'total': 100,
                    'completed': index,
                    'failed': 0,
                    'percent': index,
                    'current_step': f'Page {index} Step',
                })
                db.session.commit()
                time.sleep(0.15)

    task_manager.submit_task(task_id, worker)
    try:
        time.sleep(2.2)  # Far above. 1s It’s... stall threshold, but worker I’ve been working on it.
        data = _get_task_status(client, project_id, task_id)
        assert data['status'] == 'PROCESSING', data
        assert data['progress']['percent'] > 0
    finally:
        stop.set()
        with task_manager.lock:
            task_manager.active_tasks.pop(task_id, None)
        task_watchdog.forget(task_id)
        time.sleep(0.2)


def test_interrupted_task_uses_last_progress_write_not_created_at(client, app):
    """Interruption must be based on the time of the last writing progress, not the time of creation。"""
    project_id = _create_project(app)
    task_id = _create_export_task(
        app,
        project_id,
        created_age_seconds=7200,      # Created 2 hours ago
        heartbeat_age_seconds=1200,    # But... 20 I’m still working on it a minute ago.
    )

    data = _get_task_status(client, project_id, task_id)

    assert data['status'] == 'FAILED'
    idle = data['progress']['error_details']['idle_seconds']
    assert 1100 <= idle <= 1300, idle


def test_orphan_grace_zero_falls_back_to_default(monkeypatch):
    monkeypatch.setenv('TASK_ORPHAN_GRACE_SECONDS', '0')
    assert get_orphan_grace_seconds() > 0


def test_stall_clock_starts_when_task_actually_begins(app):
    """Waiting in line isn’t stuck.：worker It’s really starting to beat again.（Codex P2）。"""
    project_id = _create_project(app)
    task_id = _create_export_task(app, project_id, heartbeat_age_seconds=0)
    observed = {}

    def worker(tid):
        observed['step'] = task_watchdog.last_step(tid)
        observed['idle'] = task_watchdog.seconds_since_touch(tid)

    task_manager.submit_task(task_id, worker)
    try:
        deadline = time.time() + 5
        while 'step' not in observed and time.time() < deadline:
            time.sleep(0.05)
        assert observed.get('step') == 'Commencement'
        assert observed.get('idle') is not None and observed['idle'] < 1
    finally:
        with task_manager.lock:
            task_manager.active_tasks.pop(task_id, None)
        task_watchdog.forget(task_id)


def test_task_insert_does_not_start_the_stall_clock(app):
    """Create a task line does not count in itself"Progress."，Otherwise, long queues are stuck in accounting.（Codex P2）。"""
    project_id = _create_project(app)
    task_id = _create_export_task(app, project_id, heartbeat_age_seconds=0)
    assert task_watchdog.seconds_since_touch(task_id) is None


def test_stale_read_does_not_overwrite_a_finished_task(app):
    """Requests for expired snapshots cannot be rewritten as a failure.（Codex P2）。"""
    project_id = _create_project(app)
    task_id = _create_export_task(app, project_id, heartbeat_age_seconds=7200)

    with app.app_context():
        # Simulation"Request read PROCESSING Quickshot, after worker Submitted and completed"
        stale_progress = Task.query.get(task_id).get_progress()
        db.session.execute(
            update(Task).where(Task.id == task_id).values(status='COMPLETED')
        )
        db.session.commit()

        class _StaleTask:
            id = task_id
            status = 'PROCESSING'
            created_at = datetime.utcnow() - timedelta(hours=2)

            def get_progress(self):
                return stale_progress

        assert mark_task_interrupted(_StaleTask()) is False
        assert Task.query.get(task_id).status == 'COMPLETED'


def test_watchdog_message_follows_interface_language(client, app):
    """Direct display of non-export tasks error_message，So follow the interface language（Accept-Language）。"""
    project_id = _create_project(app)
    task_id = _create_export_task(app, project_id, heartbeat_age_seconds=7200)

    response = client.get(
        f'/api/projects/{project_id}/tasks/{task_id}',
        headers={'Accept-Language': 'en-US,en;q=0.9'},
    )
    data = response.get_json()['data']

    assert data['status'] == 'FAILED'
    assert data['error_message'].startswith('Task interrupted')
    assert data['progress']['help_text'].startswith('Remove the entry')
    assert data['progress']['error_code'] == INTERRUPTED_ERROR_CODE


def test_watchdog_message_falls_back_to_output_language(client, app, monkeypatch):
    """Nothing. Accept-Language Back to apply the output language of the configuration。"""
    project_id = _create_project(app)
    task_id = _create_export_task(app, project_id, heartbeat_age_seconds=7200)

    monkeypatch.setitem(app.config, 'OUTPUT_LANGUAGE', 'en')
    data = _get_task_status(client, project_id, task_id)

    assert data['error_message'].startswith('Task interrupted')


def test_startup_reconciled_message_is_localized_at_display_time(client, app):
    """Start the reconciliation in the absence of the requested context (only by OUTPUT_LANGUAGE Write），
    Recalculate displays in UI language（Codex P2）。"""
    project_id = _create_project(app)
    task_id = _create_export_task(app, project_id, status='FAILED', heartbeat_age_seconds=7200)

    with app.app_context():
        task = Task.query.get(task_id)
        task.error_message = 'Mandate interrupted： back-office services have been restarted or the process has been withdrawn and the task will not continue。'
        task.progress = json.dumps({
            'percent': 88,
            'error_code': INTERRUPTED_ERROR_CODE,
            'error_stage': 'task_watchdog',
            'error_details': {'reason': 'interrupted', 'idle_seconds': 10800},
            'watchdog_message_text': 'Mandate interrupted： back-office services have been restarted or the process has been withdrawn and the task will not continue。',
            'help_text': 'Point to the right. × Remove this record and restart it.。',
        })
        db.session.commit()

    response = client.get(
        f'/api/projects/{project_id}/tasks/{task_id}',
        headers={'Accept-Language': 'en'},
    )
    data = response.get_json()['data']
    assert data['error_message'].startswith('Task interrupted')
    assert '3.0 hours' in data['error_message']
    assert data['progress']['help_text'].startswith('Remove the entry')


def test_worker_error_is_not_overwritten_by_localization(client, app):
    """After the guard dog failed, worker More specific errors were written, and displays could not be overridden by a generic case (review) M2）。"""
    project_id = _create_project(app)
    task_id = _create_export_task(app, project_id, status='FAILED', heartbeat_age_seconds=7200)

    with app.app_context():
        task = Task.query.get(task_id)
        task.error_message = 'AI Service Return 401 invalid api key'
        task.progress = json.dumps({
            'percent': 40,
            'error_code': STALLED_ERROR_CODE,
            'error_stage': 'task_watchdog',
            'error_details': {'reason': 'stalled', 'idle_seconds': 1900, 'last_step': 'Build PPTX'},
            'watchdog_message_text': 'Mission suspected to be stuck： already 32 No progress update in minutes (last step： build) PPTX）。',
        })
        db.session.commit()

    response = client.get(
        f'/api/projects/{project_id}/tasks/{task_id}',
        headers={'Accept-Language': 'en'},
    )
    data = response.get_json()['data']
    assert data['error_message'] == 'AI Service Return 401 invalid api key'


def test_stalled_message_is_localized_at_display_time(client, app):
    """STALLED The display path will also be recalculated in the interface language (review： not previously covered)）。"""
    project_id = _create_project(app)
    task_id = _create_export_task(app, project_id, status='FAILED', heartbeat_age_seconds=7200)
    chinese_message = "\u4efb\u52a1\u7591\u4f3c\u5361\u4f4f\uff1a\u5df2 32 \u5206\u949f\u6ca1\u6709\u8fdb\u5ea6\u66f4\u65b0\uff08\u6700\u540e\u4e00\u6b65\uff1a\u6784\u5efa PPTX\uff09\u3002"

    with app.app_context():
        task = Task.query.get(task_id)
        task.error_message = chinese_message
        task.progress = json.dumps({
            'percent': 88,
            'error_code': STALLED_ERROR_CODE,
            'error_stage': 'task_watchdog',
            'error_details': {'reason': 'stalled', 'idle_seconds': 1900, 'last_step': 'Build PPTX'},
            'watchdog_message_text': chinese_message,
            'help_text': 'You can do it on the right. × Re-export after removing this task。',
        })
        db.session.commit()

    response = client.get(
        f'/api/projects/{project_id}/tasks/{task_id}',
        headers={'Accept-Language': 'en'},
    )
    data = response.get_json()['data']
    assert data['error_message'].startswith('Task looks stuck')
    assert 'building the PPTX' in data['error_message']
    assert data['error_message'].endswith('.')
    assert '。' not in data['error_message']
    assert data['progress']['help_text'].startswith('Remove the task')


def test_settings_test_status_localizes_watchdog_failure(client, app):
    """The status interface for the page test mission also needs to be localized (review： not previously covered)）。"""
    project_id = _create_project(app)
    task_id = _create_export_task(app, project_id, status='FAILED', heartbeat_age_seconds=7200)

    with app.app_context():
        task = Task.query.get(task_id)
        task.task_type = 'TEST_TEXT_MODEL'
        task.error_message = 'Mandate interrupted： back-office services have been restarted or the process has been withdrawn and the task will not continue。'
        task.progress = json.dumps({
            'percent': 0,
            'error_code': INTERRUPTED_ERROR_CODE,
            'error_stage': 'task_watchdog',
            'error_details': {'reason': 'interrupted', 'idle_seconds': 10800},
            'watchdog_message_text': 'Mandate interrupted： back-office services have been restarted or the process has been withdrawn and the task will not continue。',
        })
        db.session.commit()

    response = client.get(
        f'/api/settings/tests/{task_id}/status',
        headers={'Accept-Language': 'en'},
    )
    payload = response.get_json()['data']
    assert payload['error'].startswith('Task interrupted')
    assert payload['help_text'].startswith('Remove the entry')


def test_task_scope_restores_previous_binding():
    """task_scope It must be saved./Recovery of linear binding (review： not previously covered)）。"""
    from services.task_watchdog import task_scope

    task_watchdog.forget('outer-task')
    task_watchdog.forget('inner-task')
    task_watchdog.bind_thread('outer-task')
    try:
        assert task_watchdog.thread_task() == 'outer-task'
        with task_scope('inner-task'):
            assert task_watchdog.thread_task() == 'inner-task'
        assert task_watchdog.thread_task() == 'outer-task'

        # The abnormal path also needs to be restored.
        try:
            with task_scope('inner-task'):
                raise RuntimeError('boom')
        except RuntimeError:
            pass
        assert task_watchdog.thread_task() == 'outer-task'
    finally:
        task_watchdog.unbind_thread()
        task_watchdog.forget('outer-task')
        task_watchdog.forget('inner-task')
    assert task_watchdog.thread_task() is None


def test_runner_binds_and_unbinds_the_worker_thread(app):
    """Real. submit_task Path worker Threads must be tied to a mission (review： not previously covered)）。"""
    project_id = _create_project(app)
    task_id = _create_export_task(app, project_id, heartbeat_age_seconds=0)
    observed = {}

    def worker(tid):
        observed['bound'] = task_watchdog.thread_task()

    task_manager.submit_task(task_id, worker)
    try:
        deadline = time.time() + 5
        while 'bound' not in observed and time.time() < deadline:
            time.sleep(0.05)
        assert observed.get('bound') == task_id
        # worker Untie after completion (waiting) done callback Run away.）
        deadline = time.time() + 5
        while task_watchdog.thread_task() == task_id and time.time() < deadline:
            time.sleep(0.05)
        assert task_watchdog.thread_task() != task_id
    finally:
        with task_manager.lock:
            task_manager.active_tasks.pop(task_id, None)
        task_watchdog.forget(task_id)


def test_every_limiter_wait_is_wrapped_in_task_scope():
    """Structural regression： restricted flow waiting for task to be tied, otherwise the embedded threads, etc., will be stuck。"""
    from pathlib import Path

    source = Path(__file__).resolve().parents[2] / 'services' / 'task_manager.py'
    limiter_lines = [
        line for line in source.read_text(encoding='utf-8').splitlines()
        if 'resource_limiter.slot(' in line
    ]
    assert limiter_lines, 'expected limiter usages in task_manager.py'
    missing = [line.strip() for line in limiter_lines if 'task_scope(task_id)' not in line]
    assert not missing, f'limiter waits without task_scope: {missing}'


def test_port_available_detects_occupied_port():
    """Skip reconciliation when port is occupied to avoid misjudge another example（Codex P2）。"""
    import socket

    from app import _port_available

    listener = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    listener.bind(('0.0.0.0', 0))
    listener.listen(1)
    try:
        occupied = listener.getsockname()[1]
        assert _port_available(occupied) is False
    finally:
        listener.close()


def test_port_available_ignores_time_wait():
    """All that’s left. TIME_WAIT The port is deemed to be available, otherwise the reconciliation will skip when it is restarted (review) S1）。"""
    import socket

    from app import _port_available

    server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    server.bind(('0.0.0.0', 0))
    server.listen(1)
    port = server.getsockname()[1]

    client = socket.create_connection(('127.0.0.1', port))
    conn, _ = server.accept()
    conn.close()          # Service close first → Service-end access TIME_WAIT
    client.close()
    server.close()

    assert _port_available(port) is True


def test_instance_lock_blocks_a_second_process(app):
    """The second example does not have a data lock and therefore no start-up reconciliation will be executed (review) M1）。"""
    import os
    import subprocess
    import sys
    import textwrap

    from app import _acquire_instance_lock

    lock_path = os.path.join(app.config['UPLOAD_FOLDER'], '.backend-instance.lock')
    script = textwrap.dedent(
        f"""
        import fcntl, time
        handle = open(r"{lock_path}", 'a+')
        fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        print('locked', flush=True)
        time.sleep(10)
        """
    )
    holder = subprocess.Popen(
        [sys.executable, '-c', script], stdout=subprocess.PIPE, text=True
    )
    try:
        assert holder.stdout.readline().strip() == 'locked'
        assert _acquire_instance_lock(app) is False
    finally:
        holder.kill()
        holder.wait(timeout=5)


def test_limiter_wait_keeps_the_heartbeat_alive(app):
    """worker Still count while waiting for the limit slot."Alive."，You can’t get stuck.（Codex P2）。"""
    from services.task_manager import ResourceLimiter
    from services.task_watchdog import task_scope

    project_id = _create_project(app)
    task_id = _create_export_task(app, project_id, heartbeat_age_seconds=0)
    limiter = ResourceLimiter('test-limiter', 1)
    seen = {}

    def worker(tid):
        # Same as the real path.：worker Thread Internal task_scope Tie yourself up.
        with task_scope(tid):
            task_watchdog.touch(tid, 'Waiting for limit stream')
            with limiter.slot('blocked'):
                seen['idle_after_wait'] = task_watchdog.seconds_since_touch(tid)

    holder_ready = threading.Event()

    def holder():
        with limiter.slot('holder'):
            holder_ready.set()
            time.sleep(2.0)

    holder_thread = threading.Thread(target=holder)
    holder_thread.start()
    assert holder_ready.wait(timeout=3)

    worker_thread = threading.Thread(target=worker, args=(task_id,))
    worker_thread.start()
    worker_thread.join(timeout=5)
    holder_thread.join(timeout=3)
    task_watchdog.forget(task_id)

    assert 'idle_after_wait' in seen
    # Heart beats continually refreshed during waiting periods (rather than staying on schedule) 2 At the beginning of the second）
    assert seen['idle_after_wait'] < 1.0, seen


def test_watchdog_failure_stays_terminal_when_export_finishes(app, db_session, tmp_path, monkeypatch):
    """After the guard dog failed, worker Run again： Hold on. FAILED，But keep the product information.（Codex P2）。"""
    from PIL import Image
    from models import Page
    from services.export_service import ExportService
    from services.task_manager import export_editable_pptx_with_recursive_analysis_task

    image_path = tmp_path / 'page.png'
    Image.new('RGB', (320, 180), 'white').save(image_path)

    project = Project(creation_type='idea', idea_prompt='demo')
    db.session.add(project)
    db.session.flush()
    db.session.add(Page(project_id=project.id, order_index=0, generated_image_path='pages/page.png'))
    task = Task(
        project_id=project.id,
        task_type='EXPORT_EDITABLE_PPTX',
        status='FAILED',
        error_message='Mission suspected to be stuck： already 30 No progress update in minutes。',
    )
    task.progress = json.dumps({
        'percent': 88,
        'error_code': STALLED_ERROR_CODE,
        'error_stage': 'task_watchdog',
        'current_step': 'Build No. 17/24 Page...',
    })
    db.session.add(task)
    db.session.commit()
    task_id = task.id

    class FileServiceStub:
        def get_absolute_path(self, _relative_path):
            return str(image_path)

    monkeypatch.setattr(
        'services.image_editability.TextAttributeExtractorFactory.create_caption_model_extractor',
        lambda: None,
    )

    def fake_export(*_args, progress_callback=None, heartbeat_callback=None, **_kwargs):
        progress_callback('Build PPTX', 'Build No. 24/24 Page...', 94)
        return b'pptx-bytes', None

    monkeypatch.setattr(
        ExportService,
        'create_editable_pptx_with_recursive_analysis',
        staticmethod(fake_export),
    )

    export_editable_pptx_with_recursive_analysis_task(
        task_id=task_id,
        project_id=project.id,
        filename='demo.pptx',
        file_service=FileServiceStub(),
        app=app,
    )

    db.session.expire_all()
    stored = Task.query.get(task_id)
    assert stored.status == 'FAILED'
    progress = stored.get_progress()
    assert progress['error_code'] == STALLED_ERROR_CODE
    assert progress['download_url'].endswith('demo.pptx')
    assert progress['filename'] == 'demo.pptx'


def test_watchdog_failure_is_terminal_for_every_task_type(app, db_session):
    """No task type (not just export) can be turned back after the guard dog has failed.。"""
    project_id = _create_project(app)
    with app.app_context():
        task = Task(
            id=str(uuid.uuid4()),
            project_id=project_id,
            task_type='GENERATE_IMAGES',
            status='FAILED',
            error_message='Mission suspected to be stuck： already 30 No progress update in minutes。',
        )
        task.progress = json.dumps({
            'percent': 40,
            'error_code': STALLED_ERROR_CODE,
            'error_stage': 'task_watchdog',
        })
        db.session.add(task)
        db.session.commit()

        # worker Then restore and try tag completion
        task.status = 'COMPLETED'
        task.set_progress({'total': 10, 'completed': 10, 'percent': 100, 'current_step': 'Completed'})
        db.session.commit()

        stored = Task.query.get(task.id)
        assert stored.status == 'FAILED'
        assert stored.get_progress()['error_code'] == STALLED_ERROR_CODE


def test_set_progress_stamps_heartbeat_and_preserves_failure_reason(app):
    """Any mission writing schedule will be updated. heartbeat_at；The cause of failure will not be covered by subsequent progress.。"""
    project_id = _create_project(app)
    task_id = _create_export_task(app, project_id, status='FAILED', heartbeat_age_seconds=60)

    with app.app_context():
        task = Task.query.get(task_id)
        task.set_progress({
            'total': 100,
            'completed': 88,
            'percent': 88,
            'error_code': 'TASK_INTERRUPTED',
            'error_stage': 'task_watchdog',
            'error_details': {'reason': 'interrupted', 'idle_seconds': 60},
            'help_text': 'help',
        })
        db.session.commit()

        # After failure worker Writes another progress (no failed field)）
        task.set_progress({'total': 100, 'completed': 90, 'percent': 90})
        db.session.commit()

        progress = task.get_progress()
        assert progress['error_code'] == 'TASK_INTERRUPTED'
        assert progress['error_stage'] == 'task_watchdog'
        assert progress['help_text'] == 'help'
        assert progress['error_details']['idle_seconds'] == 60
        assert progress['heartbeat_at']
        age = progress_age_seconds(task)
        assert age is not None and age < 5

        # Empty progress writing (set page failure path as written) cannot erase doordog diagnosis.
        task.set_progress({})
        db.session.commit()
        progress = task.get_progress()
        assert progress['error_code'] == 'TASK_INTERRUPTED'
        assert progress['error_stage'] == 'task_watchdog'
        assert progress['help_text'] == 'help'
