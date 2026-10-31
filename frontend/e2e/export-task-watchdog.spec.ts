/**
 * Real Backend + Real Frontend： Backstage Tasks"It’s not working."（The Zombie Mission.。
 *
 * Client feedback： Export editable PPTX It’s stuck. "88% Build No. 17/24 Page"，
 * Show again after restarting application 88%。Backstage tasks only exist in the process.，
 * Once the process is restarted, the database records will be stopped for the last time.。
 */
import { expect, test } from '@playwright/test'
import { execFileSync } from 'child_process'
import crypto from 'crypto'
import path from 'path'

const FRONTEND_DIR = process.cwd().endsWith('frontend')
  ? process.cwd()
  : path.join(process.cwd(), 'frontend')
const PROJECT_ROOT = path.resolve(FRONTEND_DIR, '..')
const DB_PATH = process.env.DATABASE_PATH || path.join(PROJECT_ROOT, 'backend', 'instance', 'database.db')

function sqlText(value: string): string {
  return `CAST(X'${Buffer.from(value, 'utf8').toString('hex')}' AS TEXT)`
}

async function createProject(request: any, idea: string): Promise<string> {
  const response = await request.post('/api/projects', {
    data: { creation_type: 'idea', idea_prompt: idea, template_style: 'default' },
  })
  expect(response.ok()).toBeTruthy()
  return (await response.json()).data.project_id as string
}

function insertExportTask(options: {
  taskId: string
  projectId: string
  status: string
  progress: Record<string, unknown>
}) {
  const progress = JSON.stringify(options.progress)
  execFileSync('sqlite3', [
    '-cmd',
    '.timeout 5000',
    DB_PATH,
    `INSERT INTO tasks (id, project_id, task_type, status, progress, created_at)
     VALUES ('${options.taskId}', '${options.projectId}', 'EXPORT_EDITABLE_PPTX',
       '${options.status}', ${sqlText(progress)}, CURRENT_TIMESTAMP);`,
  ])
}

async function seedStoredTask(page: any, payload: Record<string, unknown>) {
  await page.addInitScript((task: Record<string, unknown>) => {
    localStorage.setItem('hasSeenHelpModal', 'true')
    localStorage.setItem('export-tasks-storage', JSON.stringify({
      state: { tasks: [task] },
      version: 0,
    }))
  }, payload)
}

test('a task left over from a previous run stops showing 88% and reports interrupted', async ({ page, request }) => {
  const projectId = await createProject(request, 'Zombie Export Job E2E')
  const taskId = crypto.randomUUID()
  const localTaskId = `e2e-watchdog-${Date.now()}`
  const staleHeartbeat = new Date(Date.now() - 3.5 * 3600 * 1000).toISOString()

  insertExportTask({
    taskId,
    projectId,
    status: 'PROCESSING',
    progress: {
      total: 100,
      completed: 88,
      failed: 0,
      current_step: 'Build No. 17/24 Page...',
      percent: 88,
      heartbeat_at: staleHeartbeat,
      messages: [
        '[Build PPTX] Build No. 16/24 Page...',
        '[Build PPTX] Build No. 17/24 Page...',
      ],
    },
  })

  await seedStoredTask(page, {
    id: localTaskId,
    taskId,
    projectId,
    type: 'editable-pptx',
    status: 'PROCESSING',
    progress: { total: 100, completed: 88, percent: 88, current_step: 'Build No. 17/24 Page...' },
    createdAt: new Date().toISOString(),
  })

  try {
    await page.goto(`/project/${projectId}/preview`)
    await page.waitForFunction(() => document.body.innerText.length > 50, { timeout: 15000 })
    await page.getByLabel('Export Tasks').click()

    const panel = page.getByTestId('export-tasks-list')
    // The first round of queries is reconciled when the page is loaded： the task is from"Ongoing 88%"Turns into a failure and gives the reason for the interruption.
    await expect(panel.getByText(/^\u5bfc\u51fa\u5931\u8d25$/)).toBeVisible({ timeout: 20000 })
    // The file was pressed by the frontend error_code + Structure details, not dependent on the back Chinese sentence
    await expect(panel.getByText(/\u5bfc\u51fa\u88ab\u4e2d\u65ad：.*3\.5 \u5c0f\u65f6/)).toBeVisible({ timeout: 20000 })
    await expect(panel.getByText('TASK_INTERRUPTED')).toBeVisible()
    await expect(panel.getByText('Task status reconciliation')).toBeVisible()
    await expect(panel.getByText('Point to the right. × Remove this record and restart it.。')).toBeVisible()

    // Progress Bar（88%）I can’t do it anymore."Ongoing"Show, can’t show"Ongoing"Count
    await expect(panel.getByText('88%')).toHaveCount(0)
    await expect(page.getByText(/^\d+ \u8fdb\u884c\u4e2d$/)).toHaveCount(0)

    const taskResponse = await request.get(`/api/projects/${projectId}/tasks/${taskId}`)
    expect(taskResponse.ok()).toBeTruthy()
    const backendTask = (await taskResponse.json()).data
    expect(backendTask.status).toBe('FAILED')
    expect(backendTask.progress.error_code).toBe('TASK_INTERRUPTED')
    expect(backendTask.progress.percent).toBe(88)
  } finally {
    await request.delete(`/api/projects/${projectId}`)
  }
})

