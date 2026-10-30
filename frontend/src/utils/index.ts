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
  const lang = language || 'ko';
  if (lang.startsWith('ko')) {
    const text = String(errorMessage || '');
    if (/[가-힣]/.test(text) && !/https?:|Bearer |sk-|Traceback/.test(text)) return text;
    if (/401|403|api.key|unauthorized/i.test(text)) return 'API 키와 모델 배포 접근 권한을 확인하세요.';
    if (/429|quota|rate.limit/i.test(text)) return '요청 한도에 도달했습니다. 잠시 후 다시 시도하세요.';
    if (/timeout|timed.out/i.test(text)) return '응답 시간이 초과되었습니다. 다시 시도하세요.';
    if (/network|connect/i.test(text)) return '서버 연결을 확인하세요. 백엔드가 실행 중이어야 합니다.';
    if (/template/i.test(text)) return '템플릿을 선택하거나 업로드하세요.';
    if (/description/i.test(text)) return '페이지 설명을 먼저 작성하세요.';
    return '작업을 완료하지 못했습니다. 입력과 서비스 설정을 확인하세요.';
  }
  const isZh = lang.startsWith('zh');

  if (!errorMessage) return isZh ? 'Operation failed' : 'Operation failed';

  const rawMessage = typeof errorMessage === 'string'
    ? errorMessage
    : (() => {
        try {
          return JSON.stringify(errorMessage);
        } catch {
          return String(errorMessage);
        }
      })();

  if (!rawMessage) return isZh ? 'Operation failed' : 'Operation failed';

  const message = rawMessage.toLowerCase();
  const isCodexContext = (
    message.includes('codex')
    || message.includes('chatgpt.com')
    || message.includes('/backend-api/codex/')
    || message.includes('openai oauth')
  );

  // Handle specific error messages
  if (message.includes('no template image found')) {
    return isZh
      ? 'There is no template for the current item. Click on the page toolbar first."Change Template"button, select or upload a template image before generating。'
      : 'No template found. Please select or upload a template image first.';
  } else if (message.includes('page must have description content')) {
    return isZh
      ? 'There is no description on this page. Please be there first."Edit Page Description"Step to generate or fill out descriptions for this page。'
      : 'This page has no description. Please generate or write a description first.';
  } else if (message.includes('image already exists')) {
    return isZh
      ? 'There are already pictures on this page, and if you need to regenerate, choose at the time of generation"Regenerated"Or try again later.。'
      : 'Image already exists. Choose "Regenerate" to create a new one.';
  }

  // Handle HTTP error codes
  if (message.includes('503') || message.includes('service unavailable')) {
    return isZh ? 'AI The service is not available for the time being. Please try again later. API Configuration。' : 'AI service temporarily unavailable. Please try again later.';
  } else if (message.includes('500') || message.includes('internal server error')) {
    return isZh ? 'Internal server error, please try again later。' : 'Internal server error. Please try again later.';
  } else if (message.includes('502') || message.includes('bad gateway')) {
    return isZh ? 'Gateway error, please try again later。' : 'Bad gateway. Please try again later.';
  } else if (message.includes('504') || message.includes('gateway timeout')) {
    return isZh ? 'Request timeout. Try again later.。' : 'Gateway timeout. Please try again later.';
  } else if (message.includes('429') || message.includes('too many requests')) {
    return isZh ? 'Requests are too frequent. Please try again later.。' : 'Too many requests. Please try again later.';
  } else if (message.includes('401') || message.includes('unauthorized')) {
    if (isCodexContext || (message.includes('oauth') && message.includes('not connected'))) {
      return isZh
        ? 'Codex Login expired or unconnected, please go to settings for re-entry OpenAI Try again after the account number.。'
        : 'Your Codex login has expired or is disconnected. Please reconnect your OpenAI account in Settings and try again.';
    }
    return isZh ? 'Authentication failed, please check API Key Configuration。' : 'Authentication failed. Please check API key settings.';
  } else if (message.includes('403') || message.includes('forbidden')) {
    return isZh ? 'Access denied, please check API Permission Configuration。' : 'Access denied. Please check API permissions.';
  } else if (message.includes('aspect_ratio') || message.includes('aspect ratio')) {
    return isZh
      ? 'The current image ratio is not supported by this model. Try again in the project settings after trying another image scale。'
      : 'The selected aspect ratio is not supported by this model. Please try a different ratio in project settings.';
  } else if (message.includes('network error') || message.includes('econnrefused')) {
    return isZh ? 'Network connection failed, check whether the network or backend service is functioning properly。' : 'Network error. Please check your connection.';
  } else if (message.includes('timeout')) {
    return isZh ? 'Request timeout. Try again later.。' : 'Request timed out. Please try again later.';
  } else if (
    message.includes('sslerror')
    || message.includes('ssleoferror')
    || message.includes('unexpected_eof_while_reading')
    || message.includes('eof occurred in violation of protocol')
    || message.includes('max retries exceeded')
    || message.includes('httpsconnectionpool')
  ) {
    if (isCodexContext) {
      return isZh
        ? 'Connection Codex Interrupted service, leading to export failure. Try again later; if repeated, re-entry to settings is available OpenAI Try again after the account number.。'
        : 'The connection to Codex was interrupted and the export failed. Please try again later, or reconnect your OpenAI account in Settings if it keeps happening.';
    }
    return isZh
      ? 'Network connection is interrupted, resulting in operation failure. Try again later。'
      : 'The connection was interrupted and the operation failed. Please try again later.';
  } else if (message.includes('Style Ripping Failed') || message.includes('style extraction failed')) {
    if (message.includes('Image input is not supported') || message.includes('support image input')) {
      return isZh
        ? 'Editable PPTX Export failed： the current image style extraction model does not support photo input. Please change the settings to those that support visual input image caption model, or switch provider Try again after。'
        : 'Editable PPTX export failed: the current style extraction model does not support image input. Switch to a vision-capable image caption model and try again.';
    }
    return isZh
      ? 'Editable PPTX Export failed： text style extraction was not successfully completed. Check image caption Model/API Configure, or try again after project settings have opened the Allowed Return to Semi-finished。'
      : 'Editable PPTX export failed because text style extraction did not complete. Check the image caption model/API settings, or enable partial results and try again.';
  }

  return rawMessage;
}

