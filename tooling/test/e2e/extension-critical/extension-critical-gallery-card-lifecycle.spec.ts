import { readFile } from 'node:fs/promises';
import { test, expect } from '../support/extension-fixture';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { seedReviewVideo } from '../support/quick-editor-media-fixture';
import { betaV1Fixture } from '../../../../apps/extension/src/composition/persistence/infrastructure/indexed-db/fixtures/beta-v1';
import { translate } from '../../../../apps/extension/src/platform/i18n';

for (const viewport of [
  ...PRIMARY_BROWSER_VIEWPORTS,
  { name: '1024x560', size: { width: 1024, height: 560 } },
])
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
          if (viewport.size.width < 1280) {
            await expect
              .poll(() => surface.evaluate((node) => node.scrollWidth > node.clientWidth))
              .toBe(true);
            await surface.hover();
            await page.mouse.wheel(500, 0);
            await expect.poll(() => surface.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0);
          }
        } else {
          await expect(created).not.toContainText(label('gallery.app.draftExpires'));
          const badge = card.locator('[data-ui="gallery.card.expiration"]');
          await expect(badge).toHaveAttribute(
            'title',
            new RegExp(label('gallery.app.draftExpires'))
          );
          const warning = await badge.evaluate((node) => {
            const probe = document.createElement('span');
            probe.style.color = 'var(--sniptale-color-warning)';
            node.appendChild(probe);
            const color = getComputedStyle(probe).color;
            probe.remove();
            return color;
          });
          await expect(badge).toHaveCSS('color', warning);
          const backing = await badge.evaluate((node) => {
            const probe = document.createElement('span');
            probe.style.backgroundColor =
              'color-mix(in srgb, var(--sniptale-color-surface-panel) 80%, transparent)';
            node.appendChild(probe);
            const color = getComputedStyle(probe).backgroundColor;
            probe.remove();
            return color;
          });
          await expect(badge).toHaveCSS('background-color', backing);
          await expect(badge).toHaveCSS('border-radius', '4px');
          await expect(badge.locator('svg')).toHaveCSS('width', '16px');
          const bounds = (await card.boundingBox())!;
          const icon = (await badge.boundingBox())!;
          expect(bounds.x + bounds.width - icon.x - icon.width).toBeCloseTo(13, 0);
          const caption = card.locator(
            '[data-ui="gallery.compact.details"], [data-ui="gallery.large.details"], [data-ui="gallery.project.details"]'
          );
          const selection = card.getByRole('button', {
            name: label('gallery.app.selectItem'),
            exact: true,
          });
          const mark = selection.locator('[data-ui="gallery.selection.mark"]');
          const visibleMark = (await mark.boundingBox())!;
          const leftInset = visibleMark.x - bounds.x;
          const bottomInset = bounds.y + bounds.height - visibleMark.y - visibleMark.height;
          expect(Math.abs(leftInset - bottomInset)).toBeLessThanOrEqual(1);
          expect(leftInset).toBeLessThanOrEqual(10);
          const dateText = created.locator(':scope > span').first();
          expect(await dateText.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(
            true
          );
          if ((await selection.getAttribute('aria-pressed')) === 'true') await selection.click();
          await page
            .getByRole('button', { name: label(`gallery.app.${mode}`), exact: true })
            .focus();
          await card.locator('[data-ui="gallery.grid.thumbnail-viewport"]').hover();
          await expect(mark).toHaveCSS('opacity', '0');
          await expect(selection.locator('[data-ui="gallery.selection.idle"]')).toHaveCSS(
            'opacity',
            '1'
          );
          await page.screenshot({ path: info.outputPath(`${mode}-idle.png`), fullPage: false });
          await caption.hover();
          await expect(mark).toHaveCSS('opacity', '1');
          await expect(selection.locator('[data-ui="gallery.selection.idle"]')).toHaveCSS(
            'opacity',
            '0'
          );
          await expect(selection).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
          await expect(selection.locator('[data-ui="gallery.selection.mark"]')).toHaveCSS(
            'width',
            '24px'
          );
          await expect(selection.locator('[data-ui="gallery.selection.mark"]')).not.toHaveCSS(
            'background-color',
            'rgba(0, 0, 0, 0)'
          );
          const selectedDisc = (await selection
            .locator('[data-ui="gallery.selection.mark"]')
            .boundingBox())!;
          expect(selectedDisc.y).toBeGreaterThan(
            (await card.locator('[data-ui="gallery.grid.thumbnail-viewport"]').boundingBox())!.y
          );
          expect((await selection.boundingBox())!.y).toBeGreaterThanOrEqual(
            (await caption.boundingBox())!.y
          );
          if ((await selection.getAttribute('aria-pressed')) !== 'true') await selection.click();
          await expect(selection).toHaveAttribute('aria-pressed', 'true');
          await expect(selection.locator('[data-ui="gallery.selection.idle"]')).toHaveCount(0);
          await card.locator('[data-ui="gallery.grid.thumbnail-viewport"]').hover();
          await expect(mark).toHaveCSS('opacity', '1');
          await selection.focus();
          await page.keyboard.press('Space');
          await expect(selection).toHaveAttribute('aria-pressed', 'false');
          await expect(mark).toHaveCSS('opacity', '1');
          await page.keyboard.press('Space');
          await expect(selection).toHaveAttribute('aria-pressed', 'true');
          await expect(card.locator('button button')).toHaveCount(0);
          await expect(page.locator('[data-ui="gallery.preview.inspector"]')).toHaveCount(0);
        }
        await page.screenshot({
          path: info.outputPath(`${mode}.png`),
          fullPage: false,
          animations: 'disabled',
        });
      }
      const item = surface.getByRole('button', { name: 'beta-v1.webm', exact: true }).first();
      await item.click();
      const inspector = page.locator('[data-ui="gallery.preview.inspector"]');
      const header = inspector.locator('[data-ui="gallery.preview.inspectorHeader"]');
      const promote = header.getByRole('button', {
        name: label('gallery.preview.saveToLibrary'),
        exact: true,
      });
      const expiry = header.getByText(label('gallery.app.draftExpires'), { exact: false });
      await expect(promote).toBeVisible();
      const commandBounds = (await promote.boundingBox())!;
      const expiryBounds = (await expiry.boundingBox())!;
      expect(commandBounds.x - expiryBounds.x - expiryBounds.width).toBeCloseTo(8, 0);
      await page.screenshot({
        path: info.outputPath('preview-draft-promotion.png'),
        fullPage: false,
        animations: 'disabled',
      });
    });
  }
