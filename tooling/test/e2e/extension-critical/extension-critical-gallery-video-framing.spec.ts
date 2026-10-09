import { expect, test, type Page } from '@playwright/test';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { startHostServer } from '../support/host-server';
import {
  addReviewFocus,
  seedReviewVideo,
  persistedFocus,
} from '../support/quick-editor-media-fixture';
import { applyHarnessBootstrap, GALLERY_HARNESS_PATH } from '../extension-critical.helpers';

/** Compare the inspector projection with actual stage boxes, not the preview's geometry helper. */
async function checkFramingGeometry(page: Page, follow: boolean, locale: 'ru' | 'en') {
  const preview = page.locator('[data-ui="gallery.videoReview.zoomPreview"]');
  const video = page.locator('dialog video');
  await video.evaluate((node) => {
    node.currentTime = 1;
  });
  await expect
    .poll(() => video.evaluate((node) => !node.seeking && Math.abs(node.currentTime - 1) < 0.001))
    .toBe(true);
  await expect
    .poll(() => video.evaluate((node) => new DOMMatrix(getComputedStyle(node).transform).a))
    .toBeCloseTo(1.25);
  const geometry = await page.evaluate((follows) => {
    const stage = document.querySelector('[data-ui="gallery.videoReview.stage"]')!;
    const video = stage.querySelector('video')!;
    const frame = document.querySelector<HTMLElement>(
      '[data-ui="gallery.videoReview.zoomPreview"] [data-focus-frame]'
    )!;
    const output = stage.getBoundingClientRect();
    const source = video.getBoundingClientRect();
    const clip = video.parentElement!.getBoundingClientRect();
    const scale = new DOMMatrix(getComputedStyle(video).transform).a;
    const baseX = (output.width - Number.parseFloat(video.style.width)) / 2;
    const baseY = (output.height - Number.parseFloat(video.style.height)) / 2;
    const left = Math.max(output.left, clip.left),
      top = Math.max(output.top, clip.top);
    const width = Math.min(output.right, clip.right) - left;
    const height = Math.min(output.bottom, clip.bottom) - top;
    const viewport = follows ? output : { left, top, width, height };
    const bounds = frame.getBoundingClientRect();
    const center = frame.querySelector('.review-focus-center')!.getBoundingClientRect();
    return {
      expected: [
        (baseX + (viewport.left - source.left) / scale) / output.width,
        (baseY + (viewport.top - source.top) / scale) / output.height,
        viewport.width / scale / output.width,
        viewport.height / scale / output.height,
      ],
      actual: [frame.style.left, frame.style.top, frame.style.width, frame.style.height].map(
        (value) => Number.parseFloat(value) / 100
      ),
      clip: [
        (left - output.left) / output.width,
        (top - output.top) / output.height,
        width / output.width,
        height / output.height,
      ],
      markerGap: Math.hypot(
        center.x + center.width / 2 - bounds.x - bounds.width / 2,
        center.y + center.height / 2 - bounds.y - bounds.height / 2
      ),
    };
  }, follow);
  for (let index = 0; index < 4; index++)
    expect(Math.abs(geometry.actual[index]! - geometry.expected[index]!)).toBeLessThan(0.004);
  expect(geometry.markerGap).toBeLessThan(0.6);
  await preview.scrollIntoViewIfNeeded();
  const bounds = (await preview.locator('[data-focus-frame]').boundingBox())!;
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  const marker = preview.locator('.review-focus-center');
  const before = await marker.boundingBox();
  await page.mouse.down();
  expect(await marker.boundingBox()).toEqual(before);
  await page.mouse.up();
  expect(await marker.boundingBox()).toEqual(before);
  await preview
    .getByRole('button', {
      name: translate('gallery.videoReview.zoomPreviewResult', locale),
      exact: true,
    })
    .click();
  const raster = await preview.locator('canvas').evaluate((canvas) => {
    const { width, height } = canvas;
    const pixels = canvas.getContext('2d')!.getImageData(0, 0, width, height).data;
    let left = width,
      top = height,
      right = 0,
      bottom = 0;
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        if (pixels[(y * width + x) * 4 + 3]! < 128) continue;
        left = Math.min(left, x);
        top = Math.min(top, y);
        right = Math.max(right, x + 1);
        bottom = Math.max(bottom, y + 1);
      }
    return {
      rect: [left / width, top / height, (right - left) / width, (bottom - top) / height],
      tolerance: 2 / Math.min(width, height),
    };
  });
  for (let index = 0; index < 4; index++)
    expect(Math.abs(raster.rect[index]! - geometry.clip[index]!)).toBeLessThan(raster.tolerance);
  await preview
    .getByRole('button', {
      name: translate('gallery.videoReview.zoomPreviewArea', locale),
      exact: true,
    })
    .click();
}

