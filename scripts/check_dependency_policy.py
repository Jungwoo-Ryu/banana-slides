#!/usr/bin/env python3
"""Reject retired service adapters and unapproved public package registries."""
import json
from pathlib import Path
import re
import tomllib
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
RETIRED = re.compile(r'mineru|baidu|volcengine|dashscope|zhipuai|lazyllm|sensenova|paddleocr|deepseek|doubao|qwen|modelscope|siliconflow|aihubmix|apimart', re.I)


def check_policy(root=ROOT):
    errors = []
    for folder in ('frontend', 'desktop'):
        lock = json.loads((root / folder / 'package-lock.json').read_text())
        for path, package in lock['packages'].items():
            name = package.get('name') or path.rsplit('node_modules/', 1)[-1]
            if RETIRED.search(name):
                errors.append(f'{folder}: retired package {name}')
            resolved = package.get('resolved', '')
            if path and not resolved:
                errors.append(f'{folder}: missing registry source for {name}')
            if resolved:
                url = urlsplit(resolved)
                if url.scheme != 'https' or url.hostname != 'registry.npmjs.org':
                    errors.append(f'{folder}: unapproved package source for {name}')
                if not package.get('integrity'):
                    errors.append(f'{folder}: missing integrity for {name}')
    lock = tomllib.loads((root / 'uv.lock').read_text())
    for package in lock['package']:
        if RETIRED.search(package['name']):
            errors.append(f'Python: retired package {package["name"]}')
        source = package.get('source', {})
        registry = source.get('registry')
        if not registry and not (package['name'] == 'banana-slides' and source == {'editable': '.'}):
            errors.append(f'Python: non-registry dependency {package["name"]}')
        if registry and registry != 'https://pypi.org/simple':
            errors.append(f'Python: unapproved registry for {package["name"]}')
        for artifact in package.get('wheels', []) + ([package['sdist']] if 'sdist' in package else []):
            url = urlsplit(artifact['url'])
            if url.scheme != 'https' or url.hostname != 'files.pythonhosted.org' or not artifact.get('hash', '').startswith('sha256:'):
                errors.append(f'Python: unapproved artifact for {package["name"]}')
    # Historical migrations retain old identifiers only to remove them and preserve data.
    files = [root / '.env.example', root / 'backend/config.py', root / 'backend/banana-slides.spec']
    for folder in ('backend/services', 'backend/controllers', 'backend/models', 'frontend/src'):
        files += [p for p in (root / folder).rglob('*') if p.suffix in ('.py', '.ts', '.tsx', '.json') and 'tests' not in p.parts]
    for path in files:
        if RETIRED.search(path.read_text(encoding='utf-8')):
            errors.append(f'{path.relative_to(root)}: retired service reference in active code')
    return errors


if __name__ == '__main__':
    violations = check_policy()
    if violations:
        raise SystemExit('\n'.join(violations))
    print('Dependency policy passed: official registries, integrity hashes, no retired service adapters.')
