import { expect, test } from '../support/extension-fixture';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';

for (const viewport of PRIMARY_BROWSER_VIEWPORTS) {
  test(`prepares selected popup language and English fallback ${viewport.name}`, async ({
    page,
    extensionId,
  }, info) => {
    await page.setViewportSize(viewport.size);
    await page.goto(`chrome-extension://${extensionId}/apps/extension/src/popup/index.html`);
    await page.evaluate(async () => {
      await chrome.storage.local.set({ 'sniptale-locale-preference': 'en' });
    });
    const language = page.locator('button[data-locale-preference]');
    await expect(language).toHaveAttribute('data-locale-preference', 'en');
    const catalogRequests: string[] = [];
    page.on('request', (request) => {
      const path = new URL(request.url()).pathname;
      if (path.startsWith('/i18n/')) catalogRequests.push(path);
    });
    await page.reload();
    await expect(language).toHaveAttribute('data-locale-preference', 'en');
    const readCatalogRequests = () => [...catalogRequests];
    await expect.poll(readCatalogRequests).toEqual(['/i18n/popup/en.json']);
    await expect(page.locator('[data-ui="popup.app.tabs"]')).toBeVisible();
    await language.click();
    await expect(language).toHaveAttribute('data-locale-preference', 'ru');
    await expect.poll(readCatalogRequests).toEqual(['/i18n/popup/en.json', '/i18n/popup/ru.json']);
    await expect(page.locator('[data-ui="popup.app.root"]')).not.toContainText(
      /\b(?:common|popup|settings|content)\.[A-Za-z]/u
    );
    await page.screenshot({ path: info.outputPath('popup-russian.png'), fullPage: false });
    await language.click();
    await expect(language).toHaveAttribute('data-locale-preference', 'en');
    expect(readCatalogRequests()).toEqual(['/i18n/popup/en.json', '/i18n/popup/ru.json']);
    await page.screenshot({ path: info.outputPath('popup-english.png'), fullPage: false });
  });

  test(`retries catalogs without replacing a ready popup language ${viewport.name}`, async ({
    page,
    extensionId,
  }, info) => {
    await page.setViewportSize(viewport.size);
    await page.addInitScript(() => {
      const originalFetch = window.fetch.bind(window);
      const failed = new Set<string>();
      window.fetch = (input, init) => {
        const url =
          typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        const locale = /\/i18n\/popup\/(en|ru)\.json$/u.exec(url)?.[1];
        if (locale && !failed.has(locale)) {
          failed.add(locale);
          document.documentElement.dataset['catalogFailure'] = locale;
          return Promise.reject(new Error('Catalog failure fixture'));
        }
        return originalFetch(input, init);
      };
    });
    await page.goto(`chrome-extension://${extensionId}/apps/extension/src/popup/index.html`);
    const retry = page.getByRole('button', { name: 'Retry', exact: true });
    await expect(retry).toBeVisible();
    await expect(page.locator('[data-ui="popup.app.root"]')).toHaveCount(0);
    await page.screenshot({ path: info.outputPath('catalog-retry.png'), fullPage: false });
    await retry.click();
    const language = page.locator('button[data-locale-preference]');
    await expect(language).toHaveAttribute('data-locale-preference', 'en');
    await language.click();
    await expect(page.locator('html')).toHaveAttribute('data-catalog-failure', 'ru');
    await expect(language).toHaveAttribute('data-locale-preference', 'en');
    expect(
      await page.evaluate(
        async () =>
          (await chrome.storage.local.get('sniptale-locale-preference'))[
            'sniptale-locale-preference'
          ]
      )
    ).toBe('en');
    await expect(page.locator('[data-ui="popup.app.root"]')).toBeVisible();
    await language.click();
    await expect(language).toHaveAttribute('data-locale-preference', 'ru');
  });
}
