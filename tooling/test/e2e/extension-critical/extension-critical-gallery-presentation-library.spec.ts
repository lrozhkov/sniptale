import { expect, test, type Page } from '@playwright/test';
import { startHostServer } from '../support/host-server';
import { seedReviewVideo } from '../support/quick-editor-media-fixture';
import { applyHarnessBootstrap, GALLERY_HARNESS_PATH } from '../extension-critical.helpers';
import { betaV1Fixture } from '../../../../apps/extension/src/composition/persistence/infrastructure/indexed-db/fixtures/beta-v1';
import { translate } from '../../../../apps/extension/src/platform/i18n';

async function seedImages(page: Page) {
  await page.evaluate(async (databaseName) => {
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
    const objects = await (
      await (await navigator.storage.getDirectory()).getDirectoryHandle('sniptale-assets')
    ).getDirectoryHandle('objects');
    const writer = await (
      await objects.getFileHandle('bookend-image-body', { create: true })
    ).createWritable();
    await writer.write(blob);
    await writer.close();
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(databaseName);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const transaction = db.transaction(['asset_refs', 'asset_owners'], 'readwrite');
    const done = new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error);
    });
    transaction.objectStore('asset_refs').put({
      assetId: 'bookend-image-body',
      createdAt: 1,
      location: { kind: 'opfs', objectKey: 'objects/bookend-image-body' },
      mimeType: 'image/png',
      sha256: null,
      size: blob.size,
    });
    for (let index = 0; index < 36; index++)
      transaction.objectStore('asset_owners').put({
        assetId: 'bookend-image-body',
        ownerKind: 'media-library',
        ownerId: `bookend-${index}`,
        role: 'source',
      });
    await done;
    db.close();
    await window.__sniptaleHarness?.seedMediaLibrary(
      Array.from({ length: 36 }, (_, index) => ({
        entry: {
          id: `bookend-${index}`,
          kind: 'image',
          source: { kind: 'stored-asset', assetId: 'bookend-image-body' },
          filename: `Backdrop ${index}.png`,
          originalFilename: `Backdrop ${index}.png`,
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
          tags: index % 2 ? [] : ['work'],
          blob,
        },
        thumbnail: {
          assetId: `bookend-${index}`,
          blob,
          width: 480,
          height: 300,
          createdAt: 1,
          updatedAt: 1,
        },
      }))
    );
  }, betaV1Fixture.databaseName);
}

