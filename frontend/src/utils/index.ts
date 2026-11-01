import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { Project, Page } from '@/types';

/**
 * Merge className (Support Tailwind CSS)
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Standardized backend returned project data
 */
export function normalizeProject(data: any): Project {
  return {
    ...data,
    id: data.project_id || data.id,
    template_image_path: data.template_image_url || data.template_image_path,
    pages: (data.pages || []).map(normalizePage),
  };
}

/**
 * Standardized backend returned page data
 */
export function normalizePage(data: any): Page {
  return {
    ...data,
    id: data.page_id || data.id,
    generated_image_path: data.generated_image_url || data.generated_image_path,
  };
}

/**
 * Visible function
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

/**
 * Fluid Functions
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean;
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

/**
 * Download File
 */
export function downloadFile(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}

export function downloadFromUrl(url: string, filename?: string) {
  const link = document.createElement('a');
  link.href = url;
  if (filename) {
    link.download = filename;
  }
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Formatting Date
 */
export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const lang = localStorage.getItem('i18nextLng') || navigator.language || 'zh-CN';
  const locale = lang.startsWith('zh') ? 'zh-CN' : 'en-US';
  return date.toLocaleString(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Generate Unique ID
 */
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Convert error messages to a friendly Chinese-English hint
 */
export function normalizeErrorMessage(
  errorMessage: string | null | undefined,
  language?: string,
): string {
  const korean = !(language || 'ko').startsWith('en');
  const text = String(errorMessage || '');
  const choose = (ko: string, en: string) => korean ? ko : en;
  if (/[가-힣]/.test(text) && !/https?:|Bearer |sk-|Traceback|\{|[\u3400-\u9fff]/.test(text)) return text;
  if (/certificate|ssl|tls|unexpected_eof/i.test(text)) return choose('HTTPS 인증서와 사내 Root CA·프록시 설정을 확인하세요.', 'Check the HTTPS certificate, company root CA and proxy settings.');
  if (/401|403|api.key|unauthorized|forbidden/i.test(text)) return choose('API 키와 모델 배포 접근 권한을 확인하세요.', 'Authentication failed. Check the API key and deployment permissions.');
  if (/429|quota|rate.limit/i.test(text)) return choose('요청 한도에 도달했습니다. 잠시 후 다시 시도하세요.', 'The request limit was reached. Try again later.');
  if (/timeout|timed.out/i.test(text)) return choose('응답 시간이 초과되었습니다. 다시 시도하세요.', 'The request timed out. Try again.');
  if (/network|connect|econnrefused/i.test(text)) return choose('서버 연결을 확인하세요. 백엔드가 실행 중이어야 합니다.', 'Check the network connection and that the backend is running.');
  if (/image input is not supported|does not support (?:photo|image)|support image input/i.test(text)) return choose('이미지 인식 배포가 이미지 입력을 지원하지 않습니다. 사내 Azure GPT-5.5 배포 설정을 확인하세요.', 'The image recognition deployment does not support image input. Check the company Azure GPT-5.5 deployment.');
  if (/style ripping failed|style extraction failed/i.test(text)) return choose('편집형 PPTX의 스타일 분석에 실패했습니다. 이미지 인식 배포를 확인하거나 부분 결과 허용 설정을 검토하세요.', 'Editable PPTX style extraction failed. Check the image recognition deployment or review the partial results setting.');
  if (/template/i.test(text)) return choose('템플릿을 선택하거나 업로드하세요.', 'Select or upload a template.');
  if (/description/i.test(text)) return choose('페이지 설명을 먼저 작성하세요.', 'Write the page description first.');
  return choose('작업을 완료하지 못했습니다. 입력과 서비스 설정을 확인하세요.', 'Could not complete the operation. Check the input and service configuration.');
}

/** Describe parser authentication failures without exposing upstream response bodies. */
export function normalizeRenovationErrorMessage(errorMessage: string | null | undefined): string {
  const message = String(errorMessage || '').toLowerCase();
  const lang = localStorage.getItem('banana-slides-language') || 'ko';
  const parserStage = /get upload url|requesting upload url|file-urls\/batch|task status|extract-results|file parsing failed/.test(message);
  const credentialFailure = /401|403|unauthorized|forbidden|token expired|invalid token|token invalid|token has expired|authenticate failed|authentication failed/.test(message);
  if (message.includes('mineru') && parserStage && credentialFailure) {
    return lang.startsWith('en')
      ? 'PPT Renovation could not parse the PDF. Check MINERU_TOKEN and MINERU_API_BASE in the server environment, restart the backend, then create the renovation project again.'
      : 'PDF를 파싱하지 못했습니다. 서버 환경변수 MINERU_TOKEN·MINERU_API_BASE와 권한을 확인하고 백엔드를 재시작한 뒤 프로젝트를 다시 만드세요.';
  }
  return normalizeErrorMessage(errorMessage, lang);
}

export const isDesktop = typeof window !== 'undefined' && 'electronAPI' in window;
export const DESKTOP_TITLEBAR_HEIGHT = 50;
