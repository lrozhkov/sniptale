import { expect, test } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { startHostServer } from '../support/host-server';
import { seedReviewVideo, seedReviewWebcamBundle } from '../support/quick-editor-media-fixture';
import {
  readWebcamWorkspace,
  seedWebcamComposition,
  webcamVideoPixels,
} from '../support/quick-editor-webcam-proof';
import { provisionQuickPreviewPerformanceFixture } from '../support/quick-preview-performance-fixture';
import {
  createExactHeldPreviewFixture,
  installHeldPreviewMotion,
  observePreviewPlayback,
  previewPlaybackControls,
  readAcquiredPreviewCamera,
  setPreviewProofVisibility,
} from '../support/quick-preview-playback-proof';
import { applyHarnessBootstrap, GALLERY_HARNESS_PATH } from '../extension-critical.helpers';

test.use({ viewport: { width: 1280, height: 560 }, deviceScaleFactor: 2 });
test.describe.configure({ mode: 'serial' });

for (const profile of [
  { fps: 30, caps: [15, 30] },
  { fps: 60, caps: [24, 60] },
]) {
  test(`manual source ${profile.fps} keeps synthetic motion over held pixels`, async ({
    page,
  }, info) => {
    test.setTimeout(240_000);
    const source = await provisionQuickPreviewPerformanceFixture({
      width: 1280,
      height: 720,
      fps: profile.fps,
    });
    const fixture = await createExactHeldPreviewFixture(
      source,
      info.outputPath(`exact-held-${profile.fps}.webm`)
    );
    expect(fixture.fps).toBe(profile.fps);
    const host = await startHostServer();
    const ui = previewPlaybackControls(page);
    try {
      await applyHarnessBootstrap(page, {
        preserveMediaLibrary: true,
        storage: { 'sniptale-locale-preference': 'en' },
      });
      await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}`);
      await page.locator('[data-ui="gallery.page.root"]').waitFor();
      // Keep bytes out of dimensions: this object crosses Playwright's structured serializer.
      await seedReviewVideo(
        page,
        'review-vp8-opus.webm',
        { width: fixture.width, height: fixture.height, duration: fixture.duration },
        false,
        false,
        {
          bytes: fixture.bytes,
          mimeType: 'video/webm',
        }
      );
      await page.reload();
      await ui.open();
      await expect.poll(() => readWebcamWorkspace(page)).not.toBeNull();
      await installHeldPreviewMotion(page);
      await page.reload();
      await ui.open();
      await expect(ui.button('gallery.videoReview.zoomTrack')).toHaveAttribute(
        'aria-pressed',
        'true'
      );
      await ui.choose('gallery.videoReview.previewResolution', '360p');
      for (const cap of profile.caps) {
        await ui.choose('gallery.videoReview.previewFrameRate', `≤ ${cap} FPS`);
        await ui.seek(2.3);
        await expect(ui.canvas).toBeVisible();
        await ui.button('gallery.videoReview.play').click();
        const trace = await observePreviewPlayback(page, 2200);
        await ui.button('gallery.videoReview.pause').click();
        await writeFile(
          info.outputPath(`held-source-${profile.fps}-cap-${cap}.json`),
          JSON.stringify(trace, null, 2)
        );
        // Progress is required, but no minimum hardware speed is promised by the FPS cap.
        expect(trace.samples.length).toBeGreaterThan(2);
        expect(trace.samples.length).toBeLessThanOrEqual(
          Math.ceil((trace.elapsed * cap) / 1000) + 2
        );
        expect(
          trace.samples.every((sample) => sample.sourceTime >= 2 && sample.sourceTime < 8)
        ).toBe(true);
        expect(new Set(trace.samples.map((sample) => sample.sourceHash)).size).toBe(1);
        expect(new Set(trace.samples.map((sample) => sample.composedHash)).size).toBeGreaterThan(2);
        expect(trace.transport.at(-1)!.time).toBeGreaterThan(trace.transport[0]!.time + 1);
      }
      await ui.seek(3.25);
      await ui.choose(
        'gallery.videoReview.previewPaused',
        translate('gallery.videoReview.previewPausedDetailed', 'en')
      );
      await expect
        .poll(() => ui.canvas.evaluate((canvas: HTMLCanvasElement) => canvas.height))
        .toBe(720);
      expect(await ui.video.evaluate((video: HTMLVideoElement) => video.currentTime)).toBeCloseTo(
        3.25,
        2
      );
      await ui.panel.press('Escape');
      await ui.review.locator('[data-ui="gallery.videoReview.fullscreen"]').click();
      await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);
      await expect(ui.canvas).toBeVisible();
      expect(await page.evaluate(() => devicePixelRatio)).toBe(2);
      await page.screenshot({
        path: info.outputPath('manual-detailed-fullscreen-dpr2.png'),
        fullPage: false,
      });
      await ui.review.locator('[data-ui="gallery.videoReview.previewSettings"]').click();
      await expect.poll(() => page.evaluate(() => !document.fullscreenElement)).toBe(true);
      await expect(ui.panel).toBeFocused();
      await page.setViewportSize({ width: 1536, height: 700 });
      await expect
        .poll(() => ui.canvas.evaluate((canvas: HTMLCanvasElement) => canvas.height))
        .toBe(720);
      expect(await ui.video.evaluate((video: HTMLVideoElement) => video.currentTime)).toBeCloseTo(
        3.25,
        2
      );
      await setPreviewProofVisibility(page, true);
      await expect(ui.canvas).toHaveCount(0);
      const hidden = await observePreviewPlayback(page, 250);
      expect(hidden.samples).toHaveLength(0);
      await setPreviewProofVisibility(page, false);
      await expect(ui.canvas).toBeVisible();
      expect(await ui.video.evaluate((video: HTMLVideoElement) => video.currentTime)).toBeCloseTo(
        3.25,
        2
      );
      await ui.button('gallery.videoReview.play').click();
      await expect
        .poll(() => ui.canvas.evaluate((canvas: HTMLCanvasElement) => canvas.height))
        .toBe(360);
      await setPreviewProofVisibility(page, true);
      await expect(ui.canvas).toHaveCount(0);
      const hiddenPlaying = await observePreviewPlayback(page, 400);
      expect(hiddenPlaying.samples).toHaveLength(0);
      expect(hiddenPlaying.transport.at(-1)!.time).toBeGreaterThan(
        hiddenPlaying.transport[0]!.time
      );
      const resumeClock = await ui.video.evaluate((video: HTMLVideoElement) => ({
        time: video.currentTime,
        wall: performance.now(),
      }));
      await setPreviewProofVisibility(page, false);
      await expect(ui.canvas).toBeVisible();
      const resumedClock = await ui.video.evaluate((video: HTMLVideoElement) => ({
        time: video.currentTime,
        wall: performance.now(),
      }));
      expect(resumedClock.time).toBeGreaterThanOrEqual(resumeClock.time);
      expect(resumedClock.time - resumeClock.time).toBeLessThanOrEqual(
        (resumedClock.wall - resumeClock.wall) / 1000 + 0.25
      );
      await writeFile(
        info.outputPath('visibility-lifecycle.json'),
        JSON.stringify({ hidden, hiddenPlaying, resumeClock, resumedClock }, null, 2)
      );
      await ui.button('gallery.videoReview.pause').click();
      await expect
        .poll(() => ui.canvas.evaluate((canvas: HTMLCanvasElement) => canvas.height))
        .toBe(720);
      await page.screenshot({
        path: info.outputPath('manual-resumed-detail.png'),
        fullPage: false,
      });
    } finally {
      await setPreviewProofVisibility(page, false);
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}

test('manual camera offset pixels follow cut speed and loop transport', async ({ page }, info) => {
  test.setTimeout(180_000);
  const host = await startHostServer();
  const ui = previewPlaybackControls(page);
  try {
    await applyHarnessBootstrap(page, {
      preserveMediaLibrary: true,
      storage: { 'sniptale-locale-preference': 'en' },
    });
    await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}`);
    await page.locator('[data-ui="gallery.page.root"]').waitFor();
    await seedReviewWebcamBundle(page);
    await page.reload();
    await ui.open(true);
    await ui.button('gallery.videoReview.advancedEditing').click();
    await ui.review
      .getByRole('button', { name: translate('gallery.videoReview.webcam', 'en'), exact: true })
      .and(ui.review.locator('[aria-label]'))
      .click();
    await expect(
      ui.review.locator('[data-ui="gallery.videoReview.webcamOverlay"] canvas')
    ).toBeVisible();
    await expect
      .poll(async () => {
        const camera = await readAcquiredPreviewCamera(page);
        return camera?.enabled === true && camera.assetId.startsWith('project-asset:');
      })
      .toBe(true);
    await seedWebcamComposition(page);
    await page.reload();
    await ui.open(true);
    await ui.choose('gallery.videoReview.previewResolution', '360p');
    await ui.choose('gallery.videoReview.previewFrameRate', '≤ 30 FPS');
    const encoded = (
      await readFile(new URL('../fixtures/review-webcam-clock.webm', import.meta.url))
    ).toString('base64');
    const reference = await webcamVideoPixels(page, encoded, [
      { time: 1.5, x: 0.5, y: 0.5 },
      { time: 3.5, x: 0.5, y: 0.5 },
    ]);
    for (const [index, source, coordinate] of [
      [0, 2.5, 0.85],
      [1, 4.5, 0.15],
    ] as const) {
      await ui.seek(source);
      // The source clock minus the authored one-second offset drives camera pixels even across rate edits.
      await expect
        .poll(async () => {
          const actual = await ui.pixel(coordinate, coordinate);
          return Math.max(
            ...actual
              .slice(0, 3)
              .map((value, channel) => Math.abs(value - reference.pixels[index]![channel]!))
          );
        })
        .toBeLessThan(9);
      expect((await ui.pixel(coordinate, coordinate))[3]).toBe(255);
    }
    await page.screenshot({ path: info.outputPath('manual-camera-offset.png'), fullPage: false });
    await ui.seek(0.8);
    const cut = await observePreviewPlayback(page, 1100, () =>
      ui.button('gallery.videoReview.play').click()
    );
    await writeFile(info.outputPath('manual-cut-transport.json'), JSON.stringify(cut, null, 2));
    await ui.button('gallery.videoReview.pause').click();
    expect(cut.transport.some((sample) => sample.time >= 2 && sample.rate === 2)).toBe(true);
    expect(
      cut.transport.some(
        (sample, index) => index > 0 && sample.time - cut.transport[index - 1]!.time > 0.8
      )
    ).toBe(true);
    expect(cut.samples.length).toBeGreaterThan(0);
    await ui.seek(4.4);
    const slow = await observePreviewPlayback(page, 500, () =>
      ui.button('gallery.videoReview.play').click()
    );
    await writeFile(info.outputPath('manual-slow-transport.json'), JSON.stringify(slow, null, 2));
    await ui.button('gallery.videoReview.pause').click();
    expect(slow.transport.some((sample) => sample.rate === 0.25)).toBe(true);
    expect(slow.transport.at(-1)!.time).toBeGreaterThan(slow.transport[0]!.time);
    expect(slow.transport.at(-1)!.time - slow.transport[0]!.time).toBeLessThan(0.4);
    await ui.panel.press('Escape');
    const ruler = ui.review.locator('[data-ui="gallery.videoReview.ruler"]');
    await ruler.scrollIntoViewIfNeeded();
    const bounds = await ruler.boundingBox();
    if (!bounds) throw new Error('Missing source ruler');
    const duration = await ui.video.evaluate((video: HTMLVideoElement) => video.duration);
    await page.mouse.move(bounds.x + (bounds.width * 0.2) / duration, bounds.y + 10);
    await page.mouse.down();
    await page.mouse.move(bounds.x + (bounds.width * 0.8) / duration, bounds.y + 10, { steps: 5 });
    await page.mouse.up();
    await expect(ui.review.locator('[data-ui="gallery.videoReview.loopSummary"]')).toBeVisible();
    await ui.seek(0.25);
    const loop = await observePreviewPlayback(page, 1700, () =>
      ui.button('gallery.videoReview.play').click()
    );
    await writeFile(info.outputPath('manual-loop-transport.json'), JSON.stringify(loop, null, 2));
    await ui.button('gallery.videoReview.pause').click();
    expect(
      loop.transport.some(
        (sample, index) => index > 0 && sample.time < loop.transport[index - 1]!.time - 0.2
      )
    ).toBe(true);
    expect(loop.samples.length).toBeGreaterThan(0);
    await writeFile(
      info.outputPath('manual-transport.json'),
      JSON.stringify(
        {
          cut,
          slow,
          loop,
          limitation:
            'Camera pixels prove decoded offset at paused source times. Native clocks/rates ' +
            'and publication traces do not measure speaker output, AV physical latency, or ' +
            'the timestamp represented by a live composed frame.',
        },
        null,
        2
      )
    );
    await page.screenshot({ path: info.outputPath('manual-loop.png'), fullPage: false });
  } finally {
    await new Promise<void>((resolve) => host.server.close(() => resolve()));
  }
});

