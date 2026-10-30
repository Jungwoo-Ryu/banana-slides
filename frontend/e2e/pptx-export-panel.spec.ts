import { test, expect, type Page } from '@playwright/test'
import { seedProjectWithImages } from './helpers/seed-project'

async function mockPreviewProject(page: Page, projectId: string) {
  await page.route(url => new URL(url).pathname.startsWith('/api/'), async (route) => {
    const url = new URL(route.request().url())

    if (url.pathname === `/api/projects/${projectId}/export/pptx`) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            download_url: '/files/mock/slides.pptx',
            download_url_absolute: 'http://localhost/files/mock/slides.pptx',
          },
        }),
      })
    }

    if (url.pathname === `/api/projects/${projectId}`) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            project_id: projectId,
            id: projectId,
            status: 'IMAGES_GENERATED',
            template_style: 'default',
            pages: [
              {
                id: 'p1',
                page_id: 'p1',
                title: 'Slide 1',
                order_index: 0,
                generated_image_path: '/files/mock/1.png',
                page_number: 1,
                outline_content: { title: 'Slide 1' },
                status: 'COMPLETED',
              },
            ],
          },
        }),
      })
    }

    if (url.pathname === '/api/settings') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: {} }) })
    }
    if (url.pathname === '/api/output-language') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { language: 'zh' } }) })
    }
    if (url.pathname === '/api/user-templates') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { templates: [] } }) })
    }

    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: {} }) })
  })

  await page.route('**/files/**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.alloc(100) })
  })
}

