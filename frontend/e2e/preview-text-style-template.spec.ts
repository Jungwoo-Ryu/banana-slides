/**
 * E2E tests for text style mode in SlidePreview template modal.
 *
 * Mock test: verify toggle, TextStyleSelector rendering, preset click, apply button.
 * Integration test: verify style is persisted after apply and survives page reload.
 */
import { test, expect } from '@playwright/test'
import { seedProjectWithImages } from './helpers/seed-project'

const BASE_URL = process.env.BASE_URL || 'http://localhost:3011'
const BACKEND_URL = BASE_URL.replace(/:\d+$/, (m) => `:${parseInt(m.slice(1)) + 2000}`)

/** Set up all mocks needed for SlidePreview to render */
async function setupMocks(page: import('@playwright/test').Page) {
  // AccessCodeGuard: bypass
  await page.route('**/api/access-code/check', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { enabled: false } }) })
  })
  // Project data
  await page.route('**/api/projects/*', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            id: 'mock-proj', status: 'IMAGES_GENERATED', template_style: '',
            pages: [{ id: 'p1', order_index: 0, status: 'COMPLETED', outline_content: { title: 'Slide 1' }, generated_image_path: 'mock.jpg' }],
          },
        }),
      })
    } else {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) })
    }
  })
  await page.route('**/api/user-templates', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { templates: [] } }) })
  })
  await page.route('**/api/settings', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: {} }) })
  })
  // Image versions
  await page.route('**/image-versions', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { versions: [] } }) })
  })
  // Image files
  await page.route('**/files/**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'image/jpeg', body: Buffer.from([]) })
  })
}

test.describe('Preview text style template - Mock tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('hasSeenHelpModal', 'true'))
  })

  test('toggle switches between image template and text style mode', async ({ page }) => {
    await setupMocks(page)
    await page.goto(`${BASE_URL}/project/mock-proj/preview`)

    // Open template modal
    await page.getByTestId('template-menu').click()
    await page.getByRole('button', { name: /\u66f4\u6362\u6a21\u677f|Change Template/ }).click()

    // Initially should show toggle label but NOT TextStyleSelector content
    await expect(page.getByText(/\u4f7f\u7528\u6587\u5b57\u63cf\u8ff0\u98ce\u683c|Use text description for style/)).toBeVisible()
    await expect(page.getByText(/\u9884\u8bbe\u98ce\u683c：|Preset styles:/)).not.toBeVisible()

    // Toggle to text style mode (click label text — the actual input is sr-only/off-screen)
    await page.getByText(/\u4f7f\u7528\u6587\u5b57\u63cf\u8ff0\u98ce\u683c|Use text description for style/).click()

    // Now TextStyleSelector should be visible
    await expect(page.getByText(/\u9884\u8bbe\u98ce\u683c：|Preset styles:/)).toBeVisible()
    // Apply button should appear
    await expect(page.getByText(/\u5e94\u7528\u98ce\u683c|Apply Style/)).toBeVisible()
  })

  test('clicking preset style fills textarea', async ({ page }) => {
    await setupMocks(page)
    await page.goto(`${BASE_URL}/project/mock-proj/preview`)
    await page.getByTestId('template-menu').click()
    await page.getByRole('button', { name: /\u66f4\u6362\u6a21\u677f|Change Template/ }).click()

    // Toggle to text style mode
    await page.getByText(/\u4f7f\u7528\u6587\u5b57\u63cf\u8ff0\u98ce\u683c|Use text description for style/).click()

    // Click first preset style button (Brief business / Business Simple)
    await page.getByText(/\u7b80\u7ea6\u5546\u52a1|Business Simple/).click()

    // Textarea should now contain the preset description
    await expect(page.getByRole('dialog').locator('textarea')).not.toHaveValue('')
  })
  test('closing modal without apply discards preset change', async ({ page }) => {
    await setupMocks(page)
    await page.goto(`${BASE_URL}/project/mock-proj/preview`)
    await page.getByTestId('template-menu').click()
    await page.getByRole('button', { name: /\u66f4\u6362\u6a21\u677f|Change Template/ }).click()

    // Toggle to text style, click a preset
    await page.getByText(/\u4f7f\u7528\u6587\u5b57\u63cf\u8ff0\u98ce\u683c|Use text description for style/).click()
    await page.getByText(/\u7b80\u7ea6\u5546\u52a1|Business Simple/).click()
    await expect(page.getByRole('dialog').locator('textarea')).not.toHaveValue('')

    // Close modal without clicking Apply
    await page.getByRole('button', { name: /^\u5173\u95ed$|^Close$/ }).first().click()
    await expect(page.getByText(/\u9884\u8bbe\u98ce\u683c：|Preset styles:/)).not.toBeVisible()

    // Reopen — toggle is still on, textarea should be empty (draft discarded)
    await page.getByTestId('template-menu').click()
    await page.getByRole('button', { name: /\u66f4\u6362\u6a21\u677f|Change Template/ }).click()
    await expect(page.getByRole('dialog').locator('textarea')).toHaveValue('')
  })
})

test.describe('Preview text style template - Integration tests', () => {
  let projectId: string

  test.beforeAll(async () => {
    const seeded = await seedProjectWithImages(BACKEND_URL, 1)
    projectId = seeded.projectId
  })

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('hasSeenHelpModal', 'true'))
  })

  test('apply text style persists and survives reload', async ({ page }) => {
    await page.goto(`${BASE_URL}/project/${projectId}/preview`)
    await page.waitForLoadState('networkidle')

    // Open template modal
    await page.getByTestId('template-menu').click()
    await page.getByRole('button', { name: /\u66f4\u6362\u6a21\u677f|Change Template/ }).click()

    // Toggle to text style mode
    await page.getByText(/\u4f7f\u7528\u6587\u5b57\u63cf\u8ff0\u98ce\u683c|Use text description for style/).click()

    // Type a custom style
    const textarea = page.getByRole('dialog').locator('textarea')
    await textarea.fill('E2E test custom style description')

    // Click apply
    await page.getByText(/\u5e94\u7528\u98ce\u683c|Apply Style/).click()

    // Modal should close
    await expect(page.getByText(/\u9884\u8bbe\u98ce\u683c：|Preset styles:/)).not.toBeVisible()

    // Reload and verify persistence
    await page.reload()
    await page.waitForLoadState('networkidle')

    // Reopen template modal and toggle to text style to verify saved value
    await page.getByTestId('template-menu').click()
    await page.getByRole('button', { name: /\u66f4\u6362\u6a21\u677f|Change Template/ }).click()
    await page.getByText(/\u4f7f\u7528\u6587\u5b57\u63cf\u8ff0\u98ce\u683c|Use text description for style/).click()
    await expect(page.getByRole('dialog').locator('textarea')).toHaveValue('E2E test custom style description')
  })
})
