"""Prevent an adapter or a non-registry dependency bypassing the supply-chain guard."""
import importlib.util
import json
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]
spec = importlib.util.spec_from_file_location('dependency_policy', ROOT / 'scripts/check_dependency_policy.py')
policy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(policy)


@pytest.fixture
def project(tmp_path):
    for folder in ('frontend', 'desktop', 'backend'):
        (tmp_path / folder).mkdir()
    for folder in ('frontend', 'desktop'):
        (tmp_path / folder / 'package-lock.json').write_text(json.dumps({'packages': {'': {}}}))
    (tmp_path / 'uv.lock').write_text('package = []\n')
    for file in ('.env.example', 'backend/config.py', 'backend/banana-slides.spec'):
        (tmp_path / file).write_text('')
    assert policy.check_policy(tmp_path) == []
    return tmp_path


@pytest.mark.parametrize('package', [
    {'resolved': 'https://registry.npmjs.org.untrusted.example/pkg.tgz', 'integrity': 'sha512-test'},
    {'resolved': 'https://registry.npmjs.org/pkg.tgz'},
    {'link': True},
])
def test_rejects_unapproved_or_unverifiable_npm_dependency(project, package):
    (project / 'frontend/package-lock.json').write_text(json.dumps({'packages': {'node_modules/pkg': package}}))
    assert policy.check_policy(project)


def test_rejects_git_dependency_that_has_no_registry_or_artifacts(project):
    (project / 'uv.lock').write_text('[[package]]\nname="pkg"\nsource={git="https://example.com/pkg.git"}\n')
    assert any('non-registry' in item for item in policy.check_policy(project))


def test_rejects_reintroduced_remote_provider_in_active_code(project):
    path = project / 'backend/services'
    path.mkdir()
    (path / 'external.py').write_text('import dashscope\n')
    assert any('retired service reference' in item for item in policy.check_policy(project))
