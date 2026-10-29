import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { startHostServer } from '../support/host-server';
import { seedReviewVideo } from '../support/quick-editor-media-fixture';
import { readWebcamWorkspace } from '../support/quick-editor-webcam-proof';
import { provisionQuickPreviewPerformanceFixture } from '../support/quick-preview-performance-fixture';
import { applyHarnessBootstrap, GALLERY_HARNESS_PATH } from '../extension-critical.helpers';

type Message = Parameters<typeof translate>[0];
const variants = [
  { width: 1280, height: 560, locale: 'ru', theme: 'dark' },
  { width: 1920, height: 900, locale: 'en', theme: 'light' },
  { width: 960, height: 560, locale: 'en', theme: 'dark' },
] as const;
test.use({ deviceScaleFactor: 1 });

async function proveInspectorBreakpoints(page: Page, info: TestInfo) {
  const review = page.locator('[data-ui="gallery.videoReview.dialog"]');
  const inspector = review.locator('[data-ui="gallery.videoReview.inspector"]');
  const navigation = inspector.locator('[data-ui="gallery.videoReview.inspectorNavigation"]');
  const group = navigation.locator(':scope > [role="group"]');
  const handle = review.locator('[data-ui="gallery.videoReview.resizeInspector"]');
  const gear = review.locator('[data-ui="gallery.videoReview.previewSettings"]');
  const panel = review.locator('[data-ui="gallery.videoReview.previewInspector"]');
  const width = () =>
    inspector.evaluate((node) => {
      const style = getComputedStyle(node);
      return (
        node.getBoundingClientRect().width -
        parseFloat(style.borderLeftWidth) -
        parseFloat(style.borderRightWidth) -
        parseFloat(style.paddingLeft) -
        parseFloat(style.paddingRight)
      );
    });
  const evidence = [];
  for (const target of [523, 524, 525]) {
    for (let attempt = 0; attempt < 4 && Math.abs((await width()) - target) > 0.5; attempt++) {
      const current = await width();
      const box = await handle.boundingBox();
      if (!box) throw new Error('Missing inspector resize handle');
      await page.mouse.move(box.x + box.width / 2, box.y + 20);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 + current - target, box.y + 20, { steps: 4 });
      await page.mouse.up();
    }
    await expect.poll(async () => Math.abs((await width()) - target)).toBeLessThanOrEqual(0.5);
    const groupBox = await group.boundingBox();
    if (!groupBox) throw new Error('Missing inspector navigation group');
    const measuredWidth = await width();
    expect(groupBox.width).toBeCloseTo(
      measuredWidth < 524 ? measuredWidth : (measuredWidth - 12) / 2,
      0
    );
    const labels = await group.getByRole('button').evaluateAll((buttons) =>
      buttons.map((button) => ({
        text: button.textContent?.trim(),
        width: button.clientWidth,
        height: button.clientHeight,
        scrollWidth: button.scrollWidth,
        scrollHeight: button.scrollHeight,
      }))
    );
    expect(labels.length).toBeGreaterThanOrEqual(3);
    expect(
      labels.every(
        (label) =>
          !!label.text &&
          label.width > 0 &&
          label.height >= 36 &&
          label.scrollWidth <= label.width + 1 &&
          label.scrollHeight <= label.height + 1
      )
    ).toBe(true);
    // Every retained context tab remains reachable; returning through the gear preserves its context.
    const otherTabs = (await group.getByRole('button').allTextContents())
      .map((text) => text.trim())
      .filter((text) => text !== 'Preview');
    for (const name of otherTabs) {
      await group.getByRole('button', { name, exact: true }).click();
      await expect(group.getByRole('button', { name, exact: true })).toHaveAttribute(
        'aria-pressed',
        'true'
      );
      await gear.click();
      await expect(panel).toBeVisible();
    }
    const resolution = panel.getByRole('button', { name: 'Resolution', exact: true });
    await resolution.click();
    await expect(page.getByRole('option', { name: '360p', exact: true })).toBeVisible();
    await page.getByRole('option', { name: '360p', exact: true }).click();
    await panel.getByRole('button', { name: 'Reset', exact: true }).scrollIntoViewIfNeeded();
    await expect(panel.getByRole('button', { name: 'Reset', exact: true })).toBeInViewport();
    await navigation.scrollIntoViewIfNeeded();
    evidence.push({
      target,
      measuredContainerWidth: await width(),
      groupWidth: groupBox.width,
      labels,
    });
    await page.screenshot({
      path: info.outputPath(`preview-container-${target}.png`),
      fullPage: false,
    });
  }
  await writeFile(
    info.outputPath('preview-container-breakpoints.json'),
    JSON.stringify(evidence, null, 2)
  );
}

