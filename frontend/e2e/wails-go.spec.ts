import { verifyExport } from './helpers/go-backend';
import { test, expect, type APIRequestContext } from '@playwright/test';
import { execFileSync } from 'node:child_process';

test.skip(process.env.SOLA_GO_E2E !== '1', 'Requires the isolated Go backend and loopback Azure protocol fixture.');
async function complete(request: APIRequestContext, project: string, id: string) {
  await expect.poll(async () => {
    const response = await request.get(`/api/projects/${project}/tasks/${id}`);
    const task = (await response.json()).data;
    if (task.status === 'FAILED') throw new Error(JSON.stringify(task));
    return task.status;
  }, { timeout: 60000 }).toBe('COMPLETED');
}

test('Go settings, outline SSE, generated images, pixel region editing and real PPTX download', async ({ page, request }, info) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: '모델 연결' })).toBeVisible();
  await page.getByLabel('디자인 시스템 프롬프트').fill('흰 배경, 금색 포인트, 넓은 여백');
  await page.getByRole('button', { name: '설정 저장', exact: true }).click();
  await expect(page.getByText('설정을 저장했습니다.', { exact: true })).toBeVisible();
  const created = (await (await request.post('/api/projects', { data: { idea_prompt: '두 장의 검증 발표', creation_type: 'idea' } })).json()).data;
  const pid = created.project_id;
  expect(created.template_style).toContain('금색');
  try {
    const outline = await request.post(`/api/projects/${pid}/generate/outline/stream`, { data: { language: 'ko' } });
    expect(await outline.text()).toContain('event: done');
    const descriptions = await request.post(`/api/projects/${pid}/generate/descriptions/stream`, { data: { language: 'ko' } });
    expect(await descriptions.text()).toContain('event: description');
    const images = await request.post(`/api/projects/${pid}/generate/images`, { data: {} });
    expect(images.status()).toBe(202);
    await complete(request, pid, (await images.json()).data.task_id);
    const project = (await (await request.get(`/api/projects/${pid}`)).json()).data;
    expect(project.pages).toHaveLength(2);
    const first = project.pages[0].page_id;
    await page.goto(`/project/${pid}/preview`);
    await expect(page.getByText('회귀 검증 1').first()).toBeVisible();
    await expect(page.getByTestId('drawer-narration-input')).not.toBeEmpty();
    await page.getByTestId('preview-floating-toolbar').getByRole('button', { name: '편집', exact: true }).click();
    await expect(page.getByRole('button', { name: '영역 선택', exact: true }).first()).toBeVisible();
    let target;
    for (const img of await page.locator('main img:visible').all()) { const box = await img.boundingBox(); if (box && box.width > 500) { target = box; break; } }
    expect(target).toBeTruthy();
    await page.mouse.move(target!.x + 90, target!.y + 70); await page.mouse.down();
    await page.mouse.move(target!.x + 280, target!.y + 150, { steps: 10 }); await page.mouse.up();
    await expect(page.getByTestId('region-selection')).toBeVisible();
    await page.getByTestId('inline-edit-prompt').fill('선택한 영역의 제목을 파란색으로 변경');
    const submitted = page.waitForResponse(r => r.url().endsWith(`/pages/${first}/edit/image`) && r.request().method() === 'POST');
    await page.getByTestId('inline-edit-prompt').press('Control+Enter');
    const edit = await submitted; expect(edit.status()).toBe(202);
    await complete(request, pid, (await edit.json()).data.task_id);
    const versions = (await (await request.get(`/api/projects/${pid}/pages/${first}/image-versions`)).json()).data.versions;
    expect(versions).toHaveLength(2);
    await page.reload();
    await page.getByRole('button', { name: '내보내기', exact: true }).click();
    await page.getByRole('button', { name: 'PPTX 내보내기', exact: true }).click();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: '내보내기 시작', exact: true }).click();
    const download = await downloadPromise;
    const saved = info.outputPath('go-export.pptx'); await download.saveAs(saved);
    // Independent OOXML reader validates the downloaded file, not the API response.
    verifyExport(saved, 'pptx', 2);
    const files = (await (await request.get(`/api/projects/${pid}/exports`)).json()).data.files;
    expect(files.some((file: { filename: string }) => file.filename.endsWith('.pptx'))).toBeTruthy();
    await page.screenshot({ path: info.outputPath('go-slide-preview.png'), fullPage: true });
    expect(errors).toEqual([]);
  } finally { await request.delete(`/api/projects/${pid}`); }
});

test('Go reference parsing, native PDF, editable PPTX and Azure speech MP4', async ({ page, request }, info) => {
  const created = (await (await request.post('/api/projects', { data: { creation_type: 'blank' } })).json()).data;
  const pid = created.project_id;
  try {
    const file = (await (await request.post('/api/reference-files/upload', { multipart: { project_id: pid, file: { name: 'brief.txt', mimeType: 'text/plain', buffer: Buffer.from('Go 문서 파싱 검증') } } })).json()).data.file;
    await expect.poll(async () => (await (await request.get(`/api/reference-files/${file.id}`)).json()).data.file.parse_status).toBe('completed');
    const added = (await (await request.post(`/api/projects/${pid}/pages`, { data: { outline_content: { title: '영상 검증', points: ['음성 및 파일 검증'] } } })).json()).data;
    await request.put(`/api/projects/${pid}/pages/${added.page_id}/narration`, { data: { narration_text: 'Go로 생성한 발표 영상 검증입니다.' } });
    const job = (await (await request.post(`/api/projects/${pid}/generate/images`, { data: {} })).json()).data;
    await complete(request, pid, job.task_id);
    const pdf = (await (await request.get(`/api/projects/${pid}/export/pdf`)).json()).data;
    const pdfBytes = await (await request.get(pdf.download_url)).body(); expect(pdfBytes.subarray(0, 4).toString()).toBe('%PDF');
    const editable = (await (await request.post(`/api/projects/${pid}/export/editable-pptx`, { data: {} })).json()).data;
    await complete(request, pid, editable.task_id);
    const video = (await (await request.post(`/api/projects/${pid}/export/video`, { data: { voice: 'alloy', speed: 1 } })).json()).data;
    await complete(request, pid, video.task_id);
    const task = (await (await request.get(`/api/projects/${pid}/tasks/${video.task_id}`)).json()).data;
    const response = await request.get(task.progress.download_url); expect(response.ok()).toBeTruthy();
    const fs = await import('node:fs/promises'); const saved = info.outputPath('go-presentation.mp4'); await fs.writeFile(saved, await response.body());
    const media = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-of', 'json', saved], { encoding: 'utf8' }));
    expect(media.streams.map((stream: { codec_type: string }) => stream.codec_type).sort()).toEqual(['audio', 'video']);
    await page.goto(`/project/${pid}/preview`);
    await expect(page.getByTestId('drawer-narration-input')).toHaveValue('Go로 생성한 발표 영상 검증입니다.');
  } finally { await request.delete(`/api/projects/${pid}`); }
});
