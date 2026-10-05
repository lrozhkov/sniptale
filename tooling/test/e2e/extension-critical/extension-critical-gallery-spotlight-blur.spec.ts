import { readFile, writeFile } from 'node:fs/promises';
import { startHostServer } from '../support/host-server';
import { applyHarnessBootstrap, GALLERY_HARNESS_PATH } from '../extension-critical.helpers';
import { seedReviewVideo, clickReviewExport } from '../support/quick-editor-media-fixture';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { build } from 'esbuild';
import { expect, test } from '@playwright/test';

test('Spotlight export blur suppresses detail uniformly at canvas edges', async ({
  page,
}, info) => {
  const bundle = await build({
    entryPoints: ['tooling/test/e2e/support/spotlight-blur-probe.ts'],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    write: false,
    loader: { '.svg': 'text' },
    define: { 'process.env.NODE_ENV': '"production"' },
  });
  const samples = await page.evaluate(async (text) => {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/javascript' }));
    try {
      return (await import(url)).probe();
    } finally {
      URL.revokeObjectURL(url);
    }
  }, bundle.outputFiles[0]!.text);
  await page.screenshot({ path: info.outputPath('spotlight-blur-edges.png'), fullPage: false });
  await writeFile(info.outputPath('spotlight-metrics.json'), JSON.stringify(samples, null, 2));
  expect(samples.live.encodes).toBe(2);
  for (const sample of samples.edges) {
    expect(sample.middle).toBeLessThan(4);
    expect(sample.top).toBeLessThan(4);
    expect(sample.bottom).toBeLessThan(4);
  }
  for (const sample of samples.scene) expect(sample.error, JSON.stringify(samples)).toBeLessThan(3);
  for (const mismatch of samples.preview) expect(mismatch).toBeLessThan(40);
});

test('quick editor exports a small left-edge blur with browser header and shadow', async ({
  page,
}, info) => {
  const host = await startHostServer();
  const label = (key: Parameters<typeof translate>[0]) => translate(key, 'en');
  try {
    await applyHarnessBootstrap(page, {
      preserveMediaLibrary: true,
      storage: { 'sniptale-locale-preference': 'en', 'sniptale-theme-preference': 'dark' },
    });
    await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}?theme=dark`);
    await page.locator('[data-ui="gallery.page.root"]').waitFor();
    await seedReviewVideo(page, 'review-vp8-opus.webm', { width: 160, height: 90, duration: 4 });
    await page.reload();
    await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).first().click();
    await page.locator('[data-ui="gallery.videoReview.enter"]').click();
    const dialog = page.locator('dialog');
    const button = (key: Parameters<typeof translate>[0]) =>
      dialog.getByRole('button', { name: label(key), exact: true });
    const number = async (key: Parameters<typeof translate>[0], value: string) => {
      const field = dialog.getByRole('textbox', { name: label(key), exact: true });
      await field.fill(value);
      await field.press('Enter');
    };
    await button('gallery.videoReview.advancedEditing').click();
    await button('gallery.videoReview.scene').click();
    await button('gallery.videoReview.windowHeader').click();
    await page
      .getByRole('option', { name: label('gallery.videoReview.windowHeaderBrowser'), exact: true })
      .click();
    await button('gallery.videoReview.backgroundSolid').click();
    await number('gallery.videoReview.backgroundPadding', '8');
    await number('gallery.videoReview.backgroundShadow', '80');
    await button('gallery.videoReview.zoomAdd').click();
    await button('gallery.videoReview.focusSpotlight').click();
    await button('gallery.videoReview.focusOutside').click();
    await page
      .getByRole('option', { name: label('gallery.videoReview.focusBlur'), exact: true })
      .click();
    await dialog
      .getByRole('heading', { name: label('gallery.videoReview.preciseArea'), exact: true })
      .click();
    await number('gallery.videoReview.focusAreaWidth', '10');
    await number('gallery.videoReview.focusAreaHeight', '10');
    await number('gallery.videoReview.focusAreaX', '0');
    await number('gallery.videoReview.focusAreaY', '45');
    const plane = dialog.locator('[data-ui="gallery.videoReview.timePlane"]');
    const rulerNode = plane.locator('[data-ui="gallery.videoReview.ruler"]');
    await rulerNode.scrollIntoViewIfNeeded();
    const ruler = await rulerNode.boundingBox();
    const duration = Number(await plane.getAttribute('aria-valuemax'));
    await page.mouse.click(ruler!.x + ruler!.width / duration, ruler!.y + 10);
    const overlay = dialog.locator(
      '[data-ui="gallery.videoReview.stage"] [data-ui="gallery.videoReview.spotlight"]'
    );
    await expect(overlay).toBeVisible();
    await expect
      .poll(() => overlay.evaluate((node) => getComputedStyle(node).backdropFilter))
      .not.toBe('none');
    await page.screenshot({
      path: info.outputPath('spotlight-header-shadow-preview.png'),
      fullPage: false,
    });
    const downloading = page.waitForEvent('download');
    await clickReviewExport(button, 'gallery.videoReview.downloadVideo');
    const download = await downloading;
    const path = info.outputPath('spotlight-header-shadow.webm');
    await download.saveAs(path);
    expect(await download.failure()).toBeNull();
    const encoded = (await readFile(path)).toString('base64');
    const result = await page.evaluate(async (body) => {
      const url = URL.createObjectURL(
        new Blob([Uint8Array.from(atob(body), (char) => char.charCodeAt(0))], {
          type: 'video/webm',
        })
      );
      const video = document.createElement('video');
      try {
        await new Promise<void>((resolve, reject) => {
          video.onloadeddata = () => resolve();
          video.onerror = () => reject(new Error('Export decode failed'));
          video.src = url;
        });
        await new Promise<void>((resolve) => {
          video.onseeked = () => resolve();
          video.currentTime = 1;
        });
        const canvas = Object.assign(document.createElement('canvas'), {
          width: video.videoWidth,
          height: video.videoHeight,
        });
        const context = canvas.getContext('2d')!;
        context.drawImage(video, 0, 0);
        let contrast = 0;
        for (const y of [0, canvas.height - 1]) {
          const row = context.getImageData(50, y, 60, 1).data;
          for (let i = 4; i < row.length; i += 4)
            contrast = Math.max(contrast, Math.abs(row[i]! - row[i - 4]!));
        }
        return { width: canvas.width, height: canvas.height, contrast };
      } finally {
        video.removeAttribute('src');
        video.load();
        URL.revokeObjectURL(url);
      }
    }, encoded);
    expect(result.width).toBe(160);
    expect(result.height).toBeGreaterThan(90);
    expect(result.contrast).toBeLessThan(15);
  } finally {
    await new Promise<void>((resolve, reject) =>
      host.server.close((error) => (error ? reject(error) : resolve()))
    );
  }
});
