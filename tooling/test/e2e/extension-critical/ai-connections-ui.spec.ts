import { createServer } from 'node:http';
import { createAIProviderDestinationBinding } from '../../../../apps/extension/src/features/ai/egress-authority';
import {
  AI_STORAGE_VERSION,
  AI_STORAGE_VERSION_KEY,
} from '../../../../apps/extension/src/composition/persistence/ai-settings/constants';
import { expect, test } from '@playwright/test';
import {
  translate,
  type AppLocale,
  type TranslationKey,
} from '../../../../apps/extension/src/platform/i18n';
import { launchExtensionBrowser, closeExtensionBrowser } from '../support/extension-browser-launch';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';

for (const { size } of PRIMARY_BROWSER_VIEWPORTS) {
  test(`AI connection forms and status rows ${size.width}`, async ({}, info) => {
    test.setTimeout(120000);
    const browser = await launchExtensionBrowser({ viewport: size });
    const page = await browser.context.newPage();
    page.setDefaultTimeout(10000);
    const locale: AppLocale = size.width === 1280 ? 'en' : 'ru';
    const label = (key: TranslationKey) => translate(key, locale);
    const server = createServer((_request, response) => {
      response.writeHead(401, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: { message: 'Synthetic rejected credential' } }));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Fixture address unavailable');
    try {
      await page.goto(
        `chrome-extension://${browser.extensionId}/apps/extension/src/settings/index.html?section=ai-connections`
      );
      await page.getByRole('region', { name: /^(Providers|Провайдеры)$/u }).waitFor();
      const scope = await createAIProviderDestinationBinding({
        id: '00000000-0000-4000-8000-000000000001',
        baseUrl: `http://127.0.0.1:${address.port}/api`,
        connectionType: 'ollama',
        incarnation: 'ui-fixture',
      });
      await page.evaluate(
        ({ locale, port, version, versionKey, scope }) => {
          const providerId = '00000000-0000-4000-8000-000000000001';
          const capabilities = {
            operations: { text: 'supported' },
            input: { text: 'supported' },
            output: { text: 'supported' },
            features: {},
          };
          return chrome.storage.local.set({
            'sniptale-locale-preference': locale,
            [versionKey]: version,
            sniptale_ai_providers: [
              {
                id: providerId,
                incarnation: 'ui-fixture',
                revision: 1,
                name: 'Local catalog provider with a longer connection name',
                connectionType: 'ollama',
                baseUrl: `http://127.0.0.1:${port}/api`,
                management: 'automatic',
                hasStoredApiKey: false,
                enabled: true,
                createdAt: Date.now(),
                catalogUpdatedAt: Date.now(),
                lastRefreshAttemptAt: Date.now(),
                observation: {
                  revision: 1,
                  status: 'unavailable',
                  scope: 'catalog',
                  checkedAt: Date.now(),
                  reason: 'invalid-credential',
                },
              },
            ],
            sniptale_ai_models: Array.from({ length: 14 }, (_, index) => ({
              id: `00000000-0000-4000-8000-${String(index + 2).padStart(12, '0')}`,
              providerId,
              modelCode: `catalog-model-${index}`,
              displayName: `Catalog model ${index}`,
              source: 'catalog',
              enabled: true,
              capabilities,
              catalog: {
                displayName: `Catalog model ${index}`,
                capabilities,
                lifecycle: 'active',
                scope,
                observedAt: Date.now(),
              },
            })),
          });
        },
        {
          locale,
          port: address.port,
          version: AI_STORAGE_VERSION,
          versionKey: AI_STORAGE_VERSION_KEY,
          scope,
        }
      );
      await page.reload();
      const providers = page.getByRole('region', {
        name: label('settings.aiProviders.providersTitle'),
        exact: true,
      });
      const row = providers.locator('[data-settings-collection-item]');
      const status = row.locator('[data-settings-collection-footer]');
      await expect(status).toContainText(label('settings.aiProviders.providerStatusInvalidKey'));
      const refresh = row.getByRole('button', {
        name: label('settings.aiProviders.providerCheckAction'),
        exact: true,
      });
      const addModel = row.getByRole('button', {
        name: label('settings.aiProviders.providerConfigureModel'),
        exact: true,
      });
      await expect(refresh).toBeVisible();
      await expect(addModel).toBeVisible();
      const actionBox = await refresh.boundingBox();
      const statusBox = await status.boundingBox();
      expect(statusBox!.y).toBeGreaterThan(actionBox!.y + actionBox!.height);
      await page.screenshot({ path: info.outputPath('provider-status.png'), fullPage: false });
      await providers
        .getByRole('button', { name: label('common.actions.add'), exact: true })
        .click();
      const dialog = page.getByRole('dialog');
      await dialog
        .getByRole('button', { name: label('settings.aiProviders.providerTypeLabel'), exact: true })
        .click();
      await expect(page.getByRole('option', { name: /Chrome AI|Sber|GigaChat/iu })).toHaveCount(0);
      await expect(page.getByRole('option').first()).toHaveText('OpenAI-compatible');
      await page.keyboard.press('Escape');
      await dialog
        .getByRole('button', { name: label('common.actions.cancel'), exact: true })
        .click();
      await addModel.click();
      const trigger = dialog.locator('.sniptale-ai-model-selector-trigger');
      await expect(trigger).toHaveAttribute('data-invalid', 'true');
      const chevronInset = await trigger.evaluate((element) => {
        const box = element.getBoundingClientRect();
        return (
          box.right -
          element.querySelector('.sniptale-select-chevron')!.getBoundingClientRect().right
        );
      });
      expect(chevronInset).toBeGreaterThanOrEqual(7);
      expect(chevronInset).toBeLessThanOrEqual(14);
      await trigger.click();
      await trigger.evaluate(async (element) => {
        await Promise.all(
          element.getAnimations({ subtree: true }).map((animation) => animation.finished)
        );
      });
      const search = page.getByRole('textbox', { name: label('aiModal.modelSearchPlaceholder') });
      const menu = page.locator('.sniptale-dropdown-menu').filter({ has: search });
      await expect(search).toBeFocused();
      const menuBox = await menu.boundingBox();
      const dialogBox = await dialog.boundingBox();
      expect(menuBox!.height).toBeGreaterThan(190);
      expect(menuBox!.y).toBeGreaterThanOrEqual(0);
      expect(menuBox!.y + menuBox!.height).toBeLessThanOrEqual(size.height);
      expect(
        menuBox!.y < dialogBox!.y || menuBox!.y + menuBox!.height > dialogBox!.y + dialogBox!.height
      ).toBe(true);
      await expect(
        page.getByRole('button', { name: 'Catalog model 0', exact: true })
      ).toBeInViewport();
      await page.screenshot({
        path: info.outputPath('catalog-over-short-form.png'),
        fullPage: false,
      });
      await menu.locator('.overflow-y-auto').evaluate((element) => {
        element.scrollTop = element.scrollHeight;
      });
      await expect(
        page.getByRole('button', { name: 'Catalog model 13', exact: true })
      ).toBeInViewport();
      await search.fill('model 12');
      const filteredBox = await menu.boundingBox();
      const triggerBox = await trigger.boundingBox();
      const gap =
        menuBox!.y < triggerBox!.y
          ? triggerBox!.y - filteredBox!.y - filteredBox!.height
          : filteredBox!.y - triggerBox!.y - triggerBox!.height;
      expect(gap).toBeGreaterThanOrEqual(3);
      expect(gap).toBeLessThanOrEqual(5);
      await expect(page.getByRole('button', { name: 'Catalog model 0', exact: true })).toHaveCount(
        0
      );
      await page.getByRole('button', { name: 'Catalog model 12', exact: true }).click();
      await expect(trigger).toContainText('Catalog model 12');
      await expect(trigger).toBeFocused();
      await trigger.click();
      await page.keyboard.press('Escape');
      await expect(search).toHaveCount(0);
      await expect(dialog).toBeVisible();
      await expect(trigger).toBeFocused();
      await dialog
        .getByRole('button', {
          name: label('settings.aiProviders.modelConfigureManually'),
          exact: true,
        })
        .click();
      const groups = dialog.locator('details.sniptale-disclosure');
      await expect(groups).toHaveCount(6);
      await expect(dialog.locator('[data-ui="settings.ai-model.parameters"]')).toHaveAttribute(
        'open',
        ''
      );
      await groups.first().locator('summary').click();
      await expect(groups.first()).toHaveAttribute('open', '');
      const enabled = dialog.getByRole('switch', {
        name: label('settings.aiProviders.modelEnabledLabel'),
        exact: true,
      });
      await enabled.scrollIntoViewIfNeeded();
      await enabled.click();
      await expect(enabled).toHaveAttribute('aria-checked', 'false');
      await page.screenshot({
        path: info.outputPath('manual-model-controls.png'),
        fullPage: false,
      });
      const save = dialog.getByRole('button', { name: label('common.actions.add'), exact: true });
      await save.scrollIntoViewIfNeeded();
      await save.click();
      await expect(dialog).toHaveCount(0);
      await page.reload();
      const models = page.getByRole('region', {
        name: label('settings.aiProviders.modelsTitle'),
        exact: true,
      });
      await expect(models).toContainText('Catalog model 12');
      await page.setViewportSize({ width: 1100, height: 560 });
      await refresh.scrollIntoViewIfNeeded();
      await expect(refresh).toBeInViewport();
      await page.screenshot({
        path: info.outputPath('below-desktop-minimum.png'),
        fullPage: false,
      });
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await closeExtensionBrowser(browser);
    }
  });
}
