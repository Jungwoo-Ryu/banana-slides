# Banana Slides Desktop App — Design Spec

Date: 2026-04-26

## Overview

Yes, sir. Banana Slides Packing as desktop application, support Windows (NSIS installer) and macOS (DMG)。Adopt Electron As Desktop Shell，PyInstaller Pack up. Python Backend is independent executable, front end build product embedded as static resource。

Core experience objectives：**First-class brand sense.**。Customized borderless titlebar, fine startup image, smooth startup process, no cheap feeling。

## 1. Project structure

```
desktop/
├── main.js                 # Electron Main Process
├── preload.js              # Preload script (exposure) IPC API）
├── python-manager.js       # Python Back-end process life cycle management
├── auto-updater.js         # GitHub Releases Version Test
├── splash.html             # Start the video.
├── package.json            # Electron Project Configuration
├── electron-builder.yml    # Packing Configuration（NSIS + DMG）
├── resources/
│   ├── icon.ico            # Windows Icon
│   ├── icon.icns           # macOS Icon
│   ├── icon.png            # Generic Icon
│   ├── installer.nsh       # NSIS Custom Install Script
│   └── README.md           # Resource justification
├── scripts/
│   └── build-all.bat       # Windows One-click build script
└── .gitignore
```

## 2. Electron Main Process (main.js)

### 2.1 Window Configuration

Use borderless windows + Platform Native Window Control：

- macOS: `titleBarStyle: 'hidden'`，Keep the original red and green light button
- Windows: `titleBarStyle: 'hidden'` + `titleBarOverlay`，Use system primary minimization/Maximize/Close button

```javascript
const win = new BrowserWindow({
  width: 1400,
  height: 900,
  minWidth: 1024,
  minHeight: 700,
  show: false,
  titleBarStyle: 'hidden',
  ...(process.platform !== 'darwin' ? {
    titleBarOverlay: {
      color: '#00000000',  // Transparent background, integration page
      symbolColor: '#6b7280',
      height: 48
    }
  } : {}),
  webPreferences: {
    preload: path.join(__dirname, 'preload.js'),
    contextIsolation: true,
    nodeIntegration: false,
  }
});
```

### 2.2 Start Process

