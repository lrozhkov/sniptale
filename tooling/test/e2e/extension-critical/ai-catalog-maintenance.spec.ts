import { createServer, type ServerResponse } from 'node:http';
import { expect, test } from '@playwright/test';
import { sendRuntimeMessage } from '../support/recording-action';
import { launchExtensionBrowser, closeExtensionBrowser } from '../support/extension-browser-launch';
import {
  configureNativeProvider,
  openNativeVoiceScenario,
  TEXT_MODEL_NAME,
} from './voice-input-model.test-support';

for (const viewport of [
  { width: 1280, height: 560 },
  { width: 1920, height: 900 },
]) {
  test(`scenario catalog maintenance preserves interaction ${viewport.width}`, async ({}, info) => {
    const browser = await launchExtensionBrowser({ viewport });
    const { extensionId } = browser;
    const page = await browser.context.newPage();
    let hold = false;
    let discovered = false;
    let requests = 0;
    let inference = 0;
    const pending = new Set<ServerResponse>();
    const reply = (response: ServerResponse) => {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(
        JSON.stringify({
          data: discovered
            ? [{ id: 'discovered-text', name: 'Discovered text model', type: 'chat' }]
            : [],
        })
      );
    };
    const server = createServer((request, response) => {
      if (request.method === 'GET' && request.url === '/v1/models') {
        requests += 1;
        if (hold) pending.add(response);
        else reply(response);
      } else {
        if (request.method === 'POST') inference += 1;
        response.writeHead(404).end();
      }
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Metadata fixture is unavailable');
    try {
      await page.setViewportSize(viewport);
      await page.goto(
        `chrome-extension://${extensionId}/apps/extension/src/settings/index.html?section=ai-connections`
      );
      await expect(page.getByRole('region', { name: /^(Providers|Провайдеры)$/u })).toBeVisible();
      await page.evaluate(() => chrome.storage.local.set({ 'sniptale-locale-preference': 'en' }));
      await page.reload();
      await configureNativeProvider(page, extensionId, 'en', `http://127.0.0.1:${address.port}`);
      await page.evaluate(async () => {
        const data = await chrome.storage.local.get('sniptale_ai_providers');
        const providers = data['sniptale_ai_providers'];
        if (!Array.isArray(providers)) throw new Error('Configured provider is unavailable');
        await chrome.storage.local.set({
          sniptale_ai_providers: providers.map((provider) => ({
            ...provider,
            management: 'automatic',
            catalogUpdatedAt: 1,
            lastRefreshAttemptAt: 1,
          })),
        });
      });
      requests = 0;
      discovered = true;
      hold = true;
      await openNativeVoiceScenario(page, extensionId);
      await page.getByRole('button', { name: 'AI assistance', exact: true }).click();
      const dialog = page.getByRole('dialog');
      const picker = dialog.locator('.sniptale-ai-model-selector-trigger');
      await expect(picker).toBeEnabled();
      await expect(picker).toContainText(TEXT_MODEL_NAME);
      await expect.poll(() => requests).toBe(1);
      await expect(
        dialog.getByRole('button', { name: 'Get suggestions', exact: true })
      ).toBeEnabled();
      await picker.click();
      const search = page.getByPlaceholder('Search model...', { exact: true });
      await search.fill('Discovered');
      await expect(page.getByTitle('Discovered text model', { exact: true })).toHaveCount(0);
      await page.screenshot({
        path: info.outputPath('cached-catalog-pending.png'),
        fullPage: false,
      });
      hold = false;
      for (const response of pending) reply(response);
      pending.clear();
      const option = page.getByTitle('Discovered text model', { exact: true });
      await expect(option).toBeVisible();
      await expect(search).toHaveValue('Discovered');
      await expect(picker).toContainText(TEXT_MODEL_NAME);
      expect(
        await page.evaluate(
          async () =>
            (await chrome.storage.local.get('sniptale_ai_scenario_selections'))[
              'sniptale_ai_scenario_selections'
            ] ?? {}
        )
      ).toEqual({});
      await option.click();
      await expect(picker).toContainText('Discovered text model');
      const preferences = () =>
        page.evaluate(
          async () =>
            (await chrome.storage.local.get('sniptale_ai_scenario_selections'))[
              'sniptale_ai_scenario_selections'
            ]
        );
      await expect
        .poll(preferences)
        .toMatchObject({ 'scenario-edit': { modelCode: 'discovered-text', source: 'explicit' } });
      await page.screenshot({
        path: info.outputPath('refreshed-catalog-choice.png'),
        fullPage: false,
      });
      await page.reload();
      await page.getByRole('button', { name: 'AI assistance', exact: true }).click();
      await expect(picker).toContainText('Discovered text model');
      // The successful complete snapshot supplies the persisted daily refresh budget.
      await expect
        .poll(() =>
          page.evaluate(async () => {
            const data = await chrome.storage.local.get('sniptale_ai_providers');
            const providers = data['sniptale_ai_providers'];
            return (
              Array.isArray(providers) &&
              providers.every((provider) => provider.catalogUpdatedAt > 1)
            );
          })
        )
        .toBe(true);
      const maintenance = await sendRuntimeMessage(page, {
        type: 'AI_SETTINGS_MUTATION',
        operation: 'refresh-managed-catalogs',
      });
      expect(maintenance).toMatchObject({ success: true });
      expect(requests).toBe(1);
      expect(inference).toBe(0);
    } finally {
      await closeExtensionBrowser(browser);
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
      );
    }
  });
}
