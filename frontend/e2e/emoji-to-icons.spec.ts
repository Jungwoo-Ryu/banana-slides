import { test, expect, type Page } from '@playwright/test';

/** Decorativeity of the First Page emoji Replaced lucide Icon / Just remove it, and avoid different platform fonts.。 */

async function openHome(page: Page) {
  await page.addInitScript(() => localStorage.setItem('hasSeenHelpModal', 'true'));
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(800);
}

/** Uploading a fake. pptx，Only to trigger a local state, no network requests will be issued. */
async function attachFakePptx(page: Page) {
  await page.locator('input[accept=".pdf,.pptx,.ppt"]').setInputFiles({
    name: 'demo.pptx',
    mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    buffer: Buffer.from('fake pptx for e2e'),
  });
}

test('tagline Organisation 🍌', async ({ page }) => {
  await openHome(page);
  const tagline = page.getByText(/nano banana pro/).first();
  await expect(tagline).toBeVisible();
  expect(await tagline.textContent()).not.toContain('🍌');
});

test('Upload pptx hint toast No, I don’t. 💡 Prefix', async ({ page }) => {
  await openHome(page);
  await page.getByRole('button', { name: /PPT \u7ffb\u65b0|PPT Renovation/ }).first().click();
  await page.waitForTimeout(400);

  await attachFakePptx(page);

  const toast = page.getByText(/\u5efa\u8bae\u5148\u5728\u672c\u5730\u5c06 PPTX \u8f6c\u4e3a PDF|recommend converting/i).first();
  await expect(toast).toBeVisible({ timeout: 10000 });
  expect(await toast.textContent()).not.toContain('💡');
});

test('Remove button for selected files is lucide Icon instead of ✕ Character', async ({ page }) => {
  await openHome(page);
  await page.getByRole('button', { name: /PPT \u7ffb\u65b0|PPT Renovation/ }).first().click();
  await page.waitForTimeout(400);

  await attachFakePptx(page);

  const chip = page.getByText('demo.pptx').first();
  await expect(chip).toBeVisible({ timeout: 10000 });

  // Remove button： the belt in the same container svg It’s... button
  const removeBtn = page
    .locator('button')
    .filter({ has: page.locator('svg.lucide-x') })
    .first();
  await expect(removeBtn).toBeVisible();
  expect(await removeBtn.textContent()).not.toContain('✕');

  // It should really remove it.
  await removeBtn.click();
  await expect(page.getByText('demo.pptx')).toHaveCount(0);
});
