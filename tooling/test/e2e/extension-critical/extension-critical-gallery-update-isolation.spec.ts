import { numericControl } from '../support/inspector-numeric';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { translate } from '../support/catalog-fixture';
import { enableGpuPreviewProof } from '../support/gpu-preview-proof';
import { startHostServer } from '../support/host-server';
import {
  addReviewFocus,
  expectTimelineSelection,
  seedReviewVideo,
} from '../support/quick-editor-media-fixture';
import { captureQuickPreviewPerformanceEnvironment } from '../support/quick-preview-performance-probe';
import { previewPlaybackControls } from '../support/quick-preview-playback-proof';
import { applyHarnessBootstrap, GALLERY_HARNESS_PATH } from '../extension-critical.helpers';

interface DecodeGateSnapshot {
  armed: boolean;
  pending: number;
  released: number;
  discarded: number;
  overflow: number;
  deliveryErrors: number;
  latestTimestampMicroseconds: number | null;
}

interface DecodeGate {
  arm(): void;
  release(): void;
  dispose(): void;
  snapshot(): DecodeGateSnapshot;
}

declare global {
  interface Window {
    galleryUpdateDecodeGate: DecodeGate;
  }
}

enableGpuPreviewProof();
test.use({ deviceScaleFactor: 1 });

/** Retain native decoded frames and flush completion until the test releases the request. */
async function installDecodeGate(page: Page) {
  await page.addInitScript(() => {
    if (window !== window.top) return;
    if (typeof VideoDecoder !== 'function')
      throw new Error('This proof requires native WebCodecs VideoDecoder');
    const NativeDecoder = VideoDecoder;
    let armed = false;
    let released = 0;
    let discarded = 0;
    let overflow = 0;
    let deliveryErrors = 0;
    let unlock: (() => void) | undefined;
    let waiting = Promise.resolve();
    let held: { decoder: VideoDecoder; frame: VideoFrame; output: VideoFrameOutputCallback }[] = [];
    const discard = (decoder: VideoDecoder) => {
      held = held.filter((entry) => {
        if (entry.decoder !== decoder) return true;
        entry.frame.close();
        discarded++;
        return false;
      });
    };
    class GatedDecoder extends NativeDecoder {
      constructor(init: VideoDecoderInit) {
        super({
          ...init,
          output: (frame) => {
            if (!armed) return init.output(frame);
            // The committed 160×90, twelve-second fixture has fewer than 512 frames.
            if (held.length >= 512) {
              frame.close();
              overflow++;
              return;
            }
            held.push({ decoder: this, frame, output: init.output });
          },
        });
      }
      override flush() {
        const completion = super.flush();
        const gate = armed ? waiting : Promise.resolve();
        return completion.then(() => gate);
      }
      override reset() {
        discard(this);
        super.reset();
      }
      override close() {
        discard(this);
        super.close();
      }
    }
    const release = () => {
      armed = false;
      const frames = held;
      held = [];
      for (const entry of frames) {
        if (entry.decoder.state === 'closed') {
          entry.frame.close();
          discarded++;
        } else {
          try {
            entry.output(entry.frame);
            released++;
          } catch {
            entry.frame.close();
            deliveryErrors++;
          }
        }
      }
      unlock?.();
      unlock = undefined;
    };
    window.VideoDecoder = GatedDecoder;
    window.galleryUpdateDecodeGate = {
      arm() {
        if (armed) throw new Error('The decode gate is already armed');
        armed = true;
        waiting = new Promise<void>((resolve) => {
          unlock = resolve;
        });
      },
      release,
      dispose() {
        release();
        if (window.VideoDecoder === GatedDecoder) window.VideoDecoder = NativeDecoder;
      },
      snapshot: () => ({
        armed,
        pending: held.length,
        released,
        discarded,
        overflow,
        deliveryErrors,
        latestTimestampMicroseconds: held.length
          ? Math.max(...held.map((entry) => entry.frame.timestamp))
          : null,
      }),
    };
  });
}

async function nextPaintOpportunity(page: Page) {
  // Two RAF callbacks provide a paint opportunity; this is not a physical scanout timestamp.
  return page.evaluate(
    () =>
      new Promise<number>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve(performance.now())))
      )
  );
}

