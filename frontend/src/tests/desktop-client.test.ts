import { afterEach, describe, expect, it, vi } from 'vitest';
afterEach(() => { delete window.go; vi.resetModules(); });
async function native() {
  window.go = { main: { App: {
    Bootstrap: vi.fn().mockResolvedValue({ baseURL: 'http://127.0.0.1:15000', session: 'session', runtime: 'wails', dataDir: 'local' }),
    SaveDownload: vi.fn(), SaveData: vi.fn(), OpenSettings: vi.fn(), OpenDataFolder: vi.fn(), ImportLegacy: vi.fn(), UIReady: vi.fn(),
  } } };
  await (await import('../utils/wails')).initializeWails();
  return import('../api/client');
}
describe('Go API transport', () => {
  it('uses the Vite/same-origin Go API in web mode', async () => {
    const { getBaseURL } = await import('../api/client'); expect(getBaseURL()).toBe('');
  });
  it('adds the native session to Go API requests and file URLs', async () => {
    const { apiClient, getImageUrl } = await native();
    let observed: any;
    await apiClient.get('/api/projects', { adapter: async config => { observed = config; return { data: {}, status: 200, statusText: 'OK', headers: {}, config }; } });
    expect(observed.baseURL).toBe('http://127.0.0.1:15000');
    expect(observed.headers['X-SolA-Session']).toBe('session');
    expect(getImageUrl('/files/test.png')).toBe('http://127.0.0.1:15000/files/test.png?session=session');
  });
  it('does not forward the local session to an external URL', async () => {
    const { apiClient } = await native(); let observed: any;
    await apiClient.get('https://example.org', { adapter: async config => { observed = config; return { data: {}, status: 200, statusText: 'OK', headers: {}, config }; } });
    expect(observed.headers['X-SolA-Session']).toBeUndefined();
  });
});
