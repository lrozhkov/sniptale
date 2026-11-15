import { test, expect } from '@playwright/test';
import { closeExtensionBrowser, launchExtensionBrowser } from '../support/extension-browser-launch';
import {
  enableCatalogSource,
  openCatalogEditor,
  searchCatalogFromUi,
} from '../security/vector-catalog.helpers';

test(
  'the real native catalog client reaches public collections, search, and ' +
    'requested artwork without a fallback',
  async ({}, info) => {
    test.setTimeout(120_000);
    const launched = await launchExtensionBrowser({ viewport: { width: 1280, height: 560 } });
    const requests: { origin: string; endpoint: string; status: number }[] = [];
    try {
      launched.context.on('response', (response) => {
        const url = new URL(response.url());
        if (url.protocol === 'https:')
          requests.push({ origin: url.origin, endpoint: url.pathname, status: response.status() });
      });
      const page = await openCatalogEditor(launched.context, launched.extensionId);
      await enableCatalogSource(page, 'https://api.iconify.design/', 'accept');
      await expect(page.locator('[data-ui="editor.elements.check-source"]')).toBeEnabled();
      await page.locator('[data-ui="editor.elements.check-source"]').click();
      await expect(
        page
          .getByRole('status')
          .filter({ hasText: /Connection checked|Подключение проверено/u })
          .first()
      ).toBeVisible();
      await searchCatalogFromUi(page, 'heart');
      await expect(
        page
          .locator('[data-ui="editor.elements.card"]')
          .filter({ has: page.locator('img') })
          .first()
      ).toBeVisible({ timeout: 30_000 });
      await expect
        .poll(() =>
          requests.some((request) => request.endpoint === '/collections' && request.status === 200)
        )
        .toBe(true);
      expect(
        requests.some((request) => request.endpoint === '/search' && request.status === 200)
      ).toBe(true);
      expect(
        requests.some((request) => request.endpoint.endsWith('.json') && request.status === 200)
      ).toBe(true);
      expect(requests.every((request) => request.origin === 'https://api.iconify.design')).toBe(
        true
      );
      await page.screenshot({
        path: info.outputPath('public-iconify-catalog.png'),
        fullPage: false,
      });
      await info.attach('catalog-network.json', {
        body: JSON.stringify(
          { source: 'https://api.iconify.design/', observedResponses: requests },
          null,
          2
        ),
        contentType: 'application/json',
      });
    } finally {
      await closeExtensionBrowser(launched, { removeUserDataDir: true });
    }
  }
);
