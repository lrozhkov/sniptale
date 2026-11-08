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

async function pixels(front: Locator) {
  return front.evaluate((canvas: HTMLCanvasElement) => {
    const sample = document.createElement('canvas');
    sample.width = sample.height = 32;
    try {
      const context = sample.getContext('2d');
      if (!context) throw new Error('Native cache pixel readback is unavailable');
      context.drawImage(canvas, 0, 0, 32, 32);
      return [...context.getImageData(0, 0, 32, 32).data];
    } finally {
      sample.width = sample.height = 0;
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
  if (!project) throw new Error('Native cache project was not persisted');
  return project;
}

async function seekFrame(playhead: Locator, frame: number, fps: number) {
  await playhead.focus();
  await playhead.press('Home');
  for (let index = 0; index < frame; index++) await playhead.press('ArrowRight');
  await expect
    .poll(async () => Number(await playhead.getAttribute('aria-valuenow')))
    .toBeCloseTo(frame / fps, 6);
}

async function selectPresentedFrame(page: Page, front: Locator) {
  await expect(async () => {
    const bounds = await front.boundingBox();
    if (!bounds) throw new Error('Current cache frame bounds are unavailable');
    // Editing stays disabled until pixels and geometry match the paused project clock.
    await page.mouse.click(bounds.x + bounds.width * 0.4, bounds.y + bounds.height * 0.4);
    await expect(page.locator('[data-preview-selection-state="editable"]')).toBeVisible({
      timeout: 500,
    });
  }).toPass({ timeout: 10_000 });
}

async function changeRenderer(page: Page, renderer: 'gpu' | 'legacy') {
  await page.locator('[data-ui="video.preview.display-settings"]').click();
  const panel = page.locator('[data-ui="video.preview.display-settings.panel"]');
  await panel
    .getByRole('radio', {
      name: translate(
        renderer === 'gpu'
          ? 'editor.scene.previewRendererGpu'
          : 'editor.scene.previewRendererLegacy',
        'en'
      ),
      exact: true,
    })
    .check();
  await panel.press('Escape');
  await expect(panel).toHaveCount(0);
}

async function changeMode(page: Page, mode: 'live' | 'cache') {
  await page.locator('[data-ui="video.preview.display-settings"]').click();
  const panel = page.locator('[data-ui="video.preview.display-settings.panel"]');
  await panel
    .getByRole('radio', {
      name: translate(
        mode === 'cache'
          ? 'videoEditor.stage.previewModeCache'
          : 'videoEditor.stage.previewModeLive',
        'en'
      ),
      exact: true,
    })
    .check();
  await panel.press('Escape');
  await expect(panel).toHaveCount(0);
}

function createCacheFixture(filename: string, size: number) {
  const project = createVideoProjectFromRecording({
    recordingId: 'beta-v1-recording',
    filename,
    width: 1904,
    height: 984,
    duration: 2,
    size,
    mimeType: 'video/mp4',
    hasAudio: false,
  });
  const clip = project.clips.find((candidate) => candidate.type === 'VIDEO');
  if (!clip) throw new Error('Native cache source fixture is unavailable');
  project.fps = 5;
  project.duration = 1;
  clip.duration = clip.sourceDuration = 1;
  clip.timelineLaneId = null;
  clip.transform = {
    ...clip.transform,
    x: 190,
    y: 98,
    width: project.width * 0.7,
    height: project.height * 0.7,
  };
  expect(isValidVideoProject(project)).toBe(true);
  // Six 1394×720 frames fit the existing 320 MiB cache and select the exact builder.
  expect((Math.round(project.duration * project.fps) + 1) * 1394 * 720 * 4).toBeLessThan(
    320 * 1024 * 1024
  );
  return { project, clip };
}

for (const viewport of PRIMARY_BROWSER_VIEWPORTS) {
  test(`Native exact cache build and hits retain GPU pixels, editing and clock ${viewport.name}`, async ({
    page,
  }, info) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ ...viewport.size });
    const host = await startHostServer();
    const errors: string[] = [];
    const materializerCopies: string[] = [];
    let probing = false;
    let stopClockProbe: (() => Promise<void>) | undefined;
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (probing && message.text() === 'sniptale-test:hidden-materializer-copy')
        materializerCopies.push(message.text());
    });
    await page.addInitScript(() => {
      const prototype = CanvasRenderingContext2D.prototype;
      prototype.drawImage = new Proxy(prototype.drawImage, {
        apply(target, context: CanvasRenderingContext2D, args: unknown[]) {
          // Test readbacks are detached; only the private production materializer counts.
          if (context.canvas.parentElement?.style.left === '-100000px')
            console.debug('sniptale-test:hidden-materializer-copy');
          return Reflect.apply(target, context, args);
        },
      });
    });
    try {
      const filename = 'review-avc-padded-color.mp4';
      const bytes = await readFile(new URL(`../fixtures/${filename}`, import.meta.url));
      const { project, clip } = createCacheFixture(filename, bytes.length);
      await applyHarnessBootstrap(page, {
        preserveMediaLibrary: true,
        videoProjects: [project],
        storage: {
          'sniptale-locale-preference': 'en',
          'sniptale-theme-preference': 'light',
          sniptale_video_editor_preview_preferences: {
            renderer: 'legacy',
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
      const gpu = page.locator('[data-preview-gpu-host] [data-preview-stage-canvas]');
      const legacy = page.locator('canvas[data-preview-stage-canvas]').filter({ visible: true });
      const ready = page.getByRole('status', {
        name: translate('videoEditor.stage.previewCacheReady', 'en'),
        exact: true,
      });
      const play = page.getByRole('button', {
        name: translate('videoEditor.timeline.play', 'en'),
        exact: true,
      });
      const references = [];
      for (const frame of [2, 3]) {
        await seekFrame(playhead, frame, project.fps);
        await selectPresentedFrame(page, legacy);
        const canvasPixels = await pixels(legacy);
        await changeRenderer(page, 'gpu');
        await selectPresentedFrame(page, gpu);
        const livePixels = await pixels(gpu);
        expect(pixelError(canvasPixels, livePixels)).toBeLessThanOrEqual(5);
        references.push({ frame, canvasPixels, livePixels });
        await changeRenderer(page, 'legacy');
      }
      await changeRenderer(page, 'gpu');
      await seekFrame(playhead, 0, project.fps);
      await selectPresentedFrame(page, gpu);
      const clockProbe = await playhead.evaluateHandle((node) => {
        const samples: number[] = [];
        const observed = { maximum: Number(node.getAttribute('aria-valuenow')), samples };
        const observer = new MutationObserver(() => {
          const time = Number(node.getAttribute('aria-valuenow'));
          if (!Number.isFinite(time)) return;
          observed.maximum = Math.max(observed.maximum, time);
          if (observed.samples.length < 32 && observed.samples.at(-1) !== time)
            observed.samples.push(time);
        });
        observer.observe(node, { attributes: true, attributeFilter: ['aria-valuenow'] });
        return { observed, observer };
      });
      stopClockProbe = async () => {
        await clockProbe.evaluate((probe) => probe.observer.disconnect());
        await clockProbe.dispose();
      };
      probing = true;
      await changeMode(page, 'cache');
      // The real Play admission prepares all exact frames before advancing the clock.
      await play.click();
      await expect(ready).toBeVisible({ timeout: 60_000 });
      // EOF returns to the session start. Record progress before Ready polling can miss this short clip.
      await expect
        .poll(() => clockProbe.evaluate((probe) => probe.observed.maximum))
        .toBeGreaterThanOrEqual(0.6);
      await expect(play).toBeVisible({ timeout: 10_000 });
      await expect.poll(async () => Number(await playhead.getAttribute('aria-valuenow'))).toBe(0);
      const observedClock = await clockProbe.evaluate((probe) => probe.observed);
      await stopClockProbe();
      stopClockProbe = undefined;
      const buildDraws = materializerCopies.length;
      expect(buildDraws).toBe(0);
      expect(await page.locator('[data-preview-stage-cached-video]').count()).toBe(0);
      const hits = [];
      for (const frame of [2, 3, 2]) {
        await seekFrame(playhead, frame, project.fps);
        await expect(ready).toBeVisible();
        await expect(gpu).toBeVisible();
        await selectPresentedFrame(page, gpu);
        expect(
          await gpu.evaluate((canvas: HTMLCanvasElement) => {
            try {
              return canvas.getContext('2d') === null;
            } catch (error) {
              if (error instanceof DOMException && error.name === 'InvalidStateError') return true;
              throw error;
            }
          })
        ).toBe(true);
        const reference = references.find((candidate) => candidate.frame === frame)!;
        const cachedPixels = await pixels(gpu);
        // Five channel LSB permit browser GPU conversion and raster scaling.
        expect(pixelError(reference.canvasPixels, cachedPixels)).toBeLessThanOrEqual(5);
        expect(pixelError(reference.livePixels, cachedPixels)).toBeLessThanOrEqual(5);
        hits.push({ frame, time: frame / project.fps, cachedPixels });
      }
      expect(materializerCopies).toEqual([]);
      await page.screenshot({ path: info.outputPath('native-cache-gpu-hit.png'), fullPage: false });
      const baseline = await savedProject(page);
      const baselinePixels = await pixels(gpu);
      const colors = baselinePixels.filter((_, index) => index % 4 !== 3);
      expect(Math.max(...colors) - Math.min(...colors)).toBeGreaterThan(100);
      await page
        .getByRole('button', {
          name: translate('videoEditor.sidebar.sceneProperties', 'en'),
          exact: true,
        })
        .click();
      await selectPresentedFrame(page, gpu);
      await expect(page.locator('[data-preview-selection-handle]')).toHaveCount(4);
      const magnet = page.getByRole('button', { name: 'Magnet', exact: true });
      if ((await magnet.getAttribute('aria-pressed')) === 'true') await magnet.click();
      const bounds = await gpu.boundingBox();
      if (!bounds) throw new Error('Native cache stage bounds are unavailable');
      const start = { x: bounds.x + bounds.width * 0.45, y: bounds.y + bounds.height * 0.45 };
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      await page.mouse.move(start.x + bounds.width * 0.08, start.y + bounds.height * 0.08, {
        steps: 5,
      });
      await page.mouse.up();
      const transform = async () =>
        (await savedProject(page)).clips.find((candidate) => candidate.id === clip.id)!.transform;
      // Pointer rounding permits one project pixel in the persisted translation.
      await expect
        .poll(async () => Math.abs((await transform()).x - clip.transform.x - project.width * 0.08))
        .toBeLessThanOrEqual(1);
      expect(
        Math.abs((await transform()).y - clip.transform.y - project.height * 0.08)
      ).toBeLessThanOrEqual(1);
      await selectPresentedFrame(page, gpu);
      await expect
        .poll(async () => pixelError(baselinePixels, await pixels(gpu)))
        .toBeGreaterThan(5);
      await page.screenshot({
        path: info.outputPath('native-cache-gpu-edited.png'),
        fullPage: false,
      });
      await page.locator('[data-ui="video-editor.timeline.toolbar.undo"]').click();
      await expect.poll(async () => (await savedProject(page)).clips).toEqual(baseline.clips);
      await selectPresentedFrame(page, gpu);
      await expect
        .poll(async () => pixelError(baselinePixels, await pixels(gpu)))
        .toBeLessThanOrEqual(1);
      await expect
        .poll(async () => Number(await playhead.getAttribute('aria-valuenow')))
        .toBeCloseTo(0.4, 6);
      await page.screenshot({
        path: info.outputPath('native-cache-gpu-restored.png'),
        fullPage: false,
      });
      const proofPath = info.outputPath('native-cache-gpu-proof.json');
      await writeFile(
        proofPath,
        JSON.stringify(
          {
            viewport: viewport.size,
            references,
            hits,
            buildDraws,
            hiddenMaterializerDraws: materializerCopies.length,
            observedClock,
            restoredError: pixelError(baselinePixels, await pixels(gpu)),
          },
          null,
          2
        )
      );
      await info.attach('native-cache-gpu-proof.json', {
        path: proofPath,
        contentType: 'application/json',
      });
      expect(materializerCopies).toEqual([]);
      expect(errors).toEqual([]);
    } finally {
      probing = false;
      if (stopClockProbe) await stopClockProbe().catch(() => {});
      await page.mouse.up().catch(() => {});
      host.server.closeAllConnections();
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}
