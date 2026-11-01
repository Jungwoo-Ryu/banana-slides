import { test, expect, type Page } from '@playwright/test';

const mockSettings = {
  success: true,
  message: 'Success',
  data: {
    id: 1,
    ai_provider_format: 'gemini',
    api_base_url: '',
    api_key_length: 0,
    text_model: 'doubao-seed-2-0',
    image_model: 'doubao-seedream-4-0',
    image_caption_model: 'doubao-seed-2-0',
    image_resolution: '2K',
    image_aspect_ratio: '16:9',
    max_description_workers: 5,
    max_image_workers: 8,
    output_language: 'zh',
    description_generation_mode: 'streaming',
    description_extra_fields: ['Visual assets', 'Layout and emphasis', 'Speaker notes'],
    image_prompt_extra_fields: ['Visual assets', 'Layout and emphasis'],
    enable_text_reasoning: false,
    text_thinking_budget: 1024,
    enable_image_reasoning: false,
    image_thinking_budget: 1024,
    mineru_api_base: '',
    mineru_token_length: 0,
    baidu_api_key_length: 0,
    text_model_source: '',
    image_model_source: '',
    image_caption_model_source: '',
    lazyllm_api_keys_info: {},
    text_api_key_length: 0,
    text_api_base_url: '',
    image_api_key_length: 0,
    image_api_base_url: '',
    image_caption_api_key_length: 0,
    image_caption_api_base_url: '',
    openai_image_api_protocol: 'auto',
    openai_oauth_connected: false,
    openai_oauth_account_id: null,
    elevenlabs_enabled: false,
    elevenlabs_api_key_length: 0,
    elevenlabs_voice_id: '',
  },
};

const modelInputs = (page: Page) =>
  page.locator('input[placeholder^="Empty Use Environmental Variable Configuration"]');

const globalProviderPill = (page: Page, provider: string) =>
  page.getByTestId('global-provider-pills').locator(`[data-provider="${provider}"]`);

const modelProviderSelect = (page: Page, source: 'text' | 'image' | 'image_caption') =>
  page.getByTestId(`${source}_model_source-select`);

