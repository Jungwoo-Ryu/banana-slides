import { expect, type Page } from '@playwright/test'

/** Export through the real UI and capture the browser's attachment download. */
export async function downloadPptx(page: Page) {
  const exportButton = page.getByRole('button', { name: 'Export', exact: true })
  await expect(exportButton).toBeEnabled()
  await exportButton.click()
  await page.getByRole('button', { name: 'Export As PPTX', exact: true }).click()
  await expect(page.getByText('PPTX Export Settings')).toBeVisible()

  // Downloads belong to Page, not BrowserContext. Arm the listener before the
  // click so even an immediately available export cannot race past it.
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 60_000 }),
    page.getByRole('button', { name: 'Start Export', exact: true }).click(),
  ])
  return download
}
