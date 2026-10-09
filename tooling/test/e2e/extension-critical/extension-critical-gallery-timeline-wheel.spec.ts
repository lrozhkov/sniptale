import { readFile } from 'node:fs/promises';
import {
  ALL_FORMATS,
  BlobSource,
  BufferTarget,
  EncodedPacketSink,
  EncodedVideoPacketSource,
  Input,
  Output,
  WebMOutputFormat,
} from 'mediabunny';
import { expect, test, type Page, type Locator } from '@playwright/test';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { startHostServer } from '../support/host-server';
import { seedReviewVideo } from '../support/quick-editor-media-fixture';
import { applyHarnessBootstrap, GALLERY_HARNESS_PATH } from '../extension-critical.helpers';

for (const variant of [
  { locale: 'en', theme: 'light' },
  { locale: 'ru', theme: 'dark' },
  { locale: 'en', theme: 'light', viewport: { width: 1200, height: 560 } },
] as const) {
  test(`timeline wheel zoom preserves drag and contains scroll (${variant.locale}${'viewport' in variant ? ', narrow' : ''})`, async ({
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
      await seedReviewVideo(page, 'review-cut-vfr.webm', { width: 160, height: 90, duration: 6 });
      await page.reload();
      await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).first().click();
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      const dialog = page.locator('dialog');
      const slider = dialog.getByRole('slider', {
        name: label('videoEditor.timeline.zoom'),
        exact: true,
      });
      await page.evaluate(() => {
        document.body.dataset.unhandledWheel = '0';
        document.addEventListener('wheel', () => {
          document.body.dataset.unhandledWheel = String(
            Number(document.body.dataset.unhandledWheel) + 1
          );
        });
        document.addEventListener(
          'wheel',
          (event) =>
            setTimeout(() => {
              document.body.dataset.wheelConsumed = String(event.defaultPrevented);
            }),
          { capture: true }
        );
      });
      await slider.hover();
      await page.mouse.wheel(0, -100);
      await expect(slider).toHaveValue('5');
      await expect(page.locator('body')).toHaveAttribute('data-wheel-consumed', 'true');
      await expect(page.locator('body')).toHaveAttribute('data-unhandled-wheel', '0');
      await page.mouse.wheel(0, 100);
      await expect(slider).toHaveValue('0');
      await slider.focus();
      await slider.press('End');
      await expect(slider).toHaveValue('100');
      await slider.hover();
      await page.mouse.wheel(0, -100);
      await expect(slider).toHaveValue('100');
      await expect(page.locator('body')).toHaveAttribute('data-unhandled-wheel', '0');
      await slider.press('Home');
      const box = (await slider.boundingBox())!;
      await page.mouse.move(box.x + 8, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * 0.7, box.y + box.height / 2, { steps: 5 });
      await page.mouse.up();
      await expect.poll(() => slider.inputValue().then(Number)).toBeGreaterThan(50);
      await dialog
        .getByRole('button', { name: label('gallery.videoReview.advancedEditing'), exact: true })
        .click();
      await dialog
        .getByRole('button', { name: label('gallery.videoReview.fit'), exact: true })
        .click();
      await expect(slider).toHaveValue('0');
      await slider.hover();
      await page.mouse.wheel(0, -100);
      await expect(slider).toHaveValue('5');
      await expect(page.locator('body')).toHaveAttribute('data-unhandled-wheel', '0');
      await page.screenshot({ path: info.outputPath('timeline-wheel.png'), fullPage: false });
    } finally {
      await new Promise<void>((resolve, reject) =>
        host.server.close((error) => (error ? reject(error) : resolve()))
      );
    }
  });

  test(`time ruler stays fixed during vertical track scroll (${variant.locale}${'viewport' in variant ? ', narrow' : ''})`, async ({
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
      await seedReviewVideo(page, 'review-vp8-opus.webm', { width: 160, height: 90, duration: 12 });
      await page.reload();
      await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).first().click();
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      const dialog = page.locator('[data-ui="gallery.videoReview.dialog"]');
      await dialog
        .getByRole('button', { name: label('gallery.videoReview.advancedEditing'), exact: true })
        .click();
      const height = dialog.getByRole('separator', {
        name: label('gallery.videoReview.resizeTimeline'),
      });
      await height.focus();
      await height.press('Home');
      const viewport = dialog.locator('[data-ui="gallery.videoReview.timelineViewport"]');
      const ruler = dialog.locator('[data-ui="gallery.videoReview.ruler"]');
      const controls = dialog.locator('[data-ui="gallery.videoReview.trackControls"]');
      const before = (await ruler.boundingBox())!;
      const rowBefore = (await dialog
        .locator('[data-ui="gallery.videoReview.rulerRow"]')
        .boundingBox())!;
      const controlsBefore = (await controls.boundingBox())!;
      const initialCap = (await dialog
        .locator('[data-ui="gallery.videoReview.rulerPlayhead"]')
        .boundingBox())!;
      expect.soft(initialCap.y + initialCap.height).toBeCloseTo(rowBefore.y + rowBefore.height, 0);
      await viewport.evaluate((node) => {
        node.scrollTop = node.scrollHeight;
      });
      await expect.poll(() => viewport.evaluate((node) => node.scrollTop)).toBeGreaterThan(20);
      await expect.poll(async () => (await ruler.boundingBox())!.y).toBeCloseTo(before.y, 0);
      expect((await controls.boundingBox())!.y).toBeCloseTo(controlsBefore.y, 0);
      const slider = dialog.getByRole('slider', {
        name: label('videoEditor.timeline.zoom'),
        exact: true,
      });
      await slider.focus();
      await slider.press('End');
      await viewport.evaluate((node) => {
        node.scrollLeft = 200;
        node.scrollTop = node.scrollHeight;
      });
      await expect.poll(() => viewport.evaluate((node) => node.scrollLeft)).toBeGreaterThan(100);
      expect((await controls.boundingBox())!.x).toBeCloseTo(controlsBefore.x, 0);
      const headerColor = await controls.evaluate(
        (node) =>
          getComputedStyle(node.closest('[data-ui="gallery.videoReview.trackHeader"]')!)
            .backgroundColor
      );
      const panelColor = await controls.evaluate((node) => {
        const header = node.closest('[data-ui="gallery.videoReview.trackHeader"]')!;
        const probe = document.createElement('div');
        probe.style.backgroundColor = 'var(--sniptale-color-surface-panel)';
        header.append(probe);
        const color = getComputedStyle(probe).backgroundColor;
        probe.remove();
        return color;
      });
      expect.soft(headerColor).toBe(panelColor);
      expect
        .soft(
          await dialog
            .locator('[data-ui="gallery.videoReview.rulerRow"]')
            .evaluate((node) => getComputedStyle(node).backgroundColor)
        )
        .toBe(panelColor);
      expect((await ruler.boundingBox())!.y).toBeCloseTo(before.y, 0);
      // Native scroll events clear hover; finish that event turn before moving the pointer.
      await settleClockLayout(page);
      const y = before.y + before.height / 2;
      const x = before.x + 120;
      await page.mouse.move(x, y);
      const hoverGuide = dialog.locator('[data-ui="gallery.videoReview.hoverTime"]');
      await expect(hoverGuide).toBeVisible();
      const guideStyle = await hoverGuide.evaluate((node) => ({
        z: Number(getComputedStyle(node).zIndex),
        pointerEvents: getComputedStyle(node).pointerEvents,
      }));
      const rulerZ = await dialog
        .locator('[data-ui="gallery.videoReview.rulerRow"]')
        .evaluate((node) => Number(getComputedStyle(node).zIndex));
      expect(guideStyle.pointerEvents).toBe('none');
      expect(guideStyle.z).toBeGreaterThan(rulerZ);
      await page.screenshot({
        path: info.outputPath('hover-above-sticky-ruler.png'),
        fullPage: false,
      });
      await page.mouse.click(x, y);
      const head = dialog.locator('[data-ui="gallery.videoReview.playhead"]');
      const cap = dialog.locator('[data-ui="gallery.videoReview.rulerPlayhead"]');
      await expect(cap).toBeVisible();
      expect((await cap.boundingBox())!.x).toBeCloseTo((await head.boundingBox())!.x, 0);
      expect((await cap.boundingBox())!.y).toBeCloseTo(before.y, 0);
      const capBox = (await cap.boundingBox())!;
      expect.soft(capBox.y + capBox.height).toBeCloseTo(rowBefore.y + rowBefore.height, 0);
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + 240, y, { steps: 5 });
      await page.mouse.up();
      await expect(dialog.locator('[data-ui="gallery.videoReview.loopSummary"]')).toBeVisible();
      await page.screenshot({ path: info.outputPath('sticky-ruler.png'), fullPage: false });
    } finally {
      await new Promise<void>((resolve, reject) =>
        host.server.close((error) => (error ? reject(error) : resolve()))
      );
    }
  });
}

