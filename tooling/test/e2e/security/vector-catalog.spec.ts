import { test, expect } from '@playwright/test';
import { closeExtensionBrowser, launchExtensionBrowser } from '../support/extension-browser-launch';
import {
  enableCatalogSource,
  openCatalogEditor,
  readCatalogLibrarySnapshot,
  searchCatalogFromUi,
  startVectorCatalogSource,
  waitCatalogEditorAutosave,
} from './vector-catalog.helpers';

test(
  'native catalog consent, exact origin denial, grant, custom base path, and ' +
    'revocation control real egress',
  async ({}, info) => {
    test.setTimeout(90_000);
    const source = await startVectorCatalogSource();
    let launched: Awaited<ReturnType<typeof launchExtensionBrowser>> | null = null;
    try {
      launched = await launchExtensionBrowser({
        ignoreHTTPSErrors: true,
        viewport: { width: 1280, height: 560 },
      });
      const page = await openCatalogEditor(launched.context, launched.extensionId);
      expect(
        await page.evaluate(() => chrome.permissions.contains({ origins: ['<all_urls>'] }))
      ).toBe(false);
      expect(source.requests).toHaveLength(0);
      await enableCatalogSource(page, source.baseUrl, 'deny');
      await expect(page.locator('[data-ui="editor.elements.check-source"]')).toBeDisabled();
      expect(
        await page.evaluate(
          (origin) => chrome.permissions.contains({ origins: [`${origin}/*`] }),
          source.origin
        )
      ).toBe(false);
      expect(source.requests).toHaveLength(0);
      await enableCatalogSource(page, source.baseUrl, 'accept');
      await expect(page.locator('[data-ui="editor.elements.check-source"]')).toBeEnabled();
      expect(
        await page.evaluate(
          (origin) => chrome.permissions.contains({ origins: [`${origin}/*`] }),
          source.origin
        )
      ).toBe(true);
      await page.locator('[data-ui="editor.elements.check-source"]').click();
      await expect
        .poll(
          () =>
            source.requests.filter((request) => request.pathname.endsWith('/collections')).length
        )
        .toBeGreaterThan(0);
      await searchCatalogFromUi(page, 'heart');
      await expect(
        page
          .locator('[data-ui="editor.elements.card"]')
          .filter({ has: page.locator('img') })
          .first()
      ).toBeVisible();
      expect(source.requests.some((request) => request.pathname.endsWith('/proof.json'))).toBe(
        true
      );
      expect(
        source.requests.every(
          (request) => request.pathname.startsWith('/chosen/catalog/') && !request.cookie
        )
      ).toBe(true);
      const before = source.requests.length;
      expect(
        await page.evaluate(
          (origin) => chrome.permissions.remove({ origins: [`${origin}/*`] }),
          source.origin
        )
      ).toBe(true);
      await searchCatalogFromUi(page, 'revoked-query');
      await expect(page.getByRole('alert').first()).toBeVisible();
      expect(source.requests).toHaveLength(before);
      await page.screenshot({ path: info.outputPath('catalog-revoked.png'), fullPage: false });
    } finally {
      if (launched) await closeExtensionBrowser(launched, { removeUserDataDir: true });
      await source.close();
    }
  }
);

