import { beforeEach, describe, expect, test } from 'vitest';
import { normalizeErrorMessage, normalizeRenovationErrorMessage } from '@/utils';

describe('operational error guidance', () => {
  beforeEach(() => localStorage.setItem('banana-slides-language', 'ko'));

  test.each([
    ['caption_provider Image input is not supported', '이미지 입력', 'image input'],
    ['Text Style Ripping Failed: failed to extract text styles', '스타일 분석', 'style extraction'],
    ['401 Unauthorized: sk-secret', '접근 권한', 'permissions'],
    ['SSLError: certificate verify failed', '인증서', 'certificate'],
    ['Network error: https://private-host', '서버 연결', 'network'],
    ['429 rate limit', '요청 한도', 'limit'],
    ['Read timed out', '시간이 초과', 'timed out'],
  ])('localizes %s without returning upstream details', (raw, ko, en) => {
    expect(normalizeErrorMessage(raw)).toContain(ko);
    expect(normalizeErrorMessage(raw, 'en')).toContain(en);
    expect(normalizeErrorMessage(raw)).not.toMatch(/sk-secret|private-host/);
  });

  test('handles missing, structured and mixed-language upstream errors', () => {
    for (const value of [undefined, null, { error: 'boom' }, '오류: ' + String.fromCodePoint(0x9519, 0x8bef)]) {
      const message = normalizeErrorMessage(value as any);
      expect(message).not.toMatch(/[\u3400-\u9fff]/);
      expect(message).toContain('확인');
    }
  });

  test.each(['ko', 'en'])('uses local OCR guidance for parser failures (%s)', (lang) => {
    localStorage.setItem('banana-slides-language', lang);
    const message = normalizeRenovationErrorMessage('Local document parsing failed: Tesseract is unavailable');
    expect(message).toContain('Tesseract');
    expect(message).toContain(lang === 'ko' ? '로컬' : 'locally');
    expect(message).not.toContain('Settings');
  });

  test.each(['Azure API returned 401 Unauthorized', 'Azure image request failed: 403 Forbidden'])('does not misattribute another auth failure to the local OCR: %s', (raw) => {
    expect(normalizeRenovationErrorMessage(raw)).not.toContain('Tesseract');
    expect(normalizeRenovationErrorMessage(raw)).toContain('접근 권한');
  });
});
