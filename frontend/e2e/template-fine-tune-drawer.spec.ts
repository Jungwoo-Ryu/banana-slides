/**
 * E2E: per-page template controls are gated by mode (spec §8.3).
 *
 * The project template library is multi-mode-only: it lives on
 * TemplateSetupPage, reachable from the SlidePreview header's "Template Configuration /
 * Template Setup" entry. In single mode that entry (and the whole library
 * concept) is absent — the only template control is "Convert to a separate template per page / Switch to
 * per-page". In multi mode the header exposes both the library entry and the
 * "Convert to Unified Template / Switch to unified" unifier.
 */
import { test, expect } from '@playwright/test'
import { seedProjectWithImages } from './helpers/seed-project'

const BASE_URL = process.env.BASE_URL || 'http://localhost:3011'
const BACKEND_URL = BASE_URL.replace(/:\d+$/, (m) => `:${parseInt(m.slice(1)) + 2000}`)

async function setMultiMode(projectId: string) {
  await fetch(`${BACKEND_URL}/api/projects/${projectId}/template-mode`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: 'multi' }),
  })
}

test.use({ viewport: { width: 1440, height: 900 } })

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('hasSeenHelpModal', 'true'))
})

test('single mode hides the template library entry', async ({ page }) => {
  const { projectId } = await seedProjectWithImages(BACKEND_URL, 1)

  await page.goto(`${BASE_URL}/project/${projectId}/preview`)
  await page.waitForLoadState('networkidle')

  // No library access in single mode (check inside the template menu).
  await page.getByTestId('template-menu').click()
  await expect(page.getByRole('button', { name: /\u6a21\u677f\u914d\u7f6e|Template Setup/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /\u8f6c\u4e3a\u7edf\u4e00\u6a21\u677f|Switch to unified/ })).toHaveCount(0)
  // Only the upgrade entry is present.
  await expect(page.getByRole('button', { name: /\u8f6c\u4e3a\u6bcf\u9875\u72ec\u7acb\u6a21\u677f|Switch to per-page/ })).toBeVisible()
})

test('multi mode exposes the full template library + unifier', async ({ page }) => {
  const { projectId } = await seedProjectWithImages(BACKEND_URL, 1)
  await setMultiMode(projectId)

  await page.goto(`${BASE_URL}/project/${projectId}/preview`)
  await page.waitForLoadState('networkidle')

  // Library entry + switch-to-single unifier both present (inside the template menu).
  await page.getByTestId('template-menu').click()
  await expect(page.getByRole('button', { name: /\u6a21\u677f\u914d\u7f6e|Template Setup/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /\u8f6c\u4e3a\u7edf\u4e00\u6a21\u677f|Switch to unified/ })).toBeVisible()
  // The single-mode upgrade entry is gone.
  await expect(page.getByRole('button', { name: /\u8f6c\u4e3a\u6bcf\u9875\u72ec\u7acb\u6a21\u677f|Switch to per-page/ })).toHaveCount(0)

  // Following the library entry reaches the setup page with the library.
  await page.getByRole('button', { name: /\u6a21\u677f\u914d\u7f6e|Template Setup/ }).click()
  await page.waitForURL(`**/project/${projectId}/template-setup`)
  await expect(page.getByText(/\u9879\u76ee\u6a21\u677f\u5e93|Project template library/)).toBeVisible()
})
