import { readFile, writeFile } from 'node:fs/promises';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { createVideoProjectFromRecording } from '../../../../apps/extension/src/features/video/project/factories/creation';
import { isValidVideoProject } from '../../../../apps/extension/src/features/video/project/validation';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { enableGpuPreviewProof } from '../support/gpu-preview-proof';
import { startHostServer } from '../support/host-server';
import { readNativeVideoProject } from '../support/native-video-project';
import { seedReviewVideo } from '../support/quick-editor-media-fixture';
import {
  applyHarnessBootstrap,
  GALLERY_HARNESS_PATH,
  VIDEO_EDITOR_HARNESS_PATH,
} from '../extension-critical.helpers';

enableGpuPreviewProof();

async function previewPixels(front: Locator) {
  return front.evaluate((canvas: HTMLCanvasElement) => {
    const readback = document.createElement('canvas');
    readback.width = readback.height = 32;
    try {
      const context = readback.getContext('2d');
      if (!context) throw new Error('Native window pixel readback is unavailable');
      context.drawImage(canvas, 0, 0, 32, 32);
      return [...context.getImageData(0, 0, 32, 32).data];
    } finally {
      readback.width = readback.height = 0;
    }
  });
}

function pixelError(before: number[], after: number[]) {
  expect(after.length).toBe(before.length);
  return (
    before.reduce((sum, value, index) => sum + Math.abs(value - after[index]!), 0) / before.length
  );
}

async function savedProject(page: Page) {
  const project = await readNativeVideoProject(page);
  if (!project) throw new Error('Native window project was not persisted');
  return project;
}