test('a task with a fresh heartbeat keeps running instead of being failed', async ({ page, request }) => {
  const projectId = await createProject(request, 'The heart beat is normal for export. E2E')
  const taskId = crypto.randomUUID()
  const localTaskId = `e2e-watchdog-fresh-${Date.now()}`

  insertExportTask({
    taskId,
    projectId,
    status: 'PROCESSING',
    progress: {
      total: 100,
      completed: 88,
      failed: 0,
      current_step: 'Build No. 17/24 Page...',
      percent: 88,
      heartbeat_at: new Date().toISOString(),
      messages: ['[Build PPTX] Build No. 17/24 Page...'],
    },
  })

  await seedStoredTask(page, {
    id: localTaskId,
    taskId,
    projectId,
    type: 'editable-pptx',
    status: 'PROCESSING',
    progress: { total: 100, completed: 88, percent: 88, current_step: 'Build No. 17/24 Page...' },
    createdAt: new Date().toISOString(),
  })

  const statusRequests: string[] = []
  page.on('request', (req) => {
    if (req.url().includes(`/tasks/${taskId}`)) statusRequests.push(req.url())
  })

  try {
    await page.goto(`/project/${projectId}/preview`)
    await page.waitForFunction(() => document.body.innerText.length > 50, { timeout: 15000 })
    await page.getByLabel('Export Tasks').click()

    const panel = page.getByTestId('export-tasks-list')
    await expect(panel.getByText('88%')).toBeVisible({ timeout: 10000 })

    // The assertion."There was a round of questioning."，Not waiting emptyly.
    await expect.poll(() => statusRequests.length, { timeout: 15000 }).toBeGreaterThanOrEqual(3)

    await expect(panel.getByText('88%')).toBeVisible()
    await expect(panel.getByText(/\u5bfc\u51fa\u88ab\u4e2d\u65ad|\u5bfc\u51fa\u7591\u4f3c\u5361\u4f4f/)).toHaveCount(0)
    // And it shouldn’t have happened."Status query aborted"The monitoring banners (shows that the interviews are normal)）
    await expect(panel.getByText('Status query temporarily interrupted')).toHaveCount(0)

    const taskResponse = await request.get(`/api/projects/${projectId}/tasks/${taskId}`)
    const backendTask = (await taskResponse.json()).data
    expect(backendTask.status).toBe('PROCESSING')
  } finally {
    await request.delete(`/api/projects/${projectId}`)
  }
})

test('a stalled task renders the localized stuck message', async ({ page, request }) => {
  const projectId = await createProject(request, 'Hold the job. E2E')
  const taskId = crypto.randomUUID()
  const localTaskId = `e2e-watchdog-stalled-${Date.now()}`

  insertExportTask({
    taskId,
    projectId,
    status: 'FAILED',
    progress: {
      total: 100,
      completed: 88,
      failed: 1,
      current_step: 'Build No. 17/24 Page...',
      percent: 88,
      backend_status: 'FAILED',
      error_code: 'TASK_STALLED',
      error_stage: 'task_watchdog',
      error_details: { reason: 'stalled', idle_seconds: 1260, last_step: 'Build PPTX' },
      messages: ['[Build PPTX] Build No. 17/24 Page...'],
    },
  })

  await seedStoredTask(page, {
    id: localTaskId,
    taskId,
    projectId,
    type: 'editable-pptx',
    // Here."Ongoing"Recover. We’ll get to the back end of the first round of questioning. FAILED + TASK_STALLED
    status: 'PROCESSING',
    progress: { total: 100, completed: 88, percent: 88 },
    createdAt: new Date().toISOString(),
  })

  try {
    await page.goto(`/project/${projectId}/preview`)
    await page.waitForFunction(() => document.body.innerText.length > 50, { timeout: 15000 })
    await page.getByLabel('Export Tasks').click()

    const panel = page.getByTestId('export-tasks-list')
    await expect(panel.getByText(/^\u5bfc\u51fa\u5931\u8d25$/)).toBeVisible({ timeout: 15000 })
    await expect(panel.getByText(/\u5bfc\u51fa\u7591\u4f3c\u5361\u4f4f：\u5df2 21 \u5206\u949f\u6ca1\u6709\u8fdb\u5ea6\u66f4\u65b0（\u6700\u540e\u4e00\u6b65：\u6784\u5efa PPTX）/)).toBeVisible()
    await expect(panel.getByText('TASK_STALLED')).toBeVisible()
    await expect(panel.getByText('Task status reconciliation')).toBeVisible()
  } finally {
    await request.delete(`/api/projects/${projectId}`)
  }
})
