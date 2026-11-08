import { readFile, writeFile } from 'node:fs/promises';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { resolveMediaFitFrame } from '../../../../apps/extension/src/features/video/project/window-geometry';
import type { QuickEditPresentationSettings } from '../../../../apps/extension/src/features/video/review/advanced/presentation';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { enableGpuPreviewProof } from '../support/gpu-preview-proof';
import { chooseInspectorValue } from '../support/inspector-utilities';
import { readNativeReviewWorkspace } from '../support/native-review-workspace';
import { seedReviewVideo } from '../support/quick-editor-media-fixture';
import { startHostServer } from '../support/host-server';
import { applyHarnessBootstrap, GALLERY_HARNESS_PATH } from '../extension-critical.helpers';

enableGpuPreviewProof();

type VideoSlot = Extract<QuickEditPresentationSettings['intro'], { mode: 'video' }>;
const grid = 64;
async function persisted(page: Page) {
  const workspace = await readNativeReviewWorkspace(page, 'recording:beta-v1-recording');
  if (!workspace) throw new Error('Gallery bookend workspace was not persisted');
  const operation = workspace.history
    .slice(0, workspace.cursor)
    .findLast((entry) => entry.target === 'advancedContent');
  const presentation =
    operation?.target === 'advancedContent'
      ? operation.after.presentation
      : workspace.advanced.presentation;
  if (!presentation) throw new Error('Gallery presentation settings are unavailable');
  return { presentation, history: { cursor: workspace.cursor, operations: workspace.history } };
}
async function pixels(front: Locator) {
  return front.evaluate((canvas: HTMLCanvasElement, size) => {
    const sample = document.createElement('canvas');
    sample.width = sample.height = size;
    try {
      const context = sample.getContext('2d');
      if (!context) throw new Error('Gallery bookend readback is unavailable');
      context.drawImage(canvas, 0, 0, size, size);
      return [...context.getImageData(0, 0, size, size).data];
    } finally {
      sample.width = sample.height = 0;
    }
  }, grid);
}
function meanError(a: number[], b: number[]) {
  expect(a.length).toBe(b.length);
  return a.reduce((sum, channel, index) => sum + Math.abs(channel - b[index]!), 0) / a.length;
}
async function normalizedReference(
  page: Page,
  bytes: Buffer,
  slot: VideoSlot,
  front: Locator,
  time: number
) {
  const output = await front.evaluate((canvas: HTMLCanvasElement) => ({
    width: canvas.width,
    height: canvas.height,
  }));
  const frame = resolveMediaFitFrame({
    source: slot.video.source,
    output,
    fit: slot.video.fit,
    crop: slot.video.crop,
  });
  const reference = await page.evaluate(
    async ({ encoded, output, frame, time, fill, grid }) => {
      const video = document.createElement('video');
      video.muted = true;
      video.preload = 'auto';
      const url = URL.createObjectURL(
        new Blob([Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0))], { type: 'video/mp4' })
      );
      const raster = document.createElement('canvas'),
        normalized = document.createElement('canvas'),
        sample = document.createElement('canvas');
      try {
        await new Promise<void>((resolve, reject) => {
          video.onloadeddata = () => resolve();
          video.onerror = () => reject(new Error('Normalized video reference decode failed'));
          video.src = url;
        });
        await new Promise<void>((resolve) => {
          video.onseeked = () => resolve();
          video.currentTime = time;
        });
        normalized.width = video.videoWidth;
        normalized.height = video.videoHeight;
        raster.width = output.width;
        raster.height = output.height;
        sample.width = sample.height = grid;
        const context = raster.getContext('2d'),
          sourceContext = normalized.getContext('2d'),
          small = sample.getContext('2d');
        if (!context || !sourceContext || !small)
          throw new Error('Normalized video reference canvas is unavailable');
        context.fillStyle = fill;
        context.fillRect(0, 0, raster.width, raster.height);
        // HTMLvideo applies container display rotation; raw VideoFrame pixels are not the reference.
        sourceContext.drawImage(video, 0, 0, normalized.width, normalized.height);
        context.drawImage(normalized, frame.x, frame.y, frame.width, frame.height);
        small.drawImage(raster, 0, 0, grid, grid);
        const metadataFrame = new VideoFrame(video);
        let decodedMetadata;
        try {
          decodedMetadata = {
            timestamp: metadataFrame.timestamp,
            colorSpace: {
              fullRange: metadataFrame.colorSpace.fullRange,
              matrix: metadataFrame.colorSpace.matrix,
              primaries: metadataFrame.colorSpace.primaries,
              transfer: metadataFrame.colorSpace.transfer,
            },
          };
        } finally {
          metadataFrame.close();
        }
        return {
          decodedMetadata,
          pixels: [...small.getImageData(0, 0, grid, grid).data],
          displayWidth: video.videoWidth,
          displayHeight: video.videoHeight,
          mediaTime: video.currentTime,
        };
      } finally {
        video.pause();
        video.removeAttribute('src');
        video.load();
        URL.revokeObjectURL(url);
        raster.width =
          raster.height =
          normalized.width =
          normalized.height =
          sample.width =
          sample.height =
            0;
      }
    },
    { encoded: bytes.toString('base64'), output, frame, time, fill: slot.video.fillColor, grid }
  );
  return { ...reference, output, frame };
}
function videoError(
  expected: number[],
  actual: number[],
  frame: ReturnType<typeof resolveMediaFitFrame>,
  output: { width: number; height: number }
) {
  let total = 0,
    content = 0,
    bottom = 0,
    count = 0,
    contentCount = 0,
    bottomCount = 0,
    max = 0;
  const left = Math.max(0, (frame.x / output.width) * grid);
  const right = Math.min(grid, ((frame.x + frame.width) / output.width) * grid);
  const top = Math.max(0, (frame.y / output.height) * grid);
  const end = Math.min(grid, ((frame.y + frame.height) / output.height) * grid);
  for (let y = 0; y < grid; y++)
    for (let x = 0; x < grid; x++)
      for (let c = 0; c < 3; c++) {
        const i = (y * grid + x) * 4 + c,
          delta = Math.abs(expected[i]! - actual[i]!);
        total += delta;
        count++;
        max = Math.max(max, delta);
        if (
          x >= Math.ceil(left) &&
          x < Math.floor(right) &&
          y >= Math.ceil(top) &&
          y < Math.floor(end)
        ) {
          content += delta;
          contentCount++;
          if (y >= Math.floor(end) - 4) {
            bottom += delta;
            bottomCount++;
          }
        }
      }
  if (!contentCount || !bottomCount) throw new Error('Video reference content coverage is empty');
  return {
    mean: total / count,
    contentMean: content / contentCount,
    bottomMean: bottom / bottomCount,
    max,
  };
}

