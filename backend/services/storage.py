"""Storage boundary for local files and future internal storage staging adapters.

Rendering libraries need local paths. A remote adapter must stage objects into
its root and implement resolve(); FileService accepts it by dependency injection.
"""
from pathlib import Path
from typing import Protocol


class FileStorage(Protocol):
    root: Path
    def resolve(self, relative_path: str) -> Path: ...


class LocalFileStorage:
    def __init__(self, root):
        self.root = Path(root).expanduser().resolve()
        self.root.mkdir(parents=True, exist_ok=True)

    def resolve(self, relative_path):
        target = (self.root / str(relative_path).replace('\\', '/')).resolve()
        if not target.is_relative_to(self.root):
            raise ValueError('저장소 밖의 파일에는 접근할 수 없습니다.')
        return target