test.describe('PPTX export panel', () => {
  test('uses selected-page image state instead of blocking on unfinished unselected pages', async ({ page }) => {
    const projectId = 'mock-partial-export-range'
    let imageExportQuery: URLSearchParams | null = null

    await page.route(url => new URL(url).pathname.startsWith('/api/'), async (route) => {
      const url = new URL(route.request().url())

      if (url.pathname === `/api/projects/${projectId}/export/images`) {
        imageExportQuery = url.searchParams
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              download_url: '/files/mock/selected-slide.png',
              download_url_absolute: 'http://localhost/files/mock/selected-slide.png',
            },
          }),
        })
      }

      if (url.pathname === `/api/projects/${projectId}`) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              project_id: projectId,
              id: projectId,
              status: 'IMAGES_GENERATED',
              template_style: 'default',
              pages: [
                {
                  id: 'p1',
                  page_id: 'p1',
                  title: 'Finished slide',
                  order_index: 0,
                  generated_image_path: '/files/mock/finished.png',
                  page_number: 1,
                  outline_content: { title: 'Finished slide' },
                  status: 'COMPLETED',
                },
                {
                  id: 'p2',
                  page_id: 'p2',
                  title: 'Draft slide',
                  order_index: 1,
                  page_number: 2,
                  outline_content: { title: 'Draft slide' },
                  status: 'DRAFT',
                },
              ],
            },
          }),
        })
      }

      if (url.pathname === '/api/settings') {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: {} }) })
      }
      if (url.pathname === '/api/output-language') {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { language: 'zh' } }) })
      }
      if (url.pathname === '/api/user-templates') {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { templates: [] } }) })
      }

      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: {} }) })
    })

    await page.route('**/files/**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.alloc(100) })
    })

    await page.goto(`/project/${projectId}/preview`)
    await page.waitForFunction(() => document.body.innerText.includes('Finished slide'), { timeout: 15000 })

    await page.locator('button:has-text("Export")').first().click()
    await expect(page.locator('button:has-text("Export as Picture")')).toBeDisabled()
    await page.locator('button:has-text("Export to Speech Video")').click()

    const videoStartButton = page.locator('button:has-text("Start Export")')
    const includeNoImageCheckbox = page.locator('label:has-text("Include uncharted pages") input')
    await expect(videoStartButton).toBeDisabled()
    await includeNoImageCheckbox.check()
    await expect(videoStartButton).toBeEnabled()
    await page.locator('button:has-text("Cancel")').click()

    await page.locator('button:has-text("Export")').first().click()
    await page.locator('button:has-text("Export to Speech Video")').click()
    await expect(includeNoImageCheckbox).not.toBeChecked()
    await expect(videoStartButton).toBeDisabled()
    await page.locator('button:has-text("Cancel")').click()

    await page.locator('button:has-text("Multiple Selections")').click()
    await page.locator('text=1. Finished slide').click()
    await page.locator('button:has-text("Export (1)")').click()

    const imgExportButton = page.locator('button:has-text("Export as Picture")')
    await expect(imgExportButton).toBeEnabled()
    await imgExportButton.click()

    await expect.poll(() => imageExportQuery?.get('page_ids')).toBe('p1')
  })

  test('opens settings panel and sends selected transition effects', async ({ page }) => {
    const projectId = 'mock-pptx-export'
    let exportQuery: URLSearchParams | null = null

    await mockPreviewProject(page, projectId)
    await page.route(`**/api/projects/${projectId}/export/pptx**`, async (route) => {
      const url = new URL(route.request().url())
      exportQuery = url.searchParams
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            download_url: '/files/mock/slides.pptx',
            download_url_absolute: 'http://localhost/files/mock/slides.pptx',
          },
        }),
      })
    })

    await page.goto(`/project/${projectId}/preview`)
    await page.waitForFunction(() => document.body.innerText.length > 50, { timeout: 15000 })

    await page.locator('button:has-text("Export")').first().click()
    await page.locator('button:has-text("Export As PPTX")').click()

    await expect(page.locator('text=PPTX Export Settings')).toBeVisible()
    await page.locator('label:has-text("Enable Page Switch Animation") input').check()
    await expect(page.locator('label:has-text("Erase")')).toBeVisible()
    await expect(page.locator('label:has-text("Split")')).toBeVisible()
    await expect(page.locator('label:has-text("The blinds.")')).toBeVisible()
    await expect(page.locator('label:has-text("Chess Board")')).toBeVisible()
    await expect(page.locator('label:has-text("Clock")')).toBeVisible()
    await page.locator('label:has-text("Turn page") input').check()
    await page.locator('label:has-text("Toggle") input').check()
    await page.locator('button:has-text("Start Export")').click()

    await expect.poll(() => exportQuery?.get('transition_enabled')).toBe('true')
    expect(exportQuery?.get('transition_effects')).toBe('fade,page_turn,push')
  })

  test('clears only the current project export history from the task panel', async ({ page }) => {
    const projectId = 'mock-export-history-current'
    const otherProjectId = 'mock-export-history-other'

    await mockPreviewProject(page, projectId)
    await page.addInitScript(({ currentProjectId, otherProjectId }) => {
      window.localStorage.setItem('export-tasks-storage', JSON.stringify({
        state: {
          tasks: [
            {
              id: 'current-project-export',
              taskId: '',
              projectId: currentProjectId,
              type: 'pptx',
              status: 'COMPLETED',
              downloadUrl: '/files/mock/current.pptx',
              createdAt: new Date().toISOString(),
            },
            {
              id: 'other-project-export',
              taskId: '',
              projectId: otherProjectId,
              type: 'pdf',
              status: 'COMPLETED',
              downloadUrl: '/files/mock/other.pdf',
              createdAt: new Date().toISOString(),
            },
          ],
        },
        version: 0,
      }))
    }, { currentProjectId: projectId, otherProjectId })

    await page.goto(`/project/${projectId}/preview`)
    await page.waitForFunction(() => document.body.innerText.length > 50, { timeout: 15000 })

    await page.getByLabel('Export Tasks').click()
    await expect(page.getByText('PPTX')).toBeVisible()
    await expect(page.getByText('PDF')).toBeHidden()

    await page.getByRole('button', { name: 'Clear' }).click()

    await expect.poll(async () => {
      return page.evaluate(() => {
        const raw = window.localStorage.getItem('export-tasks-storage')
        if (!raw) return []
        return JSON.parse(raw).state.tasks.map((task: { id: string }) => task.id)
      })
    }).toEqual(['other-project-export'])
  })

  test('keeps a restored export status unknown instead of inventing a backend failure', async ({ page }) => {
    const projectId = 'mock-stale-export-task'

    await mockPreviewProject(page, projectId)
    await page.route(`**/api/projects/${projectId}/tasks/missing-export-task`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: null }),
      })
    })
    await page.addInitScript(({ projectId }) => {
      window.localStorage.setItem('export-tasks-storage', JSON.stringify({
        state: {
          tasks: [
            {
              id: 'stale-export-task',
              taskId: 'missing-export-task',
              projectId,
              type: 'pptx',
              status: 'RUNNING',
              createdAt: new Date().toISOString(),
            },
          ],
        },
        version: 0,
      }))
    }, { projectId })

    await page.goto(`/project/${projectId}/preview`)
    await page.waitForFunction(() => document.body.innerText.length > 50, { timeout: 15000 })

    await page.getByLabel('Export Tasks').click()
    await expect(page.getByText('Job response abnormal. Backstage is unknown. Please re-examine manually.')).toBeVisible({ timeout: 15000 })
    await expect(page.getByText('This doesn’t mean the backstage exit failed.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Re-Query' })).toBeVisible()
    await expect(page.getByText(/^\u5bfc\u51fa\u5931\u8d25$/)).toHaveCount(0)
    await expect(page.getByText('1 Ongoing')).toBeVisible()
  })

  test('real backend exports PPTX with transition query enabled', async ({ request, baseURL }) => {
    const { projectId } = await seedProjectWithImages(baseURL!, 2)

    const resp = await request.get(
      `/api/projects/${projectId}/export/pptx?transition_enabled=true&transition_effects=fade,page_turn,push`
    )

    expect(resp.ok()).toBe(true)
    const data = (await resp.json()).data
    expect(data.download_url).toContain(`/files/${projectId}/exports/`)
    expect(data.download_url).toContain('.pptx')

    const fileResp = await request.get(data.download_url)
    expect(fileResp.ok()).toBe(true)
    expect(fileResp.headers()['content-type']).toContain('presentation')
  })
})
