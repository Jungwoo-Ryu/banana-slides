from utils.user_messages import localize_error, localize_progress
"""
Task model for tracking async operations
"""
import uuid
import json
from datetime import datetime
from sqlalchemy.orm import validates
from . import db


class Task(db.Model):
    """
    Task model - tracks asynchronous generation tasks
    """
    __tablename__ = 'tasks'

    # After the task was judged unsuccessful by the guard dog, the key does not allow subsequent progress to be written over.，
    # Otherwise, the front end will lose the cause of failure. services/task_watchdog.py）
    WATCHDOG_PROGRESS_KEYS = (
        'error_code',
        'error_stage',
        'error_details',
        'help_text',
        'backend_status',
        'watchdog_message_text',
    )

    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = db.Column(db.String(36), db.ForeignKey('projects.id'), nullable=False)
    task_type = db.Column(db.String(50), nullable=False)  # GENERATE_DESCRIPTIONS|GENERATE_IMAGES
    status = db.Column(db.String(50), nullable=False, default='PENDING')
    progress = db.Column(db.Text, nullable=True)  # JSON string: {"total": 10, "completed": 5, "failed": 0}
    error_message = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    completed_at = db.Column(db.DateTime, nullable=True)

    # Relationships
    project = db.relationship('Project', back_populates='tasks')

    def get_progress(self):
        """Parse progress from JSON string"""
        if self.progress:
            try:
                return json.loads(self.progress)
            except json.JSONDecodeError:
                return {"total": 0, "completed": 0, "failed": 0}
        return {"total": 0, "completed": 0, "failed": 0}

    def set_progress(self, data):
        """Set progress as JSON string, stamping the last-activity time.

        ``heartbeat_at`` Yes."Mission’s last writing progress"Time. Watchdogs use it to judge.
        Whether the task is still in progress (and read from the database once the process is restarted)）。
        """
        if not data:
            existing = self.get_progress() or {}
            if existing.get('error_stage') == 'task_watchdog':
                # Unable to overwhelm the failure diagnosis written by the guard dog with empty progress
                # （For example, when setting a page test fails set_progress({})）
                return
            self.progress = None
            return

        payload = dict(data)
        payload['heartbeat_at'] = datetime.utcnow().isoformat()

        if self.status == 'FAILED':
            previous = self.get_progress()
            for key in self.WATCHDOG_PROGRESS_KEYS:
                if key in previous and key not in payload:
                    payload[key] = previous[key]

        self.progress = json.dumps(payload)

    def update_progress(self, completed=None, failed=None):
        """Update progress incrementally"""
        prog = self.get_progress()
        if completed is not None:
            prog['completed'] = completed
        if failed is not None:
            prog['failed'] = failed
        self.set_progress(prog)

    @validates('status')
    def _keep_watchdog_failure_terminal(self, key, value):
        """The dog’s decision on failure is final. worker Then we’ll get it back together.。

        Backstage tasks cannot be really cancelled： sentenced"Hold it!"It’s... worker Maybe we’ll recover later and run.。
        At this time the user has seen the failure hint (front end stopped) and the status changes silently
        COMPLETED It can create misunderstandings and duplicate execution, so it stays here. FAILED，
        Artifact information such as download_url is still written by set_progress.
        """
        if value != 'FAILED' and self.status == 'FAILED':
            progress = self.get_progress() or {}
            if progress.get('error_stage') == 'task_watchdog':
                return 'FAILED'
        return value

    def to_dict(self):
        """Convert to dictionary"""
        return {
            'task_id': self.id,
            'task_type': self.task_type,
            'status': self.status,
            'progress': localize_progress(self.get_progress()),
            'error_message': localize_error(self.error_message) if self.error_message else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'completed_at': self.completed_at.isoformat() if self.completed_at else None,
        }

    def __repr__(self):
        return f'<Task {self.id}: {self.task_type} - {self.status}>'

