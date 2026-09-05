import { createHash } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { betaV1Fixture } from '../../../../apps/extension/src/composition/persistence/infrastructure/indexed-db/fixtures/beta-v1';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { startHostServer } from '../support/host-server';
import { applyHarnessBootstrap, GALLERY_HARNESS_PATH } from '../extension-critical.helpers';

async function seedReviewVideo(
  page: Page,
  filename: string,
  dimensions: { width: number; height: number; duration: number }
) {
  const bytes = await readFile(new URL(`../fixtures/${filename}`, import.meta.url));
  await page.evaluate(
    async ({ fixture, encoded, dimensions }) => {
      const body = Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0));
      const directory = await (
        await navigator.storage.getDirectory()
      ).getDirectoryHandle('sniptale-assets', { create: true });
      const objects = await directory.getDirectoryHandle('objects', { create: true });
      const file = await objects.getFileHandle('beta-v1-recording-asset', { create: true });
      const writer = await file.createWritable();
      await writer.write(body);
      await writer.close();
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(fixture.databaseName);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const transaction = db.transaction(
        ['recordings', 'media_library', 'asset_refs', 'asset_owners'],
        'readwrite'
      );
      const done = new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onabort = () => reject(transaction.error);
      });
      transaction
        .objectStore('recordings')
        .put({ ...fixture.records.recordings[0], size: body.length });
      transaction.objectStore('media_library').put({
        ...fixture.records.media_library[0],
        size: body.length,
        ...dimensions,
      });
      transaction
        .objectStore('asset_refs')
        .put({ ...fixture.records.asset_refs[0], size: body.length });
      transaction.objectStore('asset_owners').put(fixture.records.asset_owners[0]);
      await done;
      db.close();
    },
    { fixture: betaV1Fixture, encoded: bytes.toString('base64'), dimensions }
  );
}

