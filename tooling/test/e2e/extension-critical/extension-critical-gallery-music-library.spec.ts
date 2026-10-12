import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { startHostServer } from '../support/host-server';
import { applyHarnessBootstrap, GALLERY_HARNESS_PATH } from '../extension-critical.helpers';
import { clickReviewExport, seedReviewVideo } from '../support/quick-editor-media-fixture';
import { betaV1Fixture } from '../../../../apps/extension/src/composition/persistence/infrastructure/indexed-db/fixtures/beta-v1';
import { translate } from '../../../../apps/extension/src/platform/i18n';

const emptyFacets = {
  created: [],
  updated: [],
  format: [],
  size: [],
  resolution: [],
  duration: [],
  source: [],
};

async function libraryCounts(page: Page) {
  return page.evaluate(async (database) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(database);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const tx = db.transaction(['media_library', 'asset_refs'], 'readonly');
      const count = (store: string) =>
        new Promise<number>((resolve, reject) => {
          const request = tx.objectStore(store).count();
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
      return await Promise.all([count('media_library'), count('asset_refs')]);
    } finally {
      db.close();
    }
  }, betaV1Fixture.databaseName);
}

async function seedMusic(page: Page, source: 'project-asset' | 'recording' | 'stored-asset') {
  const bytes = await readFile(new URL('../fixtures/review-voice-speech.wav', import.meta.url));
  await page.evaluate(
    async ({ encoded, database, source }) => {
      const body = Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0));
      const objects = await (
        await (await navigator.storage.getDirectory()).getDirectoryHandle('sniptale-assets')
      ).getDirectoryHandle('objects');
      const writer = await (
        await objects.getFileHandle('music-body', { create: true })
      ).createWritable();
      await writer.write(body);
      await writer.close();
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(database);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const tx = db.transaction(
        ['media_library', 'project_assets', 'recordings', 'asset_refs', 'asset_owners'],
        'readwrite'
      );
      const done = new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error);
      });
      tx.objectStore('asset_refs').put({
        assetId: 'music-body',
        createdAt: 1,
        mimeType: 'audio/wav',
        size: body.length,
        sha256: null,
        location: { kind: 'opfs', objectKey: 'objects/music-body' },
      });
      for (let index = 0; index < 36; index++) {
        const key = `music-${index}`;
        const kind = index === 0 ? source : 'project-asset';
        const id =
          kind === 'project-asset'
            ? `project-asset:${key}`
            : kind === 'recording'
              ? `recording:${key}`
              : key;
        const locator =
          kind === 'project-asset'
            ? { kind, projectAssetId: key }
            : kind === 'recording'
              ? { kind, recordingId: key }
              : { kind, assetId: 'music-body' };
        const filename = `Song ${String(index).padStart(2, '0')} — long musical filename for the Library.wav`;
        tx.objectStore('media_library').put({
          id,
          source: locator,
          kind: 'audio',
          filename,
          originalFilename: filename,
          createdAt: index + 1,
          updatedAt: index + 1,
          mimeType: 'audio/wav',
          size: body.length,
          duration: null,
          width: null,
          height: null,
          sourceUrl: null,
          sourceTitle: null,
          sourceFavicon: null,
          tags: index % 2 ? [] : ['music'],
          workspaceRevision: 0,
        });
        if (kind !== 'stored-asset')
          tx.objectStore(kind === 'recording' ? 'recordings' : 'project_assets').put({
            id: key,
            assetId: 'music-body',
            createdAt: 1,
            mimeType: 'audio/wav',
            size: body.length,
            ...(kind === 'recording' ? { filename } : {}),
          });
        tx.objectStore('asset_owners').put({
          ownerKind: kind === 'stored-asset' ? 'media-library' : kind,
          ownerId: kind === 'stored-asset' ? id : key,
          role: kind === 'stored-asset' ? 'source' : 'body',
          assetId: 'music-body',
        });
      }
      await done;
      db.close();
    },
    { encoded: bytes.toString('base64'), database: betaV1Fixture.databaseName, source }
  );
}

