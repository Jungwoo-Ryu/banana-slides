import { test, expect, type Page, type APIRequestContext } from '@playwright/test';

/**
 * Blank items to hide on outline page"Source text"Relevant UI，And can’t trigger the automatic creation of the outline.。
 * Every claim checks the opposite.（idea The project still shows) and avoids"The whole page is not loaded."It was miscalculated.。
 */

const STREAM_URL = '**/generate/outline/stream';

async function createProject(request: APIRequestContext, body: object): Promise<string> {
  const res = await request.post('/api/projects', { data: body });
  expect(res.ok()).toBeTruthy();
  const json = await res.json();
  return json.data.project_id;
}

/** Intercept outline flow generation, avoid. idea The control team really did. AI；Counting calls at the same time */
async function blockOutlineStream(page: Page): Promise<() => number> {
  let calls = 0;
  await page.route(STREAM_URL, async route => {
    calls += 1;
    await route.fulfill({ status: 200, contentType: 'text/event-stream', body: '' });
  });
  return () => calls;
}

async function openOutline(page: Page, projectId: string) {
  await page.addInitScript(() => localStorage.setItem('hasSeenHelpModal', 'true'));
  await page.goto(`/project/${projectId}/outline`);
  await page.waitForLoadState('domcontentloaded');
  // Waiting for the page to really render the outline page（"Add Page"It’s both.）
  await expect(page.getByRole('button', { name: /\u6dfb\u52a0\u9875\u9762|Add Page/ }).first()).toBeVisible({
    timeout: 15000,
  });
}

const genOutlineBtn = (page: Page) =>
  page.getByRole('button', { name: /\u81ea\u52a8\u751f\u6210\u5927\u7eb2|\u89e3\u6790\u5927\u7eb2|Auto Generate Outline|Parse Outline/ });

/**
 * Source text box： one for the desktop and one for the moving side, by CSS class Control Invisibility，
 * So the two dots are always there. DOM Lee. —— You have to."Visible"To be sure, we can’t count the numbers.。
 */
const sourceBoxes = (page: Page) => page.locator('[contenteditable="true"]:visible');

test.describe('Blank project outline page', () => {
  test('Hide source text boxes and generate outline buttons and do not automatically generate', async ({ page, request }) => {
    const calls = await blockOutlineStream(page);
    const id = await createProject(request, { creation_type: 'blank' });
    await openOutline(page, id);

    await expect(genOutlineBtn(page)).toHaveCount(0);
    await expect(sourceBoxes(page)).toHaveCount(0);

    // For auto-generated useEffect Adequate trigger time
    await page.waitForTimeout(2500);
    expect(calls()).toBe(0);
  });

  test('Contrast：idea The project still shows the source text box and generation button', async ({ page, request }) => {
    await blockOutlineStream(page);
    const id = await createProject(request, {
      creation_type: 'idea',
      idea_prompt: 'AI Development history',
    });
    await openOutline(page, id);

    await expect(genOutlineBtn(page).first()).toBeVisible();
    await expect(sourceBoxes(page).first()).toBeVisible();
  });

  test('Blank items under moving view also do not show source cards', async ({ page, request }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await blockOutlineStream(page);
    const id = await createProject(request, { creation_type: 'blank' });
    await openOutline(page, id);

    await expect(sourceBoxes(page)).toHaveCount(0);
    await expect(genOutlineBtn(page)).toHaveCount(0);
  });

  test('Contrast： Move side idea Project display source card', async ({ page, request }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await blockOutlineStream(page);
    const id = await createProject(request, {
      creation_type: 'idea',
      idea_prompt: 'AI Development history',
    });
    await openOutline(page, id);

    await expect(sourceBoxes(page).first()).toBeVisible();
  });

  test('Blank items to add pages manually', async ({ page, request }) => {
    await blockOutlineStream(page);
    const id = await createProject(request, { creation_type: 'blank' });
    await openOutline(page, id);

    await page.getByRole('button', { name: /\u6dfb\u52a0\u9875\u9762|Add Page/ }).first().click();

    // The page card uses： <input>，No, it’s not. contenteditable
    await expect(page.getByText(/\u7b2c\s*1\s*\u9875|Page\s*1/).first()).toBeVisible({ timeout: 10000 });
    // The source text box cannot come out after the page is added
    await expect(sourceBoxes(page)).toHaveCount(0);
  });
});

test.describe('Multiple Template Modes + Blank items', () => {
  test('Creating a blank project with multiple templates enabled navigates to multi', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('hasSeenHelpModal', 'true'));
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(800);

    let modeBody: any = null;
    await page.route('**/template-mode', async route => {
      modeBody = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, message: 'Success', data: {} }),
      });
    });

    await page.getByText(/\u6bcf\u9875\u72ec\u7acb\u6a21\u677f|Per-page templates/).first().click();
    await page
      .getByRole('button', { name: /\u6216\u4ece\u7a7a\u767d\u9879\u76ee\u5f00\u59cb|Or start from a blank project/ })
      .first()
      .click();

    await expect.poll(() => modeBody, { timeout: 20000 }).not.toBeNull();
    expect(modeBody.mode).toBe('multi');
  });
});