for (const variant of [
  { locale: 'ru', theme: 'light' },
  { locale: 'en', theme: 'dark' },
] as const) {
  const label = (key: Parameters<typeof translate>[0]) => translate(key, variant.locale);

  test(`gallery review restores comments, normalized regions, field recovery and linear history (${variant.locale}, ${variant.theme})`, async ({
    page,
  }, testInfo) => {
    const host = await startHostServer();
    try {
      await applyHarnessBootstrap(page, {
        preserveMediaLibrary: true,
        storage: {
          'sniptale-locale-preference': variant.locale,
          'sniptale-theme-preference': variant.theme,
        },
      });
      await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}`);
      await page.locator('[data-ui="gallery.page.root"]').waitFor();
      await seedReviewVideo(page, 'cache-source.webm', { width: 320, height: 180, duration: 4 });
      await page.reload();
      await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).first().click();
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      const dialog = page.locator('dialog');
      const button = (key: Parameters<typeof translate>[0]) =>
        dialog.getByRole('button', { name: label(key), exact: true });
      await expect(dialog.locator('video')).toHaveJSProperty('controls', false);
      await page.keyboard.press('ArrowRight');
      await expect(dialog.locator('video')).toHaveJSProperty('currentTime', 1);
      await page.keyboard.press('ArrowLeft');
      await expect(dialog.locator('video')).toHaveJSProperty('currentTime', 0);
      await page.keyboard.press('Escape');
      await expect(dialog).toBeVisible();
      await button('gallery.videoReview.addComment').click();
      await dialog
        .getByRole('textbox', { name: label('gallery.videoReview.commentText'), exact: true })
        .fill('Check this control');
      await button('gallery.videoReview.selectedRegion').click();
      await button('gallery.videoReview.save').click();
      await expect(
        dialog.locator('ol').getByText('Check this control', { exact: true })
      ).toBeVisible();
      await button('gallery.videoReview.range').click();
      await button('gallery.videoReview.addComment').click();
      const field = dialog.getByRole('textbox', {
        name: label('gallery.videoReview.commentText'),
        exact: true,
      });
      await field.fill('Recover this unfinished range note');
      await expect(
        dialog.getByText(label('gallery.videoReview.draftSaved'), { exact: true })
      ).toBeVisible();
      await page.reload();
      await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).first().click();
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      await expect(field).toHaveValue('Recover this unfinished range note');
      await button('gallery.videoReview.save').click();
      await button('gallery.videoReview.undo').click();
      await expect(
        dialog.locator('ol').getByText('Recover this unfinished range note', { exact: true })
      ).toHaveCount(0);
      await button('gallery.videoReview.redo').click();
      await expect(
        dialog.locator('ol').getByText('Recover this unfinished range note', { exact: true })
      ).toBeVisible();
      const download = page.waitForEvent('download');
      await button('gallery.videoReview.downloadReport').click();
      const artifact = await download;
      const path = testInfo.outputPath('review.md');
      await artifact.saveAs(path);
      const report = await readFile(path, 'utf8');
      expect(report).toContain('"timeUnit": "us"');
      expect(report).toContain('"width": 0.5');
      expect(report).toContain('Check this control');
      expect(report).toContain('Recover this unfinished range note');
      expect(report).not.toContain('"history"');
      await dialog
        .locator('ol')
        .getByRole('button', { name: /Check this control/ })
        .click();
      const region = dialog.locator(
        'div[aria-label="' + label('gallery.videoReview.selectedRegion') + '"]'
      );
      await expect(region).toBeVisible();
      const beforeResize = await region.boundingBox();
      expect(beforeResize?.width).toBeGreaterThan(0);
      // The gallery harness initializes a fixed light theme; apply the production theme attributes for visual coverage.
      await page.evaluate((theme) => {
        document.documentElement.dataset.theme = theme;
        document.body.dataset.theme = theme;
      }, variant.theme);
      await expect(page.locator('body')).toHaveAttribute('data-theme', variant.theme);
      await expect
        .poll(() =>
          button('gallery.videoReview.back').evaluate((node) => getComputedStyle(node).color)
        )
        .toBe(await dialog.evaluate((node) => getComputedStyle(node).color));
      await page.screenshot({ path: testInfo.outputPath(`review-1280-${variant.theme}.png`) });
      await dialog
        .locator('[data-ui="gallery.videoReview.timeline"]')
        .screenshot({ path: testInfo.outputPath(`timeline-${variant.theme}.png`) });
      await page.setViewportSize({ width: 800, height: 600 });
      await expect(region).toBeVisible();
      const afterResize = await region.boundingBox();
      expect(afterResize!.width).toBeLessThan(beforeResize!.width);

      await expect(button('gallery.videoReview.back')).toBeInViewport();
      await page.screenshot({ path: testInfo.outputPath(`review-800-${variant.theme}.png`) });
      await page.evaluate(() => {
        document.documentElement.style.fontSize = '200%';
      });
      await dialog
        .locator('ol')
        .getByText('Check this control', { exact: true })
        .scrollIntoViewIfNeeded();
      await expect(
        dialog.locator('ol').getByText('Check this control', { exact: true })
      ).toBeInViewport();
      await button('gallery.videoReview.play').scrollIntoViewIfNeeded();
      await expect(button('gallery.videoReview.play')).toBeInViewport();
      await button('gallery.videoReview.back').scrollIntoViewIfNeeded();
      await expect(button('gallery.videoReview.back')).toBeInViewport();
      await page.screenshot({
        path: testInfo.outputPath(`review-200percent-${variant.theme}.png`),
      });
      await page.evaluate(() => {
        document.documentElement.style.fontSize = '';
      });
      await button('gallery.videoReview.back').click();
      await expect(page.locator('[data-ui="gallery.preview.surface"] video')).toHaveJSProperty(
        'controls',
        true
      );
      await expect(page.locator('[data-ui="gallery.videoReview.enter"]')).toBeFocused();
    } finally {
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}

test('gallery cuts export a separate playable copy and keep original bytes and linear history', async ({
  page,
}, testInfo) => {
  const host = await startHostServer();
  const label = (key: Parameters<typeof translate>[0]) => translate(key, 'en');
  try {
    await applyHarnessBootstrap(page, {
      preserveMediaLibrary: true,
      storage: { 'sniptale-locale-preference': 'en' },
    });
    await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}`);
    await page.locator('[data-ui="gallery.page.root"]').waitFor();
    await seedReviewVideo(page, 'review-vp8-opus.webm', { width: 160, height: 90, duration: 12 });
    await page.reload();
    const open = async () => {
      await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).first().click();
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
    };
    await open();
    const dialog = page.locator('dialog');
    const button = (key: Parameters<typeof translate>[0]) =>
      dialog.getByRole('button', { name: label(key), exact: true });
    await expect(button('gallery.videoReview.cutMode')).toBeEnabled();
    await button('gallery.videoReview.cutMode').click();
    await page.keyboard.press('ArrowRight');
    await expect(dialog.locator('video')).toHaveJSProperty('currentTime', 2);
    await page.keyboard.press('ArrowRight');
    await expect(dialog.locator('video')).toHaveJSProperty('currentTime', 4);
    await dialog.getByLabel(label('gallery.videoReview.rangeEnd'), { exact: true }).fill('4');
    await dialog.getByLabel(label('gallery.videoReview.rangeStart'), { exact: true }).fill('2');
    await button('gallery.videoReview.applyCut').click();
    const cut = dialog.getByRole('button', { name: 'Cut 0:02.000 – 0:04.000', exact: true });
    await expect(cut).toBeVisible();
    await button('gallery.videoReview.undo').click();
    await expect(cut).toHaveCount(0);
    await button('gallery.videoReview.redo').click();
    await expect(cut).toBeVisible();
    await cut.click();
    await button('gallery.videoReview.play').click();
    await expect
      .poll(() => dialog.locator('video').evaluate((video: HTMLVideoElement) => video.currentTime))
      .toBeGreaterThanOrEqual(4);
    await button('gallery.videoReview.pause').click();
    await page.reload();
    await open();
    await expect(cut).toBeVisible();
    await expect(button('gallery.videoReview.exportVideo')).toBeEnabled();
    await button('gallery.videoReview.exportVideo').click();
    await expect(
      dialog.getByText(label('gallery.videoReview.exportAdded'), { exact: true })
    ).toBeVisible();
    const reportDownload = page.waitForEvent('download');
    await button('gallery.videoReview.downloadReport').click();
    const report = await readFile(await (await reportDownload).path(), 'utf8');
    expect(report).toContain('"exported": true');
    expect(report).toContain('"videoReencoded": false');
    for (let attempt = 0; attempt < 2; attempt++) {
      const downloading = page.waitForEvent('download');
      await button('gallery.videoReview.downloadVideo').click();
      const download = await downloading;
      expect(download.suggestedFilename()).toBe('beta-v1-edited.webm');
      await download.saveAs(testInfo.outputPath(`copy-${attempt}.webm`));
    }
    const persisted = await page.evaluate(async (databaseName) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(databaseName);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const count = await new Promise<number>((resolve, reject) => {
        const request = db.transaction('recordings').objectStore('recordings').count();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      db.close();
      const directory = await (
        await navigator.storage.getDirectory()
      ).getDirectoryHandle('sniptale-assets');
      const objects = await directory.getDirectoryHandle('objects');
      const file = await (await objects.getFileHandle('beta-v1-recording-asset')).getFile();
      const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
      return {
        count,
        hash: Array.from(new Uint8Array(digest), (value) =>
          value.toString(16).padStart(2, '0')
        ).join(''),
      };
    }, betaV1Fixture.databaseName);
    expect(persisted.count).toBe(2);
    expect(persisted.hash).toBe(
      createHash('sha256')
        .update(await readFile(new URL('../fixtures/review-vp8-opus.webm', import.meta.url)))
        .digest('hex')
    );
    await dialog
      .locator('[data-ui="gallery.videoReview.timeline"]')
      .screenshot({ path: testInfo.outputPath('timeline-cut.png') });
    await button('gallery.videoReview.back').click();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'beta-v1-edited.webm', exact: true }).first().click();
    const player = page.locator('[data-ui="gallery.preview.surface"] video');
    await expect(player).toHaveJSProperty('controls', true);
    await expect
      .poll(() => player.evaluate((node) => (node as HTMLVideoElement).duration))
      .toBeCloseTo(10, 1);
  } finally {
    await new Promise<void>((resolve) => host.server.close(() => resolve()));
  }
});
