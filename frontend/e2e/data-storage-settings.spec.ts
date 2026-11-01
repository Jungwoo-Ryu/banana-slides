import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const calls: Array<{ path: string; allowInitialize: boolean }> = [];
    Object.defineProperty(window, '__dataStorageApplyCalls', { value: calls });
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        isElectron: true,
        getBackendPort: () => 5000,
        getPlatform: () => 'win32',
        minimizeWindow: () => undefined,
        maximizeWindow: () => undefined,
        closeWindow: () => undefined,
        zoomIn: () => undefined,
        zoomOut: () => undefined,
        zoomReset: () => undefined,
        checkForUpdates: async () => null,
        getAppVersion: async () => '0.9.0',
        openExternal: () => undefined,
        downloadFile: async () => ({ success: true }),
        getDataStorageInfo: async () => ({
          dataRoot: 'C:\\Users\\Test\\AppData\\Roaming\\banana-slides-desktop',
          isDefault: true,
          hasDatabase: true,
          configurable: true,
        }),
        chooseDataStorageDirectory: async () => 'D:\\Banana Slides Data',
        inspectDataStorageDirectory: async (path: string) => ({
          dataRoot: path,
          exists: true,
          writable: true,
          hasDatabase: false,
          isEmpty: true,
        }),
        openDataStorageDirectory: async () => ({ success: true }),
        applyDataStorageDirectory: async (path: string, allowInitialize: boolean) => {
          calls.push({ path, allowInitialize });
          return { success: true, restarting: true };
        },
      },
    });
  });
  await page.route((url) => url.pathname.startsWith('/api/'), async (route) => {
    await route.fulfill({ json: { success: true, data: {} } });
  });
});

test('desktop settings requires explicit confirmation before using an empty custom data location', async ({ page }) => {
  await page.goto('/#/settings');

  await expect(page.getByRole('heading', { name: /\u6570\u636e\u5b58\u50a8\u4f4d\u7f6e|Data storage location/ })).toBeHidden();
  await page.getByRole('button', { name: /\u9ad8\u7ea7\u8bbe\u7f6e|Advanced Settings/ }).click();
  await expect(page.getByRole('heading', { name: /\u6570\u636e\u5b58\u50a8\u4f4d\u7f6e|Data storage location/ })).toBeVisible();
  const storagePath = page.getByLabel(/\u5b58\u50a8\u8def\u5f84|Storage path/);
  await expect(storagePath).toHaveValue('C:\\Users\\Test\\AppData\\Roaming\\banana-slides-desktop');
  await expect(page.getByText(/\u4e0d\u4f1a\u81ea\u52a8\u79fb\u52a8\u6216\u5220\u9664\u5df2\u6709\u6570\u636e|does not move or delete existing data automatically/)).toBeVisible();

  const browse = page.getByRole('button', { name: /\u6d4f\u89c8|Browse/ });
  await expect(browse).toHaveCSS('white-space', 'nowrap');
  await browse.click();
  await expect(storagePath).toHaveValue('D:\\Banana Slides Data');
  await page.getByRole('button', { name: /\u4fdd\u5b58\u5e76\u91cd\u542f|Save and restart/ }).click();

  const confirm = page.getByRole('button', { name: /\u786e\u8ba4\u5e76\u91cd\u542f|Confirm and restart/ });
  await expect(confirm).toBeDisabled();
  await page.getByRole('checkbox').check();
  await expect(confirm).toBeEnabled();
  await confirm.click();

  await expect.poll(() => page.evaluate(() => (
    window as typeof window & { __dataStorageApplyCalls?: unknown[] }
  ).__dataStorageApplyCalls)).toEqual([
    { path: 'D:\\Banana Slides Data', allowInitialize: true },
  ]);
});
