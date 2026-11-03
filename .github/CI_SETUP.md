# Sol.A CI

The current workflows are `local-web.yml` and `dependency-security.yml`.

`Local Web` runs backend tests, the TypeScript/Vite build, Vitest, real browser flows, and a native Windows `start.bat` startup check. Browser tests use a loopback Azure protocol fixture, so they need no company credentials or paid API calls. They verify actual downloaded PPTX/PDF/MP4 artifacts as applicable; the fixture does not validate production model quality or Azure permissions.

`Dependency Security` checks approved registries and lockfile integrity metadata, prevents retired provider adapters returning to active code, audits all frontend dependencies and Python runtime dependencies, and blocks high/critical desktop dependency advisories. Desktop packaging still has a known moderate minimatch advisory; it is excluded from the web images, not treated as resolved.

Use Node.js 22.23.4 and Python 3.12 for local reproduction. Run `python scripts/check_dependency_policy.py` and `python scripts/check_source_language.py` before pushing. See `docs/enterprise/DEPENDENCY_HARDENING.md` for replacement and migration details.

No desktop release/publishing workflow is configured in this fork. Its release-only contract checks are explicitly skipped; desktop unit tests still check updater destinations and packaging configuration.