for (const viewport of PRIMARY_BROWSER_VIEWPORTS) {
  test(`Gallery GPU bookend image and normalized video ${viewport.name}`, async ({
    page,
  }, info) => {
    test.setTimeout(150_000);
    await page.setViewportSize({ ...viewport.size });
    const host = await startHostServer();
    const label = (key: Parameters<typeof translate>[0]) => translate(key, 'en');
    const review = page.locator('[data-ui="gallery.videoReview.dialog"]');
    const fields = review.locator('[data-ui="gallery.videoReview.presentationInspector"]');
    const intro = fields.locator(
      `section[aria-label="${label('gallery.videoReview.presentationIntro')}"]`
    );
    const preview = intro.locator('[data-ui="gallery.videoReview.presentationMediaPreview"]');
    const front = preview.locator(
      '[data-ui="gallery.videoReview.presentationMedia.gpuHost"] [data-preview-inspector-canvas]'
    );
    const main = review.locator('[data-ui="gallery.videoReview.stage"] video').first();
    const transport = () =>
      main.evaluate((video: HTMLVideoElement) => ({
        time: video.currentTime,
        paused: video.paused,
        rate: video.playbackRate,
        source: video.currentSrc,
      }));
    const chooseLibrary = async (filename: string) => {
      await intro
        .getByRole('button', {
          name: label('gallery.videoReview.presentationLibrary'),
          exact: true,
        })
        .click();
      const drawer = page.locator('[data-ui="gallery.videoReview.presentationLibrary.drawer"]');
      await drawer.locator(`button[title=${JSON.stringify(filename)}]`).click();
      await expect(drawer).toHaveCount(0);
      await expect(fields).toHaveAttribute('aria-busy', 'false');
    };
    try {
      await applyHarnessBootstrap(page, {
        preserveMediaLibrary: true,
        storage: {
          'sniptale-locale-preference': 'en',
          'sniptale-theme-preference': 'light',
          sniptale_quick_preview_preferences: {
            renderer: 'gpu',
            rasterPreset: 'current',
            frameRate: 'current',
            pausedQuality: 'same',
            showFrameRate: false,
          },
        },
      });
      await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}?theme=light`);
      await page.locator('[data-ui="gallery.page.root"]').waitFor();
      await seedReviewVideo(page, 'review-vp8-opus.webm', { width: 160, height: 90, duration: 12 });
      await page.reload();
      const encoded = await page.evaluate(() => {
        const canvas = document.createElement('canvas');
        canvas.width = 641;
        canvas.height = 201;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Bookend PNG fixture failed');
        context.fillStyle = '#ff0000';
        context.fillRect(0, 0, 321, 201);
        context.fillStyle = '#00ffff';
        context.fillRect(321, 0, 320, 201);
        return canvas.toDataURL('image/png').split(',')[1]!;
      });
      const imageName = 'Two-tone Gallery bookend.png';
      const videos = await Promise.all(
        ['review-avc-rotated.mp4', 'review-avc-padded-color.mp4'].map(async (name) => ({
          name,
          bytes: await readFile(new URL(`../fixtures/${name}`, import.meta.url)),
        }))
      );
      await page
        .locator('input[type="file"][multiple]')
        .setInputFiles([
          { name: imageName, mimeType: 'image/png', buffer: Buffer.from(encoded, 'base64') },
          ...videos.map(({ name, bytes }) => ({ name, mimeType: 'video/mp4', buffer: bytes })),
        ]);
      for (const name of [imageName, ...videos.map((video) => video.name)])
        await expect(page.getByRole('button', { name, exact: true }).first()).toBeVisible();
      await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).first().click();
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      await review
        .getByRole('button', { name: label('gallery.videoReview.advancedEditing'), exact: true })
        .click();
      await review
        .getByRole('button', { name: label('gallery.videoReview.scene'), exact: true })
        .click();
      await intro
        .getByRole('button', {
          name: label('gallery.videoReview.presentationBookend'),
          exact: true,
        })
        .click();
      await chooseLibrary(imageName);
      await expect
        .poll(async () => (await persisted(page)).presentation.intro.image?.filename)
        .toBe(imageName);
      await expect(preview).toHaveAttribute('aria-busy', 'false');
      await expect(front).toHaveCount(1);
      await expect
        .poll(() =>
          front.evaluate((canvas: HTMLCanvasElement) => {
            try {
              return canvas.getContext('2d') === null;
            } catch (error) {
              if (error instanceof DOMException && error.name === 'InvalidStateError') return true;
              throw error;
            }
          })
        )
        .toBe(true);
      await expect
        .poll(async () => {
          const data = await pixels(front),
            left = (32 * grid + 16) * 4,
            right = (32 * grid + 48) * 4;
          return (
            data[left]! > 240 && data[left + 1]! < 15 && data[right]! < 15 && data[right + 1]! > 240
          );
        })
        .toBe(true);
      const contained = await pixels(front);
      expect(Math.min(...contained.filter((_, index) => index % 4 === 3))).toBeGreaterThanOrEqual(
        254
      );
      const framing = intro
        .locator('summary')
        .filter({ hasText: label('gallery.videoReview.presentationFraming') });
      if ((await framing.locator('..').getAttribute('open')) === null) await framing.click();
      await chooseInspectorValue(
        page,
        intro,
        label('gallery.videoReview.presentationFit'),
        label('gallery.videoReview.presentationCover')
      );
      await expect
        .poll(async () => (await persisted(page)).presentation.intro.image?.fit)
        .toBe('cover');
      await expect.poll(async () => meanError(contained, await pixels(front))).toBeGreaterThan(4);
      const accepted = await pixels(front),
        baseline = await persisted(page),
        pinned = await transport();
      const pan = intro.getByRole('textbox', {
        name: label('gallery.videoReview.presentationPanX'),
        exact: true,
      });
      const slider = intro.getByRole('slider', {
        name: `${label('gallery.videoReview.presentationPanX')} range`,
        exact: true,
      });
      const drag = async () => {
        await pan.scrollIntoViewIfNeeded();
        await pan.hover();
        const box = (await slider.boundingBox())!;
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width * 0.8, box.y + box.height / 2, { steps: 4 });
      };
      await drag();
      await expect.poll(async () => meanError(accepted, await pixels(front))).toBeGreaterThan(4);
      expect((await persisted(page)).history).toEqual(baseline.history);
      expect(await transport()).toEqual(pinned);
      await page.keyboard.press('Escape');
      await page.mouse.up();
      await expect
        .poll(async () => meanError(accepted, await pixels(front)))
        .toBeLessThanOrEqual(1);
      expect((await persisted(page)).history).toEqual(baseline.history);
      await drag();
      await expect.poll(async () => meanError(accepted, await pixels(front))).toBeGreaterThan(4);
      await page.mouse.up();
      await expect
        .poll(async () => (await persisted(page)).history.cursor)
        .toBe(baseline.history.cursor + 1);
      expect((await persisted(page)).history.operations).toHaveLength(
        baseline.history.operations.length + 1
      );
      await review
        .getByRole('button', { name: label('gallery.videoReview.undo'), exact: true })
        .click();
      await expect
        .poll(async () => (await persisted(page)).history.cursor)
        .toBe(baseline.history.cursor);
      expect((await persisted(page)).presentation).toEqual(baseline.presentation);
      expect(await transport()).toEqual(pinned);
      await expect
        .poll(async () => meanError(accepted, await pixels(front)))
        .toBeLessThanOrEqual(1);
      await preview.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: info.outputPath('gallery-bookend-image-gpu.png'),
        fullPage: false,
      });
      for (const { name, bytes } of videos) {
        await chooseLibrary(name);
        await expect
          .poll(async () => (await persisted(page)).presentation.intro.video?.filename)
          .toBe(name);
        const beforeSeek = await persisted(page),
          beforeTransport = await transport();
        const position = preview.getByRole('textbox', {
          name: label('gallery.videoReview.presentationMediaPosition'),
          exact: true,
        });
        await expect(preview).toHaveAttribute('aria-busy', 'false');
        await expect(front).toHaveCount(1);
        const previousFront = await front.elementHandle();
        if (!previousFront) throw new Error('Initial GPU video front is unavailable');
        try {
          await position.fill('0.75');
          await position.press('Enter');
          await expect
            .poll(() => front.evaluate((canvas, previous) => canvas !== previous, previousFront))
            .toBe(true);
        } finally {
          await previousFront.dispose();
        }
        await expect.poll(async () => Number(await position.inputValue())).toBe(0.75);
        await expect(preview).toHaveAttribute('aria-busy', 'false');
        expect((await persisted(page)).history).toEqual(beforeSeek.history);
        expect(await transport()).toEqual(beforeTransport);
        const slot = (await persisted(page)).presentation.intro;
        if (slot.mode !== 'video') throw new Error('Gallery video bookend mode was not retained');
        const reference = await normalizedReference(page, bytes, slot, front, 0.75);
        const heldGpuPixels = await pixels(front);
        const historyBeforeRenderer = (await persisted(page)).history;
        const transportBeforeRenderer = await transport();
        const changeRenderer = async (mode: 'gpu' | 'legacy') => {
          await review.locator('[data-ui="gallery.videoReview.previewSettings"]').click();
          await chooseInspectorValue(
            page,
            review.locator('[data-ui="gallery.videoReview.previewInspector"]'),
            label('editor.scene.previewRenderer'),
            label(
              mode === 'gpu'
                ? 'editor.scene.previewRendererGpu'
                : 'editor.scene.previewRendererLegacy'
            )
          );
          await review
            .getByRole('button', { name: label('gallery.videoReview.scene'), exact: true })
            .click();
          await expect(preview).toHaveAttribute('aria-busy', 'false');
          await position.fill('0.75');
          await position.press('Enter');
          await expect.poll(async () => Number(await position.inputValue())).toBe(0.75);
        };
        const fallback = preview.locator('canvas[data-preview-inspector-canvas]');
        let legacyPixels: number[] = [],
          legacyFailure: unknown;
        let baselineComparison: ReturnType<typeof videoError> | null = null;
        try {
          await changeRenderer('legacy');
          await expect(fallback).toHaveCount(1);
          await expect
            .poll(() =>
              fallback.evaluate((canvas: HTMLCanvasElement) => {
                try {
                  return canvas.getContext('2d') !== null;
                } catch (error) {
                  if (error instanceof DOMException && error.name === 'InvalidStateError')
                    return false;
                  throw error;
                }
              })
            )
            .toBe(true);
          await expect
            .poll(async () => {
              legacyPixels = await pixels(fallback);
              baselineComparison = videoError(
                legacyPixels,
                heldGpuPixels,
                reference.frame,
                reference.output
              );
              return baselineComparison.contentMean;
            })
            .toBeLessThanOrEqual(5);
        } catch (error) {
          legacyFailure = error;
        } finally {
          const diagnostic = info.outputPath(name.replace('.mp4', '-legacy-baseline.json'));
          await writeFile(
            diagnostic,
            JSON.stringify(
              {
                requestedTime: 0.75,
                gpuOutput: reference.output,
                fit: reference.frame,
                comparison: baselineComparison,
                heldGpuPixels,
                legacyPixels,
              },
              null,
              2
            )
          );
          await info.attach(name + '-legacy-baseline', {
            path: diagnostic,
            contentType: 'application/json',
          });
          await changeRenderer('gpu');
          await expect(front).toHaveCount(1);
          await expect
            .poll(async () => meanError(heldGpuPixels, await pixels(front)))
            .toBeLessThanOrEqual(1);
        }
        expect((await persisted(page)).history).toEqual(historyBeforeRenderer);
        expect(await transport()).toEqual(transportBeforeRenderer);
        if (legacyFailure) throw legacyFailure;
        if (legacyPixels.length !== grid * grid * 4)
          throw new Error('Legacy video baseline was not captured');
        const capturedBaseline = videoError(
          legacyPixels,
          heldGpuPixels,
          reference.frame,
          reference.output
        );
        expect(capturedBaseline.mean).toBeLessThanOrEqual(5);
        expect(capturedBaseline.bottomMean).toBeLessThanOrEqual(5);

        if (name === 'review-avc-rotated.mp4') {
          expect([slot.video.source.width, slot.video.source.height]).toEqual([90, 160]);
          expect([reference.displayWidth, reference.displayHeight]).toEqual([90, 160]);
        }
        let comparison = videoError(
          reference.pixels,
          await pixels(front),
          reference.frame,
          reference.output
        );
        try {
          await expect
            .poll(async () => {
              comparison = videoError(
                reference.pixels,
                await pixels(front),
                reference.frame,
                reference.output
              );
              return comparison.contentMean;
            })
            .toBeLessThanOrEqual(5);
        } finally {
          const diagnostic = info.outputPath(name.replace('.mp4', '-pixels.json'));
          await writeFile(
            diagnostic,
            JSON.stringify(
              {
                requestedTime: 0.75,
                source: slot.video.source,
                reference: {
                  width: reference.displayWidth,
                  height: reference.displayHeight,
                  time: reference.mediaTime,
                  decodedMetadata: reference.decodedMetadata,
                },
                gpuOutput: reference.output,
                fit: reference.frame,
                comparison,
              },
              null,
              2
            )
          );
          await info.attach(name + '-pixels', {
            path: diagnostic,
            contentType: 'application/json',
          });
        }
        expect(comparison.mean).toBeLessThanOrEqual(5);
        expect(comparison.bottomMean).toBeLessThanOrEqual(5);
        await preview.scrollIntoViewIfNeeded();
        await page.screenshot({
          path: info.outputPath(name.replace('.mp4', '-gpu.png')),
          fullPage: false,
        });
      }
    } finally {
      await page.mouse.up().catch(() => {});
      await new Promise<void>((resolve, reject) =>
        host.server.close((error) => (error ? reject(error) : resolve()))
      );
    }
  });
}