for (const viewport of PRIMARY_BROWSER_VIEWPORTS) {
  test(`Native held playback window retains GPU image and canvas editing ${viewport.name}`, async ({
    page,
  }, info) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ ...viewport.size });
    const host = await startHostServer();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    try {
      const filename = 'review-avc-padded-color.mp4';
      const bytes = await readFile(new URL(`../fixtures/${filename}`, import.meta.url));
      const project = createVideoProjectFromRecording({
        recordingId: 'beta-v1-recording',
        filename,
        width: 1904,
        height: 984,
        duration: 2,
        size: bytes.length,
        mimeType: 'video/mp4',
        hasAudio: false,
      });
      project.version = 43;
      project.clips = project.clips.map((clip) =>
        clip.type === 'VIDEO'
          ? { ...clip, timelineLaneId: null, playbackWindow: { offset: 0, holdAt: 1 } }
          : clip
      );
      expect(isValidVideoProject(project)).toBe(true);
      const videoClip = project.clips.find((clip) => clip.type === 'VIDEO');
      if (!videoClip) throw new Error('Native window video fixture is unavailable');
      await applyHarnessBootstrap(page, {
        preserveMediaLibrary: true,
        videoProjects: [project],
        storage: {
          'sniptale-locale-preference': 'en',
          'sniptale-theme-preference': 'light',
          sniptale_video_editor_preview_preferences: {
            renderer: 'gpu',
            frameRate: 'project',
            showFrameRate: false,
            mode: 'live',
            rasterPreset: '720p',
            zoom: 'fit',
          },
        },
      });
      await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}?theme=light`);
      await page.locator('[data-ui="gallery.page.root"]').waitFor();
      await seedReviewVideo(page, filename, { width: 1904, height: 984, duration: 2 });
      await page.goto(
        `${host.origin}${VIDEO_EDITOR_HARNESS_PATH}?project=${project.id}&theme=light`
      );
      await expect(page.locator('[data-ui="video-editor.timeline.surface"]')).toBeVisible();
      const playhead = page.locator('[data-ui="video-editor.timeline.playhead-handle"]');
      await playhead.focus();
      await playhead.press('End');
      for (let frame = 0; frame < 15; frame++) await playhead.press('ArrowLeft');
      await expect
        .poll(async () => Number(await playhead.getAttribute('aria-valuenow')))
        .toBeCloseTo(1.5, 6);

      const front = page.locator('[data-preview-gpu-host] [data-preview-stage-canvas]');
      await expect(front).toHaveCount(1);
      await expect(front).toBeVisible();
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
      const backing = await front.evaluate((canvas: HTMLCanvasElement) => ({
        width: canvas.width,
        height: canvas.height,
      }));
      const bounds = await front.boundingBox();
      if (!bounds) throw new Error('Native GPU stage bounds are unavailable');
      // CSS aspect rounding may change the fitted height by at most one pixel.
      expect(
        Math.abs(bounds.height - (bounds.width * project.height) / project.width)
      ).toBeLessThanOrEqual(1);
      const reference = await page.evaluate(
        async ({ size, bytes }) => {
          const sourceUrl = URL.createObjectURL(
            new Blob([Uint8Array.from(bytes)], { type: 'video/mp4' })
          );
          const decoded = document.createElement('video');
          const fitted = document.createElement('canvas');
          const sample = document.createElement('canvas');
          decoded.muted = true;
          decoded.preload = 'auto';
          try {
            await new Promise<void>((resolve, reject) => {
              decoded.onloadeddata = () => resolve();
              decoded.onerror = () => reject(new Error('Held source reference failed to decode'));
              decoded.src = sourceUrl;
            });
            await new Promise<void>((resolve) => {
              decoded.onseeked = () => resolve();
              decoded.currentTime = 1;
            });
            fitted.width = size.width;
            fitted.height = size.height;
            sample.width = sample.height = 32;
            const full = fitted.getContext('2d'),
              context = sample.getContext('2d');
            if (!full || !context) throw new Error('Held source reference readback is unavailable');
            full.drawImage(decoded, 0, 0, size.width, size.height);
            context.drawImage(fitted, 0, 0, 32, 32);
            return {
              width: decoded.videoWidth,
              height: decoded.videoHeight,
              time: decoded.currentTime,
              pixels: [...context.getImageData(0, 0, 32, 32).data],
            };
          } finally {
            URL.revokeObjectURL(sourceUrl);
            decoded.removeAttribute('src');
            decoded.load();
            fitted.width = fitted.height = sample.width = sample.height = 0;
          }
        },
        { size: backing, bytes: [...bytes] }
      );
      expect([reference.width, reference.height, reference.time]).toEqual([1904, 984, 1]);
      // Match both scaling stages; allow five channel LSB for decoder/GPU conversion.
      await expect
        .poll(async () => pixelError(reference.pixels, await previewPixels(front)))
        .toBeLessThanOrEqual(5);
      const baselinePixels = await previewPixels(front);
      const colors = baselinePixels.filter((_, index) => index % 4 !== 3);
      expect(Math.max(...colors) - Math.min(...colors)).toBeGreaterThan(100);
      expect(
        Math.min(...baselinePixels.filter((_, index) => index % 4 === 3))
      ).toBeGreaterThanOrEqual(254);
      const baseline = await savedProject(page);
      const transform = async () =>
        (await savedProject(page)).clips.find((clip) => clip.id === videoClip.id)!.transform;
      await page
        .getByRole('button', {
          name: translate('videoEditor.sidebar.sceneProperties', 'en'),
          exact: true,
        })
        .click();
      const selectedStage = await front.boundingBox();
      if (!selectedStage) throw new Error('Native GPU stage is unavailable for selection');
      await page.mouse.click(
        selectedStage.x + selectedStage.width / 2,
        selectedStage.y + selectedStage.height / 2
      );
      const selection = page.locator('[data-preview-selection-state="editable"]');
      await expect(selection).toBeVisible();
      await expect(page.locator('[data-preview-selection-handle]')).toHaveCount(4);
      const magnet = page.getByRole('button', { name: 'Magnet', exact: true });
      if ((await magnet.getAttribute('aria-pressed')) === 'true') await magnet.click();
      const stage = await front.boundingBox();
      if (!stage) throw new Error('Native GPU stage disappeared before editing');
      const dx = stage.width * 0.08,
        dy = stage.height * 0.08;
      const start = { x: stage.x + stage.width / 2, y: stage.y + stage.height / 2 };
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      await page.mouse.move(start.x + dx, start.y + dy, { steps: 5 });
      await page.mouse.up();
      // Pointer rounding permits one project pixel in the persisted translation.
      await expect
        .poll(async () =>
          Math.abs((await transform()).x - (videoClip.transform.x + project.width * 0.08))
        )
        .toBeLessThanOrEqual(1);
      expect(
        Math.abs((await transform()).y - (videoClip.transform.y + project.height * 0.08))
      ).toBeLessThanOrEqual(1);
      await expect
        .poll(async () => pixelError(baselinePixels, await previewPixels(front)))
        .toBeGreaterThan(5);
      const movedBounds = await selection.boundingBox();
      if (!movedBounds) throw new Error('Native window selection disappeared after editing');
      expect(Math.abs(movedBounds.x - (stage.x + dx))).toBeLessThanOrEqual(1);
      expect(Math.abs(movedBounds.y - (stage.y + dy))).toBeLessThanOrEqual(1);
      await page.screenshot({
        path: info.outputPath('native-window-gpu-edited.png'),
        fullPage: false,
      });
      await page.locator('[data-ui="video-editor.timeline.toolbar.undo"]').click();
      await expect.poll(async () => (await savedProject(page)).clips).toEqual(baseline.clips);
      await expect
        .poll(async () => pixelError(baselinePixels, await previewPixels(front)))
        .toBeLessThanOrEqual(1);
      await expect
        .poll(async () => Number(await playhead.getAttribute('aria-valuenow')))
        .toBeCloseTo(1.5, 6);
      await page.screenshot({
        path: info.outputPath('native-window-gpu-restored.png'),
        fullPage: false,
      });
      const proofPath = info.outputPath('native-window-gpu-proof.json');
      await writeFile(
        proofPath,
        JSON.stringify(
          {
            viewport: viewport.size,
            backing,
            bounds,
            reference,
            baselinePixels,
            restoredError: pixelError(baselinePixels, await previewPixels(front)),
          },
          null,
          2
        )
      );
      await info.attach('native-window-gpu-proof.json', {
        path: proofPath,
        contentType: 'application/json',
      });
      expect(errors).toEqual([]);
    } finally {
      await page.mouse.up().catch(() => {});
      host.server.closeAllConnections();
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}