async function proveDetailedHandoff(
  review: import('@playwright/test').Locator,
  canvas: import('@playwright/test').Locator,
  manual: import('@playwright/test').Locator,
  label: (key: Message) => string,
  choose: (key: Message, option: string) => Promise<void>,
  field: (key: Message) => import('@playwright/test').Locator
) {
  await choose(
    'gallery.videoReview.previewPaused',
    label('gallery.videoReview.previewPausedDetailed')
  );
  await expect(canvas).toBeVisible();
  await review
    .getByRole('button', { name: label('gallery.videoReview.play'), exact: true })
    .click();
  await expect(manual).toBeHidden();
  await review
    .getByRole('button', { name: label('gallery.videoReview.pause'), exact: true })
    .click();
  await expect(canvas).toBeVisible();
  await field('gallery.videoReview.previewReset').click();
  await expect(manual).toBeHidden();
}

for (const variant of variants) {
  test(`connected preview preferences preserve the scene ${variant.width}`, async ({
    page,
  }, info) => {
    test.setTimeout(180_000);
    page.setDefaultTimeout(15_000);
    await page.setViewportSize({ width: variant.width, height: variant.height });
    const fixture = await provisionQuickPreviewPerformanceFixture({
      width: 1280,
      height: 720,
      fps: 30,
    });
    const host = await startHostServer();
    const label = (key: Message) => translate(key, variant.locale);
    const review = page.locator('[data-ui="gallery.videoReview.dialog"]');
    const panel = review.locator('[data-ui="gallery.videoReview.previewInspector"]');
    const gear = review.locator('[data-ui="gallery.videoReview.previewSettings"]');
    const video = review.locator('[data-ui="gallery.videoReview.stage"] video').first();
    const manual = review.locator('[data-ui="gallery.videoReview.manualPreview"]');
    const canvas = manual.locator('canvas[data-preview-front="true"]');
    const field = (key: Message) => panel.getByRole('button', { name: label(key), exact: true });
    const showFrameRate = panel.getByRole('switch', {
      name: label('gallery.videoReview.previewShowFrameRate'),
      exact: true,
    });
    const choose = async (key: Message, option: string) => {
      await field(key).click();
      await page.getByRole('option', { name: option, exact: true }).click();
      await expect(field(key)).toHaveText(option);
    };
    const open = async (recordingCardId: string) => {
      await page
        .locator(`[data-gallery-keyboard-id=${JSON.stringify(recordingCardId)}]`)
        .getByRole('button', { name: 'beta-v1.webm', exact: true })
        .first()
        .click();
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      await expect
        .poll(() => video.evaluate((node: HTMLVideoElement) => node.readyState))
        .toBeGreaterThanOrEqual(2);
      await expect
        .poll(() => video.evaluate((node) => node.getBoundingClientRect().width))
        .toBeGreaterThan(100);
      await expect(
        review.getByText(label('gallery.videoReview.previewFailed'), { exact: true })
      ).toHaveCount(0);
    };
    const dimensions = () =>
      canvas.evaluate((node: HTMLCanvasElement) => ({ width: node.width, height: node.height }));
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
      await seedReviewVideo(page, 'review-vp8-opus.webm', fixture, false, false, {
        bytes: fixture.bytes,
        mimeType: 'video/webm',
      });
      await page.reload();
      const recordingCardId = await page
        .getByRole('button', { name: 'beta-v1.webm', exact: true })
        .first()
        .evaluate((node) =>
          node.closest('[data-gallery-keyboard-id]')?.getAttribute('data-gallery-keyboard-id')
        );
      if (!recordingCardId) throw new Error('Missing recording card identity');
      await open(recordingCardId);
      await gear.click();
      await expect(field('gallery.videoReview.previewResolution')).toHaveText(
        label('gallery.videoReview.previewCurrent')
      );
      await expect(field('gallery.videoReview.previewFrameRate')).toHaveText(
        label('gallery.videoReview.previewCurrent')
      );
      await expect(field('gallery.videoReview.previewPaused')).toHaveText(
        label('gallery.videoReview.previewPausedSame')
      );
      await expect(showFrameRate).toHaveAttribute('aria-checked', 'false');
      await expect(manual).toBeHidden();
      await panel.press('Escape');
      await expect(gear).toBeFocused();
      await review
        .getByRole('button', { name: label('gallery.videoReview.advancedEditing'), exact: true })
        .click();
      await expect
        .poll(async () => (await readWebcamWorkspace(page))?.advanced.ui.mode)
        .toBe('advanced');
      // New projects fade in from black; sample preview pixels after that authored edge.
      await video.evaluate((node: HTMLVideoElement) => {
        node.currentTime = 1;
      });
      await expect
        .poll(() =>
          video.evaluate((node: HTMLVideoElement) => !node.seeking && node.currentTime === 1)
        )
        .toBe(true);
      const baseline = await readWebcamWorkspace(page);
      const pausedTime = await video.evaluate((node: HTMLVideoElement) => node.currentTime);
      await gear.click();
      await choose('gallery.videoReview.previewResolution', '360p');
      await choose('gallery.videoReview.previewFrameRate', '≤ 15 FPS');
      await expect(canvas).toBeVisible();
      await expect.poll(dimensions).toEqual({ width: 640, height: 360 });
      await expect(
        review.getByText(label('gallery.videoReview.previewFailed'), { exact: true })
      ).toHaveCount(0);
      // Testsrc2 has distinct opaque colors across the frame; an allocated but blank canvas fails.
      await expect
        .poll(() =>
          canvas.evaluate((node: HTMLCanvasElement) => {
            const context = node.getContext('2d');
            if (!context) return 0;
            const colors = new Set<string>();
            for (const x of [0.2, 0.4, 0.6, 0.8])
              for (const y of [0.2, 0.5, 0.8]) {
                const pixel = context.getImageData(
                  Math.floor(node.width * x),
                  Math.floor(node.height * y),
                  1,
                  1
                ).data;
                if (pixel[3] === 255) colors.add(`${pixel[0]},${pixel[1]},${pixel[2]}`);
              }
            return colors.size;
          })
        )
        .toBeGreaterThan(3);
      await expect(panel.getByLabel(label('gallery.videoReview.previewActualRaster'))).toHaveText(
        '640 × 360'
      );
      await showFrameRate.click();
      const fps = review.locator('[data-ui="gallery.videoReview.previewFPS"]');
      await expect(fps).toHaveText('— FPS');
      await expect(fps).toHaveAttribute(
        'title',
        label('gallery.videoReview.previewPresentedFrameRate')
      );
      // Native transport remains the clock; the displayed composition cadence is a separate status.
      await review
        .getByRole('button', { name: label('gallery.videoReview.play'), exact: true })
        .click();
      await expect
        .poll(() => video.evaluate((node: HTMLVideoElement) => node.currentTime))
        .toBeGreaterThan(pausedTime);
      await expect(fps).toHaveText(/\d+\.\d FPS/);
      await review
        .getByRole('button', { name: label('gallery.videoReview.pause'), exact: true })
        .click();
      await expect.poll(() => video.evaluate((node: HTMLVideoElement) => node.paused)).toBe(true);
      await expect(fps).toHaveText('— FPS');
      const stoppedAt = await video.evaluate((node: HTMLVideoElement) => node.currentTime);
      await choose(
        'gallery.videoReview.previewPaused',
        label('gallery.videoReview.previewPausedDetailed')
      );
      await expect.poll(async () => (await dimensions()).height).toBeGreaterThan(360);
      expect(await video.evaluate((node: HTMLVideoElement) => node.currentTime)).toBe(stoppedAt);
      expect(await readWebcamWorkspace(page)).toEqual(baseline);
      if (variant.width < 1280) {
        const scroll = review.locator('[data-ui="gallery.videoReview.workspaceScroll"]');
        expect(await scroll.evaluate((node) => node.scrollWidth > node.clientWidth)).toBe(true);
        await field('gallery.videoReview.previewReset').scrollIntoViewIfNeeded();
      }
      await page.screenshot({
        path: info.outputPath('preview-settings-manual.png'),
        fullPage: false,
      });
      if (variant.width === 1920) {
        await proveInspectorBreakpoints(page, info);
        expect(await readWebcamWorkspace(page)).toEqual(baseline);
        expect(await video.evaluate((node: HTMLVideoElement) => node.currentTime)).toBe(stoppedAt);
      }
      const preferenceKey = 'sniptale_quick_preview_preferences';
      await expect
        .poll(() =>
          page.evaluate((key) => window.__sniptaleHarness?.getStorageState()[key], preferenceKey)
        )
        .toEqual({
          rasterPreset: '360p',
          frameRate: '15',
          pausedQuality: 'detailed',
          showFrameRate: true,
        });
      const savedStorage = await page.evaluate(() => {
        if (!window.__sniptaleHarness) throw new Error('Harness storage unavailable');
        return window.__sniptaleHarness.getStorageState();
      });
      await page.reload();
      await page.locator('[data-ui="gallery.page.root"]').waitFor();
      // Harness reload clears its in-memory chrome.storage mock even with preserveMediaLibrary.
      // Restore the actual saved payload, not an authored preference fixture, before editor hydration.
      await page.evaluate(async (stored) => {
        await chrome.storage.local.set(stored);
      }, savedStorage);
      // The persisted editor session restores the open review after reload.
      await expect(video).toBeVisible();
      await gear.click();
      await expect(field('gallery.videoReview.previewResolution')).toHaveText('360p');
      await expect(field('gallery.videoReview.previewFrameRate')).toHaveText('≤ 15 FPS');
      await expect(field('gallery.videoReview.previewPaused')).toHaveText(
        label('gallery.videoReview.previewPausedDetailed')
      );
      await expect(showFrameRate).toHaveAttribute('aria-checked', 'true');
      await field('gallery.videoReview.previewReset').click();
      await expect(field('gallery.videoReview.previewResolution')).toHaveText(
        label('gallery.videoReview.previewCurrent')
      );
      await expect(field('gallery.videoReview.previewFrameRate')).toHaveText(
        label('gallery.videoReview.previewCurrent')
      );
      await expect(manual).toBeHidden();
      await expect(fps).toBeHidden();
      await proveDetailedHandoff(review, canvas, manual, label, choose, field);
      await panel.press('Escape');
      await expect(gear).toBeFocused();
      await review.locator('[data-ui="gallery.videoReview.fullscreen"]').click();
      await expect
        .poll(() => page.evaluate(() => document.fullscreenElement?.getAttribute('data-ui')))
        .toBe('gallery.videoReview.previewFrame');
      const beforeExit = await video.evaluate((node: HTMLVideoElement) => node.currentTime);
      await gear.click();
      await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
      await expect(panel).toBeVisible();
      await expect(panel).toBeFocused();
      expect(await video.evaluate((node: HTMLVideoElement) => node.currentTime)).toBe(beforeExit);
      await panel.press('Escape');
      await expect(gear).toBeFocused();
      expect(await readWebcamWorkspace(page)).toEqual(baseline);
      await page.screenshot({
        path: info.outputPath('preview-settings-restored.png'),
        fullPage: false,
      });
    } finally {
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}