test.describe('Settings: Volcengine AgentPlans provider', () => {
  test.use({ locale: 'zh-CN' });

  let savedSettingsPayload: Record<string, unknown> | null;

  test.beforeEach(async ({ page }) => {
    savedSettingsPayload = null;

    await page.route('**/api/settings', async route => {
      if (route.request().method() === 'PUT') {
        const payload = route.request().postDataJSON() as Record<string, unknown>;
        savedSettingsPayload = payload;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            ...mockSettings,
            data: { ...mockSettings.data, ...payload },
          }),
        });
        return;
      }

      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockSettings) });
    });
  });

  test('shows exposed providers and the Volcengine benefits before the user selects it', async ({ page }) => {
    await page.goto('/settings');

    const pills = page.getByTestId('global-provider-pills').locator('[data-provider]');
    await expect(pills).toHaveCount(13);
    await expect(globalProviderPill(page, 'gemini')).toHaveAttribute('aria-checked', 'true');
    await expect(globalProviderPill(page, 'openai')).toBeVisible();
    await expect(globalProviderPill(page, 'ppio')).toHaveCount(0);
    await expect(globalProviderPill(page, 'aiping')).toHaveCount(0);
    await expect(globalProviderPill(page, 'volcengine')).toContainText('Volcanic Agent Plan');
    await expect(globalProviderPill(page, 'volcengine')).toContainText('Direct domestic company');
    await expect(globalProviderPill(page, 'volcengine')).not.toContainText('High value for money');
    await expect(globalProviderPill(page, 'doubao')).toContainText('Doubao（Bean buns.）');
    await expect(globalProviderPill(page, 'doubao')).not.toContainText('Direct domestic company');

    await globalProviderPill(page, 'volcengine').click();
    await expect(globalProviderPill(page, 'volcengine')).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByText('Why the volcano? Agent Plan？')).toBeVisible();
    await expect(page.getByText(/\u76f8\u6bd4\u6d77\u5916\u4e3b\u6d41\u5b98\u65b9 API，\u4ef7\u683c\u66f4\u4f4e、\u6027\u4ef7\u6bd4\u66f4\u9ad8，\u751f\u6210\u6548\u679c\u63a5\u8fd1/)).toBeVisible();
  });

  test('replaces AIHubMix promo with Volcengine AgentPlans promo when selected', async ({ page }) => {
    await page.goto('/settings');

    await globalProviderPill(page, 'volcengine').click();

    const globalApiSection = page.getByTestId('global-api-config-section');
    // Agent Plans End Editable, and did not fill out obsolete automatic prefilling exclusives Base URL
    await expect(globalApiSection.getByText('API Base URL')).toBeVisible();
    await expect(globalApiSection.locator('input').first()).toHaveValue('https://ark.cn-beijing.volces.com/api/plan/v3');
    await expect(globalApiSection.locator('input[type="password"]').first()).toBeVisible();

    await globalProviderPill(page, 'openai').click();
    await expect(globalApiSection.getByText('API Base URL')).toBeVisible();
    // Leave. Agent Plans It’s outdated. plan/v3 End must be emptied., Otherwise, it will be. openai It’s... base Save
    await expect(globalApiSection.locator('input').first()).toHaveValue('');

    await globalProviderPill(page, 'volcengine').click();
    await expect(globalApiSection.getByText('API Base URL')).toBeVisible();
    await expect(globalApiSection.locator('input').first()).toHaveValue('https://ark.cn-beijing.volces.com/api/plan/v3');
    await modelProviderSelect(page, 'text').selectOption('volcengine');
    // per-model It’s... Base URL The input box is also editable (current group only) source=volcengine Show time）,
    // The empty default is also replaced with Agent Plans Exclusive Endpoints
    await expect(page.getByPlaceholder('Use default for empty Base URL')).toHaveCount(1);
    await expect(page.getByPlaceholder('Use default for empty Base URL'))
      .toHaveValue('https://ark.cn-beijing.volces.com/api/plan/v3');

    const promo = page.getByTestId('volcengine-campaign-promo');
    await expect(promo.getByText('Why the volcano? Agent Plan？')).toBeVisible();
    await expect(promo.getByText(/\u76f8\u6bd4\u6d77\u5916\u4e3b\u6d41\u5b98\u65b9 API，\u4ef7\u683c\u66f4\u4f4e、\u6027\u4ef7\u6bd4\u66f4\u9ad8，\u751f\u6210\u6548\u679c\u63a5\u8fd1/)).toBeVisible();
    await expect(promo.getByText(/\u56fd\u5185\u76f4\u8fde，\u65e0\u9700\u7279\u6b8a\u7f51\u7edc\u73af\u5883/)).toBeVisible();
    await expect(promo.getByText(/\u4e0d\u5c40\u9650\u4e8e Banana Slides/)).toBeVisible();
    await expect(promo.getByText(/Agent Plan \/ Coding Plan \u9650\u65f6\u6298\u6263/)).toBeVisible();
    await expect(promo.getByText(/\u514d\u8d39 Tokens/)).toBeVisible();
    await expect(promo.getByText('Subscription to and access volcanoes AgentPlans API Key')).toBeVisible();
    await expect(promo.getByText('Enter Agent Plan Console')).toBeVisible();
    await expect(promo.getByText(/\u5728 Agent Plan \u63a7\u5236\u53f0\u521b\u5efa\u4e13\u5c5e API Key/)).toBeVisible();
    await expect(promo.getByRole('link', { name: 'API Key Console' })).toHaveAttribute(
      'href',
      'https://ai.volcengine.com/console/apikey'
    );
    await expect(page.getByText('Click Topbar「Fill」')).not.toBeVisible();
    await expect(page.getByText(/\u611f\u8c22\u706b\u5c71\u5f15\u64ce\u8d5e\u52a9/)).not.toBeVisible();
    await expect(page.getByText('AIHubmix Applications API key')).not.toBeVisible();
    await expect(page.locator('img[alt="Volcanic engines"]')).toBeVisible();

    const volcengineLink = page.getByRole('link', { name: 'View preferences and subscribe to them' }).first();
    await expect(volcengineLink).toHaveAttribute('href', 'https://www.volcengine.com/activity/ai618?utm_campaign=hw&utm_content=hw&utm_medium=devrel_tool_web&utm_source=OWO&utm_term=banana-slides');

    await page.getByRole('button', { name: 'Type one to fill in the recommended model' }).click();
    const inputs = modelInputs(page);
    await expect(inputs.nth(0)).toHaveValue('doubao-seed-2.1-turbo');
    await expect(inputs.nth(1)).toHaveValue('doubao-seedream-5.0-lite');
    await expect(inputs.nth(2)).toHaveValue('doubao-seed-2.1-turbo');
    await expect(modelProviderSelect(page, 'text')).toHaveValue('volcengine');
    await expect(modelProviderSelect(page, 'image')).toHaveValue('volcengine');
    await expect(page.getByTestId('openai-image-api-protocol-select')).toHaveValue('images');
    await expect(modelProviderSelect(page, 'image_caption')).toHaveValue('volcengine');

    await page.getByRole('button', { name: /\u4fdd\u5b58\u8bbe\u7f6e/ }).click();
    await expect(page.getByText('Settings saved successfully')).toBeVisible();
    expect(savedSettingsPayload?.ai_provider_format).toBe('volcengine');
    expect(savedSettingsPayload?.text_model).toBe('doubao-seed-2.1-turbo');
    expect(savedSettingsPayload?.image_model).toBe('doubao-seedream-5.0-lite');
    expect(savedSettingsPayload?.image_caption_model).toBe('doubao-seed-2.1-turbo');
    expect(savedSettingsPayload?.text_model_source).toBe('volcengine');
    expect(savedSettingsPayload?.image_model_source).toBe('volcengine');
    expect(savedSettingsPayload?.image_caption_model_source).toBe('volcengine');
    expect(savedSettingsPayload?.openai_image_api_protocol).toBe('images');
    expect(savedSettingsPayload?.api_base_url).toBe('https://ark.cn-beijing.volces.com/api/plan/v3');
    // per-model base It’s got to be visible. Agent Plans Peer: Empty values will allow service testing before saving
    // And the same-name environment variable continues to hit out of date. {MODEL}_API_BASE
    expect(savedSettingsPayload?.text_api_base_url).toBe('https://ark.cn-beijing.volces.com/api/plan/v3');
    expect(savedSettingsPayload?.image_api_base_url).toBe('https://ark.cn-beijing.volces.com/api/plan/v3');
    expect(savedSettingsPayload?.image_caption_api_base_url).toBe('https://ark.cn-beijing.volces.com/api/plan/v3');
  });

  test('one-click setup replaces stale per-model base URLs with the Agent Plans endpoint', async ({ page }) => {
    await page.unroute('**/api/settings');
    await page.route('**/api/settings', async route => {
      if (route.request().method() === 'PUT') {
        const payload = route.request().postDataJSON() as Record<string, unknown>;
        savedSettingsPayload = payload;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            ...mockSettings,
            data: { ...mockSettings.data, ...payload },
          }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ...mockSettings,
          data: {
            ...mockSettings.data,
            ai_provider_format: 'openai',
            api_base_url: 'https://api.openai.com/v1',
            text_model_source: 'openai',
            text_api_base_url: 'https://api.openai.com/v1',
            image_model_source: 'gemini',
            image_api_base_url: 'https://generativelanguage.googleapis.com',
            image_caption_model_source: 'openai',
            image_caption_api_base_url: 'https://api.openai.com/v1',
          },
        }),
      });
    });

    await page.goto('/settings');

    await globalProviderPill(page, 'volcengine').click();
    await page.getByRole('button', { name: 'Type one to fill in the recommended model' }).click();

    // One-key configuration went straight through. handleFieldChange to replace the logic of: Three. per-model base
    // It has to be old. provider End Replace with Agent Plans Peer, It’s not empty.
    const baseInputs = page.getByPlaceholder('Use default for empty Base URL');
    await expect(baseInputs).toHaveCount(3);
    await expect(baseInputs.nth(0)).toHaveValue('https://ark.cn-beijing.volces.com/api/plan/v3');
    await expect(baseInputs.nth(1)).toHaveValue('https://ark.cn-beijing.volces.com/api/plan/v3');
    await expect(baseInputs.nth(2)).toHaveValue('https://ark.cn-beijing.volces.com/api/plan/v3');

    await page.getByRole('button', { name: /\u4fdd\u5b58\u8bbe\u7f6e/ }).click();
    await expect(page.getByText('Settings saved successfully')).toBeVisible();
    expect(savedSettingsPayload?.text_api_base_url).toBe('https://ark.cn-beijing.volces.com/api/plan/v3');
    expect(savedSettingsPayload?.image_api_base_url).toBe('https://ark.cn-beijing.volces.com/api/plan/v3');
    expect(savedSettingsPayload?.image_caption_api_base_url).toBe('https://ark.cn-beijing.volces.com/api/plan/v3');
  });

  test('one-click setup preserves custom base URLs', async ({ page }) => {
    await page.unroute('**/api/settings');
    await page.route('**/api/settings', async route => {
      if (route.request().method() === 'PUT') {
        const payload = route.request().postDataJSON() as Record<string, unknown>;
        savedSettingsPayload = payload;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            ...mockSettings,
            data: { ...mockSettings.data, ...payload },
          }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ...mockSettings,
          data: {
            ...mockSettings.data,
            ai_provider_format: 'volcengine',
            api_base_url: 'https://custom-proxy.example.com/v1',
            text_model_source: 'volcengine',
            text_api_base_url: 'https://custom-proxy.example.com/v1',
            image_model_source: 'volcengine',
            image_api_base_url: 'https://custom-proxy.example.com/v1',
            image_caption_model_source: 'volcengine',
            image_caption_api_base_url: 'https://custom-proxy.example.com/v1',
          },
        }),
      });
    });

    await page.goto('/settings');
    await page.getByRole('button', { name: 'Type one to fill in the recommended model' }).click();

    // User-defined peer cannot be overridden by one-click configuration
    const baseInputs = page.getByPlaceholder('Use default for empty Base URL');
    await expect(baseInputs).toHaveCount(3);
    await expect(baseInputs.nth(0)).toHaveValue('https://custom-proxy.example.com/v1');
    await expect(baseInputs.nth(1)).toHaveValue('https://custom-proxy.example.com/v1');
    await expect(baseInputs.nth(2)).toHaveValue('https://custom-proxy.example.com/v1');
    await expect(page.getByTestId('global-api-config-section').locator('input').first())
      .toHaveValue('https://custom-proxy.example.com/v1');

    await page.getByRole('button', { name: /\u4fdd\u5b58\u8bbe\u7f6e/ }).click();
    await expect(page.getByText('Settings saved successfully')).toBeVisible();
    expect(savedSettingsPayload?.api_base_url).toBe('https://custom-proxy.example.com/v1');
    expect(savedSettingsPayload?.text_api_base_url).toBe('https://custom-proxy.example.com/v1');
    expect(savedSettingsPayload?.image_api_base_url).toBe('https://custom-proxy.example.com/v1');
    expect(savedSettingsPayload?.image_caption_api_base_url).toBe('https://custom-proxy.example.com/v1');
  });

  test('one-click setup inherits custom global base for empty per-model fields', async ({ page }) => {
    await page.unroute('**/api/settings');
    await page.route('**/api/settings', async route => {
      if (route.request().method() === 'PUT') {
        const payload = route.request().postDataJSON() as Record<string, unknown>;
        savedSettingsPayload = payload;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            ...mockSettings,
            data: { ...mockSettings.data, ...payload },
          }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ...mockSettings,
          data: {
            ...mockSettings.data,
            ai_provider_format: 'volcengine',
            api_base_url: 'https://custom-proxy.example.com/v1',
            text_model_source: 'volcengine',
            image_model_source: 'volcengine',
            image_caption_model_source: 'volcengine',
          },
        }),
      });
    });

    await page.goto('/settings');
    await page.getByRole('button', { name: 'Type one to fill in the recommended model' }).click();

    // Empty. per-model base Must inherit a global custom peer, It’s not hard coded. cn-beijing End Replace
    const baseInputs = page.getByPlaceholder('Use default for empty Base URL');
    await expect(baseInputs).toHaveCount(3);
    await expect(baseInputs.nth(0)).toHaveValue('https://custom-proxy.example.com/v1');
    await expect(baseInputs.nth(1)).toHaveValue('https://custom-proxy.example.com/v1');
    await expect(baseInputs.nth(2)).toHaveValue('https://custom-proxy.example.com/v1');

    await page.getByRole('button', { name: /\u4fdd\u5b58\u8bbe\u7f6e/ }).click();
    await expect(page.getByText('Settings saved successfully')).toBeVisible();
    expect(savedSettingsPayload?.text_api_base_url).toBe('https://custom-proxy.example.com/v1');
    expect(savedSettingsPayload?.image_api_base_url).toBe('https://custom-proxy.example.com/v1');
    expect(savedSettingsPayload?.image_caption_api_base_url).toBe('https://custom-proxy.example.com/v1');
  });

  test('shows the Volcengine campaign prompt for Doubao without changing provider semantics', async ({ page }) => {
    await page.goto('/settings');

    await globalProviderPill(page, 'doubao').click();

    const globalApiSection = page.getByTestId('global-api-config-section');
    await expect(globalApiSection.locator('input[type="password"]').first()).toBeVisible();
    const promo = page.getByTestId('volcengine-campaign-promo');
    await expect(promo.getByText('Why the bean bag? / The volcano ark.？')).toBeVisible();
    await expect(promo.getByText(/\u56fd\u5185\u76f4\u8fde，\u65e0\u9700\u7279\u6b8a\u7f51\u7edc\u73af\u5883/)).toBeVisible();
    await expect(promo.getByText(/\u65e5\u5e38\u5f00\u53d1\u548c\u5176\u4ed6\u517c\u5bb9\u5de5\u5177/)).toBeVisible();
    await expect(promo.getByText(/\u8c46\u5305\u56fe\u50cf\u521b\u4f5c\u6a21\u578b 5.0/)).toBeVisible();
    await expect(promo.getByText('Free. Tokens Amount of receipt process')).not.toBeVisible();
    await expect(promo.getByText('Get the amount and get the normal ark. API Key')).toBeVisible();
    await expect(promo.getByText(/\u9700\u8981\u514d\u8d39 Tokens \u65f6，\u70b9\u51fb\u6d3b\u52a8\u9875\u7684「\u7acb\u5373\u9886\u53d6」/)).toBeVisible();
    await expect(promo.getByText(/\u5b8c\u6210「\u5f00\u901a\u670d\u52a1」\u548c「\u4e00\u952e\u6388\u6743」/)).toBeVisible();
    await expect(promo.getByText(/API Key \u7ba1\u7406\u9875\u9762\u521b\u5efa\u666e\u901a\u65b9\u821f API Key/)).toBeVisible();
    await expect(promo.getByText('Go back to this page and fill in the normal ark. API Key；Agent/Coding Plan Exclusive Key Not applicable')).toBeVisible();
    await expect(promo.getByText('Click Topbar「Fill」')).not.toBeVisible();
    await expect(page.getByText('Why the volcano? Agent Plan？')).not.toBeVisible();
    await expect(page.getByText('AIHubmix Applications API key')).not.toBeVisible();

    const volcengineLink = page.getByRole('link', { name: 'View official events' }).first();
    await expect(volcengineLink).toHaveAttribute('href', 'https://www.volcengine.com/activity/ai618?utm_campaign=hw&utm_content=hw&utm_medium=devrel_tool_web&utm_source=OWO&utm_term=banana-slides');

    await page.getByRole('button', { name: 'Type one to fill in the recommended model' }).click();
    const inputs = modelInputs(page);
    await expect(inputs.nth(0)).toHaveValue('doubao-seed-2-1-pro-260628');
    await expect(inputs.nth(1)).toHaveValue('doubao-seedream-5-0-260128');
    await expect(inputs.nth(2)).toHaveValue('doubao-seed-2-1-pro-260628');
    await expect(modelProviderSelect(page, 'text')).toHaveValue('doubao');
    await expect(modelProviderSelect(page, 'image')).toHaveValue('doubao');
    await expect(modelProviderSelect(page, 'image_caption')).toHaveValue('doubao');

    await page.getByRole('button', { name: /\u4fdd\u5b58\u8bbe\u7f6e/ }).click();
    await expect(page.getByText('Settings saved successfully')).toBeVisible();
    expect(savedSettingsPayload?.text_model).toBe('doubao-seed-2-1-pro-260628');
    expect(savedSettingsPayload?.image_model).toBe('doubao-seedream-5-0-260128');
    expect(savedSettingsPayload?.image_caption_model).toBe('doubao-seed-2-1-pro-260628');
    expect(savedSettingsPayload?.text_model_source).toBe('doubao');
    expect(savedSettingsPayload?.image_model_source).toBe('doubao');
    expect(savedSettingsPayload?.image_caption_model_source).toBe('doubao');
    expect(savedSettingsPayload?.openai_image_api_protocol).toBe('images');
  });

  test('normalizes mixed-case provider values from settings', async ({ page }) => {
    await page.unroute('**/api/settings');
    await page.route('**/api/settings', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ...mockSettings,
          data: {
            ...mockSettings.data,
            ai_provider_format: 'Volcengine',
            text_model_source: 'Volcengine',
            text_api_base_url: 'https://ark.cn-beijing.volces.com/api/v3',
          },
        }),
      })
    );

    await page.goto('/settings');

    const globalApiSection = page.getByTestId('global-api-config-section');
    await expect(globalProviderPill(page, 'volcengine')).toHaveAttribute('aria-checked', 'true');
    await expect(modelProviderSelect(page, 'text')).toHaveValue('volcengine');
    // Volcengine Do not hide anymore Base URL Input Box (Agent Plans End Editable)
    await expect(globalApiSection.getByText('API Base URL')).toBeVisible();
    // Backend Returned per-model base Sync to the corresponding input box
    await expect(page.getByPlaceholder('Use default for empty Base URL').first()).toHaveValue('https://ark.cn-beijing.volces.com/api/v3');
  });

  test('replaces another provider default base URL when switching to Agent Plans', async ({ page }) => {
    await page.unroute('**/api/settings');
    await page.route('**/api/settings', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ...mockSettings,
          data: {
            ...mockSettings.data,
            ai_provider_format: 'openai',
            api_base_url: 'https://api.inferera.com/v1',
          },
        }),
      })
    );

    await page.goto('/settings');

    await globalProviderPill(page, 'volcengine').click();

    // OpenAI Default peer should not be brought in Agent Plans Save/Test payload
    await expect(page.getByTestId('global-api-config-section').locator('input').first())
      .toHaveValue('https://ark.cn-beijing.volces.com/api/plan/v3');
  });

  test('replaces documented OpenAI base URL when switching to Agent Plans', async ({ page }) => {
    await page.unroute('**/api/settings');
    await page.route('**/api/settings', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ...mockSettings,
          data: {
            ...mockSettings.data,
            ai_provider_format: 'openai',
            api_base_url: 'https://api.openai.com/v1',
          },
        }),
      })
    );

    await page.goto('/settings');

    await globalProviderPill(page, 'volcengine').click();

    // README Documented OPENAI_API_BASE The default value is also recognized as an outdated default endpoint
    await expect(page.getByTestId('global-api-config-section').locator('input').first())
      .toHaveValue('https://ark.cn-beijing.volces.com/api/plan/v3');
  });

  test('replaces stale per-model base URL when a model source switches to Agent Plans', async ({ page }) => {
    await page.unroute('**/api/settings');
    await page.route('**/api/settings', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ...mockSettings,
          data: {
            ...mockSettings.data,
            ai_provider_format: 'openai',
            api_base_url: 'https://api.inferera.com/v1',
            text_model_source: 'openai',
            text_api_base_url: 'https://api.openai.com/v1',
          },
        }),
      })
    );

    await page.goto('/settings');

    const baseInput = page.getByPlaceholder('Use default for empty Base URL').first();
    await expect(baseInput).toHaveValue('https://api.openai.com/v1');

    // Text Model source From openai Cut volcengine: Obsolete Default base It must be replaced.,
    // Otherwise... TEXT_API_BASE It’ll take precedence. VOLCENGINE_API_BASE Wrong end of hit
    await modelProviderSelect(page, 'text').selectOption('volcengine');
    await expect(baseInput).toHaveValue('https://ark.cn-beijing.volces.com/api/plan/v3');

    // Custom per-model base Shouldn’t be destroyed.
    await baseInput.fill('https://custom.example.com/v1');
    await modelProviderSelect(page, 'text').selectOption('openai');
    await modelProviderSelect(page, 'text').selectOption('volcengine');
    await expect(baseInput).toHaveValue('https://custom.example.com/v1');
  });

  test('clears Agent Plans base when switching the global provider away', async ({ page }) => {
    await page.unroute('**/api/settings');
    await page.route('**/api/settings', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ...mockSettings,
          data: {
            ...mockSettings.data,
            ai_provider_format: 'volcengine',
            api_base_url: 'https://ark.cn-beijing.volces.com/api/plan/v3',
          },
        }),
      })
    );

    await page.goto('/settings');

    const globalBase = page.getByTestId('global-api-config-section').locator('input').first();
    await expect(globalBase).toHaveValue('https://ark.cn-beijing.volces.com/api/plan/v3');

    // Leave. Agent Plans: Outmoded plan/v3 End must be emptied., I can’t do it. openai It’s... base Save
    await globalProviderPill(page, 'openai').click();
    await expect(globalBase).toHaveValue('');
  });

  test('clears Agent Plans per-model base when the model source switches away', async ({ page }) => {
    await page.unroute('**/api/settings');
    await page.route('**/api/settings', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ...mockSettings,
          data: {
            ...mockSettings.data,
            ai_provider_format: 'volcengine',
            api_base_url: 'https://ark.cn-beijing.volces.com/api/plan/v3',
            text_model_source: 'volcengine',
            text_api_base_url: 'https://ark.cn-beijing.volces.com/api/plan/v3',
          },
        }),
      })
    );

    await page.goto('/settings');

    const baseInput = page.getByPlaceholder('Use default for empty Base URL').first();
    await expect(baseInput).toHaveValue('https://ark.cn-beijing.volces.com/api/plan/v3');

    // Single Model Leaves Agent Plans: plan/v3 It must be emptied., Otherwise... TEXT_API_BASE Priority over new provider Default Peers
    await modelProviderSelect(page, 'text').selectOption('openai');
    await expect(baseInput).toHaveValue('');
  });

  test('warns about a non-official global base and offers one-click restore', async ({ page }) => {
    await page.unroute('**/api/settings');
    await page.route('**/api/settings', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ...mockSettings,
          data: {
            ...mockSettings.data,
            ai_provider_format: 'volcengine',
            api_base_url: 'https://aihubmix.com/v1',
          },
        }),
      })
    );

    await page.goto('/settings');

    const globalBaseInput = page.getByTestId('global-api-config-section').locator('input').first();
    await expect(globalBaseInput).toHaveValue('https://aihubmix.com/v1');

    // Custom peer reserve, But the unofficial peer must be prompted and provided with a key recovery
    const hint = page.getByText(/\u4e0d\u662f\u706b\u5c71 AgentPlans \u5b98\u65b9\u7aef\u70b9/);
    await expect(hint).toBeVisible();
    await page.getByRole('button', { name: 'Use official end' }).click();
    await expect(globalBaseInput).toHaveValue('https://ark.cn-beijing.volces.com/api/plan/v3');
    await expect(hint).not.toBeVisible();

    // Disappear when sending an official tip; Manually return custom peer aftertips appear again
    await globalBaseInput.fill('https://another-proxy.example.com/v1');
    await expect(hint).toBeVisible();
  });
});