/** Two genuine keyframes provide a long seekable clock without an hour-long test file. */
async function longClockVideo() {
  const bytes = await readFile(new URL('../fixtures/review-vp8-opus.webm', import.meta.url));
  const input = new Input({ source: new BlobSource(new Blob([bytes])), formats: ALL_FORMATS });
  try {
    const track = (await input.getPrimaryVideoTrack())!;
    const packet = (await new EncodedPacketSink(track).getFirstKeyPacket())!;
    const decoderConfig = (await track.getDecoderConfig())!;
    const target = new BufferTarget();
    const output = new Output({ target, format: new WebMOutputFormat() });
    const video = new EncodedVideoPacketSource('vp8');
    output.addVideoTrack(video);
    await output.start();
    await video.add(packet.clone({ timestamp: 0, duration: 3601 }), { decoderConfig });
    await video.add(packet.clone({ timestamp: 3601, duration: 1 }), { decoderConfig });
    video.close();
    await output.finalize();
    return new Uint8Array(target.buffer!);
  } finally {
    input.dispose();
  }
}

for (const variant of [
  { locale: 'en', theme: 'light', width: 1920, height: 900 },
  { locale: 'ru', theme: 'dark', width: 1280, height: 560 },
  { locale: 'en', theme: 'light', width: 1200, height: 560 },
] as const) {
  test(`transport clock keeps button positions across rounding and minute digits (${variant.width})`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width: variant.width, height: variant.height });
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
      await seedReviewVideo(
        page,
        'clock.webm',
        { width: 160, height: 90, duration: 3602 },
        false,
        false,
        { bytes: await longClockVideo(), mimeType: 'video/webm' }
      );
      await page.reload();
      await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).first().click();
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      await page.evaluate(() => document.fonts.ready);
      const dialog = page.locator('dialog');
      const toolbar = dialog.locator('[data-ui="gallery.videoReview.toolbar"]');
      const transport = toolbar.locator('[data-toolbar-transport]');
      const video = dialog.locator('video').first();
      await expect(transport).toContainText('60:02.00');
      await verifyClockGeometry(
        page,
        toolbar,
        video,
        [0, 9.99, 10, 59.994, 59.999, 60, 599.999, 600, 3599.999, 3600]
      );
      if (variant.width === 1920) {
        const boundaries = await clockLayoutBoundaries(page, toolbar);
        for (const boundary of boundaries)
          for (const width of [boundary - 1, boundary, boundary + 1]) {
            await page.setViewportSize({ width, height: variant.height });
            await settleClockLayout(page);
            await verifyClockGeometry(page, toolbar, video, [0, 599.999, 3600]);
          }
        await page.setViewportSize({ width: variant.width, height: variant.height });
      }
      await page.screenshot({ path: info.outputPath('stable-clock.png'), fullPage: false });
    } finally {
      await new Promise<void>((resolve, reject) =>
        host.server.close((error) => (error ? reject(error) : resolve()))
      );
    }
  });
}