for (const variant of [
  { width: 1280, height: 560, locale: 'ru', theme: 'dark', source: 'project-asset' },
  { width: 1920, height: 900, locale: 'en', theme: 'light', source: 'recording' },
  { width: 960, height: 560, locale: 'en', theme: 'dark', source: 'stored-asset' },
  {
    width: 1280,
    height: 560,
    locale: 'ru',
    theme: 'dark',
    source: 'project-asset',
    lane: 'voiceover',
  },
  {
    width: 1920,
    height: 900,
    locale: 'en',
    theme: 'light',
    source: 'stored-asset',
    lane: 'voiceover',
  },
] as const) {
  test(
    [
      'music Library preserves source and modal workflow ',
      String(variant.width),
      '/',
      String('lane' in variant ? variant.lane : 'music'),
    ].join(''),
    async ({ page }, info) => {
      await page.setViewportSize({ width: variant.width, height: variant.height });
      const host = await startHostServer();
      const lane = 'lane' in variant ? variant.lane : 'music';
      const pickerLabel =
        lane === 'voiceover'
          ? 'gallery.videoReview.audioImport'
          : 'gallery.videoReview.musicLibrary';
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
                  id: 'audio-tagged',
                  name: 'Music tagged',
                  folderFilter: 'audio',
                  createdAt: 1,
                  updatedAt: 1,
                  filters: { activeTags: ['music'], scope: 'all', facetFilters: emptyFacets },
                },
                {
                  id: 'all-media',
                  name: 'All media',
                  folderFilter: 'all',
                  createdAt: 1,
                  updatedAt: 1,
                  filters: { activeTags: [], scope: 'all', facetFilters: emptyFacets },
                },
                {
                  id: 'images',
                  name: 'Images only',
                  folderFilter: 'screenshot',
                  createdAt: 1,
                  updatedAt: 1,
                  filters: { activeTags: [], scope: 'all', facetFilters: emptyFacets },
                },
              ],
            },
          },
        });
        await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}?theme=${variant.theme}`);
        await page.locator('[data-ui="gallery.page.root"]').waitFor();
        await seedReviewVideo(page, 'review-vp8-opus.webm', {
          width: 160,
          height: 90,
          duration: 12,
        });
        await seedMusic(page, variant.source);
        await page.reload();
        await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).first().click();
        await page.locator('[data-ui="gallery.videoReview.enter"]').click();
        const review = page.locator('[data-ui="gallery.videoReview.dialog"]');
        await review
          .getByRole('button', { name: label('gallery.videoReview.advancedEditing'), exact: true })
          .click();
        const header = review.locator('[data-ui="gallery.videoReview.trackHeader"]').filter({
          hasText: label(
            lane === 'voiceover'
              ? 'gallery.videoReview.audioVoiceover'
              : 'gallery.videoReview.audioMusic'
          ),
        });
        await header.getByRole('button', { name: label(pickerLabel), exact: true }).click();
        const drawer = page.locator('[data-ui="music.library.drawer"]');
        await expect(drawer).toBeVisible();
        await expect(drawer.locator('li')).toHaveCount(36);
        const search = drawer.getByRole('searchbox');
        const filter = drawer.getByRole('button', {
          name: label('gallery.videoReview.musicFilter'),
          exact: true,
        });
        const upload = drawer.getByRole('button', {
          name: label('gallery.videoReview.musicUpload'),
          exact: true,
        });
        const close = drawer.getByRole('button', {
          name: label('common.actions.close'),
          exact: true,
        });
        const list = drawer.locator('[data-ui="music.library.list"]');
        expect((await search.boundingBox())!.x).toBeLessThan((await filter.boundingBox())!.x);
        await expect(upload).toHaveCSS('height', '32px');
        expect((await upload.boundingBox())!.width).toBeGreaterThan(80);
        if (variant.width === 1280) {
          // Drawer width switches at viewport−24 = 960 and at 80vw = 960.
          for (const width of [983, 984, 985, 1199, 1200, 1201]) {
            await page.setViewportSize({ width, height: variant.height });
            await expect(search).toBeInViewport({ ratio: 1 });
            await expect(upload).toBeInViewport({ ratio: 1 });
            await expect(close).toBeInViewport({ ratio: 1 });
            await page.screenshot({
              path: info.outputPath(`music-library-width-${width}.png`),
              fullPage: false,
            });
          }
          await page.setViewportSize({ width: variant.width, height: variant.height });
        }
        const searchY = (await search.boundingBox())!.y;
        await expect
          .poll(() => list.evaluate((node) => node.scrollHeight > node.clientHeight))
          .toBe(true);
        await list.evaluate((node) => {
          node.scrollTop = node.scrollHeight;
        });
        await expect(drawer.locator('li').last()).toBeInViewport({ ratio: 1 });
        expect((await search.boundingBox())!.y).toBeCloseTo(searchY, 0);
        await expect(upload).toBeInViewport({ ratio: 1 });
        await expect(close).toBeInViewport({ ratio: 1 });
        await page.screenshot({
          path: info.outputPath('music-library-scroll.png'),
          fullPage: false,
        });
        await list.evaluate((node) => {
          node.scrollTop = 0;
        });
        await filter.click();
        await expect(page.getByRole('option', { name: 'Images only', exact: true })).toHaveCount(0);
        await page.getByRole('option', { name: 'Music tagged', exact: true }).click();
        await expect(drawer.locator('li')).toHaveCount(18);
        await search.fill('Song 01');
        await search.press('Enter');
        await expect(drawer.locator('li')).toHaveCount(0);
        await expect(filter).toContainText('Music tagged');
        await search.fill('Song 00');
        await search.press('Enter');
        await expect(drawer.locator('li')).toHaveCount(1);
        await filter.click();
        await page.getByRole('option', { name: 'All media', exact: true }).click();
        await search.fill('');
        await search.press('Enter');
        await expect(drawer.locator('li')).toHaveCount(36);
        await filter.click();
        await page
          .getByRole('option', { name: label('gallery.videoReview.musicAll'), exact: true })
          .click();
        await search.fill('not-existing');
        await search.press('Enter');
        await expect(drawer.locator('li')).toHaveCount(0);
        await expect(
          drawer.getByRole('button', { name: label('common.actions.close'), exact: true })
        ).toBeVisible();
        await search.fill('Song 00');
        await search.press('Enter');
        await expect(drawer.locator('li')).toHaveCount(1);
        await search.press('Space');
        await expect
          .poll(() =>
            review
              .locator('video')
              .first()
              .evaluate((node: HTMLVideoElement) => node.paused)
          )
          .toBe(true);
        await search.fill('Song 00');
        await search.press('Enter');
        await expect
          .poll(async () => {
            const boxes = await Promise.all([
              search.boundingBox(),
              upload.boundingBox(),
              close.boundingBox(),
            ]);
            if (boxes.some((box) => !box)) return false;
            const [searchBox, uploadBox, closeBox] = boxes;
            const overlapsRow = (
              a: NonNullable<typeof searchBox>,
              b: NonNullable<typeof searchBox>
            ) => Math.min(a.y + a.height, b.y + b.height) > Math.max(a.y, b.y);
            return (
              (!overlapsRow(searchBox!, uploadBox!) ||
                searchBox!.x + searchBox!.width <= uploadBox!.x) &&
              (!overlapsRow(uploadBox!, closeBox!) ||
                uploadBox!.x + uploadBox!.width <= closeBox!.x)
            );
          })
          .toBe(true);
        const duration = drawer.locator('li').first().locator(':scope > span');
        const add = drawer
          .locator('li')
          .first()
          .getByRole('button', { name: `${label('gallery.videoReview.musicAdd')}:` });
        expect(
          (await duration.boundingBox())!.x + (await duration.boundingBox())!.width
        ).toBeLessThanOrEqual((await add.boundingBox())!.x);
        await page.screenshot({
          path: info.outputPath('music-library-search.png'),
          fullPage: false,
        });
        const row = drawer.locator('li').first();
        await row
          .getByRole('button', { name: `${label('gallery.videoReview.musicPlay')}:` })
          .click();
        await expect(
          row.getByRole('button', { name: `${label('gallery.videoReview.musicStop')}:` })
        ).toBeVisible();
        await close.focus();
        await page.keyboard.press('Escape');
        await expect(drawer).toHaveCount(0);
        await expect(review).toBeVisible();
        await expect
          .poll(() =>
            review
              .locator('video')
              .first()
              .evaluate((node: HTMLVideoElement) => node.paused)
          )
          .toBe(true);
        await header.getByRole('button', { name: label(pickerLabel), exact: true }).click();
        await expect(drawer).toBeVisible();
        await expect(
          drawer.getByRole('button', {
            name: `${label('gallery.videoReview.musicStop')}:`,
          })
        ).toHaveCount(0);
        await expect
          .poll(() =>
            review
              .locator('video')
              .first()
              .evaluate((node: HTMLVideoElement) => node.paused)
          )
          .toBe(true);
        await search.fill('Song 00');
        await search.press('Enter');
        await expect(drawer.locator('li')).toHaveCount(1);
        await row
          .getByRole('button', { name: `${label('gallery.videoReview.musicAdd')}:` })
          .click();
        await expect(drawer).toHaveCount(0);
        await expect(review.locator(`[data-audio-lane="${lane}"] [data-audio-id]`)).toHaveCount(1);
        await page.screenshot({ path: info.outputPath('music-inserted.png'), fullPage: false });
        await expect.poll(() => libraryCounts(page)).toEqual([37, 2]);
        const button = (key: Parameters<typeof translate>[0]) =>
          review.getByRole('button', { name: label(key), exact: true });
        const clips = review.locator(`[data-audio-lane="${lane}"] [data-audio-id]`);
        const selectedId = await clips.first().getAttribute('data-audio-id');
        await button('gallery.videoReview.undo').click();
        await expect(clips).toHaveCount(0);
        expect(await libraryCounts(page)).toEqual([37, 2]);
        await button('gallery.videoReview.redo').click();
        await expect(clips).toHaveCount(1);
        await expect(clips.first()).toHaveAttribute('data-audio-id', selectedId!);
        await button('common.actions.close').click();
        await page.locator('[data-ui="gallery.videoReview.enter"]').click();
        await expect(clips).toHaveCount(1);
        await expect(clips.first()).toHaveAttribute('data-audio-id', selectedId!);
        if (variant.width === 1920) {
          const download = page.waitForEvent('download');
          await clickReviewExport(button, 'gallery.videoReview.downloadVideo');
          const result = await download;
          await result.saveAs(info.outputPath('library-music.webm'));
          expect(await result.failure()).toBeNull();
          expect(
            (await readFile(info.outputPath('library-music.webm'))).byteLength
          ).toBeGreaterThan(0);
        }
        // Undo frees the captured insertion position while retaining the selected source in history.
        await button('gallery.videoReview.undo').click();
        await expect(clips).toHaveCount(0);
        await header.getByRole('button', { name: label(pickerLabel), exact: true }).click();
        await expect(drawer).toBeVisible();
        const chooser = page.waitForEvent('filechooser');
        await upload.click();
        await (
          await chooser
        ).setFiles({
          name: 'Uploaded music.wav',
          mimeType: 'audio/wav',
          buffer: await readFile(new URL('../fixtures/review-voice-speech.wav', import.meta.url)),
        });
        await expect(drawer).toHaveCount(0);
        await expect(clips).toHaveCount(1);
        const uploadedId = await clips.first().getAttribute('data-audio-id');
        expect(uploadedId).not.toBe(selectedId);
        await expect.poll(() => libraryCounts(page)).toEqual([38, 3]);
        await button('gallery.videoReview.undo').click();
        await expect(clips).toHaveCount(0);
        expect(await libraryCounts(page)).toEqual([38, 3]);
        await button('gallery.videoReview.redo').click();
        await expect(clips).toHaveCount(1);
        await expect(clips.first()).toHaveAttribute('data-audio-id', uploadedId!);
        await button('common.actions.close').click();
        await page.locator('[data-ui="gallery.videoReview.enter"]').click();
        await expect(clips).toHaveCount(1);
        await expect(clips.first()).toHaveAttribute('data-audio-id', uploadedId!);
        expect(await libraryCounts(page)).toEqual([38, 3]);
        await page.screenshot({
          path: info.outputPath('music-upload-reopened.png'),
          fullPage: false,
        });
      } finally {
        await new Promise<void>((resolve) => host.server.close(() => resolve()));
      }
    }
  );
}
