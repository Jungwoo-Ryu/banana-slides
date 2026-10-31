import { test, expect } from '@playwright/test';

// Run against `vite preview` or the Docker frontend, never the dev server:
// E2E_WEB_BUILD=1 BASE_URL=http://localhost:3488 CI=true npx playwright test e2e/web-build-deep-links.spec.ts
test.skip(process.env.E2E_WEB_BUILD !== '1', 'Requires a built web frontend and real backend');

test('built web history loads directly and after refresh', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/history');
  await expect(page.getByRole('heading', { name: 'Historical projects', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Historical projects', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('built web project preview loads directly and after refresh', async ({ page, request }) => {
  const created = await request.post('/api/projects', {
    data: { creation_type: 'idea', idea_prompt: 'Production of static build preview links returned' },
  });
  expect(created.ok()).toBeTruthy();
  const projectId = (await created.json()).data.project_id;
  try {
    const added = await request.post(`/api/projects/${projectId}/pages`, {
      data: { order_index: 0, outline_content: { title: 'Open Preview Directly' } },
    });
    expect(added.ok()).toBeTruthy();
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`/project/${projectId}/preview`);
    await expect(page.getByText('1. Open Preview Directly', { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByText('1. Open Preview Directly', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Share / Save Link', exact: true })).toHaveCount(0);
    expect(errors).toEqual([]);
  } finally {
    const deleted = await request.delete(`/api/projects/${projectId}`);
    expect(deleted.ok()).toBeTruthy();
  }
});