async function settleClockLayout(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      )
  );
}

async function verifyClockGeometry(
  page: Page,
  toolbar: Locator,
  video: Locator,
  times: readonly number[]
) {
  const measure = () =>
    toolbar.getByRole('button').evaluateAll((nodes) =>
      nodes.map((node) => {
        const box = node.getBoundingClientRect();
        return { x: box.x, width: box.width };
      })
    );
  const before = await measure();
  const layout = await toolbar.getAttribute('data-layout');
  for (const time of times) {
    await video.evaluate((node, at) => {
      node.currentTime = at;
      node.dispatchEvent(new Event('timeupdate'));
    }, time);
    await expect.poll(() => video.evaluate((node) => node.currentTime)).toBeCloseTo(time, 2);
    await settleClockLayout(page);
    const after = await measure();
    for (let index = 0; index < before.length; index++) {
      expect(Math.abs(after[index]!.x - before[index]!.x)).toBeLessThanOrEqual(0.5);
      expect(after[index]!.width).toBe(before[index]!.width);
    }
    await expect(toolbar).toHaveAttribute('data-layout', layout!);
  }
}

/** Discover the actual layout thresholds rather than assuming viewport constants. */
async function clockLayoutBoundaries(page: Page, toolbar: Locator) {
  const at = async (width: number) => {
    await page.setViewportSize({ width, height: 900 });
    await settleClockLayout(page);
    return toolbar.getAttribute('data-layout');
  };
  const boundaries: number[] = [];
  let previous = await at(1200);
  for (let width = 1232; width <= 1920; width += 32) {
    const next = await at(width);
    if (next !== previous) {
      let low = width - 32,
        high = width;
      while (high - low > 1) {
        const middle = Math.floor((low + high) / 2);
        if ((await at(middle)) === previous) low = middle;
        else high = middle;
      }
      boundaries.push(high);
    }
    previous = next;
  }
  return boundaries;
}
