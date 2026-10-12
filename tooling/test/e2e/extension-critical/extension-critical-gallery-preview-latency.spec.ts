import { expect, test, type Page } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { startHostServer } from '../support/host-server';
import { seedReviewVideo } from '../support/quick-editor-media-fixture';
import { provisionQuickPreviewPerformanceFixture } from '../support/quick-preview-performance-fixture';
import { previewPlaybackControls } from '../support/quick-preview-playback-proof';
import { applyHarnessBootstrap, GALLERY_HARNESS_PATH } from '../extension-critical.helpers';

const manual = '[data-ui="gallery.videoReview.manualPreview"]';
test.use({ viewport: { width: 1280, height: 560 }, deviceScaleFactor: 1 });
test.describe.configure({ mode: 'serial' });

async function observePublications(page: Page) {
  return page.evaluateHandle((selector) => {
    const host = document.querySelector(selector);
    if (!host) throw new Error('Missing manual publication host');
    const scratch = document.createElement('canvas');
    scratch.width = 64;
    scratch.height = 36;
    const context = scratch.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Missing sample context');
    const samples: Array<{ now: number; width: number; height: number; pixels: number[] }> = [];
    let started = performance.now();
    let overflow = false;
    const observer = new MutationObserver((records) => {
      if (
        !records.some((record) =>
          [...record.addedNodes].some((node) => node instanceof HTMLCanvasElement)
        )
      )
        return;
      const canvas = host.firstElementChild;
      if (!(canvas instanceof HTMLCanvasElement) || !canvas.width || !canvas.height) return;
      if (samples.length >= 64) {
        overflow = true;
        return;
      }
      const now = performance.now();
      context.clearRect(0, 0, 64, 36);
      context.drawImage(canvas, 0, 0, 64, 36);
      samples.push({
        now,
        width: canvas.width,
        height: canvas.height,
        pixels: [...context.getImageData(0, 0, 64, 36).data],
      });
    });
    observer.observe(host, { childList: true });
    const timer = setTimeout(() => observer.disconnect(), 30_000);
    return {
      start() {
        samples.length = 0;
        started = performance.now();
      },
      read() {
        return { started, samples, overflow };
      },
      stop() {
        observer.disconnect();
        clearTimeout(timer);
        scratch.width = scratch.height = 0;
      },
    };
  }, manual);
}

/** A separate decoder supplies reference pixels after the timed publications have finished. */
async function referencePixels(
  page: Page,
  time: number,
  backing?: { width: number; height: number }
) {
  return page.evaluate(
    async ({ time, backing }) => {
      const source = document.querySelector('[data-ui="gallery.videoReview.stage"] video');
      if (!(source instanceof HTMLVideoElement)) throw new Error('Missing source');
      const video = document.createElement('video');
      video.muted = true;
      video.preload = 'auto';
      const wait = (event: 'loadeddata' | 'seeked') =>
        new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('Reference decode timeout')), 15000);
          video.addEventListener(
            event,
            () => {
              clearTimeout(timer);
              resolve();
            },
            { once: true }
          );
          video.addEventListener(
            'error',
            () => {
              clearTimeout(timer);
              reject(new Error('Reference decode failed'));
            },
            { once: true }
          );
        });
      try {
        const ready = wait('loadeddata');
        video.src = source.currentSrc;
        await ready;
        if (time > 0) {
          const seeked = wait('seeked');
          video.currentTime = time;
          await seeked;
        }
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 36;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) throw new Error('Missing reference context');
        const published = document.querySelector(
          '[data-ui="gallery.videoReview.manualPreview"] canvas'
        );
        if (!(published instanceof HTMLCanvasElement)) throw new Error('Missing reference backing');
        const raster = document.createElement('canvas');
        raster.width = backing?.width ?? published.width;
        raster.height = backing?.height ?? published.height;
        const rasterContext = raster.getContext('2d');
        if (!rasterContext) throw new Error('Missing reference raster context');
        // Match the two rasterization stages; direct source→64px has different filtering.
        rasterContext.drawImage(video, 0, 0, raster.width, raster.height);
        context.drawImage(raster, 0, 0, 64, 36);
        raster.width = raster.height = 0;
        const pixels = [...context.getImageData(0, 0, 64, 36).data];
        canvas.width = canvas.height = 0;
        return pixels;
      } finally {
        video.removeAttribute('src');
        video.load();
      }
    },
    { time, backing: backing ?? null }
  );
}

function pixelError(actual: number[], expected: number[]) {
  expect(actual).toHaveLength(expected.length);
  return (
    actual.reduce((sum, value, index) => sum + Math.abs(value - expected[index]!), 0) /
    actual.length
  );
}

