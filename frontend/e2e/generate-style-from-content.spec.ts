import { test, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3011';

test.describe('Generate Style from Content E2E', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('hasSeenHelpModal', 'true'));
  });

  test('generates style from home content input and applies to text area', async ({ page }) => {
    // Mock the backend generate-style-from-content API
    await page.route((url) => url.pathname.startsWith('/api/generate-style-from-content'), async (route) => {
      const json = {
        success: true,
        message: 'Success',
        data: {
          style_description: 'Visual description： medically very simple technology。\n Colours and materials： plain white background（#FFFFFF），Emphasis on colored medical blues（#0284C7）。\n Content and layout： modern liner, modularized grid。\n illustrations and rendering requirements： vector draft illustrations。',
        },
      };
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(json),
      });
    });

    await page.goto(BASE_URL);

    // Turn on "Use text description style" (checkbox toggle)
    const toggle = page.getByText(/\u4f7f\u7528\u6587\u5b57\u63cf\u8ff0\u98ce\u683c|Use text description for style/);
    await toggle.scrollIntoViewIfNeeded();
    await toggle.click();

    // Try clicking "Generate style by content" without inputting content first
    const generateStyleBtn = page.getByRole('button', { name: /\u6839\u636e\u5185\u5bb9\u751f\u6210\u98ce\u683c|Generate from content/i });
    await expect(generateStyleBtn).toBeVisible();
    await generateStyleBtn.click();

    // Verify error toast for empty content
    await expect(page.locator('text=Please enter first PPT Theme or content, and generate style by content').or(page.locator('text=Please enter PPT topic or content first'))).toBeVisible();

    // Now type some content in the main idea/outline input (the first textbox on page)
    const contentInput = page.getByRole('textbox').first();
    await contentInput.fill('Smart medicine. AI Technical programmes of the ADS and landing practices');

    // Click "Generate style by content" again
    await generateStyleBtn.click();

    // Verify success toast
    await expect(page.locator('text=Style Generation Success').or(page.locator('text=Style generated successfully'))).toBeVisible();

    // Verify that the style textarea now has the generated style description
    const styleTextarea = page.locator('textarea[placeholder*="For example, a simple business style"], textarea[placeholder*="Describe your desired PPT style"]');
    await expect(styleTextarea).toHaveValue(/\u89c6\u89c9\u63cf\u8ff0：\u533b\u7597\u6781\u7b80\u79d1\u6280\u98ce/);
  });
});



