import { expect, type APIRequestContext } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

export async function seedSlide(request: APIRequestContext, project: string, page: string) {
  const response = await request.post(`/api/projects/${project}/pages/${page}/generate/image`, { data: {} });
  expect(response.status(), await response.text()).toBe(202);
  const id = (await response.json()).data.task_id;
  await expect.poll(async () => {
    const task = (await (await request.get(`/api/projects/${project}/tasks/${id}`)).json()).data;
    if (task.status === 'FAILED') throw new Error(task.error_message);
    return task.status;
  }, { timeout: 45000 }).toBe('COMPLETED');
}
export function verifyExport(file: string, kind = 'pptx', count = 1) {
  const args = ['-kind', kind, '-count', String(count), file];
  const executable = process.env.SOLA_VERIFY_BIN;
  if (executable) execFileSync(executable, args, { encoding: 'utf8' });
  else execFileSync('go', ['-C', path.resolve('../backend'), 'run', './cmd/sola-verify', ...args], { encoding: 'utf8' });
}
