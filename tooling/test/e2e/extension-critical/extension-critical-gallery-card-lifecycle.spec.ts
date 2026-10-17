import { readFile } from 'node:fs/promises';
import { test, expect } from '../support/extension-fixture';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { seedReviewVideo } from '../support/quick-editor-media-fixture';
import { betaV1Fixture } from '../../../../apps/extension/src/composition/persistence/infrastructure/indexed-db/fixtures/beta-v1';
import { translate } from '../../../../apps/extension/src/platform/i18n';

for (const viewport of PRIMARY_BROWSER_VIEWPORTS)
  for (const theme of ['light', 'dark'] as const) {
    test(`library card lifecycle ru ${theme} ${viewport.name}`, async ({
      page,
      extensionId,
    }, info) => {
      await page.setViewportSize(viewport.size);
      await page.goto(`chrome-extension://${extensionId}/apps/extension/src/gallery/index.html`);
      await expect(page.locator('[data-ui="gallery.page.root"]')).toBeVisible();
      await expect
        .poll(() =>
          page.evaluate(
            async () =>
              (await chrome.storage.local.get('sniptale-locale-preference'))[
                'sniptale-locale-preference'
              ]
          )
        )
        .toMatch(/^(ru|en)$/);
      await page.evaluate(async (theme) => {
        localStorage.clear();
        localStorage.setItem('sniptale-locale-preference', 'ru');
        await chrome.storage.local.set({
          'sniptale-locale-preference': 'ru',
          'sniptale-theme-preference': theme,
        });
      }, theme);
      await seedReviewVideo(page, 'review-vp8-opus.webm', { width: 160, height: 90, duration: 12 });
      const bytes = await readFile(new URL('../fixtures/review-vp8-opus.webm', import.meta.url));
      await page.evaluate(
        async ({ fixture, size, createdAt }) => {
          const db = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open(fixture.databaseName);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          });
          const tx = db.transaction(['recordings', 'media_library'], 'readwrite');
          const done = new Promise<void>((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onabort = () => reject(tx.error);
          });
          const lifecycle = { savedAt: null, storageClass: 'temporary', updatedAt: createdAt };
          tx.objectStore('recordings').put({
            ...fixture.records.recordings[0],
            createdAt,
            lifecycle,
            size,
          });
          tx.objectStore('media_library').put({
            ...fixture.records.media_library[0],
            createdAt,
            lifecycle,
            size,
            width: 160,
            height: 90,
            duration: 12,
          });
          await done;
          db.close();
        },
        { fixture: betaV1Fixture, size: bytes.length, createdAt: Date.now() - 86_400_000 }
      );
      await page.reload();
      await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await page.evaluate(() => document.fonts.ready);
      const label = (key: Parameters<typeof translate>[0]) => translate(key, 'ru');
      const surface = page.locator('[data-ui="gallery.content.surface"]');
      for (const mode of ['viewModeCompactGrid', 'viewModeLargeGrid', 'viewModeList'] as const) {
        await page.getByRole('button', { name: label(`gallery.app.${mode}`), exact: true }).click();
        const card = surface
          .locator('[data-gallery-keyboard-id]')
          .filter({
            has: page.getByRole('button', { name: 'beta-v1.webm', exact: true }),
          })
          .first();
        await expect(card).toBeVisible();
        const created = card.locator(`span[title^="${label('gallery.app.createdLabel')}"]`);
        await expect(created).toBeVisible();
        if (mode === 'viewModeList') {
          await expect(created).toContainText(label('gallery.app.draftExpires'));
        } else {
          await expect(created).not.toContainText(label('gallery.app.draftExpires'));
          const badge = card.locator('[data-ui="gallery.card.expiration"]');
          await expect(badge).toHaveAttribute(
            'title',
            new RegExp(label('gallery.app.draftExpires'))
          );
          const bounds = (await card.boundingBox())!;
          const icon = (await badge.boundingBox())!;
          expect(bounds.x + bounds.width - icon.x - icon.width).toBeCloseTo(13, 0);
          await card.hover();
          const selection = card.getByRole('button', {
            name: label('gallery.app.selectItem'),
            exact: true,
          });
          await expect(selection.locator('span')).toHaveCSS('width', '24px');
          if ((await selection.getAttribute('aria-pressed')) !== 'true') await selection.click();
          await expect(selection).toHaveAttribute('aria-pressed', 'true');
          await expect(page.locator('[data-ui="gallery.preview.inspector"]')).toHaveCount(0);
        }
        await page.screenshot({
          path: info.outputPath(`${mode}.png`),
          fullPage: false,
          animations: 'disabled',
        });
      }
    });
  }
