import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { startHostServer } from '../support/host-server';
import { applyHarnessBootstrap, GALLERY_HARNESS_PATH } from '../extension-critical.helpers';
import {
  seedReviewVideo,
  clickReviewExport,
  persistedFocus,
} from '../support/quick-editor-media-fixture';

async function seek(page: Page, time: number) {
  const plane = page.locator('[data-ui="gallery.videoReview.timePlane"]');
  const rulerNode = plane.locator('[data-ui="gallery.videoReview.ruler"]');
  await rulerNode.scrollIntoViewIfNeeded();
  const ruler = await rulerNode.boundingBox();
  if (!ruler) throw new Error('Timeline ruler is unavailable');
  const duration = Number(await plane.getAttribute('aria-valuemax'));
  await page.mouse.click(ruler.x + (ruler.width * time) / duration, ruler.y + 12);
}

for (const variant of [
  { locale: 'en', theme: 'light' },
  { locale: 'ru', theme: 'dark' },
  { locale: 'en', theme: 'light', viewport: { width: 1200, height: 560 } },
] as const) {
  test(`quick editor overlapping Focus Border (${variant.locale}${'viewport' in variant ? ', below minimum' : ''})`, async ({
    page,
  }, info) => {
    if ('viewport' in variant) await page.setViewportSize(variant.viewport);
    const host = await startHostServer();
    const label = (key: Parameters<typeof translate>[0]) => translate(key, variant.locale);
    try {
      await applyHarnessBootstrap(page, {
        preserveMediaLibrary: true,
        storage: {
          'sniptale-locale-preference': variant.locale,
          'sniptale-theme-preference': variant.theme,
        },
      });
      await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}?theme=${variant.theme}`);
      await page.locator('[data-ui="gallery.page.root"]').waitFor();
      await seedReviewVideo(page, 'review-vp8-opus.webm', { width: 160, height: 90, duration: 4 });
      await page.reload();
      await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).first().click();
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      const dialog = page.locator('dialog');
      const button = (key: Parameters<typeof translate>[0]) =>
        dialog.getByRole('button', { name: label(key), exact: true });
      await button('gallery.videoReview.advancedEditing').click();
      await seek(page, 0.5);
      await button('gallery.videoReview.zoomAdd').click();
      const blocks = dialog.locator('[data-ui="gallery.videoReview.zoomLane"] [role="button"]');
      await expect(blocks).toHaveCount(1);
      await button('gallery.videoReview.focusRangeTool').click();
      const toolbar = dialog.locator('[data-ui="gallery.videoReview.editingTools"]');
      await toolbar
        .getByRole('button', { name: label('gallery.videoReview.focusType'), exact: true })
        .click();
      await page
        .getByRole('option', { name: label('gallery.videoReview.focusBorder'), exact: true })
        .click();
      await button('gallery.videoReview.zoomAdd').click();
      await expect(blocks).toHaveCount(2);
      const inspector = dialog.locator('[data-ui="gallery.videoReview.zoomInspector"]');
      await expect(
        inspector
          .locator('[data-ui="gallery.videoReview.focusType"]')
          .getByRole('button', { name: label('gallery.videoReview.zoomRegionLabel'), exact: true })
      ).toBeDisabled();
      await expect(
        inspector.getByText(label('gallery.videoReview.focusZoomConflict'), { exact: true })
      ).toBeVisible();
      const width = inspector.getByRole('textbox', {
        name: label('gallery.videoReview.borderWidth'),
        exact: true,
      });
      await expect.poll(async () => (await persistedFocus(page))?.border?.width).toBe(3);
      await width.fill('6');
      await width.press('Enter');
      await expect.poll(async () => (await persistedFocus(page))?.border?.width).toBe(6);
      await button('gallery.videoReview.undo').click();
      await expect(width).toHaveValue('3');
      await button('gallery.videoReview.redo').click();
      await expect(width).toHaveValue('6');
      await inspector
        .getByRole('button', { name: label('gallery.videoReview.borderHold'), exact: true })
        .click();
      await page
        .getByRole('option', { name: label('gallery.videoReview.borderMoving'), exact: true })
        .click();
      const period = inspector.getByRole('textbox', {
        name: label('gallery.videoReview.borderPeriod'),
        exact: true,
      });
      await expect(period).toHaveValue('2');
      await period.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: info.outputPath('focus-border-animation-controls.png'),
        fullPage: false,
      });
      const rows = await blocks.evaluateAll((nodes) =>
        nodes.map((node) => node.getBoundingClientRect().y)
      );
      expect(new Set(rows).size).toBe(2);
      const focusTool = button('gallery.videoReview.focusRangeTool');
      if ((await focusTool.getAttribute('aria-pressed')) !== 'true') await focusTool.click();
      await toolbar
        .getByRole('button', { name: label('gallery.videoReview.focusType'), exact: true })
        .click();
      await page
        .getByRole('option', { name: label('gallery.videoReview.focusSpotlight'), exact: true })
        .click();
      await button('gallery.videoReview.zoomAdd').click();
      await button('gallery.videoReview.zoomAdd').click();
      await expect(blocks).toHaveCount(4);
      await blocks.filter({ hasText: label('gallery.videoReview.focusBorder') }).click();
      await button('gallery.videoReview.pointerTool').click();
      await seek(page, 1.5);
      await expect
        .poll(async () =>
          dialog
            .locator('[data-ui="gallery.videoReview.stage"] video')
            .evaluate((node: HTMLVideoElement) => node.currentTime)
        )
        .toBeGreaterThan(1.4);
      await button('gallery.videoReview.windowHeader').click();
      await page
        .getByRole('option', {
          name: label('gallery.videoReview.windowHeaderBrowser'),
          exact: true,
        })
        .click();
      await button('gallery.videoReview.backgroundSolid').click();
      const padding = dialog.getByRole('textbox', {
        name: label('gallery.videoReview.backgroundPadding'),
        exact: true,
      });
      await padding.fill('8');
      await padding.press('Enter');
      await button('gallery.videoReview.backgroundZoom').click();
      await page
        .getByRole('option', {
          name: label(
            variant.locale === 'en'
              ? 'gallery.videoReview.backgroundZoomFixed'
              : 'gallery.videoReview.backgroundZoomFollow'
          ),
          exact: true,
        })
        .click();
      await expect(dialog.locator('[data-ui="gallery.videoReview.stage"] img')).toHaveCount(1);
      await expect(
        dialog.locator(
          '[data-ui="gallery.videoReview.stage"] [data-ui="gallery.videoReview.border"]'
        )
      ).toBeVisible();
      await page.screenshot({ path: info.outputPath('focus-border-overlap.png'), fullPage: false });
      await button('gallery.videoReview.back').click();
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      await expect(blocks).toHaveCount(4);
      await blocks.filter({ hasText: label('gallery.videoReview.focusBorder') }).click();
      await expect(width).toHaveValue('6');
      const downloading = page.waitForEvent('download');
      await clickReviewExport(button, 'gallery.videoReview.downloadVideo');
      const download = await downloading;
      await download.saveAs(info.outputPath('focus-border.webm'));
      expect(await download.failure()).toBeNull();
      const encoded = (await readFile(info.outputPath('focus-border.webm'))).toString('base64');
      const orangePixels = await page.evaluate(async (body) => {
        const url = URL.createObjectURL(
          new Blob([Uint8Array.from(atob(body), (c) => c.charCodeAt(0))], { type: 'video/webm' })
        );
        const video = document.createElement('video');
        video.muted = true;
        try {
          await new Promise<void>((resolve, reject) => {
            video.onloadeddata = () => resolve();
            video.onerror = () => reject(new Error('Export decode failed'));
            video.src = url;
          });
          await new Promise<void>((resolve) => {
            video.onseeked = () => resolve();
            video.currentTime = 1.5;
          });
          const canvas = document.createElement('canvas');
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const context = canvas.getContext('2d')!;
          context.drawImage(video, 0, 0);
          const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
          let count = 0;
          for (let i = 0; i < pixels.length; i += 4)
            if (
              pixels[i]! > 225 &&
              pixels[i + 1]! > 100 &&
              pixels[i + 1]! < 170 &&
              pixels[i + 2]! < 40
            )
              count++;
          return count;
        } finally {
          video.removeAttribute('src');
          video.load();
          URL.revokeObjectURL(url);
        }
      }, encoded);
      expect(orangePixels).toBeGreaterThan(100);
    } finally {
      await new Promise<void>((resolve, reject) =>
        host.server.close((error) => (error ? reject(error) : resolve()))
      );
    }
  });
}

test('Focus compositor produces union holes and a partial clockwise Border in Chromium', async ({
  page,
}) => {
  const bundle = await build({
    entryPoints: ['tooling/test/e2e/support/focus-render-probe.ts'],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    write: false,
  });
  const pixels = await page.evaluate(async (text) => {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/javascript' }));
    try {
      const module = await import(url);
      return module.probe();
    } finally {
      URL.revokeObjectURL(url);
    }
  }, bundle.outputFiles[0]!.text);
  expect(pixels).toMatchObject({
    outside: 204,
    firstOnly: 0,
    overlap: 0,
    secondOnly: 0,
    top: 255,
    bottom: 0,
    right: 0,
  });
  for (const stroke of pixels.patterned) {
    expect(stroke.partial).toBeGreaterThan(0);
    expect(stroke.full).toBeGreaterThan(stroke.partial * 2);
  }
});
