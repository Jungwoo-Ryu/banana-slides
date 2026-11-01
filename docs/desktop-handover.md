# Banana Slides Desktop Handover Document

## Branch Information

- Branch：`feat/electron-desktop`
- Worktree：`/home/aa/banana-slides-electron`
- PR：https://github.com/Anionex/banana-slides/pull/377

---

## Completed Tasks

### Core functions (achieved)）

| Functions | Status | Documentation |
|------|------|------|
| Electron Main Process | ✅ | `desktop/main.js` |
| Preload Script / IPC | ✅ | `desktop/preload.js` |
| Python Backend Process Management | ✅ | `desktop/python-manager.js` |
| GitHub Releases Automatically update detection | ✅ | `desktop/auto-updater.js` |
| Light color Splash Start the video. | ✅ | `desktop/splash.html` |
| electron-builder Configuration | ✅ | `desktop/electron-builder.yml` |
| PyInstaller Packing specification | ✅ | `backend/banana-slides.spec` |
| Customised Borderless Title Bar（50px） | ✅ | `frontend/src/components/shared/DesktopTitleBar.tsx` |
| Headbar Resident Navigation Button | ✅ | Ibid. |
| Update of the notification article | ✅ | `frontend/src/components/shared/UpdateChecker.tsx` |
| HashRouter（file:// Compatibility） | ✅ | `frontend/src/App.tsx` |
| API client Desktop Mode Test | ✅ | `frontend/src/api/client.ts` |
| Static resource relative path repair | ✅ | `frontend/src/config/presetStyles.ts`, `TemplateSelector.tsx` |
| Logo import Rehabilitation | ✅ | `DesktopTitleBar.tsx`, `Home.tsx`, `Landing.tsx`, `HelpModal.tsx` |
| Windows NSIS Install Package | ✅ | Verifiable Buildable |
| Linux AppImage + deb | ✅ Configure complete | `electron-builder.yml`, CI workflow |
| GitHub Actions Release Workstream | ✅ | `.github/workflows/release-desktop.yml` |
| Unit Test | ✅ 15/15 | `frontend/src/tests/desktop-*.test.ts` |

---

## Solved Bug

### ✅ Backend startup failed

**The phenomenon：** Start after installation, backend process exit immediately, log：
```
Error: Path doesn't exist: migrations. Please use the 'init' command to create a new scripts folder.
```

**The root causes：** `flask_migrate.upgrade()` Not found migrations Contents。PyInstaller Take it. migrations It’s packed. `_internal/migrations/`，But... `flask_migrate` Default to search for current working directory `migrations/`，And not... `__file__` Inner directory。

**Final rehabilitation：**
- Desktop mode by Electron Import `DATABASE_PATH` / `UPLOAD_FOLDER` / `EXPORT_FOLDER`，These run-time paths won’t be in the warehouse. `.env` Overwrite。
- `backend/app.py` Desktop mode only（`DATABASE_PATH` Existence) Skip Alembic，Usage `db.create_all()` Initialize Local SQLite。
- `backend/desktop_bootstrap.py` Runs only in desktop mode to repair the local creation of the old installation package SQLite schema；Current completion `settings`、`projects`、`pages`、`user_templates` Wait for the known missing column，Docker/The source code deployment does not implement this compatible patch logic。
- Retain non-desktop mode Alembic/fallback Start the path to avoid the logical impact of desktop compatibility Docker、Source deployment etc.。

**Validation Results：**
- Source mode： From Africa `backend/` Work Directory Starts and Settings `DATABASE_PATH`，`/health` Normal return 200。
- Old Desktop Library： Create Missing Manual `settings.enable_text_reasoning`、`projects.outline_requirements`、`user_templates.thumb_path` It’s... SQLite After database, start backend and request `/api/settings`、`/api/projects`、`/api/user-templates` Normal return 200。
- Packing Mode：`C:\tmp\banana-build\backend\banana-backend.exe` Start with Desktop Data Directory，`/health` Normal return 200，Database file is properly created。

**Relevant documents：**
- `backend/app.py`
- `backend/desktop_bootstrap.py`
- `backend/banana-slides.spec`
- `backend/tests/unit/test_desktop_backend_startup.py`

### ✅ Version detection error of old version

**The phenomenon：** Locally typed new desktop bags sometimes hint GitHub Up the old release It can be updated, especially when the version number is unchanged, but the source code is submitted in line release On Update。

**Final rehabilitation：**
- Version test no longer only press `semver` Comparison `app.getVersion()` and `releases/latest`。
- Generate Before Build `desktop/build-meta.json`，Record the current source submission time, build time, and dirty Status。
- Run to get the latest release Correspond tag , only release Upgrade when submitting more time than the current build update。
- To Local dirty Check and accept packages, take back the build time to avoid old local new packages release Misreporting。

**Relevant documents：**
- `desktop/auto-updater.js`
- `desktop/update-policy.js`
- `desktop/scripts/sync-build-meta.js`

---

## Build Method

### Preconditions

