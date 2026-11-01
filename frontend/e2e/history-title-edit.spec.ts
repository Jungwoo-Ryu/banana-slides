import { test, expect } from '@playwright/test'

test.describe('History title editing', () => {
  test('mock: editing title keeps dark theme input readable and updates displayed title', async ({ page }) => {
    const projectId = 'history-edit-mock'
    let projects = [
      {
        id: projectId,
        project_id: projectId,
        project_title: 'Visible item title',
        idea_prompt: 'Old item title',
        status: 'DRAFT',
        created_at: '2026-05-05T10:00:00.000Z',
        updated_at: '2026-05-05T10:00:00.000Z',
        pages: [
          {
            id: 'page-1',
            page_id: 'page-1',
            order_index: 0,
            status: 'DRAFT',
            outline_content: { title: 'Slide 01 - Cover', points: [] },
          },
        ],
      },
    ]

    await page.addInitScript(() => {
      localStorage.setItem('banana-slides-theme', 'dark')
    })

    await page.route('**/api/access-code/check', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { enabled: false } }),
      })
    })

    await page.route('**/api/projects?**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            projects,
            total: projects.length,
            limit: 5,
            offset: 0,
          },
        }),
      })
    })

    await page.route(`**/api/projects/${projectId}/pages/page-1/outline`, async (route) => {
      const body = route.request().postDataJSON() as { outline_content: { title: string, points: string[] } }
      projects = projects.map((project) => ({
        ...project,
        pages: project.pages.map((pageItem) => (
          pageItem.page_id === 'page-1'
            ? {
                ...pageItem,
                outline_content: {
                  ...pageItem.outline_content,
                  title: body.outline_content.title,
                },
              }
            : pageItem
        )),
      }))

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: projects[0].pages[0],
        }),
      })
    })

    await page.goto('/history')
    await expect(page.getByRole('heading', { name: 'Visible item title', exact: true })).toBeVisible()

    await page.getByRole('heading', { name: 'Visible item title', exact: true }).click()
    const input = page.locator('input[type="text"]').first()
    await expect(input).toBeVisible()
    await expect(input).toHaveCSS('background-color', 'rgb(19, 19, 26)')

    await page.route(`**/api/projects/${projectId}`, async (route) => {
      const body = route.request().postDataJSON() as { project_title: string }
      projects = projects.map((project) => ({
        ...project,
        project_title: body.project_title,
      }))

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: projects[0],
        }),
      })
    })

    await input.fill('New Cover Title')
    await input.press('Enter')

    await expect(page.getByRole('heading', { name: 'New Cover Title', exact: true })).toBeVisible()
  })

  test('integration: editing untitled project title persists after reload', async ({ page }) => {
    const frontendUrl = process.env.BASE_URL || 'http://localhost:3011'
    const frontendPort = parseInt(new URL(frontendUrl).port || '3011', 10)
    const backendUrl = `http://localhost:${frontendPort + 2000}`

    const createResponse = await fetch(`${backendUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        creation_type: 'idea',
        idea_prompt: 'Unnamed Item',
      }),
    })
    const created = await createResponse.json()
    const projectId = created.data?.project_id as string
    expect(projectId).toBeTruthy()

    try {
      await page.goto('/history')
      await page.waitForLoadState('networkidle')

      await page.getByRole('heading', { name: 'Unnamed Item', exact: true }).click()
      const input = page.locator('input[type="text"]').first()
      await input.fill('Title after Real Endurance')
      await input.press('Enter')

      await expect(page.getByRole('heading', { name: 'Title after Real Endurance', exact: true })).toBeVisible()

      await page.reload()
      await page.waitForLoadState('networkidle')
      await expect(page.getByRole('heading', { name: 'Title after Real Endurance', exact: true })).toBeVisible()
    } finally {
      await fetch(`${backendUrl}/api/projects/${projectId}`, { method: 'DELETE' })
    }
  })
})
