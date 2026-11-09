import { chooseInspectorValue } from '../support/inspector-utilities';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { enableGpuPreviewProof, installCameraFrameObserver } from '../support/gpu-preview-proof';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { startHostServer } from '../support/host-server';
import { seedReviewWebcamBundle } from '../support/quick-editor-media-fixture';
import { readWebcamWorkspace } from '../support/quick-editor-webcam-proof';
import { applyHarnessBootstrap, GALLERY_HARNESS_PATH } from '../extension-critical.helpers';

enableGpuPreviewProof();

test.describe('Gallery webcam GPU crop publication', () => {
  for (const viewport of [
    { width: 1280, height: 560 },
    { width: 1920, height: 900 },
  ]) {
    test(`Gallery webcam GPU crop draft, cancel and one commit at ${viewport.width}`, async ({
      page,
    }, info) => {
      test.setTimeout(120_000);
      await page.setViewportSize(viewport);
      const host = await startHostServer();
      const label = (key: Parameters<typeof translate>[0]) => translate(key, 'en');
      const dialog = page.locator('dialog');
      const inspector = dialog.locator('[data-ui="gallery.videoReview.webcamInspector"]');
      const cropOwner = inspector.locator('[data-ui="gallery.videoReview.webcamCrop"]');
      const crop = cropOwner.getByRole('button', {
        name: label('videoEditor.sidebar.cameraCropPreview'),
        exact: true,
      });
      const front = cropOwner.locator(
        '[data-ui="gallery.videoReview.webcamCrop.gpuHost"] [data-preview-inspector-canvas]'
      );
      const source = dialog.locator('[data-ui="gallery.videoReview.stage"] video').first();
      const camera = cropOwner.locator('video');
      const transport = () =>
        source.evaluate((video: HTMLVideoElement) => ({
          time: video.currentTime,
          paused: video.paused,
          rate: video.playbackRate,
          seeking: video.seeking,
        }));
      const painted = () =>
        front.evaluate((canvas: HTMLCanvasElement) => {
          const sample = document.createElement('canvas');
          sample.width = sample.height = 32;
          try {
            const context = sample.getContext('2d');
            if (!context) throw new Error('Crop pixel readback is unavailable');
            context.drawImage(canvas, 0, 0, 32, 32);
            return [...context.getImageData(0, 0, 32, 32).data];
          } finally {
            sample.width = sample.height = 0;
          }
        });
      const sourceColors = (canvas: Locator) =>
        canvas.evaluate((node: HTMLCanvasElement) => {
          const copy = document.createElement('canvas');
          copy.width = node.width;
          copy.height = node.height;
          try {
            const context = copy.getContext('2d');
            if (!context) throw new Error('Source color readback is unavailable.');
            context.drawImage(node, 0, 0);
            return {
              raster: { width: node.width, height: node.height },
              colors: [
                [20 / 160, 70 / 90],
                [70 / 160, 80 / 90],
                [40 / 160, 82 / 90],
              ].map(([x, y]) =>
                [
                  ...context.getImageData(
                    Math.floor(x! * node.width),
                    Math.floor(y! * node.height),
                    1,
                    1
                  ).data,
                ].slice(0, 3)
              ),
            };
          } finally {
            copy.width = copy.height = 0;
          }
        });
      const error = (a: number[], b: number[]) => {
        expect(a.length).toBe(b.length);
        return a.reduce((sum, channel, index) => sum + Math.abs(channel - b[index]!), 0) / a.length;
      };
      const history = async () => {
        const workspace = await readWebcamWorkspace(page);
        if (!workspace) throw new Error('Crop workspace was not persisted');
        return { cursor: workspace.cursor, operations: workspace.history };
      };
      const persistedPoint = async () => {
        const stored = await history();
        const operation = stored.operations
          .slice(0, stored.cursor)
          .findLast((entry) => entry.target === 'advancedContent');
        return operation?.target === 'advancedContent'
          ? operation.after.webcam?.positions.find((point) => Math.abs(point.time - 1) < 0.001)
          : undefined;
      };
      try {
        await applyHarnessBootstrap(page, {
          preserveMediaLibrary: true,
          storage: { 'sniptale-locale-preference': 'en', 'sniptale-theme-preference': 'light' },
        });
        await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}?theme=light`);
        await page.locator('[data-ui="gallery.page.root"]').waitFor();
        // The asymmetric real recording exposes crop movement; its camera asset remains independent.
        await seedReviewWebcamBundle(page, 'review-vp8-opus.webm');
        await page.reload();
        await page.getByRole('button', { name: /: Screen$/ }).click();
        await page.locator('[data-ui="gallery.videoReview.enter"]').click();
        await dialog
          .getByRole('button', { name: label('gallery.videoReview.advancedEditing'), exact: true })
          .click();
        await dialog
          .locator('[data-review-header-track="webcam"] [data-review-track-select]')
          .click();
        await dialog
          .getByRole('group', { name: label('gallery.videoReview.inspector'), exact: true })
          .getByRole('button', { name: label('gallery.videoReview.webcam'), exact: true })
          .click();
        await expect(inspector).toBeVisible();
        const zoom = inspector.getByRole('textbox', {
          name: label('videoEditor.sidebar.cameraCropZoom'),
          exact: true,
        });
        if (!(await zoom.isVisible()))
          await inspector
            .getByRole('button', { name: label('gallery.videoReview.webcamLayout'), exact: true })
            .click();
        await zoom.scrollIntoViewIfNeeded();
        await crop.scrollIntoViewIfNeeded();
        await expect(crop).toBeEnabled();
        await source.evaluate((video: HTMLVideoElement) => {
          video.currentTime = 1;
        });
        await expect
          .poll(() =>
            source.evaluate(
              (video: HTMLVideoElement) =>
                !video.seeking && video.paused && Math.abs(video.currentTime - 1) < 0.001
            )
          )
          .toBe(true);
        await dialog
          .getByRole('button', {
            name: label('gallery.videoReview.webcamAddPosition'),
            exact: true,
          })
          .click();
        await expect.poll(persistedPoint).toBeDefined();
        const authoredPoint = await persistedPoint();
        if (!authoredPoint) throw new Error('Authored camera position was not persisted');
        await expect
          .poll(() =>
            camera.evaluate(
              (video: HTMLVideoElement) =>
                !video.seeking && video.readyState >= 2 && Math.abs(video.currentTime - 1) < 0.001
            )
          )
          .toBe(true);
        // This marker belongs to the inspector's accepted, completed publication, not the stage.
        await expect(front).toHaveCount(1);
        await expect
          .poll(() =>
            front.evaluate((canvas: HTMLCanvasElement) => {
              try {
                return canvas.getContext('2d') === null;
              } catch (failure) {
                if (failure instanceof DOMException && failure.name === 'InvalidStateError')
                  return true;
                throw failure;
              }
            })
          )
          .toBe(true);
        await expect(front).toHaveCSS('opacity', '1');
        await expect
          .poll(async () => {
            const pixels = await painted();
            return (
              Math.max(...pixels.filter((_, index) => index % 4 !== 3)) -
              Math.min(...pixels.filter((_, index) => index % 4 !== 3))
            );
          })
          .toBeGreaterThan(20);
        if (viewport.width === 1920) {
          const main = dialog.locator(
            '[data-ui="gallery.videoReview.manualPreview"] canvas[data-preview-front="true"]'
          );
          await expect(main).toHaveCount(1);
          await expect
            .poll(async () => {
              const [a, b] = await Promise.all([sourceColors(main), sourceColors(front)]);
              return Math.max(
                ...a.colors.flatMap((color, index) =>
                  color.map((value, channel) => Math.abs(value - b.colors[index]![channel]!))
                )
              );
            })
            .toBeLessThan(4);
          const bytes = await readFile(
            new URL('../fixtures/review-vp8-opus.webm', import.meta.url)
          );
          await writeFile(
            info.outputPath('webcam-canonical-source-colors.json'),
            JSON.stringify(
              {
                viewport,
                sourceSHA256: createHash('sha256').update(bytes).digest('hex'),
                requestedSourceTime: 1,
                main: await sourceColors(main),
                inspector: await sourceColors(front),
              },
              null,
              2
            )
          );
        }
        const preZoomPixels = await painted();
        await zoom.fill('2');
        await zoom.press('Enter');
        await expect
          .poll(async () => {
            const point = await persistedPoint();
            return point?.id === authoredPoint.id ? point.crop?.zoom : undefined;
          })
          .toBe(2);
        await crop.scrollIntoViewIfNeeded();
        await expect.poll(async () => error(preZoomPixels, await painted())).toBeGreaterThan(2);
        const initialPixels = await painted();
        const initialTransport = await transport();
        const initialHistory = await history();
        const pan = inspector.getByRole('textbox', {
          name: label('gallery.videoReview.webcamCropX'),
          exact: true,
        });
        const initialPan = await pan.inputValue();
        const cameraSource = await camera.getAttribute('src');
        const beginDrag = async () => {
          const box = (await crop.boundingBox())!;
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
          await page.mouse.down();
          await page.mouse.move(box.x + box.width / 2 + 18, box.y + box.height / 2 + 8, {
            steps: 4,
          });
        };
        await beginDrag();
        await expect.poll(async () => error(initialPixels, await painted())).toBeGreaterThan(2);
        expect(await history()).toEqual(initialHistory);
        expect(await transport()).toEqual(initialTransport);
        await page.keyboard.press('Escape');
        await page.mouse.up();
        // Same decoded frame and same crop: allow one LSB for backend quantization.
        await expect.poll(async () => error(initialPixels, await painted())).toBeLessThanOrEqual(1);
        expect(await history()).toEqual(initialHistory);
        await expect(pan).toHaveValue(initialPan);
        await beginDrag();
        await expect.poll(async () => error(initialPixels, await painted())).toBeGreaterThan(2);
        expect(await history()).toEqual(initialHistory);
        await page.mouse.up();
        await expect.poll(async () => (await history()).cursor).toBe(initialHistory.cursor + 1);
        const acceptedHistory = await history();
        expect(acceptedHistory.operations).toHaveLength(initialHistory.operations.length + 1);
        expect(acceptedHistory.operations.slice(0, -1)).toEqual(initialHistory.operations);
        await expect(pan).not.toHaveValue(initialPan);
        expect(await transport()).toEqual(initialTransport);
        await dialog
          .getByRole('button', { name: label('gallery.videoReview.undo'), exact: true })
          .click();
        await expect.poll(async () => (await history()).cursor).toBe(initialHistory.cursor);
        await expect(pan).toHaveValue(initialPan);
        await expect.poll(async () => error(initialPixels, await painted())).toBeLessThanOrEqual(1);
        expect(await transport()).toEqual(initialTransport);
        await source.evaluate((video: HTMLVideoElement) => {
          video.currentTime = 5;
        });
        await expect
          .poll(() =>
            source.evaluate(
              (video: HTMLVideoElement) =>
                !video.seeking && video.paused && Math.abs(video.currentTime - 5) < 0.001
            )
          )
          .toBe(true);
        await expect
          .poll(() =>
            camera.evaluate(
              (video: HTMLVideoElement) =>
                !video.seeking && video.readyState >= 2 && Math.abs(video.currentTime - 1) < 0.001
            )
          )
          .toBe(true);
        await expect(front).toHaveCount(1);
        await expect.poll(async () => error(initialPixels, await painted())).toBeLessThanOrEqual(1);
        expect(await camera.getAttribute('src')).toBe(cameraSource);
        expect((await history()).cursor).toBe(initialHistory.cursor);
        if (viewport.width === 1920) {
          const changeOffset = async (value: string) => {
            const offset = inspector.getByRole('textbox', {
              name: label('gallery.videoReview.webcamOffset'),
              exact: true,
            });
            if (!(await offset.isVisible()))
              await inspector
                .getByRole('heading', {
                  name: label('gallery.videoReview.webcamTiming'),
                  exact: true,
                })
                .click();
            await offset.fill(value);
            await offset.press('Enter');
            await expect
              .poll(async () => {
                const stored = await history();
                const edit = stored.operations
                  .slice(0, stored.cursor)
                  .findLast((entry) => entry.target === 'advancedContent');
                return edit?.target === 'advancedContent' ? edit.after.webcam?.offsetSeconds : null;
              })
              .toBe(Number(value));
            const zoomControl = inspector.getByRole('textbox', {
              name: label('videoEditor.sidebar.cameraCropZoom'),
              exact: true,
            });
            if (!(await zoomControl.isVisible()))
              await inspector
                .getByRole('heading', {
                  name: label('gallery.videoReview.webcamLayout'),
                  exact: true,
                })
                .click();
            await crop.scrollIntoViewIfNeeded();
            await expect(crop).toBeEnabled();
          };
          await changeOffset('-10.9');
          await expect.poll(async () => error(initialPixels, await painted())).toBeGreaterThan(5);
          const terminal = await painted();
          await changeOffset('-12');
          await expect.poll(async () => error(terminal, await painted())).toBeLessThanOrEqual(1);
          expect(await transport()).toMatchObject({ paused: true, time: 5 });
          await writeFile(
            info.outputPath('webcam-canonical-source-tail.json'),
            JSON.stringify(
              {
                viewport,
                selectedPositionTime: authoredPoint.time,
                offsetSeconds: -12,
                requestedSourceTime: authoredPoint.time + 12,
                verifiedSourceEnd: 12,
                expectedSourcePTS: 11.9,
                ptsEvidence:
                  'Controlled provider and paint-owner tests; browser checks actual retained pixels and editability.',
                pixelError: error(terminal, await painted()),
                inspector: await sourceColors(front),
              },
              null,
              2
            )
          );
        }
        await crop.scrollIntoViewIfNeeded();
        await page.screenshot({
          path: info.outputPath('webcam-gpu-crop-restored.png'),
          fullPage: false,
        });
      } finally {
        await page.mouse.up().catch(() => {});
        await new Promise<void>((resolve, reject) =>
          host.server.close((failure) => (failure ? reject(failure) : resolve()))
        );
      }
    });
  }
});

/** Read the current authored camera rather than its pre-history baseline. */
async function currentCameraSettings(page: Page) {
  const stored = await readWebcamWorkspace(page);
  if (!stored) throw new Error('Camera workspace is unavailable.');
  const edit = stored.history
    .slice(0, stored.cursor)
    .findLast((entry) => entry.target === 'advancedContent');
  const camera = edit?.target === 'advancedContent' ? edit.after.webcam : stored.advanced.webcam;
  if (!camera) throw new Error('Camera settings are unavailable.');
  return camera;
}

/** These points lie inside the authored camera rectangle, independently of the primary source. */
async function cameraRectangleColors(
  canvas: Locator,
  rect: { x: number; y: number; width: number; height: number }
) {
  return canvas.evaluate((node: HTMLCanvasElement, rect) => {
    const copy = document.createElement('canvas');
    copy.width = node.width;
    copy.height = node.height;
    const context = copy.getContext('2d');
    if (!context) throw new Error('Camera rectangle readback is unavailable.');
    context.drawImage(node, 0, 0);
    return {
      raster: { width: node.width, height: node.height },
      colors: [
        [20 / 160, 70 / 90],
        [70 / 160, 80 / 90],
        [40 / 160, 82 / 90],
      ].map(([x, y]) =>
        [
          ...context.getImageData(
            Math.floor((rect.x + x! * rect.width) * node.width),
            Math.floor((rect.y + y! * rect.height) * node.height),
            1,
            1
          ).data,
        ].slice(0, 3)
      ),
    };
  }, rect);
}

/** The camera fixture has a uniform colour field whose red channel advances with source PTS. */
function cameraReferenceColors(time: number, filename = 'review-webcam-clock.webm') {
  const source = new URL(`../fixtures/${filename}`, import.meta.url);
  const bytes = execFileSync(
    '/usr/bin/ffmpeg',
    [
      '-v',
      'error',
      '-ss',
      String(time),
      '-i',
      fileURLToPath(source),
      '-frames:v',
      '1',
      '-f',
      'rawvideo',
      '-pix_fmt',
      'rgba',
      'pipe:1',
    ],
    { timeout: 10_000, maxBuffer: 160 * 90 * 4 + 1024 }
  );
  expect(bytes.length).toBe(160 * 90 * 4);
  return [
    [20, 70],
    [70, 80],
    [40, 82],
  ].map(([x, y]) => [...bytes.subarray((y! * 160 + x!) * 4, (y! * 160 + x!) * 4 + 3)]);
}

for (const viewport of PRIMARY_BROWSER_VIEWPORTS) {
  test(`Gallery main webcam ${viewport.size.width === 1920 ? 'canonical source and Standard' : 'gesture geometry'} at ${viewport.name}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ ...viewport.size });
    const host = await startHostServer();
    const dialog = page.locator('dialog');
    const label = (key: Parameters<typeof translate>[0]) => translate(key, 'en');
    const button = (key: Parameters<typeof translate>[0]) =>
      dialog.getByRole('button', { name: label(key), exact: true });
    const inspector = dialog.locator('[data-ui="gallery.videoReview.webcamInspector"]');
    try {
      await applyHarnessBootstrap(page, {
        preserveMediaLibrary: true,
        storage: { 'sniptale-locale-preference': 'en', 'sniptale-theme-preference': 'light' },
      });
      await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}?theme=light`);
      await page.locator('[data-ui="gallery.page.root"]').waitFor();
      await seedReviewWebcamBundle(page);
      await page.reload();
      await page.getByRole('button', { name: /: Screen$/ }).click();
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      await button('gallery.videoReview.advancedEditing').click();
      await dialog
        .locator('[data-review-header-track="webcam"] [data-review-track-select]')
        .click();
      await dialog
        .getByRole('group', { name: label('gallery.videoReview.inspector'), exact: true })
        .getByRole('button', { name: label('gallery.videoReview.webcam'), exact: true })
        .click();
      await expect(inspector).toBeVisible();
      const plane = dialog.locator('[data-ui="gallery.videoReview.timePlane"]');
      const ruler = dialog.locator('[data-ui="gallery.videoReview.ruler"]');
      const box = await ruler.boundingBox();
      if (!box) throw new Error('Camera source ruler is unavailable.');
      const duration = Number(await plane.getAttribute('aria-valuemax'));
      if (!Number.isFinite(duration) || duration <= 0)
        throw new Error('Source duration is invalid.');
      await ruler.click({ position: { x: (box.width * 1.02) / duration, y: 8 } });
      const clock = async () => Number(await plane.getAttribute('aria-valuenow'));
      await expect.poll(clock).toBeGreaterThan(1);
      await expect.poll(clock).toBeLessThan(1 + 1 / 30);
      // Ruler seeking clears selection. Restore the camera settings without changing the clock.
      await dialog
        .locator('[data-review-header-track="webcam"] [data-review-track-select]')
        .click();
      await dialog
        .getByRole('group', { name: label('gallery.videoReview.inspector'), exact: true })
        .getByRole('button', { name: label('gallery.videoReview.webcam'), exact: true })
        .click();
      await expect(inspector).toBeVisible();
      const main = dialog.locator(
        '[data-ui="gallery.videoReview.manualPreview"] canvas[data-preview-front="true"]'
      );
      const camera = await currentCameraSettings(page);
      const initialClock = await clock();
      if (viewport.size.width === 1920) {
        const error = (expected: number[][], actual: number[][]) =>
          Math.max(
            ...expected.flatMap((color, index) =>
              color.map((value, channel) => Math.abs(value - actual[index]![channel]!))
            )
          );
        const reference1 = cameraReferenceColors(1);
        const reference2 = cameraReferenceColors(2);
        expect(error(reference1, reference2)).toBeGreaterThan(4);
        const changeOffset = async (value: string) => {
          const offset = inspector.getByRole('textbox', {
            name: label('gallery.videoReview.webcamOffset'),
            exact: true,
          });
          if (!(await offset.isVisible()))
            await inspector
              .getByRole('heading', {
                name: label('gallery.videoReview.webcamTiming'),
                exact: true,
              })
              .click();
          await offset.fill(value);
          await offset.press('Enter');
          await expect
            .poll(async () => (await currentCameraSettings(page)).offsetSeconds)
            .toBe(Number(value));
        };
        await expect
          .poll(
            async () =>
              error(reference1, (await cameraRectangleColors(main, camera.placement)).colors),
            {
              message:
                'GPU camera pixels must match its own clock source, not the underlying screen video',
            }
          )
          .toBeLessThan(4);
        await changeOffset('-1');
        await expect
          .poll(
            async () =>
              error(reference2, (await cameraRectangleColors(main, camera.placement)).colors),
            {
              message:
                'GPU camera must sample the mapped camera time while primary time stays fixed',
            }
          )
          .toBeLessThan(4);
        const gpu = await cameraRectangleColors(main, camera.placement);
        await dialog.locator('[data-ui="gallery.videoReview.previewSettings"]').click();
        const panel = dialog.locator('[data-ui="gallery.videoReview.previewInspector"]');
        await panel
          .getByRole('button', { name: label('editor.scene.previewRenderer'), exact: true })
          .click();
        await page
          .getByRole('option', { name: label('editor.scene.previewRendererLegacy'), exact: true })
          .click();
        await panel.press('Escape');
        await expect(inspector).toBeVisible();
        await changeOffset('0');
        await expect
          .poll(
            async () =>
              error(reference1, (await cameraRectangleColors(main, camera.placement)).colors),
            {
              message:
                'Standard camera must replace the different GPU frame with the mapped camera source',
            }
          )
          .toBeLessThan(4);
        const standard = await cameraRectangleColors(main, camera.placement);
        await expect.poll(clock).toBe(initialClock);
        await writeFile(
          info.outputPath('main-camera-source-reference.json'),
          JSON.stringify(
            {
              viewport: viewport.size,
              mainSourceTime: initialClock,
              cameraPlacement: camera.placement,
              cameraAssetId: camera.assetId,
              cameraSHA256: createHash('sha256')
                .update(
                  await readFile(new URL('../fixtures/review-webcam-clock.webm', import.meta.url))
                )
                .digest('hex'),
              source: { width: 160, height: 90, fps: 30 },
              gpuOffsetSeconds: -1,
              gpuReferenceSeekTime: 2,

              standardOffsetSeconds: 0,
              standardReferenceSeekTime: 1,

              reference1,
              reference2,
              gpu,
              standard,
              maximumRGBDifference: Math.max(
                error(reference2, gpu.colors),
                error(reference1, standard.colors)
              ),
              limits:
                'Raw camera-rectangle pixels against independent FFmpeg seek references. Controlled source-owner tests prove provider intervals and delayed source/pose ownership. No independent browser PTS or cadence claim.',
            },
            null,
            2
          )
        );
      } else {
        const area = dialog
          .locator('[data-ui="gallery.videoReview.webcamOverlay"]')
          .getByRole('group', { name: label('gallery.videoReview.webcamSettings'), exact: true });
        await expect(area).toBeVisible();
        const before = await area.boundingBox();
        if (!before) throw new Error('Presented camera handles are unavailable.');
        await area.focus();
        await area.press('ArrowRight');
        await expect.poll(async () => (await area.boundingBox())?.x).toBeGreaterThan(before.x);
        await button('gallery.videoReview.undo').click();
        await expect.poll(async () => await currentCameraSettings(page)).toEqual(camera);
        await expect.poll(async () => (await area.boundingBox())?.x).toBeCloseTo(before.x, 1);
        await expect.poll(clock).toBe(initialClock);
      }
      await page.screenshot({
        path: info.outputPath(`main-camera-${viewport.name}.png`),
        fullPage: false,
      });
    } finally {
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}

/** Native capture identity remains observable when WebCodecs declines a source up front. */
test('Gallery unsupported camera admits actual VFR source in GPU and Standard', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1920, height: 900 });
  await page.addInitScript(() => {
    const NativeFrame = globalThis.VideoFrame;
    const records: { timestamp: number; currentTime: number; duration: number }[] = [];
    Object.defineProperty(globalThis, 'VideoFrame', {
      configurable: true,
      value: new Proxy(NativeFrame, {
        construct(target, args) {
          const frame: unknown = Reflect.construct(target, args, target);
          if (!(frame instanceof NativeFrame)) throw new Error('Invalid native frame result');
          const input: unknown = args[0];
          if (input instanceof HTMLVideoElement && records.length < 512)
            records.push({
              timestamp: frame.timestamp,
              currentTime: input.currentTime,
              duration: input.duration,
            });
          return frame;
        },
      }),
    });
    VideoDecoder.isConfigSupported = async (config) => ({ supported: false, config });
    Reflect.set(window, 'sniptaleManualCameraSourceFrames', records);
  });
  const host = await startHostServer();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const dialog = page.locator('dialog');
  const label = (key: Parameters<typeof translate>[0]) => translate(key, 'en');
  const cameraFacts = () =>
    page.evaluate(() => {
      const value: unknown = Reflect.get(window, 'sniptaleManualCameraSourceFrames');
      if (!Array.isArray(value)) throw new Error('Native camera facts are unavailable');
      const result: { timestamp: number; currentTime: number; duration: number }[] = [];
      const entries: unknown[] = value;
      for (const item of entries) {
        if (
          !item ||
          typeof item !== 'object' ||
          !('timestamp' in item) ||
          !('currentTime' in item) ||
          !('duration' in item) ||
          typeof item.timestamp !== 'number' ||
          typeof item.currentTime !== 'number' ||
          typeof item.duration !== 'number' ||
          ![item.timestamp, item.currentTime, item.duration].every(Number.isFinite)
        )
          throw new Error('Native camera facts are invalid');
        if (item.duration === 6)
          result.push({
            timestamp: item.timestamp,
            currentTime: item.currentTime,
            duration: item.duration,
          });
      }
      return result;
    });
  try {
    await applyHarnessBootstrap(page, {
      preserveMediaLibrary: true,
      storage: { 'sniptale-locale-preference': 'en', 'sniptale-theme-preference': 'light' },
    });
    await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}?theme=light`);
    await page.locator('[data-ui="gallery.page.root"]').waitFor();
    await seedReviewWebcamBundle(page, 'review-cut-vfr.webm');
    await page.reload();
    await page.getByRole('button', { name: /: Screen$/ }).click();
    await page.locator('[data-ui="gallery.videoReview.enter"]').click();
    await dialog
      .getByRole('button', { name: label('gallery.videoReview.advancedEditing'), exact: true })
      .click();
    expect(await page.evaluate(() => [typeof VideoFrame, typeof VideoDecoder])).toEqual([
      'function',
      'function',
    ]);
    const main = dialog.locator(
      '[data-ui="gallery.videoReview.manualPreview"] canvas[data-preview-front="true"]'
    );
    await expect(main).toBeVisible();
    await dialog.locator('[data-review-header-track="webcam"] [data-review-track-select]').click();
    await dialog
      .getByRole('group', { name: label('gallery.videoReview.inspector'), exact: true })
      .getByRole('button', { name: label('gallery.videoReview.webcam'), exact: true })
      .click();
    await expect(dialog.locator('[data-ui="gallery.videoReview.webcamInspector"]')).toBeVisible();
    const camera = await currentCameraSettings(page);
    const initial = await readWebcamWorkspace(page);
    if (!initial) throw new Error('Camera workspace is unavailable');
    const ruler = dialog.locator('[data-ui="gallery.videoReview.ruler"]');
    const plane = dialog.locator('[data-ui="gallery.videoReview.timePlane"]');
    const box = await ruler.boundingBox();
    const duration = Number(await plane.getAttribute('aria-valuemax'));
    if (!box || !Number.isFinite(duration) || duration <= 0)
      throw new Error('Camera source timeline is unavailable');
    const error = (expected: number[][], actual: number[][]) =>
      Math.max(
        ...expected.flatMap((color, index) =>
          color.map((value, channel) => Math.abs(value - actual[index]![channel]!))
        )
      );
    const samples = [];
    for (const [target, pts] of [
      [1.02, 0.9],
      [1.21, 1.2],
    ] as const) {
      const before = await main.elementHandle();
      if (!before) throw new Error('Previous camera publication is unavailable');
      const count = (await cameraFacts()).length;
      try {
        await ruler.click({ position: { x: (box.width * target!) / duration, y: 8 } });
        await expect
          .poll(() => main.evaluate((canvas, previous) => canvas !== previous, before))
          .toBe(true);
      } finally {
        await before.dispose();
      }
      await expect
        .poll(async () =>
          (await cameraFacts()).slice(count).some((frame) => frame.timestamp === pts! * 1e6)
        )
        .toBe(true);
      const reference = cameraReferenceColors(pts!, 'review-cut-vfr.webm');
      await expect
        .poll(async () =>
          error(reference, (await cameraRectangleColors(main, camera.placement)).colors)
        )
        .toBeLessThan(4);
      samples.push({
        target,
        expectedPTS: pts,
        reference,
        actual: await cameraRectangleColors(main, camera.placement),
      });
    }
    const acceptedTime = Number(await plane.getAttribute('aria-valuenow'));
    const gpuFront = await main.elementHandle();
    if (!gpuFront) throw new Error('Accepted GPU camera publication is unavailable');
    await dialog.locator('[data-ui="gallery.videoReview.previewSettings"]').click();
    const panel = dialog.locator('[data-ui="gallery.videoReview.previewInspector"]');
    await panel
      .getByRole('button', { name: label('editor.scene.previewRenderer'), exact: true })
      .click();
    await page
      .getByRole('option', { name: label('editor.scene.previewRendererLegacy'), exact: true })
      .click();
    await panel.press('Escape');
    try {
      await expect
        .poll(() => main.evaluate((canvas, previous) => canvas !== previous, gpuFront))
        .toBe(true);
    } finally {
      await gpuFront.dispose();
    }
    await expect
      .poll(() =>
        main.evaluate((canvas: HTMLCanvasElement) => {
          try {
            return canvas.getContext('2d') !== null;
          } catch (error) {
            if (error instanceof DOMException && error.name === 'InvalidStateError') return false;
            throw error;
          }
        })
      )
      .toBe(true);
    const reference = cameraReferenceColors(1.2, 'review-cut-vfr.webm');
    await expect
      .poll(async () =>
        error(reference, (await cameraRectangleColors(main, camera.placement)).colors)
      )
      .toBeLessThan(4);
    expect(Number(await plane.getAttribute('aria-valuenow'))).toBe(acceptedTime);
    const final = await readWebcamWorkspace(page);
    expect(final?.history).toEqual(initial.history);
    expect(final?.cursor).toBe(initial.cursor);
    expect(await currentCameraSettings(page)).toEqual(camera);
    expect(errors).toEqual([]);
    await writeFile(
      info.outputPath('manual-camera-vfr-source.json'),
      JSON.stringify(
        {
          viewport: page.viewportSize(),
          sourceRaster: { width: 160, height: 90 },
          sourceSHA256: createHash('sha256')
            .update(await readFile(new URL('../fixtures/review-cut-vfr.webm', import.meta.url)))
            .digest('hex'),
          samples,
          nativeFrames: await cameraFacts(),
          standard: await cameraRectangleColors(main, camera.placement),
          acceptedTime,
          errors,
          limitation:
            'Forced upfront WebCodecs rejection with native APIs present. Actual VFR camera captures and independent raw RGB references; controlled tests prove mismatch recovery and resource ownership. No FPS claim or genuine unsupported codec claim.',
        },
        null,
        2
      )
    );
    await page.screenshot({
      path: info.outputPath('manual-camera-vfr-source.png'),
      fullPage: false,
    });
  } finally {
    await new Promise<void>((resolve, reject) =>
      host.server.close((error) => (error ? reject(error) : resolve()))
    );
  }
});

