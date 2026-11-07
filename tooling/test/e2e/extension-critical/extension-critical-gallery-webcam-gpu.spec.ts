import { enableGpuPreviewProof } from '../support/gpu-preview-proof';
import { expect, test } from '@playwright/test';
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
