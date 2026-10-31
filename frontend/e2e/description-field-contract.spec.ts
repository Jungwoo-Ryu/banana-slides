import { test, expect } from '@playwright/test';

/**
 * Page description field compacts v2 End-to-end authentication。
 *
 * Mock Test Validation Frontend UI logic; integration tests play real backend and real AI，
 * Validate outline theory, description field, preservation retrospect, biography extraction, fine-fixing field full data stream。
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:3223';

const NEW_FIELDS = ['Visual assets', 'Layout and emphasis', 'Speaker notes'];
const LEGACY_FIELDS = ['Visual elements', 'Visual focus', 'Page layout'];

async function createProjectWithPages(page: import('@playwright/test').Page, prompt: string, titles: string[]) {
  const resp = await page.request.post(`${BASE_URL}/api/projects`, {
    data: { creation_type: 'idea', idea_prompt: prompt },
  });
  const projectId = (await resp.json()).data?.project_id;
  expect(projectId).toBeTruthy();

  for (let i = 0; i < titles.length; i++) {
    await page.request.post(`${BASE_URL}/api/projects/${projectId}/pages`, {
      data: {
        order_index: i,
        outline_content: { title: titles[i], points: [`Key points ${i + 1}`] },
        status: 'DRAFT',
      },
    });
  }
  await page.request.put(`${BASE_URL}/api/projects/${projectId}`, {
    data: { status: 'OUTLINE_GENERATED' },
  });
  return projectId;
}

async function setPageDescription(
  page: import('@playwright/test').Page,
  projectId: string,
  pageId: string,
  description_content: Record<string, unknown>,
) {
  const resp = await page.request.put(
    `${BASE_URL}/api/projects/${projectId}/pages/${pageId}/description`,
    { data: { description_content } },
  );
  expect(resp.ok()).toBeTruthy();
}

async function getPages(page: import('@playwright/test').Page, projectId: string) {
  const resp = await page.request.get(`${BASE_URL}/api/projects/${projectId}`);
  return (await resp.json()).data?.pages || [];
}

// ===== Mock Test： Frontend UI Logical =====

test.describe('Field Compacts - Mock', () => {
  test('Default field capsule displays three new positive fields', async ({ page }) => {
    await page.route('**/api/settings', async (route) => {
      if (route.request().method() !== 'GET') return route.continue();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            description_generation_mode: 'streaming',
            description_extra_fields: NEW_FIELDS,
            image_prompt_extra_fields: ['Visual assets', 'Layout and emphasis'],
          },
        }),
      });
    });

    const projectId = await createProjectWithPages(page, 'Field capsule testing', ['Page I']);
    await page.goto(`${BASE_URL}/project/${projectId}/detail`);
    await page.waitForLoadState('networkidle');

    const gearBtn = page.locator('button[title="Description Settings"], button[title="Description Settings"]');
    await gearBtn.click();

    for (const field of NEW_FIELDS) {
      await expect(page.locator('button').filter({ hasText: field }).first()).toBeVisible({ timeout: 5000 });
    }
    // Decommissioned fields should not appear in the default capsule
    for (const legacy of LEGACY_FIELDS) {
      await expect(page.locator('button').filter({ hasText: new RegExp(`^${legacy}$`) })).toHaveCount(0);
    }
  });

  test('The old field name of the stock page is displayed as usual', async ({ page }) => {
    const projectId = await createProjectWithPages(page, 'Old Field Compatibility', ['Page I']);
    const pages = await getPages(page, projectId);

    await setPageDescription(page, projectId, pages[0].page_id, {
      text: 'Text',
      extra_fields: { 'Visual elements': 'Key indicators card', 'Page layout': 'Left Right Chart' },
    });

    await page.goto(`${BASE_URL}/project/${projectId}/detail`);
    await page.waitForLoadState('networkidle');

    await expect(page.locator('text=Visual elements')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=Key indicators card')).toBeVisible();
    await expect(page.locator('text=Page layout')).toBeVisible();
    await expect(page.locator('text=Left Right Chart')).toBeVisible();
  });
});

// ===== Integrated Test： Real Backend =====

