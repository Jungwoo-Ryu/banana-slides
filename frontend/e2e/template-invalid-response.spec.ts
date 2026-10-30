import { test, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3208';

test.describe('Template invalid response handling', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('hasSeenHelpModal', 'true'));

    await page.route('**/api/access-code/check', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { required: false, enabled: false } }),
      });
    });

    await page.route('**/api/settings', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: {} }),
      });
    });

    await page.route('**/api/user-templates', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { templates: [] } }),
      });
    });
  });

  test('blocks project creation when a selected preset template is not an image', async ({ page }) => {
    let projectCreateCalls = 0;

    await page.route('**/templates/template_y.png', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<html>not an image</html>',
      });
    });

    await page.route('**/api/projects', async (route) => {
      if (route.request().method() === 'POST') {
        projectCreateCalls += 1;
      }
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ success: false, message: 'Project creation should not be called' }),
      });
    });

    await page.goto(BASE_URL);

    await page.getByRole('textbox').fill('Generate a presentation on template validation');
    await page.getByAltText(/\u590d\u53e4\u5377\u8f74|Retro Scroll/).click();
    await page.getByRole('button', { name: /\u4e0b\u4e00\u6b65|Next/ }).click();

    await expect(page.getByText(/\u52a0\u8f7d\u6a21\u677f\u5931\u8d25|Failed to load the template/)).toBeVisible();
    expect(projectCreateCalls).toBe(0);
  });
});
