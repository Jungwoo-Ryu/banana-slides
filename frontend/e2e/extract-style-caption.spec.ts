/**
 * E2E tests for extract-style using caption_provider.
 *
 * Mock test: verify frontend handles the extract-style API correctly.
 */

import { test, expect } from '@playwright/test'

const BASE_URL = process.env.BASE_URL || 'http://localhost:3011'

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
)

/** Click the extract-style button and provide a fake image via filechooser. */
async function triggerStyleExtract(page: import('@playwright/test').Page) {
  // Enable text style mode first (checkbox defaults to off)
  const toggle = page.getByText(/\u4f7f\u7528\u6587\u5b57\u63cf\u8ff0\u98ce\u683c|Use text description for style/)
  await toggle.scrollIntoViewIfNeeded()
  await toggle.click()

  // Wait for the extract button to appear, then find the sibling hidden input
  const btn = page.getByText(/\u4ece\u56fe\u7247\u63d0\u53d6\u98ce\u683c|Extract from image/)
  await expect(btn).toBeVisible()

  // The hidden file input is right after the button, not multiple, not disabled
  const fileInput = page.locator('input[type="file"][accept="image/*"]:not([multiple]):not([disabled])')
  await fileInput.setInputFiles({ name: 'style.png', mimeType: 'image/png', buffer: TINY_PNG })
}

test.describe('Extract style - Mock tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('hasSeenHelpModal', 'true'))
  })

  test('should extract style and show success toast', async ({ page }) => {
    const mockStyle = 'Modern minimalist blue gradient'

    await page.route('**/api/extract-style', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { style_description: mockStyle } }),
      })
    })

    await page.goto(BASE_URL)
    await triggerStyleExtract(page)

    await expect(page.getByText(/\u98ce\u683c\u63d0\u53d6\u6210\u529f|Style extracted successfully/)).toBeVisible({ timeout: 5000 })
  })

  test('should show error toast when extract-style fails', async ({ page }) => {
    await page.route('**/api/extract-style', async (route) => {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          error: { code: 'AI_SERVICE_ERROR', message: 'caption_provider error' },
        }),
      })
    })

    await page.goto(BASE_URL)
    await triggerStyleExtract(page)

    await expect(page.getByText(/\u98ce\u683c\u63d0\u53d6\u5931\u8d25|Style extraction failed/)).toBeVisible({ timeout: 5000 })
  })

  test('should send multipart POST to /api/extract-style', async ({ page }) => {
    let requestOk = false

    await page.route('**/api/extract-style', async (route) => {
      const req = route.request()
      expect(req.method()).toBe('POST')
      expect(req.headers()['content-type'] || '').toContain('multipart/form-data')
      requestOk = true
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { style_description: 'ok' } }),
      })
    })

    await page.goto(BASE_URL)
    await triggerStyleExtract(page)

    await expect(page.getByText(/\u98ce\u683c\u63d0\u53d6\u6210\u529f|Style extracted successfully/)).toBeVisible({ timeout: 5000 })
    expect(requestOk).toBe(true)
  })
})
