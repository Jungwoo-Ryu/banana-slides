import { test, expect } from '@playwright/test'

const PROJECT_ID = 'mock-preset-project'

const mockProject = (overrides: Record<string, unknown> = {}) => ({
  project_id: PROJECT_ID,
  status: 'OUTLINE_GENERATED',
  idea_prompt: 'Test idea',
  creation_type: 'idea',
  outline_requirements: '',
  description_requirements: '',
  pages: [
    {
      page_id: 'page-1',
      order_index: 0,
      outline_content: { title: 'Page One', points: ['Point A'] },
      description_content: { text: 'Page one description', generated_at: '2025-01-01' },
      status: 'DESCRIPTION_GENERATED',
    },
  ],
  created_at: '2025-01-01T00:00:00',
  updated_at: '2025-01-01T00:00:00',
  ...overrides,
})

/** Shared mock route handler for project API */
async function setupProjectMock(page: import('@playwright/test').Page) {
  await page.route(`**/api/projects/${PROJECT_ID}`, async (route) => {
    if (route.request().method() === 'PUT') {
      const data = route.request().postDataJSON()
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: mockProject(data) }),
      })
    } else {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: mockProject() }),
      })
    }
  })
}

async function openPresetPanel(
  page: import('@playwright/test').Page,
  type: 'outline' | 'description',
) {
  const addButton = page.locator(`[data-testid="${type}-add-preset"]`)
  try {
    await addButton.waitFor({ state: 'visible', timeout: 1000 })
  } catch (error) {
    if (!(error instanceof Error) || error.name !== 'TimeoutError') throw error
    const panelName = type === 'outline'
      ? /\u5927\u7eb2\u751f\u6210\u8981\u6c42|Outline Generation Requirements/i
      : /\u63cf\u8ff0\u8bbe\u7f6e|Description Settings/i
    await page.getByRole('button', { name: panelName }).click()
  }
  await expect(addButton).toBeVisible()
}

// ── Mock tests: Outline presets ──────────────────────────────────────

