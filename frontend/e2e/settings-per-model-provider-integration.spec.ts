/**
 * Integration E2E test for per-model provider configuration.
 * Hits the REAL backend — verifies save persistence, reload, and reset.
 */
import { test, expect, Page } from '@playwright/test'

/** Helper: get the nth model config group (0=text, 1=image, 2=caption) */
function getModelGroup(page: Page, index: number) {
  return page.locator('.space-y-4 > div').filter({ has: page.locator('select') }).nth(index)
}

// Clean up after all tests: reset settings to defaults
test.afterAll(async ({ browser }) => {
  const page = await browser.newPage()
  await page.goto('/settings')
  await page.getByRole('button', { name: /\u91cd\u7f6e/ }).click()
  await page.getByRole('button', { name: /\u786e\u5b9a\u91cd\u7f6e/ }).click()
  await page.waitForTimeout(1000)
  await page.close()
})

test.describe('Settings: Per-model provider integration (real backend)', () => {
  test.describe.configure({ mode: 'serial' })
  test.setTimeout(30_000)

  test('save per-model provider config persists to backend', async ({ page }) => {
    await page.goto('/settings')

    const textGroup = getModelGroup(page, 0)
    const textSelect = textGroup.locator('select')

    // Switch text model provider to OpenAI
    await textSelect.selectOption('openai')

    // Fill API Base URL
    const baseUrlInput = textGroup.locator('input[type="text"]').nth(1)
    await baseUrlInput.fill('https://integration-test.example.com/v1')

    // Fill API Key
    const apiKeyInput = textGroup.locator('input[type="password"]')
    await apiKeyInput.fill('sk-integration-test-key')

    // Click save
    await page.getByRole('button', { name: /\u4fdd\u5b58/ }).click()
    await expect(page.locator('text=Save successfully').or(page.locator('text=saved'))).toBeVisible({ timeout: 5000 })
  })

  test('reload page shows persisted per-model config', async ({ page }) => {
    await page.goto('/settings')

    const textGroup = getModelGroup(page, 0)
    const textSelect = textGroup.locator('select')

    // Verify provider selection persisted
    await expect(textSelect).toHaveValue('openai')

    // Verify API Base URL persisted
    const baseUrlInput = textGroup.locator('input[type="text"]').nth(1)
    await expect(baseUrlInput).toHaveValue('https://integration-test.example.com/v1')

    // Verify API Key shows "Set" placeholder (length > 0)
    const apiKeyInput = textGroup.locator('input[type="password"]')
    const placeholder = await apiKeyInput.getAttribute('placeholder')
    expect(placeholder).toMatch(/\u957f\u5ea6|length/i)
    await expect(page.getByTestId('per-model-provider-override-alert')).toHaveCount(0)
    await expect(page.getByRole('button', { name: /\u5168\u90e8\u8ddf\u968f\u9ed8\u8ba4\u914d\u7f6e/ })).toHaveCount(0)
  })

  test('reset clears per-model config from backend', async ({ page }) => {
    await page.goto('/settings')

    const textGroup = getModelGroup(page, 0)
    await textGroup.locator('select').selectOption('openai')
    await page.getByRole('button', { name: /\u4fdd\u5b58/ }).click()
    await expect(page.locator('text=Save successfully').or(page.locator('text=saved'))).toBeVisible({ timeout: 5000 })
    await expect(textGroup.locator('select')).toHaveValue('openai')

    // Click reset
    await page.getByRole('button', { name: /\u91cd\u7f6e/ }).click()
    await page.getByRole('button', { name: /\u786e\u5b9a\u91cd\u7f6e/ }).click()

    // Wait for reset to complete
    await expect(page.locator('text=Resetd').or(page.locator('text=reset'))).toBeVisible({ timeout: 5000 })

    // Verify provider reverted to env default
    await expect(textGroup.locator('select')).not.toHaveValue('openai')

    // Verify API Base URL field is hidden (lazyllm vendor or empty = no base URL)
    await expect(textGroup.locator('text=API Base URL')).toBeHidden()
  })
})