1. Show splash Window (no borders, centering, unresizeable)）
2. Start Python Backend Process (through python-manager）
3. Rotation `http://localhost:{port}/health` Waiting for the backend to be ready
4. When backend is ready, the main window loads the front page
5. Main Window ready-to-show After, off splash，Show main window

### 2.3 System Tray

Minimise to system tray when closing window, right-click menu：
- Show main window
- Separator
- Quit Apply

macOS Let’s go. dock Restore window when icon clicks。

### 2.4 Apply Menu (Chinese)）

Custom Chinese Menu Bar：
- File： New Window, Exit
- Edit： Undo, Redo, Cut, Copy, Paste, Select
- View： Reload, Developer Tool, Full Screen
- Window： Minimize, Close
- Help： About, check for updates

### 2.5 User Data Catalogue

Usage `app.getPath('userData')` As Data Root Directory：
- Windows: `%APPDATA%/BananaSlides/`
- macOS: `~/Library/Application Support/BananaSlides/`

Subdirectories：
- `data/database.db` — SQLite Database
- `uploads/` — User Uploading File
- `exports/` — Export PPT/PDF
- `logs/` — Apply Log

Passing through environmental variables to the backend：`DATABASE_PATH`, `UPLOAD_FOLDER`, `EXPORT_FOLDER`。

## 3. Preload Script (preload.js)

Pass. `contextBridge` Exposure safe. API：

```javascript
contextBridge.exposeInMainWorld('electronAPI', {
  // Version Information
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  // Update Check
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  // Platform Information
  getPlatform: () => process.platform,
  // Window Control (for custom title bar)）
  minimizeWindow: () => ipcRenderer.send('window-minimize'),
  maximizeWindow: () => ipcRenderer.send('window-maximize'),
  closeWindow: () => ipcRenderer.send('window-close'),
  // External links
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
});
```

## 4. Python Backend Management (python-manager.js)

### 4.1 Duties

- Positioning PyInstaller Pack Backend Executable
- Distribute Available Ports
- Start a back-end process to transmit environmental variables
- Health check call.
- Clean-up on process exit

### 4.2 Port Distribution

Development mode with fixed port 5000，Packing mode dynamic distribution of available ports (from 15000 Start scanning.）。

### 4.3 Environmental variables transfer

Setup on Backend Start：
- `DATABASE_PATH` — Database File Path
- `UPLOAD_FOLDER` — Upload directory
- `EXPORT_FOLDER` — Export Directory
- `CORS_ORIGINS` — `http://localhost:{electronPort}`
- `FLASK_ENV` — `production`

### 4.4 Health screening

Every 500ms Rotation `/health`，At most, wait. 30 seconds. Timeout displays the error dialogue box and exits。

### 4.5 Process Cleaning

Apply exit（`app.on('before-quit')`）：
- Send SIGTERM To Backend Process
- Wait. 5 sec
- Send if still running SIGKILL
- Windows Use Up `taskkill /F /PID`

## 5. Automatically update detection (auto-updater.js)

### 5.1 Test Logic

- Call GitHub API: `GET https://api.github.com/repos/Anionex/banana-slides/releases/latest`
- Comparison `tag_name`（semver）With Current `app.getVersion()`
- If new version is available, return version number, update description, download links

### 5.2 Trigger Time

- Apply after startup 5 Autocheck every second.
- Users can use the menu"Help → Check for updates"Manual Trigger
- Frontend UpdateChecker Component passes. IPC Call

### 5.3 Interactive Method

When a new version is detected, the front end displays a non-intrusive notification entry, including：
- New version number
- Updated summary of notes
- "Go to Download"Buttons (Open GitHub Releases Page）
- "Remind later."button

## 6. Start the video. (splash.html)

Independence HTML File, load without border window. Design requirements：

- Dimensions：480×360，Centre Show Unresizeable
- Background： Gradual colour（banana Brand colour system, yellow to orange.）
- Logo：Centre Display Application logo
- Apply Name："Banana Slides" Use brand fonts
- Load animated： bottom long progress bar + Status Text（"Starting backend service..."）
- Corporate style： concise, advanced, strong brand

## 7. Frontend Custom Title Bar (DesktopTitleBar.tsx)

### 7.1 Design requirements

Renders only in desktop mode. Advanced sense, not cheap。

- Height 48px，Isolated integration with page contents
- Left：macOS Leave a red and green light space up there.（~70px padding），Windows Show Application Up logo + Name
- Middle： Optional display of current Slide title
- Right：Windows Override `titleBarOverlay` Process raw buttons，macOS Upshowable buttons
- The entire title bar area can be dragged（`-webkit-app-region: drag`），Set button area as `no-drag`
- Support bright colors/Dark Theme
- Use gross glass effect in the background（`backdrop-filter: blur`）or merge with page background

### 7.2 Achieved

- Test `window.electronAPI` Existence to judge desktop mode
- Pass. CSS `env(titlebar-area-*)` Fit Windows titleBarOverlay Regional
- macOS Up through. `navigator.platform` or preload It’s exposed. `getPlatform()` Judgement.

## 8. Frontend Update Check Component (UpdateChecker.tsx)

- Apply after startup to pass `window.electronAPI.checkForUpdates()` Inspection
- Show notice bars at the top of the page when a new version is available (without blocking content, push layout)）
- Notification style： brand colour gradient background, round corner, with closed buttons
- "Go to Download"Button Call `window.electronAPI.openExternal(url)`
- This session is no longer visible after user closes

## 9. Frontend API Client Fit (client.ts)

Desktop mode, frontend not passed Vite proxy It’s a direct link to the back.：

```typescript
const isDesktop = typeof window !== 'undefined' && 'electronAPI' in window;
const API_BASE_URL = isDesktop
  ? `http://localhost:${window.__BACKEND_PORT__ || 5000}`
  : '';
```

Backend Passes Electron preload Script in `contextBridge.exposeInMainWorld` injects into `window.__BACKEND_PORT__`。Main process establishes port at backend, by IPC Passed to preload。

## 10. Backend Changes (app.py)

### 10.1 Windows UTF-8 Output

At the top of the file, all import Before：

```python
if sys.platform == 'win32':
    if sys.stdout is not None:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    if sys.stderr is not None:
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
```

### 10.2 Environmental variable path support

`create_app()` Checking `DATABASE_PATH`, `UPLOAD_FOLDER`, `EXPORT_FOLDER` Environment variable. Use (desktop mode) if available, otherwise use existing relative path logic (development mode)）。

### 10.3 Database table automatically created

Yes. `with app.app_context():` Add to Blocks `db.create_all()`，Ensures that a table is automatically created when you start running for the first time after packing. Alembic Still the main migration tool.，`db.create_all()` As a front.。

## 11. PyInstaller Packing specification (banana-slides.spec)

### 11.1 Access.

`backend/app.py`

### 11.2 Data Files

- `fonts/` — Font File
- `migrations/` — Alembic Migration File

### 11.3 Invisible Import

Collect all critical dependent submodules：flask, sqlalchemy, google.generativeai, openai, pptx, docx, lxml, httpx, aiohttp, reportlab, markitdown Wait.。

### 11.4 Exclude

tkinter, matplotlib, scipy, IPython, jupyter, notebook — Volume Reduction。

### 11.5 Output

- Executable File Name：`banana-backend`
- Mode：`console=False`（No Console Window）
- Usage COLLECT Mode (non-single file) to facilitate debugging and updating

## 12. electron-builder Configuration

```yaml
appId: com.banana.slides
productName: Banana Slides

directories:
  output: dist
  buildResources: resources

files:
  - "main.js"
  - "python-manager.js"
  - "preload.js"
  - "auto-updater.js"
  - "splash.html"
  - "package.json"
  - "node_modules/**/*"

extraResources:
  - from: "backend/"
    to: "backend"
    filter: ["**/*"]
  - from: "frontend/"
    to: "frontend"
    filter: ["**/*"]

win:
  target:
    - target: nsis
      arch: [x64]
  icon: resources/icon.ico
  artifactName: "BananaSlides-${version}-Setup.${ext}"

mac:
  target:
    - target: dmg
      arch: [x64, arm64]
  icon: resources/icon.icns
  artifactName: "BananaSlides-${version}.${ext}"

nsis:
  oneClick: false
  perMachine: false
  allowToChangeInstallationDirectory: true
  createDesktopShortcut: true
  createStartMenuShortcut: true
  shortcutName: "Banana Slides"

compression: maximum
```

## 13. GitHub Actions Release Workstream (release-desktop.yml)

### 13.1 Trigger Condition

Send `v*` Trigger on Label。

### 13.2 Build Matrix

- Windows: `windows-latest`
- macOS: `macos-latest`

### 13.3 Steps

1. Checkout Code
2. From tag Sync Version Number to `desktop/package.json` and `frontend/package.json`
3. Install Node.js Dependency
4. Install Python + uv
5. Build Frontend (`npm run build`)
6. PyInstaller Pack Backend
7. Copy Build to `desktop/frontend/` and `desktop/backend/`
8. electron-builder Pack up.
9. Upload to GitHub Release

## 14. Vite Configure Changes

Add `base: './'` Ensure that the construction product uses a relative path and adapts Electron It’s... `file://` Protocol Loading。

## 15. It’s not in range.

- 100 degrees OCR API Key Settings： Achieved in the current code without change
- Autodown installation in application： version testing only + Guide Downloads
- Linux Support： Not this time
- Code signing is not configured yet; it can be added later