test.describe('Field Compacts - Integration', () => {
  test('New field saves and refreshs and disappears.', async ({ page }) => {
    const projectId = await createProjectWithPages(page, 'Field Endurance', ['Page I']);
    const pages = await getPages(page, projectId);
    const pageId = pages[0].page_id;

    await setPageDescription(page, projectId, pageId, {
      text: 'Text',
      extra_fields: { 'Visual assets': 'Line chart： three years of growth', 'Layout and emphasis': 'Left right; trend map focused' },
    });

    await page.goto(`${BASE_URL}/project/${projectId}/detail`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=Line chart： three years of growth')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=Left right; trend map focused')).toBeVisible();

    // Change a field and save it by editing a bullet window
    await page.locator('button').filter({ hasText: /\u7f16\u8f91|Edit/ }).first().click();
    const dialog = page.getByRole('dialog');
    // Main field label should have been renamed「SLIDE_TEXT」，Field blocks arranged according to configuration order
    await expect(dialog.getByText('SLIDE_TEXT', { exact: true })).toBeVisible({ timeout: 5000 });
    await expect(dialog.getByText('Visual assets', { exact: true })).toBeVisible();
    await expect(dialog.getByText('Layout and emphasis', { exact: true })).toBeVisible();

    // Enter Box Order：0=SLIDE_TEXT 1=Visual assets 2=Layout and emphasis
    const layoutBox = dialog.getByRole('textbox').nth(2);
    await expect(layoutBox).toHaveText('Left right; trend map focused', { timeout: 5000 });
    // contenteditable Component：insertText It’s the only way to get to the components. onChange（keyboard.type Unreliable for Chinese）
    await layoutBox.click();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.insertText('medium-sized title; title of focus');
    // Refresh when the saving request is really complete, or else reload I’ll take it. PUT Before
    const savePromise = page.waitForResponse(
      (r) => r.url().includes('/description') && r.request().method() === 'PUT' && r.ok(),
    );
    await page.locator('button').filter({ hasText: /^\u4fdd\u5b58$|^Save$/ }).click();
    await savePromise;

    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=medium-sized title; title of focus')).toBeVisible({ timeout: 5000 });

    // Enduring to the back end, not just the front-end state
    const after = await getPages(page, projectId);
    expect(after[0].description_content.extra_fields['Layout and emphasis']).toBe('medium-sized title; title of focus');

    // Empty fields and disappear from the card
    await setPageDescription(page, projectId, pageId, { text: 'Text' });
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=medium-sized title; title of focus')).toHaveCount(0);
  });

  test('Real. AI：The first point on the outline page is the sentence.', async ({ page }) => {
    test.setTimeout(240000);

    const resp = await page.request.post(`${BASE_URL}/api/projects`, {
      data: { creation_type: 'idea', idea_prompt: 'Analyzing the causes and revelations of three winters of artificial intelligence.，6 Page' },
    });
    const projectId = (await resp.json()).data?.project_id;

    const genResp = await page.request.post(
      `${BASE_URL}/api/projects/${projectId}/generate/outline`,
      { data: {}, timeout: 180000 },
    );
    expect(genResp.ok()).toBeTruthy();

    // Query until outline library
    let pages: any[] = [];
    for (let i = 0; i < 60; i++) {
      pages = await getPages(page, projectId);
      if (pages.length > 1 && pages.every((p) => p.outline_content?.points?.length)) break;
      await page.waitForTimeout(3000);
    }
    expect(pages.length).toBeGreaterThan(1);

    // The first point of the content page (jumping cover) should be a full statement, not a short topic phrase
    const contentPages = pages.slice(1);
    const firstPoints = contentPages.map((p) => p.outline_content.points[0] as string);
    console.log('First point of the outline：\n' + firstPoints.map((s, i) => `  ${i + 2}. ${s}`).join('\n'));

    const assertionLike = firstPoints.filter((s) => s && s.length >= 12);
    expect(assertionLike.length).toBeGreaterThanOrEqual(Math.ceil(contentPages.length * 0.7));
  });

  test('Real. AI：Generate descriptions with new fields and without text Image assets Paragraph', async ({ page }) => {
    test.setTimeout(300000);

    const projectId = await createProjectWithPages(page, 'SaaS Product Quarterly Rewinding', ['Overview of operations', 'Growth attribution']);

    const genResp = await page.request.post(
      `${BASE_URL}/api/projects/${projectId}/generate/descriptions`,
      { data: {}, timeout: 240000 },
    );
    expect(genResp.ok()).toBeTruthy();

    let pages: any[] = [];
    for (let i = 0; i < 80; i++) {
      pages = await getPages(page, projectId);
      if (pages.every((p) => p.description_content?.text)) break;
      await page.waitForTimeout(3000);
    }

    const withFields = pages.filter((p) => p.description_content?.extra_fields);
    console.log('Description Fields：', JSON.stringify(pages.map((p) => Object.keys(p.description_content?.extra_fields || {}))));
    expect(withFields.length).toBeGreaterThan(0);

    for (const p of pages) {
      // Field lines cannot be left behind SLIDE_TEXT , or you will be rendered word for word on the slide
      expect(p.description_content.text).not.toContain('Image assets：');
      expect(p.description_content.text).not.toContain('Visual assets：');
      expect(p.description_content.text).not.toContain('Layout and emphasis：');
    }

    const allFieldNames = new Set(pages.flatMap((p) => Object.keys(p.description_content?.extra_fields || {})));
    console.log('Former field name：', [...allFieldNames].join(', '));
    expect([...allFieldNames].some((n) => NEW_FIELDS.includes(n))).toBeTruthy();

    await page.goto(`${BASE_URL}/project/${projectId}/detail`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=Visual assets').or(page.locator('text=Layout and emphasis')).first()).toBeVisible({ timeout: 10000 });
  });

  test('Real. AI：Precision description does not lose extra fields', async ({ page }) => {
    test.setTimeout(240000);

    const projectId = await createProjectWithPages(page, 'Precautionary Fields', ['Market opportunities']);
    const pages = await getPages(page, projectId);
    await setPageDescription(page, projectId, pages[0].page_id, {
      text: 'SLIDE_TEXT：\n- Three years of high market growth.',
      extra_fields: { 'Visual assets': 'Line chart： growth curve', 'Layout and emphasis': 'Left Right Chart' },
    });

    const refineResp = await page.request.post(
      `${BASE_URL}/api/projects/${projectId}/refine/descriptions`,
      { data: { user_requirement: 'Make the text simpler.' }, timeout: 180000 },
    );
    expect(refineResp.ok()).toBeTruthy();

    const after = await getPages(page, projectId);
    const content = after[0].description_content;
    console.log('I’m fine.：', JSON.stringify(content));

    // Critical Return： Field must remain extra_fields It’s not blended in. SLIDE_TEXT
    expect(content.extra_fields).toBeTruthy();
    expect(Object.keys(content.extra_fields).length).toBeGreaterThan(0);
    expect(content.text).not.toContain('Visual assets：');
    expect(content.text).not.toContain('Layout and emphasis：');
  });

  test('Real living maps： references to material in the frame fields are still extracted as reference maps', async ({ page }) => {
    test.setTimeout(420000);

    const projectId = await createProjectWithPages(page, 'Material extraction links', ['Pages']);
    const pages = await getPages(page, projectId);

    // Upload a map of the material. Got it. /files/ Path
    const uploadResp = await page.request.post(`${BASE_URL}/api/projects/${projectId}/materials/upload`, {
      multipart: {
        file: {
          name: 'material.png',
          mimeType: 'image/png',
          buffer: Buffer.from(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
            'base64',
          ),
        },
      },
    });
    expect(uploadResp.ok()).toBeTruthy();
    const materialUrl = (await uploadResp.json()).data?.url || (await uploadResp.json()).data?.file_path;
    console.log('Materials URL：', materialUrl);

    // It’s written in the material quote"Visual assets"Fields (new contract), not text
    await setPageDescription(page, projectId, pages[0].page_id, {
      text: 'SLIDE_TEXT：\n- Material presentation page',
      extra_fields: { 'Visual assets': `![Materials](${materialUrl})` },
    });

    // The living chart requires a template or style description of the project
    await page.request.put(`${BASE_URL}/api/projects/${projectId}`, {
      data: { template_style: 'Clean business style, white-bottom blue emphasis on color.' },
    });

    const genResp = await page.request.post(
      `${BASE_URL}/api/projects/${projectId}/generate/images`,
      { data: {}, timeout: 360000 },
    );
    expect(genResp.ok(), await genResp.text()).toBeTruthy();

    let imaged: any[] = [];
    for (let i = 0; i < 60; i++) {
      imaged = await getPages(page, projectId);
      if (imaged.every((p) => p.generated_image_url)) break;
      await page.waitForTimeout(4000);
    }
    console.log('Results of the biograph：', imaged.map((p) => p.generated_image_url).join(', '));
    // Photo output attests「It’s written in the material quote Visual assets Fields」I can still walk the road to life map.
    expect(imaged[0].generated_image_url).toBeTruthy();

    // The material must really be identified as a reference map： the backend log will record the number of images taken
    const imageResp = await page.request.get(imaged[0].generated_image_url.startsWith('http')
      ? imaged[0].generated_image_url
      : `${BASE_URL}${imaged[0].generated_image_url}`);
    expect(imageResp.ok()).toBeTruthy();
    expect(Number(imageResp.headers()['content-length'] || '0')).toBeGreaterThan(1000);
  });
});
