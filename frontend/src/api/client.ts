import axios from 'axios';
import { desktopConfig, desktopFileURL, isWails, saveNative, sessionHeaders } from '@/utils/wails';

const isClientSideUrl = (url: string) => /^\/?(data|blob):/i.test(url);
const normalizeClientSideUrl = (url: string) => url.replace(/^\/(?=(data|blob):)/i, '');

export function getBaseURL(): string {
  return isWails() ? desktopConfig()?.baseURL || 'http://127.0.0.1:0' : '';
}

export function triggerDownload(url: string, filename?: string): void {
  if (!url || typeof url !== 'string') return;
  const name = filename || url.split(/[?#]/)[0].split('/').pop() || 'download';
  if (isWails()) {
    void saveNative(url, name).catch(error => {
      console.error('파일 저장 실패', error);
      window.alert(`파일을 저장하지 못했습니다: ${String(error)}`);
    });
    return;
  }
  const link = document.createElement('a');
  link.href = url; link.rel = 'noopener'; link.download = name; link.hidden = true;
  document.body.appendChild(link);
  try { link.click(); } finally { link.remove(); }
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

    if (isWails() && !hasAbsoluteRequestURL && !hasAbsoluteBaseURL) {
      Object.assign(config.headers, sessionHeaders());
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

  if (isWails()) url = desktopFileURL(url);

  // Add time stamp parameters to avoid browser caches (add only when time stamp is provided)）
  if (timestamp) {
    const ts = typeof timestamp === 'string'
      ? new Date(timestamp).getTime()
      : timestamp;
    url += `${url.includes('?') ? '&' : '?'}v=${ts}`;
  }

  return url;
};

export default apiClient;
