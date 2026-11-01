/**
 * E2E test: Import outline / description from Markdown files
 */
import { test, expect, Page, Locator } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'

test.use({ baseURL: process.env.BASE_URL || 'http://localhost:3011' })

const PROJECT_ID = 'mock-import-proj'

const mockProject = (pages: any[] = []) => ({
  success: true,
  data: {
    id: PROJECT_ID, project_id: PROJECT_ID, title: 'Test',
    status: 'OUTLINE_GENERATED', creation_type: 'idea',
    idea_prompt: 'test', pages,
  }
})

const mockSettings = () => ({
  success: true,
  data: { ai_provider_format: 'gemini', google_api_key: 'fake' }
})

// Unified format fixture (outline + description in one file)
const UNIFIED_MD = `# Item

## Page 1 Page: AI Introduction

> Section: Introduction

**Outline points：**
- What’s artificial intelligence?
- AI History

**Page description：**
It’s about... AI Description of the profile。

---

## Page 2 Page: AI Apply

> Section: Text

**Outline points：**
- Medical field
- In the field of education

**Page description：**
It’s about... AI Description of application。

---
`

// Legacy format (no markers) — should still parse
const LEGACY_MD = `# Outline

## Page 1 Page: Old Format Page
> Section: Test
- Point one.
- Point two.
`

const EMPTY_MD = `# Empty files
No page contents
`

