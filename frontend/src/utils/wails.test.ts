import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => { delete window.go; vi.restoreAllMocks(); vi.resetModules(); });
function native() {
  const api = {
    Bootstrap: vi.fn().mockResolvedValue({ baseURL: 'http://127.0.0.1:51234', session: 'local-token', runtime: 'wails', dataDir: 'C:/SolA' }),
    SaveDownload: vi.fn().mockResolvedValue('C:/saved.pptx'), SaveData: vi.fn().mockResolvedValue('C:/saved.zip'),
    OpenSettings: vi.fn(), OpenDataFolder: vi.fn(), ImportLegacy: vi.fn(), UIReady: vi.fn(),
  };
  window.go = { main: { App: api } };
  return api;
}
describe('Wails native boundary', () => {
  it('uses no session in ordinary web mode', async () => {
    const bridge = await import('./wails'); await bridge.initializeWails();
    expect(bridge.sessionHeaders()).toEqual({}); expect(bridge.isWails()).toBe(false);
  });
  it('authenticates local file URLs and keeps version query parameters', async () => {
    native(); const bridge = await import('./wails'); await bridge.initializeWails();
    expect(bridge.sessionHeaders()).toEqual({ 'X-SolA-Session': 'local-token' });
    const parsed = new URL(bridge.desktopFileURL('/files/project/pages/image.png?v=123'));
    expect(parsed.searchParams.get('v')).toBe('123'); expect(parsed.searchParams.get('session')).toBe('local-token');
    expect(bridge.desktopFileURL('https://example.org/image.png')).toBe('https://example.org/image.png');
  });
  it('saves via the native file dialog and refuses remote downloads', async () => {
    const api = native(); const bridge = await import('./wails'); await bridge.initializeWails();
    await bridge.saveNative('/files/project/exports/deck.pptx', 'deck.pptx');
    expect(api.SaveDownload).toHaveBeenCalledWith('/files/project/exports/deck.pptx', 'deck.pptx');
    await expect(bridge.saveNative('https://example.org/file.pptx', 'file.pptx')).rejects.toThrow('앱에서 생성한 파일');
    expect(api.SaveDownload).toHaveBeenCalledTimes(1);
  });
  it('rejects a non-loopback bootstrap address', async () => {
    const api = native(); api.Bootstrap.mockResolvedValue({ baseURL: 'https://evil.example', session: 'token' });
    const bridge = await import('./wails'); await expect(bridge.initializeWails()).rejects.toThrow('로컬');
  });
});
