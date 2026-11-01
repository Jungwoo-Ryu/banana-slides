import { test, expect, type Page } from '@playwright/test';

/**
 * createProject Now, it’s a priority to use a visible input. creation_type，Infer text fields only when default。
 * All the ways this path is created, so the three old ways must remain the same.。
 */

const CREATE_URL = '**/api/projects';

/** Intercept creation requests and return captured payload；Use it. mock Response to avoidance of real-life projects and follow-up AI Call */
async function capturePayload(page: Page, act: () => Promise<void>): Promise<any> {
  let body: any = null;
  await page.route(CREATE_URL, async route => {
    if (route.request().method() !== 'POST') return route.fallback();
    body = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        message: 'Success',
        data: { project_id: 'e2e-fake-id', status: 'DRAFT', pages: [] },
      }),
    });
  });
  await act();
  await expect.poll(() => body, { timeout: 15000 }).not.toBeNull();
  await page.unroute(CREATE_URL);
  return body;
}

async function openHome(page: Page) {
  // First visit will pop up"Fast start."Lead the missile window. It’ll block all hits below.
  await page.addInitScript(() => {
    localStorage.setItem('hasSeenHelpModal', 'true');
  });
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(800);
}

async function selectTab(page: Page, names: RegExp) {
  await page.getByRole('button', { name: names }).first().click();
  await page.waitForTimeout(300);
}

async function fillContent(page: Page, text: string) {
  // MarkdownTextarea Yes. contenteditable div，No, it’s not. <textarea>
  const box = page.locator('[contenteditable="true"]').first();
  await box.waitFor({ state: 'visible', timeout: 10000 });
  await box.click();
  await page.keyboard.insertText(text);
  // Wait. React state Sync (Submit button by) content.trim() Disarm disabled）
  await expect(
    page.getByRole('button', { name: /^(\u4e0b\u4e00\u6b65|Next)$/ }).first()
  ).toBeEnabled({ timeout: 10000 });
}

async function clickCreate(page: Page) {
  // The button to submit is common.next（"Next"），No, it’s not. home.actions.createProject
  await page
    .getByRole('button', { name: /^(\u4e0b\u4e00\u6b65|Next)$/ })
    .first()
    .click();
}

test.describe('creation_type Inference', () => {
  test('Generate a sentence -> idea', async ({ page }) => {
    await openHome(page);
    await selectTab(page, /\u4e00\u53e5\u8bdd\u751f\u6210|From Idea/);
    await fillContent(page, 'AI Development history');
    const body = await capturePayload(page, () => clickCreate(page));

    expect(body.creation_type).toBe('idea');
    expect(body.idea_prompt).toBe('AI Development history');
    expect(body.outline_text).toBeUndefined();
    expect(body.description_text).toBeUndefined();
  });

  test('Generate from Outline -> outline', async ({ page }) => {
    await openHome(page);
    await selectTab(page, /\u4ece\u5927\u7eb2\u751f\u6210|From Outline/);
    await fillContent(page, 'Page 1： Origin');
    const body = await capturePayload(page, () => clickCreate(page));

    expect(body.creation_type).toBe('outline');
    expect(body.outline_text).toBe('Page 1： Origin');
    expect(body.idea_prompt).toBeUndefined();
  });

  test('Generate from Description -> descriptions', async ({ page }) => {
    await openHome(page);
    await selectTab(page, /\u4ece\u63cf\u8ff0\u751f\u6210|From Description/);
    await fillContent(page, 'Page 1： Origin, right-hand map');
    const body = await capturePayload(page, () => clickCreate(page));

    // Watch out for the back end with a complex number. descriptions
    expect(body.creation_type).toBe('descriptions');
    expect(body.description_text).toBe('Page 1： Origin, right-hand map');
    expect(body.idea_prompt).toBeUndefined();
  });

  test('Blank items -> blank，and without any text fields', async ({ page }) => {
    await openHome(page);
    const body = await capturePayload(page, async () => {
      await page
        .getByRole('button', { name: /\u6216\u4ece\u7a7a\u767d\u9879\u76ee\u5f00\u59cb|Or start from a blank project/ })
        .first()
        .click();
    });

    expect(body.creation_type).toBe('blank');
    expect(body.idea_prompt).toBeUndefined();
    expect(body.outline_text).toBeUndefined();
    expect(body.description_text).toBeUndefined();
  });
});