for (let repetition = 1; repetition <= 3; repetition++) {
  test(`context-cold manual activation and seek refinement ${repetition}`, async ({
    page,
  }, info) => {
    test.setTimeout(180_000);
    const fixture = await provisionQuickPreviewPerformanceFixture({
      width: 1280,
      height: 720,
      fps: 30,
    });
    const server = await startHostServer();
    const ui = previewPlaybackControls(page);
    try {
      await applyHarnessBootstrap(page, {
        preserveMediaLibrary: true,
        storage: { 'sniptale-locale-preference': 'en' },
      });
      await page.goto(`${server.origin}${GALLERY_HARNESS_PATH}`);
      await page.locator('[data-ui="gallery.page.root"]').waitFor();
      await seedReviewVideo(
        page,
        'latency-720p30.webm',
        { width: fixture.width, height: fixture.height, duration: fixture.duration },
        false,
        false,
        { bytes: fixture.bytes, mimeType: 'video/webm' }
      );
      await page.reload();
      const openStarted = await page.evaluate(() => performance.now());
      await ui.open();
      const decodedReady = await page.evaluate(() => performance.now());
      const activation = await observePublications(page);
      let activationData;
      try {
        await activation.evaluate((probe) => probe.start());
        await ui.choose('gallery.videoReview.previewResolution', '360p');
        await expect(ui.canvas).toBeVisible();
        await expect
          .poll(() => activation.evaluate((probe) => probe.read().samples.length))
          .toBeGreaterThan(0);
        activationData = await activation.evaluate((probe) => probe.read());
      } finally {
        await activation.evaluate((probe) => probe.stop());
        await activation.dispose();
      }
      const activationReference = await referencePixels(
        page,
        await ui.video.evaluate((video: HTMLVideoElement) => video.currentTime)
      );
      const activationFirst = activationData.samples.find(
        (sample) => pixelError(sample.pixels, activationReference) < 5
      );
      await writeFile(
        info.outputPath('activation-reference.json'),
        JSON.stringify(
          activationData.samples.map((sample) => ({
            width: sample.width,
            height: sample.height,
            referenceMAE: pixelError(sample.pixels, activationReference),
          })),
          null,
          2
        )
      );
      expect(activationFirst).toBeDefined();
      await ui.choose(
        'gallery.videoReview.previewPaused',
        translate('gallery.videoReview.previewPausedDetailed', 'en')
      );
      await expect
        .poll(() => ui.canvas.evaluate((canvas: HTMLCanvasElement) => canvas.height))
        .toBe(720);
      const seeks = [];
      for (const target of [2.25, 10.25, 21.25]) {
        const oldReference = await referencePixels(
          page,
          await ui.video.evaluate((video: HTMLVideoElement) => video.currentTime)
        );
        const probe = await observePublications(page);
        let trace;
        try {
          await probe.evaluate((value) => value.start());
          await ui.seek(target);
          await expect
            .poll(() =>
              probe.evaluate((value) =>
                value.read().samples.some((sample) => sample.height === 720)
              )
            )
            .toBe(true);
          trace = await probe.evaluate((value) => value.read());
        } finally {
          await probe.evaluate((value) => value.stop());
          await probe.dispose();
        }
        const expected = await referencePixels(page, target);
        expect(pixelError(oldReference, expected)).toBeGreaterThan(5);
        const matching = trace.samples.filter((sample) => pixelError(sample.pixels, expected) < 5);
        const first = matching[0];
        const refined = matching.find((sample) => sample.height === 720);
        expect(first).toBeDefined();
        expect(refined).toBeDefined();
        expect(trace.overflow).toBe(false);
        expect(await ui.video.evaluate((video: HTMLVideoElement) => video.currentTime)).toBeCloseTo(
          target,
          4
        );
        seeks.push({
          target,
          started: trace.started,
          firstFrameMs: first!.now - trace.started,
          refinedFrameMs: refined!.now - trace.started,
          firstEqualsRefined: first === refined,
          samples: trace.samples.map(({ pixels, ...sample }) => ({
            ...sample,
            referenceMAE: pixelError(pixels, expected),
            previousFrameMAE: pixelError(pixels, oldReference),
          })),
        });
      }
      await writeFile(
        info.outputPath('latency.json'),
        JSON.stringify(
          {
            repetition,
            fixture: fixture.manifest,
            cacheState:
              'Fresh browser context; browser process, OS, fixture and font caches may be warm',
            activationStart: 'Before opening preview settings and selecting360p through the UI',
            semantics:
              'Native currentTime seek events; publication time precedes64×36 diagnostic ' +
              'readback; independent source decoder runs after measurement; DOM publication is ' +
              'not scanout',
            editorOpenToDecodedMs: decodedReady - openStarted,
            activationMs: activationFirst!.now - activationData.started,
            activation: activationData.samples.map(({ pixels, ...sample }) => ({
              ...sample,
              referenceMAE: pixelError(pixels, activationReference),
            })),
            seeks,
          },
          null,
          2
        )
      );
      await page.screenshot({ path: info.outputPath('latency-final.png'), fullPage: false });
    } finally {
      await new Promise<void>((resolve) => server.server.close(() => resolve()));
    }
  });
}