for (const variant of [
  { width: 1280, height: 560, theme: 'dark', locale: 'ru' },
  { width: 1920, height: 900, theme: 'light', locale: 'en' },
  { width: 960, height: 560, theme: 'dark', locale: 'en' },
] as const) {
  test(`bookend library grouped filters and scroll ${variant.width}`, async ({ page }, info) => {
    await page.setViewportSize(variant);
    const host = await startHostServer();
    const label = (key: Parameters<typeof translate>[0]) => translate(key, variant.locale);
    try {
      const views = ['all', 'screenshot', 'recording', 'audio'].flatMap((folderFilter) =>
        Array.from({ length: 10 }, (_, index) => ({
          id: `${folderFilter}-${index}`,
          name: index === 0 ? 'Work' : `Filter ${index}`,
          folderFilter,
          createdAt: index + 1,
          updatedAt: index + 1,
          filters: {
            activeTags: folderFilter === 'screenshot' ? ['work'] : [],
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
        }))
      );
      await applyHarnessBootstrap(page, {
        preserveMediaLibrary: true,
        storage: {
          'sniptale-locale-preference': variant.locale,
          'sniptale-theme-preference': variant.theme,
          sniptale_gallery_saved_views: { version: 1, views },
        },
      });
      await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}?theme=${variant.theme}`);
      await page.locator('[data-ui="gallery.page.root"]').waitFor();
      await seedReviewVideo(page, 'review-vp8-opus.webm', { width: 160, height: 90, duration: 12 });
      await seedImages(page);
      await page.reload();
      await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).first().click();
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      const review = page.locator('[data-ui="gallery.videoReview.dialog"]');
      await review
        .getByRole('button', { name: label('gallery.videoReview.advancedEditing'), exact: true })
        .click();
      await review
        .getByRole('button', { name: label('gallery.videoReview.scene'), exact: true })
        .click();
      const intro = review.locator(
        `section[aria-label="${label('gallery.videoReview.presentationIntro')}"]`
      );
      await intro
        .getByRole('button', {
          name: label('gallery.videoReview.presentationBookend'),
          exact: true,
        })
        .click();
      const trigger = intro.getByRole('button', {
        name: label('gallery.videoReview.presentationLibrary'),
        exact: true,
      });
      await trigger.click();
      const drawer = page.locator('[data-ui="gallery.videoReview.presentationLibrary.drawer"]');
      const search = drawer.getByRole('searchbox', {
        name: label('gallery.videoReview.presentationSearchMedia'),
      });
      const filter = drawer.locator(
        '[data-ui="gallery.videoReview.presentationLibrary.filter"] button'
      );
      const cards = drawer.locator('button[title^="Backdrop "]');
      await expect(cards).toHaveCount(36);
      const firstBox = (await cards.first().boundingBox())!;
      expect(firstBox.height).toBeGreaterThan(100);
      expect((await search.boundingBox())!.x).toBeLessThan((await filter.boundingBox())!.x);
      await cards.last().scrollIntoViewIfNeeded();
      await expect(search).toBeInViewport({ ratio: 1 });
      await filter.click();
      const menu = page.getByRole('listbox');
      await expect(menu.getByRole('group')).toHaveCount(3);
      await expect(menu.getByRole('option')).toHaveCount(33);
      await menu
        .getByRole('option', {
          name: label('gallery.videoReview.presentationLibraryImages'),
          exact: true,
        })
        .click();
      await expect(drawer.locator('button[title="beta-v1.webm"]')).toHaveCount(0);
      await filter.click();
      await menu
        .getByRole('group', {
          name: label('gallery.videoReview.presentationLibraryImages'),
          exact: true,
        })
        .getByRole('option', { name: 'Work', exact: true })
        .click();
      await expect(cards).toHaveCount(18);
      await expect(filter).toHaveAttribute(
        'title',
        `${label('gallery.videoReview.presentationLibraryImages')}: Work`
      );
      await search.fill('no matching media');
      await search.press('Enter');
      await expect(cards).toHaveCount(0);
      await expect(filter).toBeVisible();
      await search.fill('Backdrop 0');
      await expect(cards).toHaveCount(1);
      await page.screenshot({
        path: info.outputPath('library-header-and-filter.png'),
        fullPage: false,
      });
      await filter.click();
      await menu
        .getByRole('group', {
          name: label('gallery.videoReview.presentationLibraryVideos'),
          exact: true,
        })
        .getByRole('option', { name: 'Filter 9', exact: true })
        .scrollIntoViewIfNeeded();
      await expect(menu).toBeInViewport({ ratio: 1 });
      await page.screenshot({ path: info.outputPath('library-grouped-menu.png'), fullPage: false });
      await page.keyboard.press('Escape');
      await expect(filter).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(drawer).toHaveCount(0);
      await expect(trigger).toBeFocused();
      await trigger.click();
      await expect(cards).toHaveCount(36);
      await cards.first().click();
      await expect(drawer).toHaveCount(0);
      await expect(intro.locator('canvas')).toBeVisible();
      await expect(
        intro
          .getByRole('button', {
            name: label('gallery.videoReview.presentationPreviewJoinIntro'),
            exact: true,
          })
          .locator('svg')
      ).toHaveCount(1);
      await expect(
        intro
          .getByRole('button', {
            name: label('gallery.videoReview.presentationResetIntro'),
            exact: true,
          })
          .locator('svg')
      ).toHaveCount(1);
      await page.screenshot({
        path: info.outputPath('bookend-preview-reset.png'),
        fullPage: false,
      });
    } finally {
      await new Promise<void>((resolve, reject) =>
        host.server.close((error) => (error ? reject(error) : resolve()))
      );
    }
  });
}