test(
  'native collection download persists partial progress, resumes only the ' +
    'refused artwork, and inserts offline after cache clearing',
  async ({}, info) => {
    test.setTimeout(90_000);
    const source = await startVectorCatalogSource({ downloadPair: true });
    let launched: Awaited<ReturnType<typeof launchExtensionBrowser>> | null = null;
    try {
      launched = await launchExtensionBrowser({
        ignoreHTTPSErrors: true,
        viewport: { width: 1280, height: 560 },
      });
      await launched.context.addInitScript(() => {
        localStorage.setItem('sniptale-locale-preference', 'en');
      });
      let page = await openCatalogEditor(launched.context, launched.extensionId);
      await enableCatalogSource(page, source.baseUrl, 'accept');
      await expect(page.locator('[data-ui="editor.elements.check-source"]')).toBeEnabled();
      await page.locator('[data-ui="editor.elements.check-source"]').click();
      const management = () => page.locator('[data-ui="editor.elements.management"]');
      // downloadProgress is "Collection download"; the transient section is "Download collection".
      const persistedDownloadRow = () =>
        management()
          .locator('section')
          .filter({
            has: page.getByRole('heading', { name: 'Collection download', exact: true }),
          })
          .locator(':scope > div')
          .filter({ hasText: 'Proof elements:' });
      await management().getByRole('button', { name: 'Filter collections', exact: true }).click();
      await page.getByRole('option', { name: 'Proof elements', exact: true }).click();
      await page.locator('[data-ui="editor.elements.download"]').click();
      await expect(persistedDownloadRow()).toContainText('1/2 · Partially downloaded');
      await expect(
        persistedDownloadRow().getByRole('button', { name: 'Resume download', exact: true })
      ).toBeEnabled();
      expect(source.artworkRequests).toEqual([['heart', 'repairable']]);
      await page.screenshot({
        path: info.outputPath('catalog-download-partial.png'),
        fullPage: false,
      });

      // The accepted artwork is usable even while its collection is incomplete.
      await management().getByRole('button', { name: 'Back to elements', exact: true }).click();
      await page.getByRole('button', { name: 'My elements', exact: true }).click();
      await expect(page.locator('[data-ui="editor.elements.card"]')).toHaveCount(1);
      await page.locator('[data-ui="editor.elements.card"]').click();
      await page.locator('[data-ui="editor.elements.add"]').click();
      await expect(page.locator('[data-ui="editor.vector.properties"]')).toBeVisible();
      await page.locator('[data-ui="editor.floating.layers.mode.layers"]').click();
      await expect(
        page.locator('[data-ui="editor.layers.list-viewport"] span[title="heart"]')
      ).toBeVisible();
      const documentUrl = await waitCatalogEditorAutosave(page);
      await page.close();
      page = await launched.context.newPage();
      await page.setViewportSize({ width: 1280, height: 560 });
      await page.goto(documentUrl, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('[data-ui="editor.canvas.document-boundary"]')).toBeVisible();
      await page.locator('[data-ui="editor.floating.layers.mode.layers"]').click();
      await expect(
        page.locator('[data-ui="editor.layers.list-viewport"] span[title="heart"]')
      ).toBeVisible();
      await page.locator('[data-ui="editor.floating.layers.mode.elements"]').click();
      await page.locator('[data-ui="editor.elements.manage"]').click();
      await expect(persistedDownloadRow()).toContainText('1/2 · Partially downloaded');
      const beforeResume = source.artworkRequests.length;
      source.makeSecondArtworkSupported();
      await persistedDownloadRow()
        .getByRole('button', { name: 'Resume download', exact: true })
        .click();
      await expect(persistedDownloadRow()).toContainText('2/2 · Ready');
      await expect(
        persistedDownloadRow().getByRole('button', { name: 'Resume download', exact: true })
      ).toHaveCount(0);
      expect(source.artworkRequests.slice(beforeResume)).toEqual([['repairable']]);

      await management().getByRole('button', { name: 'Back to elements', exact: true }).click();
      await page.getByRole('button', { name: 'My elements', exact: true }).click();
      const cards = () => page.locator('[data-ui="editor.elements.card"]');
      await expect(cards()).toHaveCount(2);
      await expect(cards().locator('img')).toHaveCount(2);
      const previews = await cards()
        .locator('img')
        .evaluateAll((images) => images.map((image) => image.getAttribute('src')).sort());
      await page.locator('[data-ui="editor.elements.manage"]').click();
      const canvasPng = () =>
        page.locator('canvas.lower-canvas').evaluate((canvas) => {
          if (!(canvas instanceof HTMLCanvasElement)) throw new Error('Missing editor canvas');
          return canvas.toDataURL('image/png');
        });
      const beforeSourceChange = await readCatalogLibrarySnapshot(page);
      expect(beforeSourceChange.baseUrl).toBe(source.baseUrl);
      const insertedPixels = await canvasPng();
      const otherBaseUrl = `${source.origin}/another/catalog/`;
      await page.locator('[data-ui="editor.elements.source-url"]').fill(otherBaseUrl);
      await page.locator('[data-ui="editor.elements.consent"]').check();
      // The new path has the same granted origin; Chromium does not need another host grant.
      await page.locator('[data-ui="editor.elements.enable-network"]').click();
      await expect
        .poll(() => readCatalogLibrarySnapshot(page).then((snapshot) => snapshot.baseUrl))
        .toBe(otherBaseUrl);
      expect((await readCatalogLibrarySnapshot(page)).acceptedRowsWithoutSettings).toEqual(
        beforeSourceChange.acceptedRowsWithoutSettings
      );
      expect(await canvasPng()).toBe(insertedPixels);
      await management()
        .getByRole('button', { name: 'Turn off online catalog', exact: true })
        .click();
      await expect(page.locator('[data-ui="editor.elements.check-source"]')).toBeDisabled();
      const beforeClear = await readCatalogLibrarySnapshot(page);
      expect(beforeClear.cacheCount).toBeGreaterThan(0);
      const requestsBeforeOffline = source.requests.length;
      await launched.context.setOffline(true);
      await page.locator('[data-ui="editor.elements.clear-cache"]').click();
      await expect
        .poll(() => readCatalogLibrarySnapshot(page).then((snapshot) => snapshot.cacheCount))
        .toBe(0);
      expect((await readCatalogLibrarySnapshot(page)).acceptedRows).toEqual(
        beforeClear.acceptedRows
      );
      await expect(persistedDownloadRow()).toContainText('2/2 · Ready');
      await management().getByRole('button', { name: 'Back to elements', exact: true }).click();
      await expect(cards()).toHaveCount(2);
      await expect(cards().locator('img')).toHaveCount(2);
      expect(
        await cards()
          .locator('img')
          .evaluateAll((images) => images.map((image) => image.getAttribute('src')).sort())
      ).toEqual(previews);
      await cards().filter({ hasText: 'repairable' }).click();
      await page.locator('[data-ui="editor.elements.add"]').click();
      await expect(page.locator('[data-ui="editor.vector.properties"]')).toBeVisible();
      await waitCatalogEditorAutosave(page);
      await page.locator('[data-ui="editor.floating.layers.mode.layers"]').click();
      await expect(
        page.locator('[data-ui="editor.layers.list-viewport"] span[title="heart"]')
      ).toBeVisible();
      await expect(
        page.locator('[data-ui="editor.layers.list-viewport"] span[title="repairable"]')
      ).toBeVisible();
      expect(source.requests).toHaveLength(requestsBeforeOffline);
      await page.screenshot({
        path: info.outputPath('catalog-download-offline-insertion.png'),
        fullPage: false,
      });
    } finally {
      if (launched) await closeExtensionBrowser(launched, { removeUserDataDir: true });
      await source.close();
    }
  }
);