- Windows Machine (or WSL2 + Windows interop）
- Windows Side：Node.js 20+、Python 3.11（Item .venv，Don’t use the whole thing. Python）
- WSL Side：uv、Node.js

### One complete build process

```bash
# 1. Yes. WSL Build frontend in
cd /home/aa/banana-slides-electron/frontend
./node_modules/.bin/vite build

# 2. Yes. WSL Generate desktop build metadata (version testing dependent)）
cd /home/aa/banana-slides-electron/desktop
node scripts/sync-build-meta.js

# 3. Sync File To Windows Build Directory
rsync -a /home/aa/banana-slides-electron/desktop/ /mnt/c/tmp/banana-build/desktop/ --exclude=node_modules --exclude=dist
rsync -a /home/aa/banana-slides-electron/frontend/dist/ /mnt/c/tmp/banana-build/frontend/
rsync -a /home/aa/banana-slides-electron/backend/ /mnt/c/tmp/banana-build/backend_src/ \
  --exclude=__pycache__ --exclude=.venv --exclude=dist --exclude=build --exclude='*.egg-info'

# 4. Yes. Windows Clean the side. venv Run! PyInstaller（Important： Not a global approach Python，It’s all over. torch It’s gonna get stuck.）
# Make sure. C:\tmp\banana-build\.venv Existence（uv sync Create）
powershell.exe -Command "cd 'C:\tmp\banana-build\backend_src'; & '..\\.venv\\Scripts\\python.exe' -m PyInstaller banana-slides.spec --noconfirm --log-level WARN"

# 5. Take it. PyInstaller Output to backend/
powershell.exe -Command "Remove-Item -Recurse -Force 'C:\tmp\banana-build\backend'; Copy-Item -Recurse 'C:\tmp\banana-build\backend_src\dist\banana-backend' 'C:\tmp\banana-build\backend'"

# 6. electron-builder Pack up.
powershell.exe -Command "
  \$env:ELECTRON_MIRROR='https://npmmirror.com/mirrors/electron/'
  \$env:CSC_IDENTITY_AUTO_DISCOVERY='false'
  cd 'C:\tmp\banana-build\desktop'
  npx electron-builder --win
"
```

Output：`C:\tmp\banana-build\desktop\dist\BananaSlides-0.3.0-Setup.exe`

### Important matters of concern

1. **PyInstaller Must use the item. .venv It’s... Python**，You can’t use the whole thing. Python（It’s all over. torch We’re gonna get stuck in the analysis phase when we get a big bag. 10+ min）
2. **`package.json` Not in there. `"build": {}`**，Empty objects will overwrite `electron-builder.yml` all configuration settings
3. **`extraResources` It’s... `from` Path**Relative to `desktop/` Contents，backend and frontend It’s a bro directory. We need it. `../backend/` and `../frontend/`
4. **Mr. Sing before packing. `build-meta.json`**，Otherwise, the version will go back to the old one. semver-only Logical
5. **Don’t pass it. `signAndEditExecutable=false`**，Otherwise... Windows Resources such as executable icons will not be correctly written
6. **Windows SmartScreen** We’ll intercept the unsigned. exe，Right → Properties → Unlock, or right-click as administrator

---

## Development mode (quick debugging)）

```bash
# WSL Inline Start Backend
cd /home/aa/banana-slides-electron/backend
nohup uv run python app.py > /tmp/electron-backend.log 2>&1 &

# WSL Internal Start Frontend
cd /home/aa/banana-slides-electron/frontend
nohup ./node_modules/.bin/vite --port 3034 > /tmp/electron-frontend.log 2>&1 &

# Windows Side Start Electron（C:\tmp\electron-app It’s already in there. node_modules）
# Yes. PowerShell Lee.：
cd C:\tmp\electron-app
$env:NODE_ENV='development'
$env:FRONTEND_PORT='3034'
$env:BACKEND_PORT='5034'
node node_modules\electron\cli.js .
```

---

## Design principles (user confirmed, do not change)）

- Headbar height 50px，Pure White Background `#ffffff`，`z-index: 9999`
- Navigator buttons are posted in the titlebar (material generation, material centre, history, settings)、Zoom、Languages, themes）
- Material generation/The material center is through. URL params `?action=material-generate` / `?action=material-center` Trigger Home Page modal
- Home Hide Page in Desktop Mode web Navigation Bar
- Splash Bright theme (white to warm yellow gradients), real logo，Floating Animations
- Windows Window Control Button： Minimize/Maximise grey suspension. Close red suspension.
- Default Window 1100×750，Min 680×480
- `isDesktop` Unified from `@/utils` Import, do not repeat definition in files

---

## File Structure

```
desktop/
├── main.js                 # Main Process
├── preload.js              # IPC bridge
├── python-manager.js       # Backend Process Management
├── auto-updater.js         # Version Test
├── splash.html             # Start the video.
├── electron-builder.yml    # Packing Configuration
├── package.json            # Note： Do not add "build": {}
└── resources/
    ├── icon.ico            # Apply Icon（Windows）
    ├── icon.png            # Apply Icon（Linux/Universal）
    ├── installer-icon.ico  # Install package icon (general download icon)）
    ├── installerSidebar.bmp
    └── installerHeader.bmp

backend/
└── banana-slides.spec      # PyInstaller Specifications

frontend/src/
├── components/shared/
│   ├── DesktopTitleBar.tsx # Custom title bar (with navigation buttons)）
│   └── UpdateChecker.tsx   # Update of the notification article
├── App.tsx                 # HashRouter/BrowserRouter Switch
├── api/client.ts           # Desktop Mode baseURL Test
└── utils/index.ts          # isDesktop Shared constant

.github/workflows/
└── release-desktop.yml     # v* tag Trigger，Win + macOS + Linux
```
