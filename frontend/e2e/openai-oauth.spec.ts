import { test, expect } from '@playwright/test';

if (process.env.BANANA_ISSUE_FIXTURES === '1') {
  test.use({ video: 'off', launchOptions: { channel: 'chrome' } });
}

const BASE_URL = process.env.BASE_URL || 'http://localhost:3009';
const DESKTOP_BACKEND_PORT = Number(new URL(process.env.BACKEND_URL || 'http://127.0.0.1:5011').port);

async function getBaseSettings(): Promise<Record<string, unknown>> {
  const resp = await fetch(`${BASE_URL}/api/settings`);
  const json = await resp.json();
  return json.data;
}

async function expandAdvancedSettings(page: import('@playwright/test').Page) {
  const advancedBtn = page.locator('button', { hasText: /\u9ad8\u7ea7\u8bbe\u7f6e|Advanced/ });
  await advancedBtn.waitFor({ state: 'visible', timeout: 10000 });
  await advancedBtn.click();
  await page.waitForTimeout(500);
}

test.describe('OpenAI OAuth Settings Section', () => {
  test.describe('Mock tests — UI logic', () => {
    test('should show OAuth section with login button when not connected', async ({ page }) => {
      const base = await getBaseSettings();
      await page.route('**/api/settings', async (route) => {
        if (route.request().method() === 'GET') {
          await route.fulfill({
            json: { success: true, data: { ...base, openai_oauth_connected: false, openai_oauth_account_id: null } },
          });
        } else {
          await route.continue();
        }
      });

      await page.goto(`${BASE_URL}/settings`);
      await expandAdvancedSettings(page);
      await page.waitForSelector('text=Login with OpenAI');

      const loginBtn = page.locator('button', { hasText: 'Login with OpenAI' });
      await expect(loginBtn).toBeVisible();

      const disconnectBtn = page.locator('button', { hasText: /\u65ad\u5f00\u8fde\u63a5|Disconnect/ });
      await expect(disconnectBtn).not.toBeVisible();
    });

    test('settings still render when sessionStorage persistence is unavailable', async ({ page }) => {
      const base = await getBaseSettings();
      await page.addInitScript(() => {
        const originalSetItem = Storage.prototype.setItem;
        Storage.prototype.setItem = function (key, value) {
          if (key === 'banana-settings') {
            throw new DOMException('Storage disabled', 'SecurityError');
          }
          return originalSetItem.call(this, key, value);
        };
      });
      await page.route('**/api/settings', async (route) => {
        if (route.request().method() === 'GET') {
          await route.fulfill({
            json: { success: true, data: { ...base, openai_oauth_connected: false, openai_oauth_account_id: null } },
          });
        } else {
          await route.continue();
        }
      });

      await page.goto(`${BASE_URL}/settings`);
      await expandAdvancedSettings(page);

      await expect(page.getByRole('button', { name: 'Login with OpenAI' })).toBeVisible();
    });

    test('should show connected state with account ID and disconnect button', async ({ page }) => {
      const base = await getBaseSettings();
      await page.route('**/api/settings', async (route) => {
        if (route.request().method() === 'GET') {
          await route.fulfill({
            json: { success: true, data: { ...base, openai_oauth_connected: true, openai_oauth_account_id: 'user@example.com' } },
          });
        } else {
          await route.continue();
        }
      });

      await page.goto(`${BASE_URL}/settings`);
      await expandAdvancedSettings(page);
      await page.waitForSelector('text=/Connected|Connected/');

      await expect(page.locator('text=user@example.com')).toBeVisible();

      const disconnectBtn = page.locator('button', { hasText: /Disconnect|\u65ad\u5f00\u8fde\u63a5/ });
      await expect(disconnectBtn).toBeVisible();

      const loginBtn = page.locator('button', { hasText: 'Login with OpenAI' });
      await expect(loginBtn).not.toBeVisible();
    });

    test('should call authorize endpoint when login button clicked', async ({ page }) => {
      const base = await getBaseSettings();
      let authorizeCalled = false;

      await page.route('**/api/settings', async (route) => {
        if (route.request().method() === 'GET') {
          await route.fulfill({
            json: { success: true, data: { ...base, openai_oauth_connected: false, openai_oauth_account_id: null } },
          });
        } else {
          await route.continue();
        }
      });

      await page.route('**/api/settings/openai-oauth/authorize', async (route) => {
        authorizeCalled = true;
        await route.fulfill({
          json: { success: true, data: { auth_url: 'https://auth.openai.com/oauth/authorize?client_id=test' } },
        });
      });

      await page.goto(`${BASE_URL}/settings`);
      await expandAdvancedSettings(page);
      await page.waitForSelector('text=Login with OpenAI');

      await page.evaluate(() => {
        (window as any).__openedUrl = null;
        window.open = (url: any) => {
          (window as any).__openedUrl = url;
          return {
            closed: false,
            location: { set href(value: string) { (window as any).__openedUrl = value; } },
            close() {},
          } as unknown as Window;
        };
      });

      await page.click('button:has-text("Login with OpenAI")');
      await page.waitForTimeout(500);

      expect(authorizeCalled).toBe(true);

      const openedUrl = await page.evaluate(() => (window as any).__openedUrl);
      expect(openedUrl).toContain('auth.openai.com');
    });

    test('desktop external-browser login updates automatically without window.opener', async ({ page }) => {
      const base = await getBaseSettings();
      let statusChecks = 0;

      await page.addInitScript((backendPort) => {
        Object.defineProperty(window, 'electronAPI', {
          configurable: true,
          value: {
            isElectron: true,
            getBackendPort: () => backendPort,
            getPlatform: () => 'darwin',
            minimizeWindow: () => undefined,
            maximizeWindow: () => undefined,
            closeWindow: () => undefined,
            zoomIn: () => undefined,
            zoomOut: () => undefined,
            zoomReset: () => undefined,
          },
        });
        window.open = () => null;
      }, DESKTOP_BACKEND_PORT);
      await page.route('**/api/settings', async (route) => {
        if (route.request().method() === 'GET') {
          await route.fulfill({
            json: { success: true, data: { ...base, openai_oauth_connected: false, openai_oauth_account_id: null } },
          });
        } else {
          await route.continue();
        }
      });
      await page.route('**/api/settings/openai-oauth/authorize', async (route) => {
        await route.fulfill({
          json: { success: true, data: { auth_url: 'https://auth.openai.com/oauth/authorize?client_id=test' } },
        });
      });
      await page.route('**/api/settings/openai-oauth/status', async (route) => {
        statusChecks += 1;
        const connected = statusChecks >= 2;
        await route.fulfill({
          json: {
            success: true,
            data: { connected, account_id: connected ? 'desktop@example.com' : null },
          },
        });
      });

      await page.goto(`${BASE_URL}/#/settings`);
      await expandAdvancedSettings(page);
      await page.getByRole('button', { name: 'Login with OpenAI' }).click();

      await expect(page.getByRole('button', { name: /\u8fde\u63a5\u4e2d|Connecting/ })).toBeVisible();
      await expect(page.getByText('desktop@example.com')).toBeVisible({ timeout: 5000 });
      expect(statusChecks).toBeGreaterThanOrEqual(2);
    });

    test('web popup still completes through postMessage', async ({ page }) => {
      const base = await getBaseSettings();
      let callbackSent = false;

      await page.route('**/api/settings', async (route) => {
        if (route.request().method() === 'GET') {
          await route.fulfill({
            json: { success: true, data: { ...base, openai_oauth_connected: false, openai_oauth_account_id: null } },
          });
        } else {
          await route.continue();
        }
      });
      await page.route('**/api/settings/openai-oauth/authorize', async (route) => {
        await route.fulfill({
          json: { success: true, data: { auth_url: 'https://auth.openai.com/oauth/authorize?client_id=test' } },
        });
      });
      await page.route('**/api/settings/openai-oauth/status', async (route) => {
        await route.fulfill({
          json: {
            success: true,
            data: { connected: callbackSent, account_id: callbackSent ? 'web@example.com' : null },
          },
        });
      });

      await page.goto(`${BASE_URL}/settings`);
      await expandAdvancedSettings(page);
      await page.evaluate(() => {
        window.open = () => ({
          closed: false,
          location: { set href(value: string) { (window as any).__openedUrl = value; } },
          close() {},
        }) as unknown as Window;
      });
      await page.getByRole('button', { name: 'Login with OpenAI' }).click();

      await page.waitForFunction(() => (window as any).__openedUrl?.includes('auth.openai.com'));
      callbackSent = true;
      await page.evaluate(() => {
        window.dispatchEvent(new MessageEvent('message', {
          origin: 'http://localhost:1455',
          data: { type: 'openai-oauth-callback', success: true },
        }));
      });

      await expect(page.getByText('web@example.com')).toBeVisible({ timeout: 5000 });
    });

    test('web popup callback failure ends the connecting state', async ({ page }) => {
      const base = await getBaseSettings();

      await page.route('**/api/settings', async (route) => {
        if (route.request().method() === 'GET') {
          await route.fulfill({
            json: { success: true, data: { ...base, openai_oauth_connected: false, openai_oauth_account_id: null } },
          });
        } else {
          await route.continue();
        }
      });
      await page.route('**/api/settings/openai-oauth/authorize', async (route) => {
        await route.fulfill({
          json: { success: true, data: { auth_url: 'https://auth.openai.com/oauth/authorize?client_id=test' } },
        });
      });
      await page.route('**/api/settings/openai-oauth/status', async (route) => {
        await route.fulfill({ json: { success: true, data: { connected: false, account_id: null } } });
      });

      await page.goto(`${BASE_URL}/settings`);
      await expandAdvancedSettings(page);
      await page.evaluate(() => {
        window.open = () => ({
          closed: false,
          location: { set href(value: string) { (window as any).__openedUrl = value; } },
          close() {},
        }) as unknown as Window;
      });
      await page.getByRole('button', { name: 'Login with OpenAI' }).click();
      await page.waitForFunction(() => (window as any).__openedUrl?.includes('auth.openai.com'));
      await page.evaluate(() => {
        window.dispatchEvent(new MessageEvent('message', {
          origin: 'http://localhost:1455',
          data: { type: 'openai-oauth-callback', success: false, message: 'Access denied' },
        }));
      });

      await expect(page.getByText('Access denied')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Login with OpenAI' })).toBeEnabled();
    });

    test('blocked web popup does not stay in the connecting state', async ({ page }) => {
      const base = await getBaseSettings();

      await page.route('**/api/settings', async (route) => {
        if (route.request().method() === 'GET') {
          await route.fulfill({
            json: { success: true, data: { ...base, openai_oauth_connected: false, openai_oauth_account_id: null } },
          });
        } else {
          await route.continue();
        }
      });
      await page.route('**/api/settings/openai-oauth/authorize', async (route) => {
        await route.fulfill({
          json: { success: true, data: { auth_url: 'https://auth.openai.com/oauth/authorize?client_id=test' } },
        });
      });

      await page.goto(`${BASE_URL}/settings`);
      await expandAdvancedSettings(page);
      await page.evaluate(() => {
        window.open = () => null;
      });
      await page.getByRole('button', { name: 'Login with OpenAI' }).click();

      await expect(page.getByText(/\u767b\u5f55\u7a97\u53e3\u88ab\u6d4f\u89c8\u5668\u62e6\u622a|login window was blocked/i)).toBeVisible();
      await expect(page.getByRole('button', { name: 'Login with OpenAI' })).toBeEnabled();
    });

    test('immediately closed web popup is treated as blocked', async ({ page }) => {
      const base = await getBaseSettings();

      await page.route('**/api/settings', async (route) => {
        if (route.request().method() === 'GET') {
          await route.fulfill({
            json: { success: true, data: { ...base, openai_oauth_connected: false, openai_oauth_account_id: null } },
          });
        } else {
          await route.continue();
        }
      });
      await page.route('**/api/settings/openai-oauth/authorize', async (route) => {
        await route.fulfill({
          json: { success: true, data: { auth_url: 'https://auth.openai.com/oauth/authorize?client_id=test' } },
        });
      });

      await page.goto(`${BASE_URL}/settings`);
      await expandAdvancedSettings(page);
      await page.evaluate(() => {
        window.open = () => ({ closed: true }) as Window;
      });
      await page.getByRole('button', { name: 'Login with OpenAI' }).click();

      await expect(page.getByText(/\u767b\u5f55\u7a97\u53e3\u88ab\u6d4f\u89c8\u5668\u62e6\u622a|login window was blocked/i)).toBeVisible();
      await expect(page.getByRole('button', { name: 'Login with OpenAI' })).toBeEnabled();
    });

    test('should auto-open manual callback when localhost callback port is unavailable', async ({ page }) => {
      const base = await getBaseSettings();

      await page.route('**/api/settings', async (route) => {
        if (route.request().method() === 'GET') {
          await route.fulfill({
            json: { success: true, data: { ...base, openai_oauth_connected: false, openai_oauth_account_id: null } },
          });
        } else {
          await route.continue();
        }
      });

      await page.route('**/api/settings/openai-oauth/authorize', async (route) => {
        await route.fulfill({
          json: {
            success: true,
            data: {
              auth_url: 'https://auth.openai.com/oauth/authorize?client_id=test',
              callback_server_available: false,
            },
          },
        });
      });

      await page.goto(`${BASE_URL}/settings`);
      await expandAdvancedSettings(page);
      await page.waitForSelector('text=Login with OpenAI');

      await page.evaluate(() => {
        (window as any).__openedUrl = null;
        window.open = (url: any) => {
          (window as any).__openedUrl = url;
          return {
            closed: false,
            location: { set href(value: string) { (window as any).__openedUrl = value; } },
            close() {},
          } as unknown as Window;
        };
      });

      await page.click('button:has-text("Login with OpenAI")');

      await expect(page.getByText('I’ve detected the machine. 1455 Port is occupied, please log in and copy the full address in the bullet window address bar and paste to the bottom。')).toBeVisible();
      await expect(page.getByPlaceholder('Paste BacktoAdd address...')).toBeVisible();

      const openedUrl = await page.evaluate(() => (window as any).__openedUrl);
      expect(openedUrl).toContain('auth.openai.com');
    });

    test('should call disconnect endpoint and update UI', async ({ page }) => {
      const base = await getBaseSettings();
      let disconnectCalled = false;

      await page.route('**/api/settings', async (route) => {
        if (route.request().method() === 'GET') {
          await route.fulfill({
            json: { success: true, data: { ...base, openai_oauth_connected: true, openai_oauth_account_id: 'user@example.com' } },
          });
        } else {
          await route.continue();
        }
      });

      await page.route('**/api/settings/openai-oauth/disconnect', async (route) => {
        disconnectCalled = true;
        await route.fulfill({
          json: { success: true, data: { message: 'Disconnected' } },
        });
      });

      await page.goto(`${BASE_URL}/settings`);
      await expandAdvancedSettings(page);
      await page.waitForSelector('text=/Connected|Connected/');

      const disconnectBtn = page.locator('button', { hasText: /Disconnect|\u65ad\u5f00\u8fde\u63a5/ });
      await disconnectBtn.click();
      await page.waitForTimeout(500);

      expect(disconnectCalled).toBe(true);

      await expect(page.locator('button', { hasText: 'Login with OpenAI' })).toBeVisible();
    });

    test('should submit manual callback URL and update connected state', async ({ page }) => {
      const base = await getBaseSettings();
      let manualCallbackPayload: Record<string, unknown> | null = null;
      let statusCalls = 0;

      await page.route('**/api/settings', async (route) => {
        if (route.request().method() === 'GET') {
          await route.fulfill({
            json: { success: true, data: { ...base, openai_oauth_connected: false, openai_oauth_account_id: null } },
          });
        } else {
          await route.continue();
        }
      });

      await page.route('**/api/settings/openai-oauth/manual-callback', async (route) => {
        manualCallbackPayload = route.request().postDataJSON();
        await route.fulfill({
          json: { success: true, data: { message: 'Connected', account_id: 'user@example.com' } },
        });
      });

      await page.route('**/api/settings/openai-oauth/status', async (route) => {
        statusCalls += 1;
        await route.fulfill({
          json: { success: true, data: { connected: true, account_id: 'user@example.com' } },
        });
      });

      await page.goto(`${BASE_URL}/settings`);
      await expandAdvancedSettings(page);
      await page.getByRole('button', { name: /\u767b\u5f55\u540e\u8fde\u63a5\u5931\u8d25|Connection failed after login/ }).click();

      const callbackUrl = 'http://localhost:1455/auth/callback?code=auth-code&state=state-123';
      await page.getByPlaceholder(/\u7c98\u8d34\u56de\u8c03\u5730\u5740|Paste callback URL/).fill(callbackUrl);
      await page.getByRole('button', { name: /\u63d0\u4ea4|Submit/ }).click();

      await expect(page.locator('text=user@example.com')).toBeVisible();
      expect(manualCallbackPayload).toEqual({ callback_url: callbackUrl });
      expect(statusCalls).toBe(0);
    });

    test('should mark OAuth disconnected after Codex settings test returns unauthorized', async ({ page }) => {
      const base = await getBaseSettings();

      await page.route('**/api/settings', async (route) => {
        if (route.request().method() === 'GET') {
          await route.fulfill({
            json: { success: true, data: { ...base, openai_oauth_connected: true, openai_oauth_account_id: 'user@example.com' } },
          });
        } else {
          await route.continue();
        }
      });

      await page.route('**/api/settings/tests/text-model', async (route) => {
        await route.fulfill({
          json: { success: true, data: { task_id: 'codex-expired-task', status: 'PENDING' } },
        });
      });

      await page.route('**/api/settings/tests/codex-expired-task/status', async (route) => {
        await route.fulfill({
          json: {
            success: true,
            data: {
              status: 'FAILED',
              error: 'Codex Login expired or invalid, disconnected OpenAI Account connection. Please log back in OpenAI Then we’ll test it.。',
              openai_oauth_disconnected: true,
            },
          },
        });
      });

      await page.goto(`${BASE_URL}/settings`);
      await expandAdvancedSettings(page);
      await expect(page.locator('text=user@example.com')).toBeVisible();

      const textModelTestBtn = page.locator('button', { hasText: /\u5f00\u59cb\u6d4b\u8bd5|Start Test/ }).nth(1);
      await textModelTestBtn.click();

      await expect(page.locator('button', { hasText: 'Login with OpenAI' })).toBeVisible({ timeout: 5000 });
      await expect(page.locator('text=user@example.com')).not.toBeVisible();
      await expect(page.getByText('Codex Login expired or invalid, disconnected OpenAI Account connection. Please log back in OpenAI Then we’ll test it.。', { exact: true })).toBeVisible();
    });
  });

  test.describe('Integration tests — real backend', () => {
    test('OAuth status endpoint returns valid response', async ({ request }) => {
      const resp = await request.get(`${BASE_URL}/api/settings/openai-oauth/status`);
      expect(resp.ok()).toBeTruthy();
      const data = await resp.json();
      expect(data.success).toBe(true);
      expect(typeof data.data.connected).toBe('boolean');
      if (data.data.connected) {
        expect(data.data.account_id).toBeTruthy();
      } else {
        expect(data.data.account_id).toBeNull();
      }
    });

    test('OAuth authorize endpoint returns valid auth URL', async ({ request }) => {
      const resp = await request.get(`${BASE_URL}/api/settings/openai-oauth/authorize`);
      expect(resp.ok()).toBeTruthy();
      const data = await resp.json();
      expect(data.success).toBe(true);
      expect(data.data.auth_url).toContain('https://auth.openai.com/oauth/authorize');
      expect(data.data.auth_url).toContain('client_id=app_EMoamEEZ73f0CkXaXp7hrann');
      expect(data.data.auth_url).toContain('code_challenge=');
      expect(data.data.auth_url).toContain('code_challenge_method=S256');
      expect(data.data.auth_url).toContain('originator=codex_cli_rs');
      expect(data.data.auth_url).toContain('localhost%3A1455');
      expect(typeof data.data.callback_server_available).toBe('boolean');
    });

    test('OAuth disconnect endpoint works even when not connected', async ({ request }) => {
      const resp = await request.post(`${BASE_URL}/api/settings/openai-oauth/disconnect`);
      expect(resp.ok()).toBeTruthy();
      const data = await resp.json();
      expect(data.success).toBe(true);
    });

    test('Settings API includes OAuth fields', async ({ request }) => {
      const resp = await request.get(`${BASE_URL}/api/settings`);
      expect(resp.ok()).toBeTruthy();
      const data = await resp.json();
      expect(data.success).toBe(true);
      expect(data.data).toHaveProperty('openai_oauth_connected');
      expect(typeof data.data.openai_oauth_connected).toBe('boolean');
    });

    test('OAuth section renders correctly with real backend', async ({ page }) => {
      await page.goto(`${BASE_URL}/settings`);
      await expandAdvancedSettings(page);

      const loginBtn = page.locator('button', { hasText: 'Login with OpenAI' });
      const disconnectBtn = page.locator('button', { hasText: /Disconnect|\u65ad\u5f00\u8fde\u63a5/ });
      const hasLogin = await loginBtn.isVisible().catch(() => false);
      const hasDisconnect = await disconnectBtn.isVisible().catch(() => false);
      expect(hasLogin || hasDisconnect).toBeTruthy();
    });
  });
});
