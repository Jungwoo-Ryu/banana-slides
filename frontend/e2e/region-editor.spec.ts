import { expect, test, type Page, type APIRequestContext } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const root = path.resolve('..');
const python = path.join(root, process.platform === 'win32' ? '.venv/Scripts/python.exe' : '.venv/bin/python');

async function fixture(request: APIRequestContext) {
  const created = await request.post('/api/projects', { data: { creation_type: 'idea', idea_prompt: 'Region editor regression' } });
  expect(created.ok()).toBeTruthy();
  const id = (await created.json()).data.project_id;
  const added = await request.post(`/api/projects/${id}/pages`, { data: { order_index: 0, outline_content: { title: '영역 편집', points: [] } } });
  expect(added.ok()).toBeTruthy();
  const state = (await (await request.get(`/api/projects/${id}`)).json()).data;
  const pageId = state.pages[0].page_id;
  execFileSync(python, [path.join(root, 'scripts/seed_local_e2e.py'), id, pageId]);
  return { id, pageId };
}

async function draw(page: Page, x: number, y: number, width: number, height: number) {
  const canvas = page.getByTestId('region-editor-canvas');
  await canvas.scrollIntoViewIfNeeded();
  const box = (await canvas.boundingBox())!;
  const scale = Math.min(box.width / 1280, box.height / 720);
  const left = box.x + (box.width - 1280 * scale) / 2;
  const top = box.y + (box.height - 720 * scale) / 2;
  await page.mouse.move(left + x * scale, top + y * scale);
  await page.mouse.down();
  await page.mouse.move(left + (x + width) * scale, top + (y + height) * scale, { steps: 8 });
  await page.mouse.up();
}

async function expectRegion(page: Page, values: number[]) {
  for (const [index, label] of ['X 좌표', 'Y 좌표', '너비', '높이'].entries()) {
    await expect(page.getByRole('spinbutton', { name: label, exact: true })).toHaveValue(String(values[index]));
  }
}