test.describe('Preset capsules - OutlineEditor (mock)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.removeItem('presetCapsules_outline')
      localStorage.setItem('outlineReqOpen', 'true')
    })
    await setupProjectMock(page)
  })

  test('displays preset area with add button', async ({ page }) => {
    await page.goto(`/project/${PROJECT_ID}/outline`)
    await page.waitForLoadState('networkidle')
    await openPresetPanel(page, 'outline')

    const presets = page.locator('[data-testid="outline-presets"]')
    await expect(presets).toBeVisible()
    await expect(page.locator('[data-testid="outline-add-preset"]')).toBeVisible()
  })

  test('repairs a non-array preset cache without blocking the editor', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('presetCapsules_outline', JSON.stringify({ name: 'Old Cache' }))
    })

    await page.goto(`/project/${PROJECT_ID}/outline`)
    await page.waitForLoadState('networkidle')
    await openPresetPanel(page, 'outline')

    await expect(page.locator('[data-testid="outline-add-preset"]')).toBeVisible()
    await expect(page.locator('[data-testid^="outline-user-preset-"]')).toHaveCount(0)
    await expect.poll(() => page.evaluate(() => localStorage.getItem('presetCapsules_outline'))).toBe('[]')
  })

  test('salvages valid presets from a mixed legacy cache', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('presetCapsules_outline', JSON.stringify([
        { name: '  Reservations  ', content: '  Effective content  ', legacy: true },
        { name: '', content: 'No name' },
        { name: 'Error', content: 7 },
      ]))
    })

    await page.goto(`/project/${PROJECT_ID}/outline`)
    await page.waitForLoadState('networkidle')
    await openPresetPanel(page, 'outline')

    const preset = page.locator('[data-testid="outline-user-preset-0"]')
    await expect(preset).toContainText('Reservations')
    await expect(page.locator('[data-testid^="outline-user-preset-"]')).toHaveCount(1)
    await expect.poll(() => page.evaluate(() => localStorage.getItem('presetCapsules_outline'))).toBe(
      JSON.stringify([{ name: 'Reservations', content: 'Effective content' }]),
    )
  })

  test('can add custom preset', async ({ page }) => {
    await page.goto(`/project/${PROJECT_ID}/outline`)
    await page.waitForLoadState('networkidle')
    await openPresetPanel(page, 'outline')

    await page.locator('[data-testid="outline-add-preset"]').click()
    await page.locator('[data-testid="outline-preset-name-input"]').fill('My preset.')
    await page.locator('[data-testid="outline-preset-content-input"]').fill('Customise the content of the hint')
    await page.locator('[data-testid="outline-preset-confirm"]').click()
    await openPresetPanel(page, 'outline')

    const userPreset = page.locator('[data-testid="outline-user-preset-0"]')
    await expect(userPreset).toBeVisible()
    await expect(userPreset).toContainText('My preset.')
    await expect(page.locator('[data-testid="outline-delete-preset-0"]')).toBeVisible()
  })

  test('keeps a newly added preset usable when localStorage is read-only', async ({ page }) => {
    await page.addInitScript(() => {
      const originalSetItem = Storage.prototype.setItem
      Storage.prototype.setItem = function (key: string, value: string) {
        if (key.startsWith('presetCapsules_')) {
          throw new DOMException('Storage quota exceeded', 'QuotaExceededError')
        }
        return originalSetItem.call(this, key, value)
      }
    })

    await page.goto(`/project/${PROJECT_ID}/outline`)
    await page.waitForLoadState('networkidle')
    await openPresetPanel(page, 'outline')

    await page.locator('[data-testid="outline-add-preset"]').click()
    await page.locator('[data-testid="outline-preset-name-input"]').fill('Use only for this time')
    await page.locator('[data-testid="outline-preset-content-input"]').fill('Cache cannot be written or continue')
    await page.locator('[data-testid="outline-preset-confirm"]').click()

    await expect(page.locator('[data-testid="outline-user-preset-0"]')).toContainText('Use only for this time')
  })

  test('clicking custom preset appends content', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('presetCapsules_outline', JSON.stringify([
        { name: 'Test Presets', content: 'Test hints' }
      ]))
    })

    await page.goto(`/project/${PROJECT_ID}/outline`)
    await page.waitForLoadState('networkidle')
    await openPresetPanel(page, 'outline')

    const textarea = page.locator('[data-testid="outline-requirements-textarea"] [contenteditable="true"]')
    const userPreset = page.locator('[data-testid="outline-user-preset-0"]')
    await expect(userPreset).toBeVisible()
    await userPreset.locator('button').first().click()

    await expect(textarea).toHaveText('Test hints')
  })

  test('can delete custom preset', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('presetCapsules_outline', JSON.stringify([
        { name: 'To be deleted', content: 'Contents' }
      ]))
    })

    await page.goto(`/project/${PROJECT_ID}/outline`)
    await page.waitForLoadState('networkidle')
    await openPresetPanel(page, 'outline')

    await expect(page.locator('[data-testid="outline-user-preset-0"]')).toBeVisible()
    await page.locator('[data-testid="outline-delete-preset-0"]').click()
    await expect(page.locator('[data-testid="outline-user-preset-0"]')).not.toBeVisible()
  })

  test('can cancel adding preset with Escape', async ({ page }) => {
    await page.goto(`/project/${PROJECT_ID}/outline`)
    await page.waitForLoadState('networkidle')
    await openPresetPanel(page, 'outline')

    await page.locator('[data-testid="outline-add-preset"]').click()
    await expect(page.locator('[data-testid="outline-preset-name-input"]')).toBeVisible()

    await page.locator('[data-testid="outline-preset-name-input"]').press('Escape')

    await expect(page.locator('[data-testid="outline-preset-name-input"]')).not.toBeVisible()
    await expect(page.locator('[data-testid="outline-add-preset"]')).toBeVisible()
  })

  test('add button is disabled when fields are empty', async ({ page }) => {
    await page.goto(`/project/${PROJECT_ID}/outline`)
    await page.waitForLoadState('networkidle')
    await openPresetPanel(page, 'outline')

    await page.locator('[data-testid="outline-add-preset"]').click()

    const confirmBtn = page.locator('[data-testid="outline-preset-confirm"]')
    await expect(confirmBtn).toBeDisabled()

    await page.locator('[data-testid="outline-preset-name-input"]').fill('Name')
    await expect(confirmBtn).toBeDisabled()

    await page.locator('[data-testid="outline-preset-content-input"]').fill('Contents')
    await expect(confirmBtn).toBeEnabled()
  })
})

// ── Mock tests: Description presets ──────────────────────────────────

test.describe('Preset capsules - DetailEditor (mock)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.removeItem('presetCapsules_description')
      localStorage.setItem('descReqOpen', 'true')
    })
    await setupProjectMock(page)
  })

  test('displays preset area with add button', async ({ page }) => {
    await page.goto(`/project/${PROJECT_ID}/detail`)
    await page.waitForLoadState('networkidle')
    await openPresetPanel(page, 'description')

    const presets = page.locator('[data-testid="description-presets"]')
    await expect(presets).toBeVisible()
    await expect(page.locator('[data-testid="description-add-preset"]')).toBeVisible()
  })

  test('description custom presets are independent from outline presets', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('presetCapsules_outline', JSON.stringify([
        { name: 'Outline presets', content: 'Outline' }
      ]))
      localStorage.setItem('presetCapsules_description', JSON.stringify([
        { name: 'Description Presets', content: 'Description' }
      ]))
    })

    await page.goto(`/project/${PROJECT_ID}/detail`)
    await page.waitForLoadState('networkidle')
    await openPresetPanel(page, 'description')

    const descPreset = page.locator('[data-testid="description-user-preset-0"]')
    await expect(descPreset).toBeVisible()
    await expect(descPreset).toContainText('Description Presets')
    await expect(page.locator('text=Outline presets')).not.toBeVisible()
  })

  test('can save a description preset from the settings popover modal', async ({ page }) => {
    await page.goto(`/project/${PROJECT_ID}/detail`)
    await page.waitForLoadState('networkidle')
    await openPresetPanel(page, 'description')

    await page.locator('[data-testid="description-add-preset"]').click()
    await page.locator('[data-testid="description-preset-name-input"]').fill('Description Presets')
    await page.locator('[data-testid="description-preset-content-input"]').fill('Emphasis on data comparison')
    await page.locator('[data-testid="description-preset-confirm"]').click()

    await expect(page.locator('[data-testid="description-user-preset-0"]')).toContainText('Description Presets')
    await expect.poll(() => page.evaluate(() => localStorage.getItem('presetCapsules_description'))).toBe(
      JSON.stringify([{ name: 'Description Presets', content: 'Emphasis on data comparison' }]),
    )
  })
})

