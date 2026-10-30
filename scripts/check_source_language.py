"""Reject literal CJK ideographs in tracked source, documentation and fixtures.

Use English or Korean prose. Explicit Unicode escapes are allowed only for legacy
input aliases and Unicode character-class tests. User data and binaries are not scanned.
"""
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
CJK = re.compile('[\u3400-\u9fff\uf900-\ufaff\U00020000-\U0002fa1f]')


def main():
    names = subprocess.check_output(['git', 'ls-files', '-z'], cwd=ROOT).decode().split('\0')
    violations = []
    for name in filter(None, names):
        try:
            data = (ROOT / name).read_bytes()
            if b'\x00' in data:
                continue
            text = data.decode('utf-8')
        except (OSError, UnicodeDecodeError):
            continue
        for line_no, line in enumerate(text.splitlines(), 1):
            if CJK.search(line):
                violations.append(f'{name}:{line_no}: use English or Korean source text')
    if violations:
        print('\n'.join(violations))
        return 1
    print('Source language check passed: no literal CJK ideographs in tracked text files.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
