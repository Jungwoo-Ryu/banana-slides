from pathlib import Path

try:
    import tomllib
except ModuleNotFoundError:
    import tomli as tomllib


def test_backend_container_uses_prebuilt_virtualenv_at_runtime():
    dockerfile = Path(__file__).resolve().parents[2] / "Dockerfile"
    content = dockerfile.read_text(encoding="utf-8")

    cmd_lines = [line for line in content.splitlines() if line.startswith("CMD ")]

    assert len(cmd_lines) == 1
    assert "/app/.venv/bin/alembic upgrade head" in cmd_lines[0]
    assert "exec /app/.venv/bin/python app.py" in cmd_lines[0]
    assert "uv run" not in cmd_lines[0]


def test_only_company_azure_model_dependencies_are_packaged():
    pyproject = Path(__file__).resolve().parents[3] / "pyproject.toml"
    dependencies = tomllib.loads(pyproject.read_text())["project"]["dependencies"]
    assert any(dep.startswith("openai>=") for dep in dependencies)
    assert not any(dep.startswith(("google-genai", "anthropic", "lazyllm", "edge-tts", "elevenlabs")) for dep in dependencies)


def test_requests_socks_runtime_dependency_is_packaged():
    project_root = Path(__file__).resolve().parents[3]
    data = tomllib.loads(
        (project_root / "pyproject.toml").read_text(encoding="utf-8")
    )
    dependencies = data["project"]["dependencies"]
    spec = project_root / "backend" / "banana-slides.spec"
    spec_content = spec.read_text(encoding="utf-8")

    assert any(dep.startswith("requests[socks]") for dep in dependencies)
    assert "'requests', 'socks', 'aiohttp'" in spec_content


def test_desktop_spec_does_not_collect_removed_model_providers():
    spec = Path(__file__).resolve().parents[2] / "banana-slides.spec"
    content = spec.read_text(encoding="utf-8")
    assert "lazyllm.module.llms.onlinemodule.supplier" not in content
