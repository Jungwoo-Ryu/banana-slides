import { seedProjectWithImages } from './helpers/seed-project';
import { expect, test } from '@playwright/test';
test.use({ video: 'off', launchOptions: { channel: 'chrome' } });

// Run with scripts/verify_screenshot_issues.py: real HTTP/SQLite/tasks, fixture AI only.
test.skip(process.env.BANANA_ISSUE_FIXTURES !== '1', 'Requires the isolated issue verification runner');
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('hasSeenHelpModal', 'true');
    localStorage.setItem('banana-slides-language', 'zh');
  });
});

test('report form preserves input and sends edited prompt through real project and outline APIs', async ({ page, request }) => {
  await page.goto('/');
  const editor = page.locator('[contenteditable="true"]').first();
  await editor.fill('Free input drafts');
  await page.getByRole('button', { name: 'Daily debriefing', exact: true }).click();
  await expect(page.getByText('Please complete the subject and continue.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeDisabled();
  await page.getByLabel('Subject(s) (To be completed)）').fill('Project progress in October');
  await page.getByLabel('scene preset').selectOption('1');
  await page.getByLabel('Target audience').fill('Research and development team');
  await page.getByLabel('scene preset').selectOption('3');
  await expect(page.getByLabel('Target audience')).toHaveValue('Research and development team');
  await expect(editor).toContainText('Project progress in October');
  const finalPrompt = 'Theme： Project progress in October, reported to the R & D team. Only confirmed data are used。';
  await editor.fill(finalPrompt);
  await page.getByLabel('Additional requests').fill('Cannot overwrite manual preview');
  await expect(editor).toHaveText(finalPrompt);
  await page.getByRole('button', { name: 'Free input', exact: true }).click();
  await expect(editor).toHaveText('Free input drafts');
  await page.getByRole('button', { name: 'Daily debriefing', exact: true }).click();
  await expect(editor).toHaveText(finalPrompt);
  await page.getByRole('button', { name: '16:9', exact: true }).click();
  await page.getByRole('button', { name: '4:3', exact: true }).click();
  await page.screenshot({ path: '../output/issue-verification/report-form.png', fullPage: true });
  const created = page.waitForResponse(r => r.url().endsWith('/api/projects') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  const id = (await (await created).json()).data.project_id;
  try {
    await expect(page).toHaveURL(new RegExp(`/project/${id}/outline`));
    await expect.poll(async () => (await (await request.get(`/api/projects/${id}`)).json()).data.pages.length).toBe(1);
    await page.reload();
    const saved = (await (await request.get(`/api/projects/${id}`)).json()).data;
    expect(saved.idea_prompt).toBe(finalPrompt);
    expect(saved.image_aspect_ratio).toBe('4:3');
    await expect(page.locator('[contenteditable="true"]:visible').first()).toContainText('Project progress in October');
    await page.screenshot({ path: '../output/issue-verification/report.png', fullPage: true });
  } finally { await request.delete(`/api/projects/${id}`); }
});

test('Codex selection opens login, cancellation preserves provider, manual callback applies intended field', async ({ page }) => {
  const settings = await (await page.request.get('/api/settings')).json();
  await page.route('**/api/settings', route => route.request().method() === 'GET'
    ? route.fulfill({ json: { ...settings, data: { ...settings.data, ai_provider_format: 'gemini', openai_oauth_connected: false } } })
    : route.continue());
  await page.goto('/settings');
  const codex = page.getByRole('radio', { name: 'Codex (OpenAI OAuth)', exact: true });
  await expect(codex).toBeEnabled();
  await codex.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('button', { name: 'Login with OpenAI' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(codex).toHaveAttribute('aria-checked', 'false');
  await page.getByTestId('image_model_source-select').selectOption('codex');
  await expect(dialog).toBeVisible();
  await page.route('**/api/settings/openai-oauth/manual-callback', route => route.fulfill({ json: { success: true, data: { account_id: 'fixture-user' } } }));
  await dialog.getByRole('button', { name: /\u767b\u5f55\u540e\u8fde\u63a5\u5931\u8d25|Connection failed/ }).click();
  await dialog.locator('input').fill('http://localhost:1455/auth/callback?code=fixture&state=fixture');
  await dialog.getByRole('button', { name: /\u63d0\u4ea4|Submit/ }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByTestId('image_model_source-select')).toHaveValue('codex');
  await expect(codex).toHaveAttribute('aria-checked', 'false');
  await codex.click();
  await expect(codex).toHaveAttribute('aria-checked', 'true');
  await expect(dialog).not.toBeVisible();
});

test('OAuth popup opens synchronously before the delayed authorize response', async ({ page }) => {
  await page.goto('/settings');
  await page.getByRole('radio', { name: 'Codex (OpenAI OAuth)', exact: true }).click();
  let release: () => void = () => {};
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/settings/openai-oauth/authorize', async route => {
    await gate;
    await route.fulfill({ json: { success: true, data: { auth_url: `${new URL(page.url()).origin}/?oauth-fixture=1` } } });
  });
  const popupEvent = page.waitForEvent('popup');
  await page.getByRole('dialog').getByRole('button', { name: 'Login with OpenAI' }).click();
  const popup = await popupEvent;
  expect(popup.url()).toBe('about:blank');
  release();
  await expect(popup).toHaveURL(/oauth-fixture=1/);
  await popup.close();
  await expect(page.getByRole('button', { name: 'Login with OpenAI' })).toBeEnabled();
});

test('two material jobs run concurrently, survive closing/reopening and retain separate results', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto('/?action=material-generate');
  let dialog = page.getByRole('dialog', { name: 'Material toolbox' });
  const prompt = dialog.locator('textarea').first();
  await prompt.fill('slow first blue');
  const submitted = page.waitForResponse(r => r.url().endsWith('/materials/process') && r.request().method() === 'POST');
  await dialog.getByRole('button', { name: 'Implementation tool', exact: true }).click();
  expect((await submitted).ok()).toBeTruthy();
  await expect(dialog.getByRole('button', { name: 'Implementation tool', exact: true })).toBeEnabled();
  await prompt.fill('fast second green');
  await dialog.getByRole('button', { name: 'Implementation tool', exact: true }).click();
  const runs = page.getByTestId('material-runs');
  await expect(runs.getByRole('button', { name: /#2 fast second green/ })).toBeVisible();
  await expect(runs.getByRole('button', { name: /#1 slow first blue/ })).toContainText('Generating');
  await dialog.getByRole('button', { name: 'Close', exact: true }).last().click();
  await page.reload();
  await page.getByRole('button', { name: 'Material generation', exact: true }).first().click();
  dialog = page.getByRole('dialog', { name: 'Material toolbox' });
  await expect(runs.getByRole('button', { name: /#2 fast second green/ })).toContainText('Completed', { timeout: 15000 });
  await expect(runs.getByRole('button', { name: /#1 slow first blue/ })).toContainText('Completed', { timeout: 20000 });
  await runs.getByRole('button', { name: /#1 slow first blue/ }).click();
  const first = await dialog.getByAltText('Process result').getAttribute('src');
  await runs.getByRole('button', { name: /#2 fast second green/ }).click();
  const second = await dialog.getByAltText('Process result').getAttribute('src');
  expect(first).not.toBe(second);
  await expect(dialog.getByAltText('Process result')).toBeVisible();
  await dialog.locator('textarea').first().fill('fail third');
  await dialog.getByRole('button', { name: 'Implementation tool', exact: true }).click();
  await expect(runs.getByRole('button', { name: /#3 fail third/ })).toContainText('Failed', { timeout: 15000 });
  await expect(runs.getByRole('button', { name: /#1 slow first blue/ })).toContainText('Completed');
  await runs.scrollIntoViewIfNeeded();
  await dialog.screenshot({ path: '../output/issue-verification/materials.png' });
});

for (const [format, label] of [['pptx', 'Export As PPTX'], ['pdf', 'Export As PDF'], ['images', 'Export as Picture']]) {
  test(`delayed ${format} export downloads real bytes with popup opening blocked`, async ({ page, request, baseURL }) => {
    const { projectId } = await seedProjectWithImages(baseURL!, 1);
    try {
      await page.addInitScript(() => { window.open = () => { throw new Error('Popup blocked'); }; });
      await page.route(`**/api/projects/${projectId}/export/${format}**`, async route => {
        const response = await route.fetch();
        await new Promise(resolve => setTimeout(resolve, 5500));
        await route.fulfill({ response });
      });
      await page.goto(`/project/${projectId}/preview`);
      await page.locator('button:has-text("Export")').first().click();
      const downloading = page.waitForEvent('download');
      await page.getByRole('button', { name: label, exact: true }).click();
      if (format === 'pptx') await page.getByRole('button', { name: 'Start Export' }).click();
      const download = await downloading;
      expect(await download.failure()).toBeNull();
      const stream = await download.createReadStream();
      let size = 0;
      for await (const chunk of stream!) size += chunk.length;
      expect(size).toBeGreaterThan(100);
      expect(page.url()).toContain(`/project/${projectId}/preview`);
    } finally { await request.delete(`/api/projects/${projectId}`); }
  });
}

test('editable export without randomUUID sends a valid task ID and surfaces errors', async ({ page, request, baseURL }) => {
  const { projectId } = await seedProjectWithImages(baseURL!, 1);
  try {
    await page.addInitScript(() => Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true }));
    let taskId = '';
    await page.route(`**/api/projects/${projectId}/export/editable-pptx`, async route => {
      taskId = route.request().postDataJSON().client_task_id;
      await route.fulfill({ status: 400, json: { success: false, error: { message: 'Fixture export validation error' } } });
    });
    await page.goto(`/project/${projectId}/preview`);
    await page.locator('button:has-text("Export")').first().click();
    await page.getByRole('button', { name: /\u5bfc\u51fa\u53ef\u7f16\u8f91 PPTX/ }).click();
    await page.getByRole('button', { name: 'Start Export' }).click();
    await expect.poll(() => taskId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    await expect(page.getByText(/Fixture export validation error/).first()).toBeVisible();
  } finally { await request.delete(`/api/projects/${projectId}`); }
});

for (const multi of [false, true]) {
  test(`report entry preserves ${multi ? 'per-page' : 'single'} templates and reference files`, async ({ page, request }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Daily debriefing', exact: true }).click();
    await page.getByLabel('Subject(s) (To be completed)）').fill('Reporting with information and templates');
    const uploaded = page.waitForResponse(r => r.url().endsWith('/api/reference-files/upload') && r.request().method() === 'POST');
    await page.locator('input[type="file"][accept*=".txt"]').setInputFiles({ name: 'report-notes.txt', mimeType: 'text/plain', buffer: Buffer.from('Confirmed report evidence: milestone A completed.') });
    const fileResponse = await (await uploaded).json();
    const fileId = fileResponse.data.file_id || fileResponse.data.id;
    await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeEnabled({ timeout: 15000 });
    await page.getByAltText('A retroverse scroll.', { exact: true }).click();
    if (multi) await page.getByRole('checkbox', { name: /\u6bcf\u9875\u72ec\u7acb\u6a21\u677f/ }).check();
    const created = page.waitForResponse(r => r.url().endsWith('/api/projects') && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    const id = (await (await created).json()).data.project_id;
    try {
      await expect(page).toHaveURL(new RegExp(`/project/${id}/outline`));
      const saved = (await (await request.get(`/api/projects/${id}`)).json()).data;
      expect(saved.template_mode).toBe(multi ? 'multi' : 'single');
      if (!multi) expect(saved.template_image_url).toBeTruthy();
      const refs = (await (await request.get(`/api/reference-files/project/${id}`)).json()).data;
      expect(JSON.stringify(refs)).toContain('report-notes.txt');
      await page.reload();
      await expect(page.getByText('report-notes.txt').first()).toBeVisible();
    } finally {
      await request.delete(`/api/projects/${id}`);
      if (fileId) await request.delete(`/api/reference-files/${fileId}`);
    }
  });
}

test('global Codex login applies the selection and clears the previous APIMart default endpoint', async ({ page }) => {
  const base = await (await page.request.get('/api/settings')).json();
  await page.route('**/api/settings', route => route.fulfill({ json: {
    ...base, data: { ...base.data, ai_provider_format: 'openai', api_base_url: 'https://api.apimart.ai/v1', openai_oauth_connected: false },
  } }));
  await page.route('**/api/settings/openai-oauth/manual-callback', route => route.fulfill({ json: { success: true, data: { account_id: 'fixture-user' } } }));
  await page.goto('/settings');
  await page.getByRole('radio', { name: 'Codex (OpenAI OAuth)', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: /\u767b\u5f55\u540e\u8fde\u63a5\u5931\u8d25|Connection failed/ }).click();
  await dialog.locator('input').fill('http://localhost:1455/auth/callback?code=fixture&state=fixture');
  await dialog.getByRole('button', { name: 'Submit' }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('radio', { name: 'Codex (OpenAI OAuth)', exact: true })).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('radio', { name: /^OpenAI/ }).click();
  await expect(page.getByTestId('global-api-config-section').locator('input[type="text"]').first()).toHaveValue('');
});
