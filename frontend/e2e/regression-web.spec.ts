import { test, expect, type APIRequestContext } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
const root = path.resolve('..');
const python = path.join(root, process.platform === 'win32' ? '.venv/Scripts/python.exe' : '.venv/bin/python');
const project = async (request: APIRequestContext, id: string) => (await (await request.get(`/api/projects/${id}`)).json()).data;
async function task(request: APIRequestContext, id: string, taskId: string) {
  await expect.poll(async () => {
    const result = (await (await request.get(`/api/projects/${id}/tasks/${taskId}`)).json()).data;
    if (result.status === 'FAILED') throw new Error(JSON.stringify(result));
    return result.status;
  }, { timeout: 45000 }).toBe('COMPLETED');
}

test('real backend generation: SSE, scripts, image editing, version restore and all static exports', async ({ page, request }, info) => {
  test.skip(process.env.SOLA_E2E_VIDEO !== '1', 'Requires the loopback Azure protocol fixture');
  test.setTimeout(100000);
  const modelLog = path.join(process.env.SOLA_E2E_FOLDER!, 'model-requests.jsonl');
  const previousRequests = existsSync(modelLog) ? readFileSync(modelLog, 'utf8').trim().split('\n').filter(Boolean).length : 0;
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  const created = await request.post('/api/projects', { data: { creation_type: 'idea', idea_prompt: '회귀 검증용 두 페이지 발표', template_style: 'REGRESSION_DESIGN: navy and gold' } });
  expect(created.ok()).toBeTruthy(); const id = (await created.json()).data.project_id;
  try {
    await page.goto(`/project/${id}/outline`);
    await expect.poll(async () => (await project(request, id)).pages.length, { timeout: 20000 }).toBe(2);
    await expect(page.getByText('회귀 검증 1', { exact: true }).first()).toBeVisible();
    await page.getByRole('button', { name: '다음', exact: true }).click();
    await expect(page).toHaveURL(/\/detail/);
    await page.getByRole('button', { name: '설명 일괄 생성', exact: true }).click();
    await expect.poll(async () => (await project(request, id)).pages.filter((p: any) => p.narration_text).length, { timeout: 20000 }).toBe(2);
    await expect(page.getByTestId('slide-narration-input').first()).toHaveValue('1번 슬라이드의 자동 생성 발표 대본입니다.');
    await page.getByRole('button', { name: '이미지 생성', exact: true }).click();
    await page.getByRole('button', { name: /이미지 일괄 생성/ }).click();
    await expect.poll(async () => (await project(request, id)).pages.filter((p: any) => p.generated_image_url).length, { timeout: 45000 }).toBe(2);
    const first = (await project(request, id)).pages[0];
    const versionsUrl = `/api/projects/${id}/pages/${first.page_id}/image-versions`;
    const original = (await (await request.get(versionsUrl)).json()).data.versions[0];
    const originalImage = await (await request.get(original.image_url)).body();
    await page.reload();
    await page.getByTestId('preview-floating-toolbar').getByRole('button', { name: '편집', exact: true }).click();
    await page.getByTestId('inline-edit-prompt').fill('제목 색상을 청록색으로 변경하세요.');
    const submitted = page.waitForResponse(r => r.url().endsWith('/edit/image') && r.request().method() === 'POST');
    await page.getByTestId('inline-edit-prompt').press('Control+Enter');
    const edited = await submitted; expect(edited.status()).toBe(202);
    await task(request, id, (await edited.json()).data.task_id);
    const versions = (await (await request.get(versionsUrl)).json()).data.versions;
    expect(versions).toHaveLength(2);
    expect(Buffer.compare(await (await request.get(versions.find((v: any) => v.is_current).image_url)).body(), originalImage)).not.toBe(0);
    expect((await request.post(`${versionsUrl}/${original.version_id}/set-current`)).ok()).toBeTruthy();
    const restored = (await (await request.get(versionsUrl)).json()).data.versions.find((v: any) => v.is_current);
    expect(restored.version_id).toBe(original.version_id);
    expect(Buffer.compare(await (await request.get(restored.image_url)).body(), originalImage)).toBe(0);

    for (const format of ['pptx', 'pdf', 'images']) {
      const result = await request.get(`/api/projects/${id}/export/${format}`);
      expect(result.ok(), await result.text()).toBeTruthy();
      const url = (await result.json()).data.download_url;
      const downloaded = await request.get(url); expect(downloaded.ok()).toBeTruthy();
      const file = info.outputPath(path.basename(url)); writeFileSync(file, await downloaded.body());
      const validation = format === 'pptx' ? 'from pptx import Presentation; assert len(Presentation(p).slides)==2' : format === 'pdf' ? 'import fitz; assert len(fitz.open(p))==2' : 'import zipfile; z=zipfile.ZipFile(p); assert len(z.namelist())==2; assert z.testzip() is None';
      execFileSync(python, ['-c', 'import sys; p=sys.argv[1]; ' + validation, file]);
    }
    const logs = readFileSync(modelLog, 'utf8').trim().split('\n').slice(previousRequests).map(l => JSON.parse(l));
    const images = logs.filter(l => l.path.includes('/images/') && l.prompt.includes('REGRESSION_DESIGN'));
    expect(images.length).toBeGreaterThanOrEqual(2);
    expect(images.every(l => !l.prompt.includes('자동 생성 발표 대본'))).toBe(true);
    expect(logs.some(l => l.path.endsWith('/images/edits') && l.references > 0)).toBe(true);
    expect(logs.filter(l => l.stream).length).toBeGreaterThanOrEqual(2);
    expect(errors).toEqual([]);
  } finally { await request.delete(`/api/projects/${id}`); }
});

test('PDF template upload splits, analyzes, binds and generates a slide through Azure vision', async ({ page, request }) => {
  test.skip(process.env.SOLA_E2E_VIDEO !== '1', 'Requires the loopback Azure protocol fixture');
  const created = await request.post('/api/projects', { data: { creation_type: 'blank' } });
  const id = (await created.json()).data.project_id;
  try {
    const upload = await request.post(`/api/projects/${id}/template-assets/upload-pdf`, { multipart: { pdf: { name: '검증 템플릿.pdf', mimeType: 'application/pdf', buffer: readFileSync('e2e/fixtures/test-3-page.pdf') } } });
    expect(upload.status()).toBe(202); await task(request, id, (await upload.json()).data.task_id);
    const assets = async () => (await (await request.get(`/api/projects/${id}/template-assets`)).json()).data.assets;
    await expect.poll(async () => (await assets()).filter((a: any) => a.analysis_status === 'completed').length, { timeout: 45000 }).toBe(3);
    const asset = (await assets())[0];
    const added = await request.post(`/api/projects/${id}/pages`, { data: { order_index: 0, outline_content: { title: 'PDF 템플릿 검증' }, description_content: { text: '템플릿에 맞춘 내용' } } });
    const pageId = (await added.json()).data.page_id;
    const bound = await request.patch(`/api/projects/${id}/pages/${pageId}/template`, { data: { template_asset_id: asset.id, selection_source: 'manual' } });
    expect(bound.ok(), await bound.text()).toBeTruthy();
    const generated = await request.post(`/api/projects/${id}/pages/${pageId}/generate/image`, { data: {} });
    expect(generated.status(), await generated.text()).toBe(202); await task(request, id, (await generated.json()).data.task_id);
    await page.goto(`/project/${id}/preview`);
    await expect(page.getByText('PDF 템플릿 검증').first()).toBeVisible();
    expect((await project(request, id)).pages[0].template_asset_id).toBe(asset.id);
  } finally { await request.delete(`/api/projects/${id}`); }
});
