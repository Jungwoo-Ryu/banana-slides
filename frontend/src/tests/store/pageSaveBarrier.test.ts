import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const { narration, getProject } = vi.hoisted(() => ({ narration: vi.fn(), getProject: vi.fn() }));
vi.mock('@/api/endpoints', () => ({ updatePageNarration: narration, getProject }));
let store: typeof import('@/store/useProjectStore')['useProjectStore'];
const project = (id: string) => ({ id, project_id: id, pages: [{ id: `${id}-page`, narration_text: '' }] } as any);
beforeEach(async () => {
  vi.resetModules(); vi.useFakeTimers(); narration.mockReset(); getProject.mockReset();
  store = (await import('@/store/useProjectStore')).useProjectStore;
  store.setState({ currentProject: project('a'), pageGeneratingTasks: { hold: 'task' } });
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

describe('page save barrier before export', () => {
  it('explicit save waits for the request and a newer edit before export', async () => {
    let complete!: () => void;
    narration.mockImplementationOnce(() => new Promise<void>(resolve => { complete = resolve; })).mockResolvedValueOnce({});
    store.getState().updatePageLocal('a-page', { narration_text: 'First edit' });
    const first = store.getState().saveAllPages();
    await vi.waitFor(() => expect(narration).toHaveBeenCalledTimes(1));
    store.getState().updatePageLocal('a-page', { narration_text: 'Last reviewed edit' });
    let exported = false;
    const barrier = store.getState().flushPendingPageUpdates().then(ok => { exported = ok; });
    await Promise.resolve(); expect(exported).toBe(false);
    complete(); await first; await barrier;
    expect(narration.mock.calls).toEqual([['a', 'a-page', 'First edit'], ['a', 'a-page', 'Last reviewed edit']]);
    expect(exported).toBe(true);
    expect(store.getState().isSavingPages).toBe(false);
  });

  it('blocks export on a failed save and retries the newest text', async () => {
    narration.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({});
    store.getState().updatePageLocal('a-page', { narration_text: 'Unsaved' });
    expect(await store.getState().flushPendingPageUpdates()).toBe(false);
    store.getState().updatePageLocal('a-page', { narration_text: 'Reviewed after failure' });
    expect(await store.getState().flushPendingPageUpdates()).toBe(true);
    expect(narration).toHaveBeenLastCalledWith('a', 'a-page', 'Reviewed after failure');
  });

  it('does not attribute queued edits to a newly opened project', async () => {
    narration.mockResolvedValue({});
    store.getState().updatePageLocal('a-page', { narration_text: 'Project A' });
    store.getState().setCurrentProject(project('b'));
    store.getState().updatePageLocal('b-page', { narration_text: 'Project B' });
    expect(await store.getState().flushPendingPageUpdates()).toBe(true);
    expect(narration.mock.calls).toEqual([['a', 'a-page', 'Project A'], ['b', 'b-page', 'Project B']]);
    expect(store.getState().currentProject?.id).toBe('b');
  });
});
