/**
 * UI regression: a failed renovation task must turn a MinerU credential
 * response into a recovery action rather than raw API text.
 */
import { test, expect } from '@playwright/test';

test.use({ baseURL: process.env.BASE_URL || 'http://localhost:3011' });

test.describe('PPT renovation MinerU error guidance', () => {
  let projectId: string;

  test.beforeEach(async ({ request }) => {
    const response = await request.post('/api/projects', {
      data: { creation_type: 'blank' },
    });
    expect(response.ok()).toBeTruthy();
    projectId = (await response.json()).data.project_id;
  });

  test.afterEach(async ({ request }) => {
    if (projectId) await request.delete(`/api/projects/${projectId}`);
  });

  test('shows MinerU token recovery steps after the task reports an expired token', async ({ page }) => {
    const taskId = 'renovation-mineru-expired-token';

    await page.route(`**/api/projects/${projectId}/tasks/${taskId}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            task_id: taskId,
            status: 'FAILED',
            error_message: 'MinerU parsing failed: Network error while requesting upload URL: 401 Unauthorized',
            progress: { total: 1, completed: 0 },
          },
        }),
      });
    });

    await page.addInitScript(({ id }) => {
      localStorage.setItem('renovationTaskId', id);
      localStorage.setItem('hasSeenHelpModal', 'true');
    }, { id: taskId });

    await page.goto(`/project/${projectId}/detail`);

    const toast = page.getByText(/MinerU Token \u5df2\u5931\u6548、\u65e0\u6548\u6216\u6ca1\u6709\u6743\u9650/);
    await expect(toast).toBeVisible({ timeout: 10_000 });
    await expect(toast).toContainText('Settings → MinerU Configuration');
    await expect(toast).toContainText('Service testing');
    await expect(toast).toContainText('Recreate renovation project');
    await expect.poll(() => page.evaluate(() => localStorage.getItem('renovationTaskId'))).toBeNull();
  });
});