for (const width of [1280, 1920]) {
  test(`timeline pages playback and respects manual navigation at ${width}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: width === 1280 ? 560 : 900 });
    const host = await startHostServer();
    const ui = previewPlaybackControls(page);
    try {
      await applyHarnessBootstrap(page, {
        preserveMediaLibrary: true,
        storage: {
          'sniptale-locale-preference': 'en',
          'sniptale-theme-preference': width === 1280 ? 'dark' : 'light',
        },
      });
      await page.goto(
        `${host.origin}${GALLERY_HARNESS_PATH}?theme=${width === 1280 ? 'dark' : 'light'}`
      );
      await page.locator('[data-ui="gallery.page.root"]').waitFor();
      await seedReviewVideo(page, 'review-vp8-opus.webm', { width: 160, height: 90, duration: 12 });
      await page.reload();
      await ui.open();
      if (width === 1920) await ui.button('gallery.videoReview.advancedEditing').click();
      const viewport = ui.review.locator('[data-ui="gallery.videoReview.timelineViewport"]');
      const zoom = ui.review.getByRole('slider', {
        name: translate('videoEditor.timeline.zoom', 'en'),
        exact: true,
      });
      await zoom.fill('75');
      await ui.seek(2);
      await ui.button('gallery.videoReview.play').click();
      const samples = await viewport.evaluate(async (node) => {
        const plane = node.querySelector<HTMLElement>('[data-ui="gallery.videoReview.timePlane"]')!;
        const playhead = node.querySelector<HTMLElement>(
          '[data-ui="gallery.videoReview.playhead"]'
        )!;
        const samples: Array<{ time: number; left: number; x: number; width: number }> = [];
        const start = performance.now();
        while (performance.now() - start < 1400) {
          await new Promise(requestAnimationFrame);
          const gutter = Number.parseFloat(plane.style.getPropertyValue('--review-track-gutter'));
          const bounds = node.getBoundingClientRect();
          const cursor = playhead.getBoundingClientRect();
          samples.push({
            time: Number(plane.getAttribute('aria-valuenow')),
            left: node.scrollLeft,
            x: cursor.left + cursor.width / 2 - bounds.left - gutter,
            width: node.clientWidth - gutter,
          });
        }
        return samples;
      });
      expect(samples.length).toBeGreaterThan(2);
      expect(samples.at(-1)!.time).toBeGreaterThan(samples[0]!.time + 0.5);
      expect(samples.at(-1)!.left).toBeGreaterThan(samples[0]!.left);
      expect(samples.every((sample) => sample.x >= -1 && sample.x <= sample.width + 1)).toBe(true);
      const advances = samples.slice(1).map((sample, index) => sample.left - samples[index]!.left);
      expect(advances.filter((advance) => advance > 1).length).toBeGreaterThan(0);
      expect(
        advances.every((advance) => Math.abs(advance) <= 1 || advance >= samples[0]!.width * 0.8)
      ).toBe(true);
      expect(advances.filter((advance) => Math.abs(advance) <= 1).length).toBeGreaterThan(
        samples.length / 2
      );
      await writeFile(info.outputPath('timeline-follow.json'), JSON.stringify(samples, null, 2));
      await viewport.hover();
      const beforeWheel = await viewport.evaluate((node) => node.scrollLeft);
      await page.mouse.wheel(-500, 0);
      await expect
        .poll(() => viewport.evaluate((node) => node.scrollLeft))
        .toBeLessThan(beforeWheel);
      const manual = await viewport.evaluate((node) => node.scrollLeft);
      const time = await ui.video.evaluate((node: HTMLVideoElement) => node.currentTime);
      await expect
        .poll(() => ui.video.evaluate((node: HTMLVideoElement) => node.currentTime))
        .toBeGreaterThan(time + 0.5);
      expect(await viewport.evaluate((node) => node.scrollLeft)).toBeCloseTo(manual, 0);
      await ui.button('gallery.videoReview.pause').click();
      await ui.button('gallery.videoReview.play').click();
      await expect
        .poll(() => viewport.evaluate((node) => node.scrollLeft))
        .toBeGreaterThan(manual + 20);
      await ui.button('gallery.videoReview.pause').click();
      const timePlane = ui.review.locator('[data-ui="gallery.videoReview.timePlane"]');
      await timePlane.focus();
      await page.keyboard.press('End');
      await expect
        .poll(async () => Number(await timePlane.getAttribute('aria-valuenow')))
        .toBeGreaterThan(11.9);
      await expect
        .poll(() => viewport.evaluate((node) => node.scrollLeft))
        .toBeGreaterThan(manual + 1000);
      await page.keyboard.press('Home');
      await expect(timePlane).toHaveAttribute('aria-valuenow', '0');
      await expect.poll(() => viewport.evaluate((node) => node.scrollLeft)).toBe(0);
      await ui.button('gallery.videoReview.play').click();
      await timePlane.focus();
      await page.keyboard.press('End');
      await expect
        .poll(async () => Number(await timePlane.getAttribute('aria-valuenow')))
        .toBeGreaterThan(11.9);
      await expect
        .poll(() => viewport.evaluate((node) => node.scrollLeft))
        .toBeGreaterThan(manual + 1000);
      await page.screenshot({
        path: info.outputPath(`timeline-follow-${width}.png`),
        fullPage: false,
      });
      if (width === 1280) {
        await page.setViewportSize({ width: 1200, height: 560 });
        await expect(viewport).toBeVisible();
      }
    } finally {
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}