// ── Integration tests ────────────────────────────────────────────────

test.describe('Preset capsules (integration)', () => {
  let projectId: string

  test.beforeEach(async ({ request, page }) => {
    const res = await request.post('/api/projects', {
      data: { idea_prompt: 'Preset integration test', creation_type: 'idea' },
    })
    const body = await res.json()
    projectId = body.data.project_id

    await page.goto('/')
    await page.evaluate(() => {
      localStorage.removeItem('presetCapsules_outline')
      localStorage.removeItem('presetCapsules_description')
      localStorage.setItem('outlineReqOpen', 'true')
    })
  })

  test('custom preset click appends to textarea and auto-saves', async ({ page }) => {
    // Seed a preset
    await page.evaluate(() => {
      localStorage.setItem('presetCapsules_outline', JSON.stringify([
        { name: 'Integration presets', content: 'Integrated Test Content' }
      ]))
    })

    await page.goto(`/project/${projectId}/outline`)
    await page.waitForLoadState('networkidle')
    await openPresetPanel(page, 'outline')

    const textarea = page.locator('[data-testid="outline-requirements-textarea"] [contenteditable="true"]')
    await expect(textarea).toBeVisible()

    // Click user preset
    const savePromise = page.waitForResponse(
      (resp) => resp.url().includes(`/api/projects/${projectId}`) && resp.request().method() === 'PUT'
    )
    await page.locator('[data-testid="outline-user-preset-0"]').locator('button').first().click()
    await expect(textarea).toHaveText('Integrated Test Content')

    // Wait for debounced auto-save
    await savePromise

    // Reload and verify persisted
    await page.reload()
    await page.waitForLoadState('networkidle')
    await openPresetPanel(page, 'outline')

    const textareaAfter = page.locator('[data-testid="outline-requirements-textarea"] [contenteditable="true"]')
    await expect(textareaAfter).toBeVisible()
    await expect(textareaAfter).toHaveText('Integrated Test Content')
  })

  test('custom presets persist in localStorage across page navigations', async ({ page }) => {
    await page.goto(`/project/${projectId}/outline`)
    await page.waitForLoadState('networkidle')
    await openPresetPanel(page, 'outline')

    await page.locator('[data-testid="outline-add-preset"]').click()
    await page.locator('[data-testid="outline-preset-name-input"]').fill('Integrated Test Presets')
    await page.locator('[data-testid="outline-preset-content-input"]').fill('Integrated Test Content')
    await page.locator('[data-testid="outline-preset-confirm"]').click()
    await openPresetPanel(page, 'outline')

    await expect(page.locator('[data-testid="outline-user-preset-0"]')).toBeVisible()

    // Navigate away and back
    await page.goto(`/project/${projectId}/outline`)
    await page.waitForLoadState('networkidle')
    await openPresetPanel(page, 'outline')

    const userPreset = page.locator('[data-testid="outline-user-preset-0"]')
    await expect(userPreset).toBeVisible()
    await expect(userPreset).toContainText('Integrated Test Presets')
  })

  test('recovers a corrupted cache, then saves and reloads a new preset', async ({ page }) => {
    await page.goto('/')
    await page.evaluate(() => {
      localStorage.setItem('presetCapsules_outline', '{corrupted')
      localStorage.setItem('outlineReqOpen', 'true')
    })

    await page.goto(`/project/${projectId}/outline`)
    await page.waitForLoadState('networkidle')
    await openPresetPanel(page, 'outline')
    await expect(page.locator('[data-testid="outline-add-preset"]')).toBeVisible()

    await page.locator('[data-testid="outline-add-preset"]').click()
    await page.locator('[data-testid="outline-preset-name-input"]').fill('Presets after restoration')
    await page.locator('[data-testid="outline-preset-content-input"]').fill('Recovered content')
    await page.locator('[data-testid="outline-preset-confirm"]').click()
    await openPresetPanel(page, 'outline')
    await expect(page.locator('[data-testid="outline-user-preset-0"]')).toContainText('Presets after restoration')

    await page.reload()
    await page.waitForLoadState('networkidle')
    await openPresetPanel(page, 'outline')
    await expect(page.locator('[data-testid="outline-user-preset-0"]')).toContainText('Presets after restoration')
  })
})