/**
 * PPT Refurbishment dependency MinerU Parsing PDF。Only conversion of a certificate failure into a clear repair action in the workflow，
 * Avoid taking the rest of it. provider authentication errors are incorrectly attributed to MinerU。
 */
export function normalizeRenovationErrorMessage(errorMessage: string | null | undefined): string {
  const rawMessage = typeof errorMessage === 'string' ? errorMessage : String(errorMessage || '');
  const message = rawMessage.toLowerCase();
  const lang = localStorage.getItem('banana-slides-language') || navigator.language || 'zh';
  const isZh = lang.startsWith('zh');
  const normalized = normalizeErrorMessage(errorMessage, lang);
  const looksLikeMineruCredentialStage = message.includes('get upload url')
    || message.includes('requesting upload url')
    || message.includes('file-urls/batch')
    || message.includes('task status')
    || message.includes('extract-results')
    || message.includes('file parsing failed');
  const looksLikeCredentialFailure = message.includes('401')
    || message.includes('403')
    || message.includes('unauthorized')
    || message.includes('forbidden')
    || message.includes('token expired')
    || message.includes('invalid token')
    || message.includes('token invalid')
    || message.includes('token has expired')
    || message.includes('authenticate failed')
    || message.includes('authentication failed');

  if (message.includes('mineru') && looksLikeMineruCredentialStage && looksLikeCredentialFailure) {
    return isZh
      ? 'PPT Refurbishment cannot resolve PDF：MinerU Token It is invalid, invalid or without permission. Please come.「Settings → MinerU Configuration」Update Token，Run first“MinerU Parsing PDF”Service testing, re-create renovation project。'
      : 'PPT Renovation could not parse the PDF because the MinerU token is expired, invalid, or unauthorized. Update it in Settings → MinerU Configuration, run the “MinerU PDF Parsing” service test, then create the renovation project again.';
  }

  return normalized;
}

export const isDesktop = typeof window !== 'undefined' && 'electronAPI' in window;
export const DESKTOP_TITLEBAR_HEIGHT = 50;
