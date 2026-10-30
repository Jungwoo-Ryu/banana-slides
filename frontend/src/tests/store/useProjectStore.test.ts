/**
 * Zustand Store Test
 *
 * Test useProjectStore Core state management function
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useProjectStore } from '@/store/useProjectStore'

// Mock API Module
vi.mock('@/api/endpoints', () => ({
  createProject: vi.fn(),
  getProject: vi.fn(),
  updatePage: vi.fn(),
  updatePageDescription: vi.fn(),
  updatePageOutline: vi.fn(),
  generateOutline: vi.fn(),
  generateDescriptions: vi.fn(),
  generateImages: vi.fn(),
  getTaskStatus: vi.fn(),
  exportPPTX: vi.fn(),
  exportPDF: vi.fn(),
  uploadTemplateAsset: vi.fn(),
  deleteTemplateAsset: vi.fn(),
  generateOutlineStream: vi.fn(),
}))

import { deleteTemplateAsset, uploadTemplateAsset, generateOutlineStream } from '@/api/endpoints'

describe('useProjectStore', () => {
  beforeEach(() => {
    // Reset store Status
    const { result } = renderHook(() => useProjectStore())
    act(() => {
      result.current.setCurrentProject(null)
      result.current.setError(null)
      result.current.setGlobalLoading(false)
      useProjectStore.setState({ templateAssets: [] })
    })
  })

  describe('Initial Status', () => {
    it('should initialize with default state', () => {
      const { result } = renderHook(() => useProjectStore())

      expect(result.current.currentProject).toBeNull()
      expect(result.current.isGlobalLoading).toBe(false)
      expect(result.current.error).toBeNull()
      expect(result.current.activeTaskId).toBeNull()
    })
  })

  describe('Basis Setters', () => {
    it('should set current project correctly', () => {
      const { result } = renderHook(() => useProjectStore())
      const mockProject = {
        id: '123',
        status: 'DRAFT',
        pages: [],
        created_at: new Date().toISOString()
      }

      act(() => {
        result.current.setCurrentProject(mockProject as any)
      })

      expect(result.current.currentProject).toEqual(mockProject)
    })

    it('should set global loading state', () => {
      const { result } = renderHook(() => useProjectStore())

      act(() => {
        result.current.setGlobalLoading(true)
      })

      expect(result.current.isGlobalLoading).toBe(true)

      act(() => {
        result.current.setGlobalLoading(false)
      })

      expect(result.current.isGlobalLoading).toBe(false)
    })

    it('should set error correctly', () => {
      const { result } = renderHook(() => useProjectStore())

      act(() => {
        result.current.setError('Test error')
      })

      expect(result.current.error).toBe('Test error')

      act(() => {
        result.current.setError(null)
      })

      expect(result.current.error).toBeNull()
    })
  })

  describe('Local Page Update', () => {
    it('should update page locally (optimistic update)', () => {
      const { result } = renderHook(() => useProjectStore())

      // Set items first
      const mockProject = {
        id: 'proj-123',
        status: 'DRAFT',
        pages: [
          { id: 'page-1', outline_content: { title: 'Page 1', points: [] } },
          { id: 'page-2', outline_content: { title: 'Page 2', points: [] } },
        ]
      }

      act(() => {
        result.current.setCurrentProject(mockProject as any)
      })

      // Update Page
      act(() => {
        result.current.updatePageLocal('page-1', {
          outline_content: { title: 'Updated Page 1', points: ['new point'] }
        })
      })

      // Validate optimistic updates
      const updatedPage = result.current.currentProject?.pages.find(p => p.id === 'page-1')
      expect(updatedPage?.outline_content?.title).toBe('Updated Page 1')
    })
  })

  describe('Template asset deletion', () => {
    it('should bind uploaded template by page_id and clear stale match metadata', async () => {
      vi.mocked(uploadTemplateAsset).mockResolvedValue({
        data: {
          asset: { id: 'asset-1', project_id: 'proj-123', image_path: 'a.png' },
          analyze_task_id: null,
        },
      } as any)
      const { result } = renderHook(() => useProjectStore())

      act(() => {
        result.current.setCurrentProject({
          id: 'proj-123',
          status: 'DRAFT',
          pages: [{
            page_id: 'page-1',
            template_asset_id: 'old-asset',
            template_selection_source: 'auto_match',
            template_match_reason: 'stale',
            template_match_confidence: 0.91,
          }],
        } as any)
      })

      await act(async () => {
        await result.current.uploadTemplateAsset(
          'proj-123',
          new File(['x'], 'a.png', { type: 'image/png' }),
          { bindToPageId: 'page-1' }
        )
      })

      const page = result.current.currentProject?.pages[0]
      expect(page?.template_asset_id).toBe('asset-1')
      expect(page?.template_selection_source).toBe('manual')
      expect(page?.template_match_reason).toBeNull()
      expect(page?.template_match_confidence).toBeNull()
    })

    it('should clear optimistic template match metadata for affected pages', async () => {
      vi.mocked(deleteTemplateAsset).mockResolvedValue({
        data: { cleared_page_ids: ['page-1'] },
      } as any)
      const { result } = renderHook(() => useProjectStore())

      act(() => {
        result.current.setCurrentProject({
          id: 'proj-123',
          status: 'DRAFT',
          pages: [
            {
              id: 'page-1',
              template_asset_id: 'asset-1',
              template_selection_source: 'auto_match',
              template_match_reason: 'fits',
              template_match_confidence: 0.92,
            },
            {
              id: 'page-2',
              template_asset_id: 'asset-2',
              template_selection_source: 'manual',
              template_match_reason: 'keep',
              template_match_confidence: 0.8,
            },
          ],
        } as any)
        useProjectStore.setState({
          templateAssets: [
          { id: 'asset-1', project_id: 'proj-123', image_path: 'a.png' },
          { id: 'asset-2', project_id: 'proj-123', image_path: 'b.png' },
          ] as any,
        })
      })

      await act(async () => {
        await result.current.deleteTemplateAsset('proj-123', 'asset-1')
      })

      expect(result.current.templateAssets.map((a) => a.id)).toEqual(['asset-2'])
      const clearedPage = result.current.currentProject?.pages[0]
      expect(clearedPage?.template_asset_id).toBeNull()
      expect(clearedPage?.template_selection_source).toBeNull()
      expect(clearedPage?.template_match_reason).toBeNull()
      expect(clearedPage?.template_match_confidence).toBeNull()
      expect(result.current.currentProject?.pages[1].template_match_reason).toBe('keep')
    })
  })

  describe('Clear Status', () => {
    it('should clear project by setting null', () => {
      const { result } = renderHook(() => useProjectStore())

      // Set items first
      act(() => {
        result.current.setCurrentProject({ id: '123', pages: [] } as any)
      })

      expect(result.current.currentProject).not.toBeNull()

      // Clear
      act(() => {
        result.current.setCurrentProject(null)
      })

      expect(result.current.currentProject).toBeNull()
    })
  })
})

describe('useProjectStore Fluid outline item segregation', () => {
  const projectA = { id: 'proj-a', status: 'DRAFT', pages: [], created_at: '2026-01-01T00:00:00' }
  const projectB = { id: 'proj-b', status: 'DRAFT', pages: [], created_at: '2026-01-01T00:00:00' }

  beforeEach(() => {
    vi.mocked(generateOutlineStream).mockReset()
    useProjectStore.setState({
      currentProject: null,
      error: null,
      isOutlineStreaming: false,
      outlineStreamingProjectIds: [],
    })
  })

  it('After leaving the project, the project’s flow failure does not set errors, does not throw out and returns active=false', async () => {
    const { result } = renderHook(() => useProjectStore())
    let rejectStream!: (err: Error) => void
    vi.mocked(generateOutlineStream).mockImplementationOnce(
      () => new Promise<void>((_, reject) => { rejectStream = reject })
    )

    act(() => { result.current.setCurrentProject(projectA as any) })

    let pending!: Promise<{ complete: boolean; active: boolean } | undefined>
    act(() => { pending = result.current.generateOutlineStream() })

    // Cut to another item before the flow ends
    act(() => { result.current.setCurrentProject(projectB as any) })

    await act(async () => {
      rejectStream(new Error('Failed to fetch'))
      await expect(pending).resolves.toEqual({ complete: false, active: false })
    })

    expect(result.current.error).toBeNull()
    expect(result.current.isOutlineStreaming).toBe(false)
    expect(result.current.outlineStreamingProjectIds).toEqual([])
    expect(result.current.currentProject?.id).toBe('proj-b')
  })

  it('When streaming to other items, page and callback do not write to the current item', async () => {
    const { result } = renderHook(() => useProjectStore())
    let emitPage!: (page: any) => void
    let emitDone!: (data: any) => void
    let resolveStream!: () => void
    vi.mocked(generateOutlineStream).mockImplementationOnce(
      ((projectId: string, callbacks: any) => new Promise<void>((resolve) => {
        emitPage = callbacks.onPage
        emitDone = callbacks.onDone
        resolveStream = resolve
      })) as any
    )

    act(() => { result.current.setCurrentProject(projectA as any) })
    let pending!: Promise<{ complete: boolean; active: boolean } | undefined>
    act(() => { pending = result.current.generateOutlineStream() })

    // Cut to another item before the flow ends
    act(() => { result.current.setCurrentProject(projectB as any) })

    await act(async () => {
      // The page event and the completed event have only arrived now and the current item is B
      emitPage({ index: 0, title: 'Source page', points: ['p'] })
      emitDone({ total: 1, complete: true, pages: [{ id: 'real-1', order_index: 0, outline_content: { title: 'Source page', points: ['p'] } }] })
      resolveStream()
      await expect(pending).resolves.toEqual({ complete: true, active: false })
    })

    // B The page remains the same and the error status is empty
    expect(result.current.currentProject?.id).toBe('proj-b')
    expect(result.current.currentProject?.pages).toHaveLength(0)
    expect(result.current.error).toBeNull()
    expect(result.current.isOutlineStreaming).toBe(false)
  })

  it('SSE error Event does not set error and does not throw when arriving after the item has been cut', async () => {
    const { result } = renderHook(() => useProjectStore())
    let emitError!: (message: string) => void
    let resolveStream!: () => void
    vi.mocked(generateOutlineStream).mockImplementationOnce(
      ((projectId: string, callbacks: any) => new Promise<void>((resolve) => {
        emitError = callbacks.onError
        resolveStream = resolve
      })) as any
    )

    act(() => { result.current.setCurrentProject(projectA as any) })
    let pending!: Promise<{ complete: boolean; active: boolean } | undefined>
    act(() => { pending = result.current.generateOutlineStream() })

    // Cut to another item before the flow ends
    act(() => { result.current.setCurrentProject(projectB as any) })

    await act(async () => {
      emitError('AI service unavailable')
      resolveStream()
      await expect(pending).resolves.toEqual({ complete: false, active: false })
    })

    expect(result.current.error).toBeNull()
    expect(result.current.currentProject?.id).toBe('proj-b')
    expect(result.current.currentProject?.pages).toHaveLength(0)
  })

  it('Two projects can be generated simultaneously.，A After that. B Hold on. streaming', async () => {
    const { result } = renderHook(() => useProjectStore())
    const resolvers: Array<() => void> = []
    vi.mocked(generateOutlineStream).mockImplementation(
      () => new Promise<void>((resolve) => { resolvers.push(resolve) })
    )

    act(() => { result.current.setCurrentProject(projectA as any) })
    let pendingA!: Promise<{ complete: boolean; active: boolean } | undefined>
    act(() => { pendingA = result.current.generateOutlineStream() })
    expect(result.current.outlineStreamingProjectIds).toEqual(['proj-a'])
    expect(result.current.isOutlineStreaming).toBe(true)

    act(() => { result.current.setCurrentProject(projectB as any) })
    let pendingB!: Promise<{ complete: boolean; active: boolean } | undefined>
    act(() => { pendingB = result.current.generateOutlineStream() })
    expect([...result.current.outlineStreamingProjectIds].sort()).toEqual(['proj-a', 'proj-b'])
    expect(result.current.isOutlineStreaming).toBe(true)

    // A First completed： clean-up only A，B Still Flowing
    await act(async () => { resolvers[0](); await pendingA })
    expect(result.current.outlineStreamingProjectIds).toEqual(['proj-b'])
    expect(result.current.isOutlineStreaming).toBe(true)

    // B Completed： All cleared
    await act(async () => { resolvers[1](); await pendingB })
    expect(result.current.outlineStreamingProjectIds).toEqual([])
    expect(result.current.isOutlineStreaming).toBe(false)
  })

  it('Stay while initiating the project, the flow failed to set and throw the error', async () => {
    const { result } = renderHook(() => useProjectStore())
    let rejectStream!: (err: Error) => void
    vi.mocked(generateOutlineStream).mockImplementationOnce(
      () => new Promise<void>((_, reject) => { rejectStream = reject })
    )

    act(() => { result.current.setCurrentProject(projectA as any) })

    let pending!: Promise<{ complete: boolean; active: boolean } | undefined>
    act(() => { pending = result.current.generateOutlineStream() })

    await act(async () => {
      rejectStream(new Error('boom'))
      await expect(pending).rejects.toThrow('boom')
    })

    expect(result.current.error).toBe('boom')
    expect(result.current.isOutlineStreaming).toBe(false)
  })

  it('Recall direct return when current task with item already exists', async () => {
    const { result } = renderHook(() => useProjectStore())
    let resolveStream!: () => void
    vi.mocked(generateOutlineStream).mockImplementationOnce(
      () => new Promise<void>((resolve) => { resolveStream = resolve })
    )

    act(() => { result.current.setCurrentProject(projectA as any) })
    let first!: Promise<{ complete: boolean; active: boolean } | undefined>
    act(() => { first = result.current.generateOutlineStream() })
    const second = await act(async () => result.current.generateOutlineStream())
    expect(second).toBeUndefined()
    expect(vi.mocked(generateOutlineStream)).toHaveBeenCalledTimes(1)

    // Reset after close
    resolveStream()
    await act(async () => { await first })
    expect(result.current.isOutlineStreaming).toBe(false)
  })
})
