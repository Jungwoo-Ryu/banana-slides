import { test, expect } from '@playwright/test'

const getBackendUrl = () => {
  if (process.env.BACKEND_URL) return process.env.BACKEND_URL
  const frontendUrl = process.env.BASE_URL || 'http://localhost:3011'
  const parsedFrontendUrl = new URL(frontendUrl)
  const frontendPort = parseInt(parsedFrontendUrl.port || '3011', 10)
  return `${parsedFrontendUrl.protocol}//${parsedFrontendUrl.hostname}:${frontendPort + 2000}`
}

test.describe('Markdown import preview', () => {
  test('integration: preview shows appended page count before importing outline markdown', async ({ page }) => {
    const backendUrl = getBackendUrl()
    const createResponse = await fetch(`${backendUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        creation_type: 'idea',
        idea_prompt: 'Markdown import preview test',
      }),
    })
    const created = await createResponse.json()
    const projectId = created.data?.project_id as string
    expect(projectId).toBeTruthy()

    try {
      await fetch(`${backendUrl}/api/projects/${projectId}/pages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_index: 0,
          outline_content: { title: 'Original Page', points: ['Existing content'] },
        }),
      })

      await page.addInitScript(() => localStorage.setItem('hasSeenHelpModal', 'true'))
      await page.goto(`/project/${projectId}/outline`)
      await expect(page.getByText('Original Page')).toBeVisible()

      await page.getByRole('button', { name: /\u5bfc\u5165\/\u5bfc\u51fa|Import\/Export/ }).click()
      await page.getByRole('button', { name: /^\u5bfc\u5165$|^Import$/ }).click()

      const markdown = [
        '## Page 1 Page: Add the first page',
        '',
        'This page describes the import preview。',
        '',
        '---',
        '',
        '## Page 2 Page: Add the second page',
        '',
        'Additional page confirmed on this page。',
      ].join('\n')
      await page.getByPlaceholder(/\u628a\u5927\u7eb2|Paste outline/).fill(markdown)

      await expect(page.getByText(/\u5c06\u8ffd\u52a0 2 \u9875\u5230\u5f53\u524d\u9879\u76ee|2 page\(s\) will be appended/)).toBeVisible()
      await page.getByRole('button', { name: /\u5bfc\u5165\u5230\u9879\u76ee|Import into Project/ }).click()

      await expect(page.getByText('Add the first page')).toBeVisible()
      await expect(page.getByText('Add the second page')).toBeVisible()

      const projectResponse = await fetch(`${backendUrl}/api/projects/${projectId}`)
      const project = await projectResponse.json()
      const titles = project.data.pages.map((item: { outline_content?: { title?: string } }) => item.outline_content?.title)
      expect(titles).toEqual(expect.arrayContaining(['Original Page', 'Add the first page', 'Add the second page']))
      expect(project.data.pages).toHaveLength(3)
    } finally {
      await fetch(`${backendUrl}/api/projects/${projectId}`, { method: 'DELETE' })
    }
  })
})
