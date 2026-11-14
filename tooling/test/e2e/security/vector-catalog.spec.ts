import { test, expect } from '@playwright/test';
import { closeExtensionBrowser, launchExtensionBrowser } from '../support/extension-browser-launch';
import {
  enableCatalogSource,
  checkCatalogSource,
  openCatalogSettings,
  readCatalogDownloadProgress,
  openCatalogEditor,
  readCatalogLibrarySnapshot,
  searchCatalogFromUi,
  startVectorCatalogSource,
  waitCatalogEditorAutosave,
} from './vector-catalog.helpers';

test(
  'native catalog permission, exact origin denial, grant, custom base path, and ' +
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
      expect((await readCatalogLibrarySnapshot(page)).baseUrl).not.toBe(source.baseUrl);
      expect(
        await page.evaluate(
          (origin) => chrome.permissions.contains({ origins: [`${origin}/*`] }),
          source.origin
        )
      ).toBe(false);
      expect(source.requests).toHaveLength(0);
      await enableCatalogSource(page, source.baseUrl, 'accept');
      expect((await readCatalogLibrarySnapshot(page)).baseUrl).toBe(source.baseUrl);
      expect(
        await page.evaluate(
          (origin) => chrome.permissions.contains({ origins: [`${origin}/*`] }),
          source.origin
        )
      ).toBe(true);
      await checkCatalogSource(page);
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
      expect((await readCatalogLibrarySnapshot(page)).baseUrl).toBe(source.baseUrl);
      await checkCatalogSource(page);
      const actions = () => page.locator('[data-ui="editor.elements.collection-download"]');
      const assertProgress = async (accepted: number, total: number, status: string) => {
        await expect
          .poll(() => readCatalogDownloadProgress(page))
          .toEqual([{ accepted, total, status }]);
      };
      await page.getByRole('button', { name: 'Filter collections', exact: true }).click();
      await page.getByRole('option', { name: 'Proof elements', exact: true }).click();
      await expect(
        page.getByRole('button', { name: 'proof:heart', exact: true }).locator('img')
      ).toBeVisible();
      await expect(
        page
          .getByRole('button', { name: 'proof:repairable', exact: true })
          .getByLabel('Unsupported SVG profile', { exact: true })
      ).toBeVisible();
      expect(source.artworkRequests).toEqual([['heart', 'repairable']]);
      const beforeDownload = source.artworkRequests.length;
      await actions().getByRole('button', { name: 'Download collection', exact: true }).click();
      await assertProgress(1, 2, 'partial');
      await expect(
        actions().getByRole('button', { name: 'Resume download', exact: true })
      ).toBeEnabled();
      expect(source.artworkRequests.slice(beforeDownload)).toEqual([['heart', 'repairable']]);
      await page.screenshot({
        path: info.outputPath('catalog-download-partial.png'),
        fullPage: false,
      });

      // The accepted artwork is usable even while its collection is incomplete.
      await page.getByRole('button', { name: 'Filter collections', exact: true }).click();
      await page.getByRole('option', { name: 'Proof elements', exact: true }).first().click();
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
      await assertProgress(1, 2, 'partial');
      const beforeResume = source.artworkRequests.length;
      source.makeSecondArtworkSupported();
      await page.getByRole('button', { name: 'Filter collections', exact: true }).click();
      await page.getByRole('option', { name: 'Proof elements', exact: true }).first().click();
      await actions().getByRole('button', { name: 'Resume download', exact: true }).click();
      await assertProgress(2, 2, 'ready');
      await expect(
        actions().getByRole('button', { name: 'Resume download', exact: true })
      ).toHaveCount(0);
      expect(source.artworkRequests.slice(beforeResume)).toEqual([['repairable']]);

      await page.getByRole('button', { name: 'Filter collections', exact: true }).click();
      await page.getByRole('option', { name: 'Proof elements', exact: true }).first().click();
      const cards = () => page.locator('[data-ui="editor.elements.card"]');
      await expect(cards()).toHaveCount(2);
      await expect(cards().locator('img')).toHaveCount(2);
      const previews = await cards()
        .locator('img')
        .evaluateAll((images) => images.map((image) => image.getAttribute('src')).sort());
      const canvasPng = () =>
        page.locator('canvas.lower-canvas').evaluate((canvas) => {
          if (!(canvas instanceof HTMLCanvasElement)) throw new Error('Missing editor canvas');
          return canvas.toDataURL('image/png');
        });
      const beforeSourceChange = await readCatalogLibrarySnapshot(page);
      expect(beforeSourceChange.baseUrl).toBe(source.baseUrl);
      const insertedPixels = await canvasPng();
      const otherBaseUrl = `${source.origin}/another/catalog/`;
      const settings = await openCatalogSettings(page);
      await settings
        .getByRole('textbox', { name: 'Catalog server', exact: true })
        .fill(otherBaseUrl);
      // The new path has the same granted origin; Chromium does not need another host grant.
      await settings.getByRole('button', { name: 'Save', exact: true }).click();
      await expect
        .poll(() => readCatalogLibrarySnapshot(page).then((snapshot) => snapshot.baseUrl))
        .toBe(otherBaseUrl);
      expect((await readCatalogLibrarySnapshot(page)).acceptedRowsWithoutSettings).toEqual(
        beforeSourceChange.acceptedRowsWithoutSettings
      );
      expect(await canvasPng()).toBe(insertedPixels);
      await settings.getByRole('switch', { name: 'Online catalog', exact: true }).click();
      await expect(settings.getByRole('button', { name: 'Check', exact: true })).toBeDisabled();
      const beforeClear = await readCatalogLibrarySnapshot(page);
      expect(beforeClear.cacheCount).toBeGreaterThan(0);
      const requestsBeforeOffline = source.requests.length;
      await launched.context.setOffline(true);
      await settings.getByRole('button', { name: 'Clear cache', exact: true }).click();
      await expect
        .poll(() => readCatalogLibrarySnapshot(page).then((snapshot) => snapshot.cacheCount))
        .toBe(0);
      expect((await readCatalogLibrarySnapshot(page)).acceptedRows).toEqual(
        beforeClear.acceptedRows
      );
      await assertProgress(2, 2, 'ready');
      await settings.close();
      await page.reload();
      await page.locator('[data-ui="editor.floating.layers.mode.elements"]').click();
      await page.getByRole('button', { name: 'Filter collections', exact: true }).click();
      await page.getByRole('option', { name: 'Proof elements', exact: true }).first().click();
      await expect(cards()).toHaveCount(2);
      await expect(cards().locator('img')).toHaveCount(2);
      expect(
        await cards()
          .locator('img')
          .evaluateAll((images) => images.map((image) => image.getAttribute('src')).sort())
      ).toEqual(previews);
      await page.getByRole('button', { name: 'proof:repairable', exact: true }).click();
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