test('Gallery declined private camera keeps selected source and EOF in GPU and Standard', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1920, height: 900 });
  await page.addInitScript(installCameraFrameObserver);
  await page.addInitScript(() => {
    VideoDecoder.isConfigSupported = async (config) => ({ supported: false, config });
  });
  const host = await startHostServer();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const label = (key: Parameters<typeof translate>[0]) => translate(key, 'en');
  const dialog = page.locator('dialog');
  const inspector = dialog.locator('[data-ui="gallery.videoReview.webcamInspector"]');
  const owner = inspector.locator('[data-ui="gallery.videoReview.webcamCrop"]');
  const gpu = owner.locator(
    '[data-ui="gallery.videoReview.webcamCrop.gpuHost"] [data-preview-inspector-canvas]'
  );
  const error = (expected: number[][], actual: number[][]) =>
    Math.max(
      ...expected.flatMap((color, i) =>
        color.map((channel, c) => Math.abs(channel - actual[i]![c]!))
      )
    );
  const colors = (canvas: Locator) =>
    cameraRectangleColors(canvas, { x: 0, y: 0, width: 1, height: 1 });
  const openCamera = async () => {
    await dialog.locator('[data-review-header-track="webcam"] [data-review-track-select]').click();
    await dialog
      .getByRole('group', { name: label('gallery.videoReview.inspector'), exact: true })
      .getByRole('button', { name: label('gallery.videoReview.webcam'), exact: true })
      .click();
    await expect(inspector).toBeVisible();
  };
  try {
    await applyHarnessBootstrap(page, {
      preserveMediaLibrary: true,
      storage: {
        'sniptale-locale-preference': 'en',
        'sniptale-theme-preference': 'light',
      },
    });
    await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}?theme=light`);
    await page.locator('[data-ui="gallery.page.root"]').waitFor();
    await seedReviewWebcamBundle(page, 'review-cut-vfr.webm');
    await page.reload();
    await page.getByRole('button', { name: /: Screen$/ }).click();
    await page.locator('[data-ui="gallery.videoReview.enter"]').click();
    await dialog
      .getByRole('button', { name: label('gallery.videoReview.advancedEditing'), exact: true })
      .click();
    await openCamera();
    const layout = inspector.getByRole('button', {
      name: label('gallery.videoReview.webcamLayout'),
      exact: true,
    });
    if (!(await owner.isVisible())) await layout.click();
    const master = dialog.locator('[data-ui="gallery.videoReview.stage"] video').first();
    const samples = [];
    for (const [target, pts] of [
      [1.02, 0.9],
      [1.91, 1.8],
      [8, 5.9],
    ] as const) {
      await master.evaluate((video: HTMLVideoElement, time) => {
        video.currentTime = time;
      }, target);
      await expect
        .poll(() => master.evaluate((video: HTMLVideoElement) => video.paused && !video.seeking))
        .toBe(true);
      await dialog
        .getByRole('button', { name: label('gallery.videoReview.webcamAddPosition'), exact: true })
        .click();
      await expect
        .poll(async () =>
          (await currentCameraSettings(page)).positions.some(
            (point) => Math.abs(point.time - target) < 0.001
          )
        )
        .toBe(true);
      await expect(gpu).toHaveCount(1);
      await expect
        .poll(() =>
          gpu.evaluate((canvas) => {
            const read: unknown = Reflect.get(window, 'sniptaleCurrentInspectorFrame');
            if (typeof read !== 'function')
              throw new Error('Private camera PTS evidence is unavailable.');
            const value: unknown = read(canvas);
            if (value !== null && typeof value !== 'number')
              throw new Error('Invalid private camera PTS.');
            return value;
          })
        )
        .toBe(pts * 1e6);
      const reference = cameraReferenceColors(pts, 'review-cut-vfr.webm');
      await expect.poll(async () => error(reference, (await colors(gpu)).colors)).toBeLessThan(4);
      samples.push({ target, expectedPTS: pts, reference, actual: await colors(gpu) });
    }
    const camera = await currentCameraSettings(page);
    const point = camera.positions.find((point) => Math.abs(point.time - 8) < 0.001);
    if (!point) throw new Error('The selected EOF camera position is unavailable.');
    const initial = await readWebcamWorkspace(page);
    const mainTime = await master.evaluate((video: HTMLVideoElement) => video.currentTime);
    await dialog.locator('[data-ui="gallery.videoReview.previewSettings"]').click();
    const panel = dialog.locator('[data-ui="gallery.videoReview.previewInspector"]');
    await panel
      .getByRole('button', { name: label('editor.scene.previewRenderer'), exact: true })
      .click();
    await page
      .getByRole('option', { name: label('editor.scene.previewRendererLegacy'), exact: true })
      .click();
    await panel.press('Escape');
    await openCamera();
    if (!(await owner.isVisible())) await layout.click();
    const index = camera.positions.findIndex((item) => item.id === point.id);
    await chooseInspectorValue(
      page,
      inspector,
      label('gallery.videoReview.webcamPosition'),
      `${index + 1} · ${point.time.toFixed(3)} s`
    );
    const standard = owner.locator('button > canvas');
    const reference = cameraReferenceColors(5.9, 'review-cut-vfr.webm');
    await expect
      .poll(async () => error(reference, (await colors(standard)).colors))
      .toBeLessThan(4);
    expect(await master.evaluate((video: HTMLVideoElement) => video.currentTime)).toBe(mainTime);
    const final = await readWebcamWorkspace(page);
    expect(final?.history).toEqual(initial?.history);
    expect(final?.cursor).toBe(initial?.cursor);
    expect(await currentCameraSettings(page)).toEqual(camera);
    expect(errors).toEqual([]);
    await writeFile(
      info.outputPath('gallery-private-camera-source.json'),
      JSON.stringify(
        {
          viewport: page.viewportSize(),
          sourceRaster: { width: 160, height: 90 },
          samples,
          standard: await colors(standard),
          mainTime,
          errors,
          limit:
            'Frame available. Forced refusal. Selected positions, EOF and color only. No FPS or all-family claim.',
        },
        null,
        2
      )
    );
    await owner.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: info.outputPath('gallery-private-camera-source.png'),
      fullPage: false,
    });
  } finally {
    await new Promise<void>((resolve, reject) =>
      host.server.close((error) => (error ? reject(error) : resolve()))
    );
  }
});
