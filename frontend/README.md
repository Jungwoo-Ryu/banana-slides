# Banana Slides (Banana Slides) Frontend

It’s a figment. AI PPT Frontend Application for Generators。

## Technology.

- **Frame**: React 18 + TypeScript
- **Build Tool**: Vite
- **Status Management**: Zustand
- **Styles**: TailwindCSS
- **Route**: React Router
- **Drag**: @dnd-kit
- **Icon**: Lucide React

## Start development

### 1. Installation Dependence

```bash
npm install
```

### 2. Configure Environment Variables

**Attention.**：The configuration is no longer required. `VITE_API_BASE_URL`！

Use a relative path for front-end automatic forwarding through proxy to back-end：
- **Development environment**：Pass. Vite proxy Automatically forward to backend
- **Production environment**：Pass. nginx proxy Automatically forward to backend service

**One key to change the back port**：
Just in the root directory. `.env` Document Changes `BACKEND_PORT` Environment variable (default) 5011），The front and back ends will automatically use the new port：

```env
BACKEND_PORT=8080  # Modify to 8080 or other port
```

It doesn’t matter where the back end runs.（localhost、IP Or domain name) , the front end is automatically fit without manual configuration。

### 3. Start development server

```bash
npm run dev
```

Application will be http://localhost:3011 Start

### 4. Build a Production Version

```bash
npm run build
```

## Project structure

```
src/
├── api/              # API Envelope
│   ├── client.ts     # Axios Example Configuration
│   └── endpoints.ts  # API Peer
├── components/       # Component
│   ├── shared/       # Generic Component
│   ├── outline/      # Outline Edit Component
│   └── preview/      # Preview Component
├── pages/            # Page
│   ├── Home.tsx      # Home Page
│   ├── OutlineEditor.tsx    # Outline Edit Page
│   ├── DetailEditor.tsx     # Detailed description of the editor page
│   └── SlidePreview.tsx     # Preview Page
├── store/            # Status Management
│   └── useProjectStore.ts
├── types/            # TypeScript Type
│   └── index.ts
├── utils/            # Tool Functions
│   └── index.ts
├── App.tsx           # Application entrance
├── main.tsx          # React Mount Point
└── index.css         # Global Styles
```

## Main functions

### 1. Home Page (/)
- Three ways to create： a sentence to be generated, an outline to be generated, a description to be generated
- Style Template Selection and Upload

### 2. Outline Edit Page (/project/:id/outline)
- Drag to Sort Page
- Edit outline contents
- Auto Generate Outline

### 3. Detailed description of the editor page (/project/:id/detail)
- Batch Generate Page Description
- Edit Page Description
- Grid displays all pages

### 4. Preview Page (/project/:id/preview)
- View generated pictures
- Edit single page (natural language modification)）
- Export As PPTX/PDF

## Development of attention

### Status Management
- Usage Zustand Undertake global state management
- The critical state will be synchronized. localStorage
- Autorestore items after page refreshing

### Step-by-step mission
- Monitoring of long-term missions using a rotating mechanism
- Show Real Time Progress
- Automatically refresh data after completion

### Picture Processing
- All picture paths need to pass `getImageUrl()` Processing
- Support relative and absolute paths

### Drag function
- Usage @dnd-kit Achieved
- Support keyboard operations
- Optimistic Update UI

## Integration with Backend

Ensure backend service runs at the configured port (default) 5011）：

```bash
cd ../backend
python app.py
```

## Browser Support

- Chrome (Recommendations)
- Firefox
- Safari
- Edge
