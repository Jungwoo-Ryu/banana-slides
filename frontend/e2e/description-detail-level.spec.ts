/**
 * E2E tests for description detail level selector.
 *
 * Mock tests: verify UI rendering, default selection, click behavior,
 * and that the correct detail_level is sent in API requests.
 *
 * Integration test: verify selector works with real backend.
 */
import { test, expect } from '@playwright/test'

const PROJECT_ID = 'mock-proj-detail-level'

function makePage(id: string, index: number, title: string, description?: string) {
  return {
    id,
    page_id: id,
    title,
    sort_order: index,
    order_index: index,
    status: description ? 'DESCRIPTION_GENERATED' : 'DRAFT',
    outline_content: { title, points: [`Point for ${title}`] },
    description_content: description ? { text: description } : null,
    generated_image_path: null,
  }
}

const pages = [
  makePage('p1', 0, 'Title Page'),
  makePage('p2', 1, 'Introduction'),
  makePage('p3', 2, 'Conclusion'),
]

async function setupMockRoutes(page: import('@playwright/test').Page) {
  // Mock access code check (required — AccessCodeGuard blocks rendering)
  await page.route('**/api/access-code/check', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: { enabled: false } }),
    })
  })

  // Mock project GET
  await page.route(`**/api/projects/${PROJECT_ID}`, async (route) => {
    if (route.request().method() !== 'GET') { await route.continue(); return }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          project_id: PROJECT_ID, id: PROJECT_ID,
          status: 'OUTLINE_GENERATED', creation_type: 'idea',
          pages,
        },
      }),
    })
  })

  // Mock reference files
  await page.route('**/api/projects/*/files*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: [] }),
    })
  })
}

test.describe('Detail level selector — mock tests', () => {
  test('renders selector with "standard" selected by default', async ({ page }) => {
    await setupMockRoutes(page)

    await page.goto(`/project/${PROJECT_ID}/detail`)
    await page.waitForSelector('text=Batch Generation Description')

    // The selector should be visible with 3 buttons
    const buttons = page.locator('button', { hasText: /\u7cbe\u7b80|\u6807\u51c6|\u8be6\u7ec6/ })
    await expect(buttons).toHaveCount(3)

    // "Standard" should have the active style (bg-banana-500)
    const standardBtn = page.locator('button', { hasText: 'Standard' })
    await expect(standardBtn).toHaveClass(/bg-banana-500/)
  })

  test('clicking a level option changes the selection', async ({ page }) => {
    await setupMockRoutes(page)

    await page.goto(`/project/${PROJECT_ID}/detail`)
    await page.waitForSelector('text=Batch Generation Description')

    // Click "Streamlining"
    const conciseBtn = page.locator('button', { hasText: 'Streamlining' })
    await conciseBtn.click()
    await expect(conciseBtn).toHaveClass(/bg-banana-500/)

    // "Standard" should no longer be active
    const standardBtn = page.locator('button', { hasText: 'Standard' })
    await expect(standardBtn).not.toHaveClass(/bg-banana-500/)

    // Click "Details"
    const detailedBtn = page.locator('button', { hasText: 'Details' })
    await detailedBtn.click()
    await expect(detailedBtn).toHaveClass(/bg-banana-500/)
    await expect(conciseBtn).not.toHaveClass(/bg-banana-500/)
  })

  test('batch generate sends correct detail_level in request', async ({ page }) => {
    await setupMockRoutes(page)

    // Capture the POST body
    let capturedBody: any = null
    await page.route('**/api/projects/*/generate/descriptions', async (route) => {
      capturedBody = JSON.parse(route.request().postData() || '{}')
      await route.fulfill({
        status: 202,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { task_id: 'mock-task-1' } }),
      })
    })

    // Mock task polling — immediately complete
    await page.route(`**/api/projects/${PROJECT_ID}/tasks/*`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: { task_id: 'mock-task-1', status: 'COMPLETED', progress: { total: 3, completed: 3 } },
        }),
      })
    })

    await page.goto(`/project/${PROJECT_ID}/detail`)
    await page.waitForSelector('text=Batch Generation Description')

    // Select "Details" then click batch generate
    await page.locator('button', { hasText: 'Details' }).click()
    await page.locator('button', { hasText: 'Batch Generation Description' }).click()

    // Wait for the request to be captured
    await expect.poll(() => capturedBody).toBeTruthy()
    expect(capturedBody.detail_level).toBe('detailed')
  })

  test('default detail_level is "default" when not changed', async ({ page }) => {
    await setupMockRoutes(page)

    let capturedBody: any = null
    await page.route('**/api/projects/*/generate/descriptions', async (route) => {
      capturedBody = JSON.parse(route.request().postData() || '{}')
      await route.fulfill({
        status: 202,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { task_id: 'mock-task-2' } }),
      })
    })

    await page.route(`**/api/projects/${PROJECT_ID}/tasks/*`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: { task_id: 'mock-task-2', status: 'COMPLETED', progress: { total: 3, completed: 3 } },
        }),
      })
    })

    await page.goto(`/project/${PROJECT_ID}/detail`)
    await page.waitForSelector('text=Batch Generation Description')

    await page.locator('button', { hasText: 'Batch Generation Description' }).click()

    await expect.poll(() => capturedBody).toBeTruthy()
    expect(capturedBody.detail_level).toBe('default')
  })
})
