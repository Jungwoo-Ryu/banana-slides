/**
 * Aspect Ratio Lock - Integration E2E Test
 *
 * Uses real backend to verify aspect ratio lock when project has generated images.
 */
import { test, expect } from '@playwright/test'
import { seedProjectWithImages } from './helpers/seed-project'

const BASE = process.env.BASE_URL || 'http://localhost:3011'
const API = `http://localhost:${Number(new URL(BASE).port) + 2000}`

test.describe('Aspect ratio lock (integration)', () => {
  test.setTimeout(30_000)

  let projectId: string

  test('aspect ratio locked after images generated', async ({ page }) => {
    // Seed project with 1 page that has a real image
    const seeded = await seedProjectWithImages(API, 1)
    projectId = seeded.projectId

    await page.goto(`/project/${projectId}/preview`)
    await page.waitForLoadState('networkidle')

    // Open project settings
    const settingsBtn = page.locator('button').filter({ hasText: /\u8bbe\u7f6e|Settings/ }).first()
    await settingsBtn.click()

    // Verify locked state
    await expect(page.getByText(/\u5df2\u751f\u6210\u56fe\u7247\u7684\u9879\u76ee\u65e0\u6cd5\u8c03\u6574|Cannot change aspect ratio/)).toBeVisible()

    // All ratio buttons should be disabled
    for (const ratio of ['16:9', '4:3', '1:1', '9:16', '3:2']) {
      await expect(page.locator(`button:has-text("${ratio}")`).first()).toBeDisabled()
    }
  })
})