for (const variant of [
  { locale: 'ru' as const, theme: 'light' as const },
  { locale: 'en' as const, theme: 'dark' as const },
]) {
  test(`inspector framing includes following background and tracks playback in ${variant.locale}/${variant.theme}`, async ({
    page,
  }, info) => {
    const host = await startHostServer();
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
      await seedReviewVideo(page, 'review-vp8-opus.webm', { width: 160, height: 90, duration: 12 });
      await page.reload();
      await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).first().click();
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      const dialog = page.locator('dialog');
      const label = (key: Parameters<typeof translate>[0]) => translate(key, variant.locale);
      const button = (key: Parameters<typeof translate>[0]) =>
        dialog.getByRole('button', { name: label(key), exact: true });
      const field = (key: Parameters<typeof translate>[0]) =>
        dialog.getByRole('textbox', { name: label(key), exact: true });
      const setNumber = async (key: Parameters<typeof translate>[0], value: string) => {
        await field(key).fill(value);
        await field(key).press('Enter');
      };
      await button('gallery.videoReview.advancedEditing').click();
      await button('gallery.videoReview.scene').click();
      await button('gallery.videoReview.backgroundSolid').click();
      await button('gallery.videoReview.backgroundZoomContent').click();
      await setNumber('gallery.videoReview.backgroundPadding', '20');
      await setNumber('gallery.videoReview.backgroundCornerRadius', '0');
      await addReviewFocus(page);
      await setNumber('gallery.videoReview.zoomScale', '1.25');
      await dialog
        .locator('summary')
        .filter({ hasText: label('gallery.videoReview.precisePosition') })
        .click();
      await setNumber('gallery.videoReview.zoomFocusX', '10');
      const preview = dialog.locator('[data-ui="gallery.videoReview.zoomPreview"]');
      const area = preview.locator('[data-focus-frame]');
      const width = () => area.evaluate((node: HTMLElement) => Number.parseFloat(node.style.width));
      const left = () => area.evaluate((node: HTMLElement) => Number.parseFloat(node.style.left));
      await expect(preview).toHaveAttribute('data-status', 'ready');
      await expect.poll(width).toBeCloseTo(400 / 9, 3);
      await expect
        .poll(async () => (await persistedFocus(page))?.transform)
        .toEqual({ scale: 1.25, centerX: 0.1, centerY: 0.5 });
      const before = (await persistedFocus(page))!;
      await checkFramingGeometry(page, false, variant.locale);
      const sceneMode = async (follow: boolean, padding: string) => {
        await button('gallery.videoReview.scene').click();
        await button(
          follow
            ? 'gallery.videoReview.backgroundZoomWindow'
            : 'gallery.videoReview.backgroundZoomContent'
        ).click();
        await setNumber('gallery.videoReview.backgroundPadding', padding);
        await button('gallery.videoReview.zoomRegionLabel').click();
        await expect(preview).toHaveAttribute('data-status', 'ready');
        await checkFramingGeometry(page, follow, variant.locale);
      };
      await sceneMode(true, '20');
      await expect.poll(width).toBeCloseTo(80, 3);
      await expect.poll(left).toBeCloseTo(40 / 9, 3);
      await sceneMode(true, '30');
      await expect.poll(width).toBeCloseTo(80, 3);
      await expect.poll(left).toBeCloseTo(20 / 3, 3);
      await sceneMode(false, '20');
      await expect.poll(width).toBeCloseTo(400 / 9, 3);
      await sceneMode(true, '20');
      await expect.poll(() => persistedFocus(page)).toEqual(before);
      await preview.scrollIntoViewIfNeeded();
      await page.screenshot({ path: info.outputPath('framing-follow-video.png'), fullPage: false });
      // Background pixels are inside the framing rectangle and must not click-to-place.
      const box = (await preview.locator('canvas').boundingBox())!;
      await page.mouse.click(box.x + box.width * 0.12, box.y + box.height / 2);
      await expect.poll(() => persistedFocus(page)).toEqual(before);
      await expect(preview).toHaveAttribute('data-status', 'ready');
      const video = dialog.locator('video');
      await video.evaluate((node) => {
        node.currentTime = 0;
      });
      await expect(preview).toHaveAttribute('data-status', 'ready');
      await button('gallery.videoReview.play').click();
      // Transport intentionally clears edit selection. Reopen the focus while it plays.
      await dialog
        .locator('[data-ui="gallery.videoReview.zoomLane"] [role="button"]')
        .first()
        .click();
      await expect(preview).toHaveAttribute('data-playing', 'true');
      await expect.poll(() => video.evaluate((node) => node.currentTime)).toBeGreaterThan(0.1);
      await expect.poll(width).toBeLessThan(99);
      const pixels = () => preview.locator('canvas').evaluate((node) => node.toDataURL());
      const first = await pixels();
      await expect.poll(pixels).not.toBe(first);
      await button('gallery.videoReview.scene').click();
      await expect(preview).toHaveCount(0);
      await button('gallery.videoReview.zoomRegionLabel').click();
      await expect(preview).toHaveAttribute('data-playing', 'true');
      await expect.poll(() => video.evaluate((node) => node.currentTime)).toBeGreaterThan(2.2);
      await expect.poll(width).toBeCloseTo(100, 3);
      await button('gallery.videoReview.pause').click();
      await expect(preview).toHaveAttribute('data-playing', 'false');
      await expect.poll(width).toBeCloseTo(80, 3);
      await expect.poll(() => persistedFocus(page)).toEqual(before);
      await button('gallery.videoReview.zoomPreviewResult').click();
      await expect(area).toHaveCount(0);
      await button('gallery.videoReview.zoomPreviewArea').click();
      await expect.poll(width).toBeCloseTo(80, 3);
      await button('gallery.videoReview.back').click();
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      await dialog
        .locator('[data-ui="gallery.videoReview.zoomLane"] [role="button"]')
        .first()
        .click();
      await expect(preview).toHaveAttribute('data-status', 'ready');
      await expect.poll(width).toBeCloseTo(80, 3);
      await expect.poll(() => persistedFocus(page)).toEqual(before);
    } finally {
      await new Promise<void>((resolve, reject) =>
        host.server.close((error) => (error ? reject(error) : resolve()))
      );
    }
  });
}
