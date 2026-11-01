import { beforeEach, afterEach, expect, it, vi } from 'vitest';
const api = vi.hoisted(() => ({ generateImages: vi.fn(), getTaskStatus: vi.fn() }));
vi.mock('@/api/endpoints', () => api);
let store: typeof import('@/store/useProjectStore')['useProjectStore'];
let flush: ReturnType<typeof vi.fn>;
let sync: ReturnType<typeof vi.fn>;
let poll: ReturnType<typeof vi.fn>;
const project = { id: 'project', project_id: 'project', pages: [{ id: 'one' }, { id: 'two' }] } as any;
beforeEach(async () => {
  vi.resetModules(); vi.useFakeTimers(); vi.clearAllMocks();
  store = (await import('@/store/useProjectStore')).useProjectStore;
  flush = vi.fn().mockResolvedValue(true); sync = vi.fn().mockResolvedValue(undefined); poll = vi.fn();
  store.setState({ currentProject: project, pageGeneratingTasks: {}, flushPendingPageUpdates: flush, syncProject: sync });
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

it('awaits pending edits before requesting generation and excludes already running pages', async () => {
  let finish!: (ok: boolean) => void;
  flush.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  api.generateImages.mockResolvedValue({ data: { task_id: 'new-task' } });
  store.setState({ pageGeneratingTasks: { one: 'existing-task' }, pollImageTask: poll });
  const result = store.getState().generateImages();
  expect(api.generateImages).not.toHaveBeenCalled();
  finish(true); await result;
  expect(api.generateImages).toHaveBeenCalledWith('project', undefined, ['two']);
  expect(store.getState().pageGeneratingTasks).toEqual({ one: 'existing-task', two: 'new-task' });
});

it('does not call the model when saving edits fails', async () => {
  flush.mockResolvedValue(false); store.setState({ pollImageTask: poll });
  await expect(store.getState().generateImages()).rejects.toThrow('저장');
  expect(api.generateImages).not.toHaveBeenCalled();
  expect(store.getState().error).toContain('저장');
});

it('does not submit an old project after navigation while saving', async () => {
  flush.mockImplementationOnce(async () => { store.setState({ currentProject: { ...project, project_id: 'other' } }); return true; });
  await store.getState().generateImages();
  expect(api.generateImages).not.toHaveBeenCalled();
});

it('surfaces partial batch failures, releases failed tasks and preserves unrelated active work', async () => {
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  const message = '2개 중 1개 이미지 생성에 실패했습니다. Azure 이미지 배포의 API 키와 접근 권한을 확인하세요.';
  const pageErrors = [{ page_id: 'one', stage: 'azure_image_request', http_status: 401, provider_request_id: 'azure-id' }];
  api.getTaskStatus.mockResolvedValue({ data: { status: 'FAILED', error_message: message, progress: { completed: 1, failed: 1, page_errors: pageErrors } } });
  store.setState({ pageGeneratingTasks: { one: 'batch', two: 'other-task' } });
  await store.getState().pollImageTask('batch', ['one', 'two']);
  await vi.waitFor(() => expect(store.getState().error).toBe(message));
  expect(store.getState().pageGeneratingTasks).toEqual({ two: 'other-task' });
  expect(sync).toHaveBeenCalledTimes(1);
  expect(consoleError).toHaveBeenCalledWith('[Sol.A image-generation]', expect.objectContaining({ task_id: 'batch', page_errors: pageErrors }));
  consoleError.mockRestore();
});