async function previewPixels(canvas: Locator) {
  return canvas.evaluate((node: HTMLCanvasElement) => {
    const readback = document.createElement('canvas');
    readback.width = 16;
    readback.height = 9;
    try {
      const context = readback.getContext('2d');
      if (!context) throw new Error('Preview pixel readback is unavailable');
      context.drawImage(node, 0, 0, 16, 9);
      return [...context.getImageData(0, 0, 16, 9).data];
    } finally {
      readback.width = readback.height = 0;
    }
  });
}

async function selectSection(page: Page, tab: Locator, keyboard = false) {
  if (keyboard) await tab.focus();
  const started = await page.evaluate(() => performance.now());
  if (keyboard) await page.keyboard.press('ArrowLeft');
  else await tab.click();
  return { started, paintOpportunity: await nextPaintOpportunity(page) };
}

for (const viewport of PRIMARY_BROWSER_VIEWPORTS) {
  test(`gallery isolates inspector and selection from pending preview (${viewport.name})`, async ({
    page,
  }, info) => {
    test.setTimeout(120_000);
    await page.setViewportSize(viewport.size);
    await installDecodeGate(page);
    const host = await startHostServer();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const timings: { action: string; started: number; paintOpportunity: number }[] = [];
    const ui = previewPlaybackControls(page);
    const inspector = ui.review.locator('[data-ui="gallery.videoReview.inspector"]');
    const sections = inspector.locator(
      '[data-ui="gallery.videoReview.inspectorSectionNavigation"]'
    );
    const section = (id: string) =>
      sections.locator(`[data-inspector-tab-motion="${id}"] [role="tab"]`);
    try {
      await applyHarnessBootstrap(page, {
        preserveMediaLibrary: true,
        storage: {
          'sniptale-locale-preference': 'en',
          'sniptale-theme-preference': 'dark',
        },
      });
      await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}?theme=dark`);
      await page.locator('[data-ui="gallery.page.root"]').waitFor();
      await seedReviewVideo(
        page,
        'review-vp8-opus.webm',
        { width: 160, height: 90, duration: 12 },
        false,
        true,
        undefined,
        undefined,
        { modeChoice: 'advanced' }
      );
      await page.reload();
      await ui.open();
      await ui.review
        .locator('[data-review-header-track="source"] [data-review-track-select]')
        .click();
      await section('list').click();
      await section('canvas').click();
      await expect(section('canvas')).toHaveAttribute('aria-selected', 'true');
      for (const id of ['source-filters', 'window-header', 'background']) {
        timings.push({ action: `section:${id}`, ...(await selectSection(page, section(id))) });
        await expect(section(id)).toHaveAttribute('aria-selected', 'true');
      }
      timings.push({
        action: 'section:ArrowLeft',
        ...(await selectSection(page, section('background'), true)),
      });
      await expect(section('window-header')).toHaveAttribute('aria-selected', 'true');
      await addReviewFocus(page, 'en');
      await ui.seek(4);
      await addReviewFocus(page, 'en');
      const items = ui.review.locator('[data-review-removal-key^="focus:"]');
      await expect(items).toHaveCount(2);
      // The authored introductory fade is fully black at zero. Warm a visible interior frame.
      await ui.seek(1);
      await ui.choose(
        'editor.scene.previewRenderer',
        translate('editor.scene.previewRendererGpu', 'en')
      );
      await ui.choose('gallery.videoReview.previewResolution', '360p');
      await expect(ui.canvas).toBeVisible();
      await expect
        .poll(() => ui.canvas.evaluate((node: HTMLCanvasElement) => node.width))
        .toBeGreaterThan(0);
      await expect
        .poll(
          async () => {
            const pixels = await previewPixels(ui.canvas);
            const colors = new Set<string>();
            for (let offset = 0; offset < pixels.length; offset += 4)
              colors.add(pixels.slice(offset, offset + 3).join(','));
            return colors.size;
          },
          { message: 'The committed color fixture must be painted before blocking decode' }
        )
        .toBeGreaterThan(8);
      const warmPixels = await previewPixels(ui.canvas);
      await items.first().scrollIntoViewIfNeeded();
      const unrelated = await ui.review
        .locator('[data-ui="gallery.videoReview.sourceLane"]')
        .elementHandle();
      if (!unrelated) throw new Error('The unrelated source lane is absent');
      const before = await unrelated.evaluate((node) => {
        const box = node.getBoundingClientRect();
        return { x: box.x, y: box.y, width: box.width, height: box.height };
      });
      await page.evaluate(() => window.galleryUpdateDecodeGate.arm());
      await ui.seek(8.25);
      await expect
        .poll(
          () =>
            page.evaluate(
              () => window.galleryUpdateDecodeGate.snapshot().latestTimestampMicroseconds ?? -1
            ),
          {
            timeout: 15_000,
            message: 'The uncached 8.25-second preview must reach the controlled decode gate',
          }
        )
        .toBeGreaterThanOrEqual(8_000_000);
      const blocked = await page.evaluate(() => window.galleryUpdateDecodeGate.snapshot());
      expect(blocked.latestTimestampMicroseconds).not.toBeNull();
      expect(blocked.latestTimestampMicroseconds ?? 0).toBeGreaterThanOrEqual(8_000_000);
      expect(await previewPixels(ui.canvas)).toEqual(warmPixels);
      for (const index of [0, 1]) {
        const started = await page.evaluate(() => performance.now());
        await items.nth(index).click();
        await expectTimelineSelection(items.nth(index));
        const scale = numericControl(inspector, translate('gallery.videoReview.zoomScale', 'en'));
        await scale.scrollIntoViewIfNeeded();
        await expect(scale).toBeInViewport();
        await expect(scale).toBeVisible();
        const paintOpportunity = await nextPaintOpportunity(page);
        timings.push({ action: `selection:${index}`, started, paintOpportunity });
        const gate = await page.evaluate(() => window.galleryUpdateDecodeGate.snapshot());
        expect(gate.armed).toBe(true);
        expect(gate.pending).toBeGreaterThan(0);
        expect(gate.released).toBe(blocked.released);
        const after = await unrelated.evaluate((node) => {
          const box = node.getBoundingClientRect();
          return {
            current: node === document.querySelector('[data-ui="gallery.videoReview.sourceLane"]'),
            x: box.x,
            y: box.y,
            width: box.width,
            height: box.height,
          };
        });
        expect(after.current).toBe(true);
        for (const key of ['x', 'y', 'width', 'height'] as const) {
          // Half a CSS pixel permits fractional layout rounding without permitting lane movement.
          expect(Math.abs(after[key] - before[key])).toBeLessThanOrEqual(0.5);
        }
      }
      await page.screenshot({
        path: info.outputPath('selection-while-decode-pending.png'),
        fullPage: false,
      });
      await page.evaluate(() => window.galleryUpdateDecodeGate.release());
      await expect
        .poll(() => page.evaluate(() => window.galleryUpdateDecodeGate.snapshot().pending))
        .toBe(0);
      await expect
        .poll(() => previewPixels(ui.canvas), {
          message: 'The animated fixture must publish a replacement after decode resumes',
        })
        .not.toEqual(warmPixels);
      const gate = await page.evaluate(() => window.galleryUpdateDecodeGate.snapshot());
      expect(gate.overflow).toBe(0);
      expect(gate.deliveryErrors).toBe(0);
      expect(gate.released).toBeGreaterThan(blocked.released);
      expect(errors).toEqual([]);
      await writeFile(
        info.outputPath('update-isolation.json'),
        JSON.stringify(
          {
            fixture: 'committed review-vp8-opus.webm; synthetic history and two focus regions',
            environment: await captureQuickPreviewPerformanceEnvironment(page),
            viewport,
            geometryToleranceCssPixels: 0.5,
            semantics: [
              'Paint opportunities and visible DOM assertions;',
              'not physical scanout, React commit counts or hardware FPS.',
              'Decoder outputs are held until both selections finish.',
              'Elapsed timings include browser automation and have no hardware FPS assertion.',
            ].join(' '),
            timings: timings.map((value) => ({
              ...value,
              elapsedMs: value.paintOpportunity - value.started,
            })),
            before,
            retainedWarmFrame: true,
            publishedReplacement: true,
            blocked,
            gate,
            errors,
          },
          null,
          2
        )
      );
      await page.screenshot({
        path: info.outputPath('selection-after-decode-release.png'),
        fullPage: false,
      });
      await unrelated.dispose();
    } finally {
      await page.evaluate(() => window.galleryUpdateDecodeGate?.dispose()).catch(() => {});
      await new Promise<void>((resolve, reject) =>
        host.server.close((error) => (error ? reject(error) : resolve()))
      );
    }
  });
}