test.describe('Import Markdown (mocked)', () => {
  test.setTimeout(60_000)

  let addPageCalls: any[]
  let singleAddRequests: number
  let projectPages: any[]

  test.beforeEach(async ({ page }) => {
    addPageCalls = []
    singleAddRequests = 0
    projectPages = []

    await page.route('**/api/settings', r =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockSettings()) }))

    await page.route('**/api/access-code/check', r =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { required: false } }) }))

    await page.route('**/api/user-templates', r =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [] }) }))

    await page.route(`**/api/reference-files/project/${PROJECT_ID}`, r =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { files: [] } }) }))

    // Project endpoint: returns current pages state
    await page.route(`**/api/projects/${PROJECT_ID}`, r =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockProject(projectPages)) }))

    await page.route(`**/api/projects/${PROJECT_ID}/pages/batch`, async (route) => {
      const body = route.request().postDataJSON()
      for (const pageBody of body.pages) {
        addPageCalls.push(pageBody)
        const newPage = {
          id: `page-${addPageCalls.length}`,
          page_id: `page-${addPageCalls.length}`,
          order_index: pageBody.order_index ?? projectPages.length,
          outline_content: pageBody.outline_content || { title: '', points: [] },
          description_content: pageBody.description_content || null,
          part: pageBody.part || null,
          status: 'DRAFT',
        }
        projectPages.push(newPage)
      }
      await route.fulfill({
        status: 201, contentType: 'application/json',
        body: JSON.stringify({ success: true, data: projectPages.slice(-body.pages.length) })
      })
    })

    // Add page endpoint: capture calls and grow projectPages
    await page.route(`**/api/projects/${PROJECT_ID}/pages`, async (route) => {
      if (route.request().method() === 'POST') {
        singleAddRequests += 1
        const body = route.request().postDataJSON()
        addPageCalls.push(body)
        const newPage = {
          id: `page-${addPageCalls.length}`,
          page_id: `page-${addPageCalls.length}`,
          order_index: body.order_index ?? projectPages.length,
          outline_content: body.outline_content || { title: '', points: [] },
          description_content: body.description_content || null,
          part: body.part || null,
          status: 'DRAFT',
        }
        projectPages.push(newPage)
        await route.fulfill({
          status: 201, contentType: 'application/json',
          body: JSON.stringify({ success: true, data: newPage })
        })
      } else {
        await route.fulfill({
          status: 200, contentType: 'application/json',
          body: JSON.stringify({ success: true, data: { pages: projectPages } })
        })
      }
    })
  })

  function writeTempFile(name: string, content: string): string {
    const filePath = path.join('/tmp', name)
    fs.writeFileSync(filePath, content, 'utf-8')
    return filePath
  }

  async function openImportModal(page: Page): Promise<Locator> {
    await page.getByRole('button', { name: /\u5bfc\u5165\/\u5bfc\u51fa/ }).click()
    await page.getByRole('button', { name: /^\u5bfc\u5165$/ }).click()
    const dialog = page.getByRole('dialog', { name: 'Import Markdown' })
    await expect(dialog).toBeVisible()
    return dialog.locator('input[type="file"]')
  }

  async function importSelectedFile(page: Page) {
    await page.getByRole('button', { name: 'Import to Item' }).click()
  }

  test('import unified markdown on outline page — preserves outline + description', async ({ page }) => {
    const mdPath = writeTempFile('test-unified.md', UNIFIED_MD)

    await page.goto(`/project/${PROJECT_ID}/outline`)

    const fileInput = await openImportModal(page)
    await fileInput.setInputFiles(mdPath)
    await importSelectedFile(page)

    await expect(page.locator('text=Import succeeded').first()).toBeVisible({ timeout: 5_000 })

    expect(addPageCalls).toHaveLength(2)
    expect(singleAddRequests).toBe(0)
    // Page 1: outline + description + part
    expect(addPageCalls[0].outline_content.title).toBe('AI Introduction')
    expect(addPageCalls[0].outline_content.points).toContain('What’s artificial intelligence?')
    expect(addPageCalls[0].outline_content.points).toContain('AI History')
    expect(addPageCalls[0].part).toBe('Introduction')
    expect(addPageCalls[0].description_content).toEqual({ text: 'It’s about... AI Description of the profile。' })
    // Page 2
    expect(addPageCalls[1].outline_content.title).toBe('AI Apply')
    expect(addPageCalls[1].outline_content.points).toContain('Medical field')
    expect(addPageCalls[1].part).toBe('Text')
    expect(addPageCalls[1].description_content).toEqual({ text: 'It’s about... AI Description of application。' })
  })

  test('import unified markdown on detail page — same result', async ({ page }) => {
    const mdPath = writeTempFile('test-unified-detail.md', UNIFIED_MD)

    await page.goto(`/project/${PROJECT_ID}/detail`)

    const fileInput = await openImportModal(page)
    await fileInput.setInputFiles(mdPath)
    await importSelectedFile(page)

    await expect(page.locator('text=Import succeeded').first()).toBeVisible({ timeout: 5_000 })

    expect(addPageCalls).toHaveLength(2)
    expect(singleAddRequests).toBe(0)
    expect(addPageCalls[0].outline_content.title).toBe('AI Introduction')
    expect(addPageCalls[0].description_content).toEqual({ text: 'It’s about... AI Description of the profile。' })
  })

  test('import legacy format still works', async ({ page }) => {
    const mdPath = writeTempFile('test-legacy.md', LEGACY_MD)

    await page.goto(`/project/${PROJECT_ID}/outline`)

    const fileInput = await openImportModal(page)
    await fileInput.setInputFiles(mdPath)
    await importSelectedFile(page)

    await expect(page.locator('text=Import succeeded').first()).toBeVisible({ timeout: 5_000 })

    expect(addPageCalls).toHaveLength(1)
    expect(singleAddRequests).toBe(0)
    expect(addPageCalls[0].outline_content.title).toBe('Old Format Page')
    expect(addPageCalls[0].outline_content.points).toContain('Point one.')
    expect(addPageCalls[0].part).toBe('Test')
  })

  test('import empty markdown shows preview error and disables import', async ({ page }) => {
    const mdPath = writeTempFile('test-empty.md', EMPTY_MD)

    await page.goto(`/project/${PROJECT_ID}/outline`)

    const fileInput = await openImportModal(page)
    await fileInput.setInputFiles(mdPath)

    await expect(page.getByText('Not recognized to importable page')).toBeVisible({ timeout: 5_000 })
    await expect(page.getByRole('button', { name: 'Import to Item' })).toBeDisabled()
    expect(addPageCalls).toHaveLength(0)
    expect(singleAddRequests).toBe(0)
  })

  test('rejects unsupported import files before parsing', async ({ page }) => {
    const pdfPath = writeTempFile('test-import.pdf', '%PDF-1.7 fake pdf')

    await page.goto(`/project/${PROJECT_ID}/outline`)

    const fileInput = await openImportModal(page)
    const textarea = page.getByPlaceholder('Puts the outline or the outline+Description Markdown Paste Here...')
    await textarea.fill('## Draft Page: Should not be emptied by misselected files')
    await fileInput.setInputFiles(pdfPath)

    await expect(page.getByText('Import only .md、.markdown or .txt Documentation')).toBeVisible({ timeout: 5_000 })
    await expect(textarea).toHaveValue('## Draft Page: Should not be emptied by misselected files')
    expect(addPageCalls).toHaveLength(0)
    expect(singleAddRequests).toBe(0)
  })

  test('export→import round-trip preserves data', async ({ page }) => {
    // Pre-populate project with pages that have outline + description
    const existingPages = [
      {
        id: 'p1', page_id: 'p1', order_index: 0, part: 'Chapter I',
        outline_content: { title: 'Introduction', points: ['Background', 'Purpose of the study'] },
        description_content: { text: 'This is a detailed description of the introductory page.。' },
        status: 'DESCRIPTION_GENERATED',
      },
      {
        id: 'p2', page_id: 'p2', order_index: 1, part: null,
        outline_content: { title: 'Methodology', points: ['Experimental design'] },
        description_content: { text: 'Description of the methodology。' },
        status: 'DESCRIPTION_GENERATED',
      },
    ]

    // Override project route to return pages
    await page.route(`**/api/projects/${PROJECT_ID}`, r =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockProject(existingPages)) }))

    // Use detail page "Export Outline+Description" for full export
    await page.goto(`/project/${PROJECT_ID}/detail`)
    await page.getByRole('button', { name: /\u5bfc\u5165\/\u5bfc\u51fa/ }).click()
    await expect(page.getByRole('button', { name: 'Export Outline and Description' })).toBeVisible()

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Export Outline and Description' }).click(),
    ])
    const downloadPath = await download.path()
    const exportedContent = fs.readFileSync(downloadPath!, 'utf-8')

    // Verify exported content has both markers
    expect(exportedContent).toContain('**Outline points：**')
    expect(exportedContent).toContain('**Page description：**')
    expect(exportedContent).toContain('Introduction')
    expect(exportedContent).toContain('Background')
    expect(exportedContent).toContain('This is a detailed description of the introductory page.。')

    // Import the exported file back
    addPageCalls = []
    const reimportPath = writeTempFile('roundtrip.md', exportedContent)
    const fileInput = await openImportModal(page)
    await fileInput.setInputFiles(reimportPath)
    await importSelectedFile(page)

    await expect(page.locator('text=Import succeeded').first()).toBeVisible({ timeout: 5_000 })

    // Verify round-trip fidelity
    expect(addPageCalls).toHaveLength(2)
    expect(singleAddRequests).toBe(0)
    expect(addPageCalls[0].outline_content.title).toBe('Introduction')
    expect(addPageCalls[0].outline_content.points).toEqual(['Background', 'Purpose of the study'])
    expect(addPageCalls[0].part).toBe('Chapter I')
    expect(addPageCalls[0].description_content).toEqual({ text: 'This is a detailed description of the introductory page.。' })
    expect(addPageCalls[1].outline_content.title).toBe('Methodology')
    expect(addPageCalls[1].outline_content.points).toEqual(['Experimental design'])
    expect(addPageCalls[1].description_content).toEqual({ text: 'Description of the methodology。' })
    expect(addPageCalls[1].part).toBeUndefined()
  })
})
