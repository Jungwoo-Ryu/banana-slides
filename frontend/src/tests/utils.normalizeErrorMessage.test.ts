import { beforeEach, describe, expect, test } from 'vitest';
import { normalizeErrorMessage, normalizeRenovationErrorMessage } from '@/utils';

describe('normalizeErrorMessage', () => {
  beforeEach(() => {
    localStorage.setItem('banana-slides-language', 'zh-CN');
    localStorage.setItem('i18nextLng', 'zh-CN');
  });

  test('maps style extraction image-input failures to actionable export guidance', () => {
    const message = normalizeErrorMessage('Text Style Ripping Failed: The current image style extraction model does not support photo input: caption_provider Image input is not supported');
    expect(message).toContain('Image input is not supported');
    expect(message).toContain('image caption');
  });

  test('maps generic style extraction failures to editable pptx guidance', () => {
    const message = normalizeErrorMessage('Text Style Ripping Failed: Failed to call visual model to extract text styles');
    expect(message).toContain('Editable PPTX Export failed');
    expect(message).toContain('Allow return of semi-finished products');
  });

  test('maps codex oauth 401 failures to relogin guidance', () => {
    const message = normalizeErrorMessage('401 OpenAI OAuth is not connected for codex export');
    expect(message).toContain('Re-entry');
    expect(message).toContain('OpenAI');
  });

  test('maps codex ssl eof failures to retry guidance', () => {
    const message = normalizeErrorMessage("HTTPSConnectionPool(host='chatgpt.com', port=443): Max retries exceeded with url: /backend-api/codex/responses (Caused by SSLError(SSLEOFError(8, '[SSL: UNEXPECTED_EOF_WHILE_READING] EOF occurred in violation of protocol (_ssl.c:1017)')))");
    expect(message).toContain('Codex');
    expect(message).toContain('Try again later.');
  });

  test('does not crash on non-string errors', () => {
    const message = normalizeErrorMessage({ error: 'boom', status: 500 } as any);
    expect(typeof message).toBe('string');
    expect(message.length).toBeGreaterThan(0);
  });

  test('keeps non-codex network failures generic', () => {
    const message = normalizeErrorMessage("HTTPSConnectionPool(host='api.openai.com', port=443): Max retries exceeded");
    expect(message).not.toContain('Codex');
    expect(message).toContain('Network Connection Interrupted');
  });

  test('maps MinerU credential failures in the renovation workflow to a concrete recovery step', () => {
    const message = normalizeRenovationErrorMessage(
      'Failed to get upload URL: MinerU API returned 401 Unauthorized: token expired'
    );
    expect(message).toContain('MinerU Token');
    expect(message).toContain('Service testing');
    expect(message).toContain('Recreate renovation project');
  });

  test('maps MinerU business auth responses without an HTTP status', () => {
    const message = normalizeRenovationErrorMessage(
      'MinerU parsing failed: Failed to get upload URL: user authenticate failed'
    );
    expect(message).toContain('MinerU Token');
    expect(message).toContain('Service testing');
  });

  test('does not mislabel an unrelated provider authentication failure as MinerU', () => {
    const message = normalizeRenovationErrorMessage('OpenAI API returned 401 Unauthorized');
    expect(message).toContain('Authentication Failed');
    expect(message).not.toContain('MinerU Token');
  });

  test('does not mislabel an expired signed upload URL as a MinerU token failure', () => {
    const message = normalizeRenovationErrorMessage(
      'MinerU parsing failed: File upload failed: 403 Forbidden'
    );
    expect(message).toContain('Access denied');
    expect(message).not.toContain('MinerU Token');
  });

  test('uses the configured UI language for MinerU recovery guidance', () => {
    localStorage.setItem('banana-slides-language', 'en');
    const message = normalizeRenovationErrorMessage(
      'MinerU parsing failed: Failed to get upload URL: user authenticate failed'
    );
    expect(message).toContain('PPT Renovation could not parse the PDF');
    expect(message).toContain('MinerU Configuration');
  });

  test('uses the configured UI language for non-credential renovation failures', () => {
    localStorage.setItem('banana-slides-language', 'en');
    const message = normalizeRenovationErrorMessage(
      'MinerU parsing failed: File upload failed: 403 Forbidden'
    );
    expect(message).toContain('Access denied');
    expect(message).not.toContain('Access denied');
  });
});