test('precise region moves, resizes and survives viewport changes; submission uses the latest pixels', async ({ page, request }, info) => {
  const { id, pageId } = await fixture(request);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(`/project/${id}/preview`);
    await page.getByTestId('preview-floating-toolbar').getByRole('button', { name: '편집', exact: true }).click();
    await expect(page.getByTestId('region-editor')).toContainText('1280 × 720 px');
    await draw(page, 160, 120, 480, 240);
    await expectRegion(page, [160, 120, 480, 240]);
    await expect(page.getByTestId('inline-edit-attachment-thumb')).toHaveCount(0);
    await page.getByRole('spinbutton', { name: '너비', exact: true }).fill('400');
    await page.getByRole('spinbutton', { name: '너비', exact: true }).press('Enter');
    await page.getByTestId('region-selection').focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Shift+ArrowDown');
    await expectRegion(page, [161, 130, 400, 240]);

    const scale = (await page.getByTestId('region-editor-canvas').boundingBox())!.width / 1280;
    const handle = await page.getByRole('button', { name: '선택 영역 크기 조절: 오른쪽 아래', exact: true }).boundingBox();
    await page.mouse.move(handle!.x + handle!.width / 2, handle!.y + handle!.height / 2);
    await page.mouse.down();
    await page.mouse.move(handle!.x + handle!.width / 2 + 100 * scale, handle!.y + handle!.height / 2 + 50 * scale);
    await page.mouse.up();
    await expectRegion(page, [161, 130, 500, 290]);
    const selection = (await page.getByTestId('region-selection').boundingBox())!;
    await page.mouse.move(selection.x + selection.width / 2, selection.y + selection.height / 2);
    await page.mouse.down();
    await page.mouse.move(selection.x + selection.width / 2 + 40 * scale, selection.y + selection.height / 2 - 20 * scale);
    await page.mouse.up();
    await expectRegion(page, [201, 110, 500, 290]);
    await page.screenshot({ path: info.outputPath('region-desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 1200, height: 900 });
    await expectRegion(page, [201, 110, 500, 290]);
    await draw(page, 1000, 600, -200, -120);
    await expectRegion(page, [800, 480, 200, 120]);
    await page.keyboard.press('Escape');
    await page.getByTestId('preview-floating-toolbar').getByRole('button', { name: '편집', exact: true }).click();
    await expectRegion(page, [800, 480, 200, 120]);

    // Retry a real browser multipart request without invoking a paid model.
    const payloads: Buffer[] = [];
    await page.route(`**/api/projects/${id}/pages/${pageId}/edit/image`, async route => {
      payloads.push(route.request().postDataBuffer()!);
      await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ success: false, error: { message: '영역 편집 재시도 검증' } }) });
    });
    await page.getByTestId('inline-edit-prompt').fill('선택한 제목 색상을 변경하세요.');
    await page.getByTestId('inline-edit-prompt').press('Control+Enter');
    await expect.poll(() => payloads.length).toBe(1);
    const payload = payloads[0];
    expect(payload.toString()).toContain('x=800, y=480, width=200, height=120');
    expect(payload.toString().match(/filename="selected-region-/g)).toHaveLength(1);
    const png = payload.indexOf(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    expect(png).toBeGreaterThan(0);
    expect(payload.readUInt32BE(png + 16)).toBe(200);
    expect(payload.readUInt32BE(png + 20)).toBe(120);
    await expectRegion(page, [800, 480, 200, 120]);
    await expect(page.getByTestId('inline-edit-attachment-thumb')).toHaveCount(0);
    await expect(page.getByText('영역 편집 재시도 검증', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '선택 해제', exact: true }).click();
    await expect(page.getByTestId('region-selection')).toHaveCount(0);
    await page.getByTestId('inline-edit-prompt').press('Control+Enter');
    await expect.poll(() => payloads.length).toBe(2);
    expect(JSON.parse(payloads[1].toString()).edit_instruction).toBe('선택한 제목 색상을 변경하세요.');
    expect(errors).toEqual([]);
  } finally { await request.delete(`/api/projects/${id}`); }
});

test('mobile modal maps letterboxed original pixels and supports touch selection', async ({ page, request }, info) => {
  const { id } = await fixture(request);
  try {
    // The original stays 1280×720 while the project preview uses a square canvas.
    expect((await request.put(`/api/projects/${id}`, { data: { image_aspect_ratio: '1:1' } })).ok()).toBeTruthy();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/project/${id}/preview`);
    await page.getByRole('button', { name: '편집', exact: true }).filter({ visible: true }).click();
    const editor = page.getByTestId('region-editor');
    await expect(editor).toContainText('1280 × 720 px');
    const canvas = page.getByTestId('region-editor-canvas');
    await canvas.scrollIntoViewIfNeeded();
    const box = (await canvas.boundingBox())!;
    const scale = box.width / 1280;
    const top = box.y + (box.height - 720 * scale) / 2;
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + 200 * scale, y: top + 150 * scale }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: box.x + 600 * scale, y: top + 450 * scale }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expectRegion(page, [200, 150, 400, 300]);
    await page.getByRole('spinbutton', { name: '높이', exact: true }).fill('9999');
    await page.getByRole('spinbutton', { name: '높이', exact: true }).press('Enter');
    await expectRegion(page, [200, 150, 400, 570]);
    await page.screenshot({ path: info.outputPath('region-mobile.png'), fullPage: true });
    await page.getByRole('button', { name: '선택 해제', exact: true }).click();
    // Letterbox space cannot start a region.
    await page.mouse.move(box.x + 30, box.y + 10);
    await page.mouse.down(); await page.mouse.move(box.x + 70, box.y + 30); await page.mouse.up();
    await expect(page.getByTestId('region-selection')).toHaveCount(0);
  } finally { await request.delete(`/api/projects/${id}`); }
});
