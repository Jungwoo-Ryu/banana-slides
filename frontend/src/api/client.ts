import axios from 'axios';
import { isDesktop } from '@/utils';

const DESKTOP_BACKEND_PORT_STORAGE_KEY = '__desktop_backend_port__';

function isValidPort(port: number): boolean {
  return Number.isInteger(port) && port > 0 && port <= 65535;
}

function parsePort(value: unknown): number {
  return Number.parseInt(String(value ?? ''), 10);
}

function resolveDesktopBackendPort(): number {
  const rawPort = (window as any).electronAPI?.getBackendPort?.();
  const port = parsePort(rawPort);
  if (isValidPort(port)) {
    sessionStorage.setItem(DESKTOP_BACKEND_PORT_STORAGE_KEY, String(port));
    return port;
  }

  const cachedPort = parsePort(sessionStorage.getItem(DESKTOP_BACKEND_PORT_STORAGE_KEY));
  if (isValidPort(cachedPort)) {
    return cachedPort;
  }

  console.warn('Desktop backend port is unavailable');
  return 0;
}

const isClientSideUrl = (url: string) => /^\/?(data|blob):/i.test(url);
const normalizeClientSideUrl = (url: string) => url.replace(/^\/(?=(data|blob):)/i, '');

// Desktop Mode： From URL query param Synchronize the backend to avoid arcade competition
if (isDesktop) {
  (window as any).__BACKEND_PORT__ = resolveDesktopBackendPort();
}

export function getBaseURL(): string {
  if (!isDesktop) return '';
  const port = (window as any).__BACKEND_PORT__;
  if (!isValidPort(port)) {
    console.warn('Desktop backend port is unavailable');
    return 'http://127.0.0.1:0';
  }
  return `http://127.0.0.1:${port}`;
}

// Unify Download Entry：desktop Walk original saving dialogue box，web Come on. window.open
export function triggerDownload(relativeOrAbsoluteUrl: string, filename?: string): void {
  if (!relativeOrAbsoluteUrl || typeof relativeOrAbsoluteUrl !== 'string') {
    console.warn('Invalid download URL:', relativeOrAbsoluteUrl);
    return;
  }

  if (isDesktop) {
    if (isClientSideUrl(relativeOrAbsoluteUrl)) {
      const url = normalizeClientSideUrl(relativeOrAbsoluteUrl);
      (window as any).electronAPI.downloadFile(url, filename || 'download');
      return;
    }

    const normalizedPath = relativeOrAbsoluteUrl.startsWith('/')
      ? relativeOrAbsoluteUrl
      : `/${relativeOrAbsoluteUrl}`;
    const url = /^https?:\/\//i.test(relativeOrAbsoluteUrl)
      ? relativeOrAbsoluteUrl
      : `${getBaseURL()}${normalizedPath}`;
    let fallbackFilename = 'download';
    try {
      fallbackFilename = new URL(url).pathname.split('/').pop() || 'download';
    } catch {
      fallbackFilename = relativeOrAbsoluteUrl.split('?')[0].split('/').filter(Boolean).pop() || 'download';
    }
    (window as any).electronAPI.downloadFile(url, filename || fallbackFilename);
  } else {
    // Downloads may start after a long export request, when popup activation has expired.
    const link = document.createElement('a');
    link.href = relativeOrAbsoluteUrl;
    link.rel = 'noopener';
    link.download = filename || relativeOrAbsoluteUrl.split(/[?#]/)[0].split('/').pop() || '';
    link.hidden = true;
    document.body.appendChild(link);
    try {
      link.click();
    } finally {
      link.remove();
    }
  }
}

// Create axios Examples
export const apiClient = axios.create({
  timeout: 300000, // 5 Minute timeout（AI It could be slow to produce.）
});

// Request interceptor.
apiClient.interceptors.request.use(
  (config) => {
    const hasAbsoluteBaseURL = typeof config.baseURL === 'string' && /^https?:\/\//i.test(config.baseURL);
    const hasAbsoluteRequestURL = typeof config.url === 'string' && /^https?:\/\//i.test(config.url);
    if (!hasAbsoluteBaseURL && !hasAbsoluteRequestURL) {
      config.baseURL = getBaseURL();
    }

    // Return user-visible error files in UI language to backend (e.g. aborted backstage task)/Hold it!）
    if (config.headers && !config.headers['Accept-Language']) {
      config.headers['Accept-Language'] = 'ko';
    }

    // If the request is FormData，Delete Content-Type Let browsers set up automatically
    // Browser automatically adds correct Content-Type and boundary
    if (config.data instanceof FormData) {
      // Do Not Set Content-Type，Let the browser process it automatically
      if (config.headers) {
        delete config.headers['Content-Type'];
      }
    } else if (config.headers && !config.headers['Content-Type']) {
      // For Africa FormData Request, default set to JSON
      config.headers['Content-Type'] = 'application/json';
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor
apiClient.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    // Unified error handling
    if (error.response) {
      // Server returns the error status code
      console.error('API Error:', error.response.data);
    } else if (error.request) {
      // Request sent but no response received
      console.error('Network Error:', error.request);
    } else {
      // other errors
      console.error('Error:', error.message);
    }
    return Promise.reject(error);
  }
);

// Image URL Processing Tool
// Use relative path to forward via proxy to backend
export const getImageUrl = (path?: string, timestamp?: string | number): string => {
  if (!path) return '';
  if (isClientSideUrl(path)) {
    return normalizeClientSideUrl(path);
  }

  // If it’s complete, URL，Go straight back.
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  // Use relative path (ensure that / Start）
  let url = path.startsWith('/') ? path : '/' + path;

  if (isDesktop) {
    url = `${getBaseURL()}${url}`;
  }

  // Add time stamp parameters to avoid browser caches (add only when time stamp is provided)）
  if (timestamp) {
    const ts = typeof timestamp === 'string'
      ? new Date(timestamp).getTime()
      : timestamp;
    url += `?v=${ts}`;
  }

  return url;
};

export default apiClient;
