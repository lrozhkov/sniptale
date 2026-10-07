import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { startHostServer } from '../support/host-server';
import {
  seedReviewVideo,
  persistedFocus,
  clickReviewExport,
} from '../support/quick-editor-media-fixture';
import { applyHarnessBootstrap, GALLERY_HARNESS_PATH } from '../extension-critical.helpers';
import { translate } from '../../../../apps/extension/src/platform/i18n';

test('quick zoom perspective survives reopening and matches encoded output', async ({
  page,
}, info) => {
  const host = await startHostServer();
  const label = (key: Parameters<typeof translate>[0]) => translate(key, 'en');
  const dialog = page.locator('dialog');
  const button = (key: Parameters<typeof translate>[0]) =>
    dialog.getByRole('button', { name: label(key), exact: true });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await applyHarnessBootstrap(page, {
      preserveMediaLibrary: true,
      storage: { 'sniptale-locale-preference': 'en' },
    });
    await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}`);
    await page.locator('[data-ui="gallery.page.root"]').waitFor();
    await seedReviewVideo(
      page,
      'review-vp8-opus.webm',
      { width: 160, height: 90, duration: 12 },
      false,
      true
    );
    await page.reload();
    await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).first().click();
    await page.locator('[data-ui="gallery.videoReview.enter"]').click();
    await button('gallery.videoReview.advancedEditing').click();
    await button('gallery.videoReview.historyOpen').click();
    const history = dialog.locator('[data-ui="gallery.videoReview.actionHistory"]');
    await history
      .getByRole('checkbox', { name: label('gallery.videoReview.historySelectAll'), exact: true })
      .click();
    await history
      .getByRole('button', { name: label('gallery.videoReview.historyConfigure'), exact: true })
      .click();
    await history
      .getByRole('button', { name: label('gallery.videoReview.clickEffect'), exact: true })
      .click();
    await page
      .getByRole('option', { name: label('gallery.videoReview.click_ripple'), exact: true })
      .click();
    await button('gallery.videoReview.scene').click();
    await button('gallery.videoReview.backgroundSolid').click();
    await button('gallery.videoReview.backgroundZoom').click();
    await page
      .getByRole('option', { name: label('gallery.videoReview.backgroundZoomFollow'), exact: true })
      .click();
    const padding = dialog.getByRole('textbox', {
      name: label('gallery.videoReview.backgroundPadding'),
      exact: true,
    });
    await padding.fill('12');
    await padding.press('Enter');
    await dialog.getByRole('button', { name: label('windowHeader.browser'), exact: true }).click();
    await button('gallery.videoReview.zoomAdd').click();
    const group = dialog.locator('details[data-level="group"]').filter({
      has: page.locator('summary h4', { hasText: label('gallery.videoReview.perspective') }),
    });
    await expect(group).not.toHaveAttribute('open');
    await group.locator('summary').click();
    await group
      .getByRole('button', { name: label('gallery.videoReview.spatialEnabled'), exact: true })
      .click();
    await page
      .getByRole('option', { name: label('gallery.videoReview.motionBlurOn'), exact: true })
      .click();
    const tilt = group.getByRole('textbox', {
      name: label('gallery.videoReview.perspectiveY'),
      exact: true,
    });
    await tilt.fill('35');
    await tilt.press('Enter');
    await expect.poll(async () => (await persistedFocus(page))?.perspective?.rotateY).toBe(35);
    const ruler = dialog.locator('[data-ui="gallery.videoReview.ruler"]');
    const rulerBox = (await ruler.boundingBox())!;
    const duration = Number(
      await dialog
        .locator('[data-ui="gallery.videoReview.timePlane"]')
        .getAttribute('aria-valuemax')
    );
    await page.mouse.click(rulerBox.x + (1.2 * rulerBox.width) / duration, rulerBox.y + 10);
    const stage = dialog.locator('[data-ui="gallery.videoReview.stage"]');
    const raster = stage.locator('[data-ui="gallery.videoReview.motionBlurCanvas"]');
    await expect(raster).toBeVisible();
    await expect
      .poll(() => stage.locator('video').evaluate((video: HTMLVideoElement) => video.currentTime))
      .toBeCloseTo(1.2, 1);
    await expect(
      dialog.getByText(label('gallery.videoReview.spatialUnavailable'), { exact: true })
    ).toHaveCount(0);
    await button('gallery.videoReview.zoomPreviewResult').click();
    await expect(dialog.locator('[data-ui="gallery.videoReview.zoomPreview"]')).toHaveAttribute(
      'data-status',
      'ready'
    );
    const depth = dialog.locator('details[data-level="group"]').filter({
      has: page.locator('summary h4', { hasText: label('gallery.videoReview.depthOfField') }),
    });
    await depth.locator('summary').click();
    await depth
      .getByRole('button', { name: label('gallery.videoReview.spatialEnabled'), exact: true })
      .click();
    await page
      .getByRole('option', { name: label('gallery.videoReview.motionBlurOn'), exact: true })
      .click();
    await depth
      .getByRole('button', { name: label('gallery.videoReview.depthMode'), exact: true })
      .click();
    await page
      .getByRole('option', { name: label('gallery.videoReview.depthModeArea'), exact: true })
      .click();
    const blur = depth.getByRole('textbox', {
      name: label('gallery.videoReview.depthStrength'),
      exact: true,
    });
    await blur.fill('100');
    await blur.press('Enter');
    await expect.poll(async () => (await persistedFocus(page))?.depthOfField?.strength).toBe(1);
    await blur.scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath('depth-inspector.png'), fullPage: false });
    await tilt.scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath('perspective-inspector.png'), fullPage: false });
    const clickCanvas = stage.locator('[data-ui="gallery.videoReview.clickAnimation"]');
    await expect(clickCanvas).toBeVisible();
    expect(
      await clickCanvas.locator('..').evaluate((node) => getComputedStyle(node).transform)
    ).toMatch(/^matrix3d/);
    await page.screenshot({ path: info.outputPath('projected-click.png'), fullPage: false });
    const sourceTime = await stage
      .locator('video')
      .evaluate((video: HTMLVideoElement) => video.currentTime);
    const expected = await raster.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
    await button('gallery.videoReview.back').click();
    await page.locator('[data-ui="gallery.videoReview.enter"]').click();
    await dialog
      .locator('[data-ui="gallery.videoReview.zoomLane"] [role="button"]')
      .first()
      .click();
    await expect(tilt).toHaveValue('35');
    const downloadPromise = page.waitForEvent('download');
    await clickReviewExport(button, 'gallery.videoReview.downloadVideo');
    const download = await downloadPromise;
    await download.saveAs(info.outputPath('perspective.webm'));
    const encoded = (await readFile(await download.path())).toString('base64');
    const difference = await page.evaluate(
      async ({ encoded, expected, sourceTime }) => {
        const video = document.createElement('video');
        const blob = new Blob([Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0))], {
          type: 'video/webm',
        });
        const url = URL.createObjectURL(blob);
        try {
          video.src = url;
          await new Promise<void>((resolve, reject) => {
            video.onloadeddata = () => resolve();
            video.onerror = () => reject(new Error('Export decode failed'));
          });
          video.currentTime = sourceTime;
          await new Promise<void>((resolve) => {
            video.onseeked = () => resolve();
          });
          const image = new Image();
          image.src = expected;
          await image.decode();
          const canvas = document.createElement('canvas');
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const context = canvas.getContext('2d')!;
          context.drawImage(image, 0, 0, canvas.width, canvas.height);
          const a = context.getImageData(0, 0, canvas.width, canvas.height).data;
          context.drawImage(video, 0, 0);
          const b = context.getImageData(0, 0, canvas.width, canvas.height).data;
          let error = 0;
          for (let i = 0; i < a.length; i += 4)
            for (let c = 0; c < 3; c++) error += Math.abs(a[i + c]! - b[i + c]!);
          return error / (a.length * 0.75);
        } finally {
          video.removeAttribute('src');
          video.load();
          URL.revokeObjectURL(url);
        }
      },
      { encoded, expected, sourceTime }
    );
    expect(difference).toBeLessThan(18);
    await page.mouse.click(rulerBox.x + (4 * rulerBox.width) / duration, rulerBox.y + 10);
    await button('gallery.videoReview.zoomAdd').click();
    const link = dialog.locator('[data-ui="gallery.videoReview.zoomLink"]');
    await link.hover();
    await link.click();
    await expect(link).toHaveAttribute('data-connected', 'true');
    await page.mouse.click(rulerBox.x + (3 * rulerBox.width) / duration, rulerBox.y + 10);
    await expect(raster).toBeVisible();
    await page.screenshot({
      path: info.outputPath('perspective-to-ordinary-link.png'),
      fullPage: false,
    });
    await page.mouse.click(rulerBox.x + (5 * rulerBox.width) / duration, rulerBox.y + 10);
    await button('gallery.videoReview.scene').click();
    await expect(button('gallery.videoReview.backgroundZoom')).toBeDisabled();
    await page.mouse.click(rulerBox.x + (7 * rulerBox.width) / duration, rulerBox.y + 10);
    await expect(button('gallery.videoReview.backgroundZoom')).toBeEnabled();
    await dialog
      .locator('[data-ui="gallery.videoReview.zoomLane"] [role="button"]')
      .first()
      .click();
    if (page.viewportSize()!.width === 1920) {
      const scroll = dialog.locator('.review-inspector-scroll');
      const handle = dialog.locator('[data-ui="gallery.videoReview.resizeInspector"]');
      for (const target of [523, 524, 525]) {
        const contentWidth = () =>
          scroll.evaluate((node) => {
            const style = getComputedStyle(node);
            return (
              node.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
            );
          });
        const current = await contentWidth();
        const box = (await handle.boundingBox())!;
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width / 2 - (target - current), box.y + box.height / 2);
        await page.mouse.up();
        await expect.poll(contentWidth).toBe(target);
        await blur.scrollIntoViewIfNeeded();
        await expect(blur).toBeVisible();
        await page.screenshot({
          path: info.outputPath(`spatial-inspector-${target}.png`),
          fullPage: false,
        });
      }
    }
    await page.setViewportSize({ width: 1100, height: 560 });
    await blur.scrollIntoViewIfNeeded();
    await expect(blur).toBeVisible();
    await page.screenshot({
      path: info.outputPath('spatial-below-minimum-width.png'),
      fullPage: false,
    });
    expect(errors).toEqual([]);
  } finally {
    await new Promise<void>((resolve) => host.server.close(() => resolve()));
  }
});

test('unavailable perspective preserves settings and can retry', async ({ page }) => {
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
    await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).first().click();
    await page.locator('[data-ui="gallery.videoReview.enter"]').click();
    const dialog = page.locator('dialog');
    await dialog
      .getByRole('button', { name: label('gallery.videoReview.advancedEditing'), exact: true })
      .click();
    await dialog
      .getByRole('button', { name: label('gallery.videoReview.zoomAdd'), exact: true })
      .click();
    await dialog
      .getByRole('button', { name: label('gallery.videoReview.zoomPreviewResult'), exact: true })
      .click();
    await page.evaluate(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
        configurable: true,
        value: function (this: HTMLCanvasElement, kind: string, ...options: unknown[]) {
          return kind === 'webgl' ? null : Reflect.apply(original, this, [kind, ...options]);
        },
      });
      document.addEventListener(
        'restore-test-gpu',
        () =>
          Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
            value: original,
            configurable: true,
          }),
        { once: true }
      );
    });
    const group = dialog.locator('details[data-level="group"]').filter({
      has: page.locator('summary h4', { hasText: label('gallery.videoReview.perspective') }),
    });
    await group.locator('summary').click();
    await group
      .getByRole('button', { name: label('gallery.videoReview.spatialEnabled'), exact: true })
      .click();
    await page
      .getByRole('option', { name: label('gallery.videoReview.motionBlurOn'), exact: true })
      .click();
    const alert = dialog
      .locator('[data-ui="gallery.videoReview.stage"]')
      .getByRole('alert')
      .filter({ hasText: label('gallery.videoReview.spatialUnavailable') });
    await expect(alert).toBeVisible();
    await expect.poll(async () => (await persistedFocus(page))?.perspective?.enabled).toBe(true);
    const miniAlert = dialog
      .locator('[data-ui="gallery.videoReview.zoomPreview"]')
      .getByRole('alert');
    await expect(miniAlert).toBeVisible();
    await dialog
      .getByRole('button', { name: label('gallery.videoReview.zoomPreviewArea'), exact: true })
      .click();
    await expect(miniAlert).toHaveCount(0);
    await expect.poll(async () => (await persistedFocus(page))?.perspective?.enabled).toBe(true);
    await dialog
      .getByRole('button', { name: label('gallery.videoReview.zoomPreviewResult'), exact: true })
      .click();
    await expect(miniAlert).toBeVisible();
    await group
      .getByRole('button', { name: label('gallery.videoReview.spatialEnabled'), exact: true })
      .click();
    await page
      .getByRole('option', { name: label('gallery.videoReview.motionBlurOff'), exact: true })
      .click();
    await expect(miniAlert).toHaveCount(0);
    await expect(alert).toHaveCount(0);
    await group
      .getByRole('button', { name: label('gallery.videoReview.spatialEnabled'), exact: true })
      .click();
    await page
      .getByRole('option', { name: label('gallery.videoReview.motionBlurOn'), exact: true })
      .click();
    await expect(miniAlert).toBeVisible();
    await page.evaluate(() => document.dispatchEvent(new Event('restore-test-gpu')));
    await alert
      .getByRole('button', { name: label('gallery.videoReview.retry'), exact: true })
      .click();
    await expect(alert).toHaveCount(0);
    await miniAlert
      .getByRole('button', { name: label('gallery.videoReview.retry'), exact: true })
      .click();
    await expect(miniAlert).toHaveCount(0);
    await expect(dialog.locator('[data-ui="gallery.videoReview.motionBlurCanvas"]')).toBeVisible();
    await expect.poll(async () => (await persistedFocus(page))?.perspective?.enabled).toBe(true);
  } finally {
    await new Promise<void>((resolve) => host.server.close(() => resolve()));
  }
});
