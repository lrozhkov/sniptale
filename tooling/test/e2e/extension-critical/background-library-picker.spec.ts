import { expect, test } from '@playwright/test';
import { startHostServer } from '../support/host-server';
import { seedReviewVideo } from '../support/quick-editor-media-fixture';
import { applyHarnessBootstrap, GALLERY_HARNESS_PATH } from '../extension-critical.helpers';
import { translate } from '../../../../apps/extension/src/platform/i18n';

for (const variant of [
  { width: 1280, height: 560, theme: 'dark', locale: 'ru' },
  { width: 1920, height: 900, theme: 'light', locale: 'en' },
  { width: 1100, height: 560, theme: 'dark', locale: 'en' },
] as const) {
  test(`background library cards keep their size and scroll ${variant.width}`, async ({
    page,
  }, info) => {
    await page.setViewportSize(variant);
    const host = await startHostServer();
    const label = (key: Parameters<typeof translate>[0]) => translate(key, variant.locale);
    try {
      await applyHarnessBootstrap(page, {
        preserveMediaLibrary: true,
        storage: {
          'sniptale-locale-preference': variant.locale,
          'sniptale-theme-preference': variant.theme,
          sniptale_gallery_saved_views: {
            version: 1,
            views: [
              {
                id: 'backgrounds',
                name: 'Backgrounds',
                folderFilter: 'screenshot',
                createdAt: 1,
                updatedAt: 1,
                filters: {
                  activeTags: ['background'],
                  scope: 'all',
                  facetFilters: {
                    created: [],
                    updated: [],
                    format: [],
                    size: [],
                    resolution: [],
                    duration: [],
                    source: [],
                  },
                },
              },
            ],
          },
        },
      });
      await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}?theme=${variant.theme}`);
      await page.locator('[data-ui="gallery.page.root"]').waitFor();
      await seedReviewVideo(page, 'review-vp8-opus.webm', { width: 160, height: 90, duration: 12 });
      await page.evaluate(async () => {
        const canvas = document.createElement('canvas');
        canvas.width = 480;
        canvas.height = 300;
        const context = canvas.getContext('2d')!;
        context.fillStyle = '#408cae';
        context.fillRect(0, 0, 480, 300);
        context.fillStyle = '#ffd47d';
        context.fillRect(20, 20, 440, 260);
        const blob = await new Promise<Blob>((resolve) =>
          canvas.toBlob((value) => resolve(value!), 'image/png')
        );
        await window.__sniptaleHarness?.seedMediaLibrary(
          Array.from({ length: 36 }, (_, index) => ({
            entry: {
              id: `background-${index}`,
              kind: 'image',
              source: { kind: 'screenshot' },
              filename: `Background ${index}.png`,
              originalFilename: `Background ${index}.png`,
              createdAt: index + 1,
              updatedAt: index + 1,
              size: blob.size,
              mimeType: 'image/png',
              width: 480,
              height: 300,
              duration: null,
              sourceUrl: null,
              sourceTitle: null,
              sourceFavicon: null,
              tags: index % 2 ? [] : ['background'],
              blob,
            },
            thumbnail: {
              assetId: `background-${index}`,
              blob,
              width: 480,
              height: 300,
              createdAt: 1,
              updatedAt: 1,
            },
          }))
        );
      });
      await page.reload();
      await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).first().click();
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      await page
        .getByRole('button', { name: label('gallery.videoReview.advancedEditing'), exact: true })
        .click();
      await page
        .getByRole('button', { name: label('gallery.videoReview.scene'), exact: true })
        .click();
      const background = page.locator('[data-ui="gallery.videoReview.backgroundInspector"]');
      await background
        .getByRole('button', { name: label('gallery.videoReview.backgroundSolid'), exact: true })
        .click();
      const paint = background
        .locator('.review-background-swatches [role="group"] > button')
        .first();
      await expect(paint).toHaveCSS('height', '32px');
      const paintSize = (await paint.boundingBox())!;
      const more = background.getByRole('button', {
        name: label('settings.editor.backgrounds.showMore'),
        exact: true,
      });
      if (await more.count()) await expect(more).toHaveCSS('border-top-width', '0px');
      await page.screenshot({
        path: info.outputPath('background-paint-presets.png'),
        fullPage: false,
      });
      await page
        .locator('[data-ui="gallery.videoReview.backgroundInspector"]')
        .getByRole('button', { name: label('gallery.videoReview.backgroundImage'), exact: true })
        .click();
      const image = background
        .locator('[data-ui="background.image.picker"] [role="group"] > button')
        .first();
      await expect(image).toHaveCSS('height', '32px');
      expect((await image.boundingBox())!.width).toBeCloseTo(paintSize.width, 0);
      await page
        .locator('[data-ui="background.image.picker"]')
        .getByRole('button', { name: label('settings.editor.backgrounds.library'), exact: true })
        .click();
      const drawer = page.locator('[data-ui="background.library.drawer"]');
      const list = drawer.locator('[data-ui="library-materials-list"]');
      const card = list.getByRole('button').first();
      await expect(list.getByRole('button')).toHaveCount(36);
      await expect(card.locator('img')).toBeVisible();
      await page.screenshot({ path: info.outputPath('library-cards.png'), fullPage: false });
      expect.soft((await card.boundingBox())!.height).toBeGreaterThanOrEqual(180);
      await expect.soft(card.locator('img')).toHaveCSS('object-fit', 'contain');
      const search = drawer.getByRole('searchbox');
      const searchY = (await search.boundingBox())!.y;
      const controls = drawer.locator('[data-ui="background.library.controls"]');
      expect((await controls.boundingBox())!.y).toBeLessThan((await list.boundingBox())!.y);
      const searchShell = drawer.locator('[data-ui="background.library.search"]');
      expect(
        (await controls
          .getByRole('button', { name: label('settings.editor.backgrounds.filter') })
          .boundingBox())!.height
      ).toBe((await searchShell.boundingBox())!.height);
      await controls
        .getByRole('button', { name: label('settings.editor.backgrounds.filter') })
        .focus();
      await expect(searchShell).toHaveCSS('width', '192px');
      const idleWidth = (await searchShell.boundingBox())!.width;
      await search.focus();
      await expect
        .poll(async () => (await searchShell.boundingBox())!.width)
        .toBeGreaterThan(idleWidth + 30);
      expect((await searchShell.boundingBox())!.width).toBeLessThan(260);
      expect(await search.evaluate((el) => getComputedStyle(el, '::placeholder').color)).toBe(
        'rgba(0, 0, 0, 0)'
      );
      await page.screenshot({
        path: info.outputPath('library-search-focused.png'),
        fullPage: false,
      });
      await list.evaluate((node) => {
        node.scrollTop = node.scrollHeight;
      });
      await expect.poll(() => list.evaluate((node) => node.scrollTop)).toBeGreaterThan(100);
      expect((await search.boundingBox())!.y).toBeCloseTo(searchY, 0);
      await drawer
        .getByRole('button', { name: label('settings.editor.backgrounds.filter') })
        .click();
      await page.screenshot({ path: info.outputPath('library-filter.png'), fullPage: false });
      await page.keyboard.press('Escape');
      await expect(drawer).toBeVisible();
      await expect(page.getByRole('listbox')).toHaveCount(0);
      await drawer
        .getByRole('button', { name: label('settings.editor.backgrounds.filter') })
        .press('ArrowDown');
      await page.getByRole('option', { name: 'Backgrounds', exact: true }).click();
      await expect(list.getByRole('button')).toHaveCount(18);
      await search.fill('Background 1.');
      await expect(list.getByRole('button')).toHaveCount(0);
      await expect(drawer.getByText(label('settings.editor.backgrounds.noResults'))).toBeVisible();
      await drawer
        .getByRole('button', { name: label('settings.editor.backgrounds.filter') })
        .click();
      await page
        .getByRole('option', { name: label('settings.editor.backgrounds.allImages'), exact: true })
        .click();
      await expect(list.getByRole('button')).toHaveCount(1);
      await search.clear();
      await expect(list.getByRole('button')).toHaveCount(36);
      await page.keyboard.press('Escape');
      await expect(drawer).toHaveCount(0);
    } finally {
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}
