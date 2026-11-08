import { readFile, writeFile } from 'node:fs/promises';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { createVideoProjectFromRecording } from '../../../../apps/extension/src/features/video/project/factories/creation';
import { isValidVideoProject } from '../../../../apps/extension/src/features/video/project/validation';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { enableGpuPreviewProof } from '../support/gpu-preview-proof';
import { startHostServer } from '../support/host-server';
import { seedReviewVideo } from '../support/quick-editor-media-fixture';
import {
  applyHarnessBootstrap,
  GALLERY_HARNESS_PATH,
  VIDEO_EDITOR_HARNESS_PATH,
} from '../extension-critical.helpers';

enableGpuPreviewProof();

const CACHE_PROOF_FPS = 4;

async function pixels(surface: Locator) {
  return surface.evaluate((source: HTMLCanvasElement | HTMLVideoElement) => {
    const sample = document.createElement('canvas');
    sample.width = sample.height = 32;
    try {
      const context = sample.getContext('2d');
      if (!context) throw new Error('Persistent cache pixel readback is unavailable');
      context.drawImage(source, 0, 0, 32, 32);
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

async function seekFrame(playhead: Locator, frame: number) {
  await playhead.focus();
  await playhead.press('Home');
  for (let index = 0; index < frame; index++) await playhead.press('ArrowRight');
  await expect
    .poll(async () => Number(await playhead.getAttribute('aria-valuenow')))
    .toBeCloseTo(frame / CACHE_PROOF_FPS, 6);
}

async function selectPresentedFrame(page: Page, front: Locator) {
  await expect(async () => {
    const box = await front.boundingBox();
    if (!box) throw new Error('Persistent cache live frame bounds are unavailable');
    await page.mouse.click(box.x + box.width * 0.45, box.y + box.height * 0.4);
    await expect(page.locator('[data-preview-selection-state="editable"]')).toBeVisible({
      timeout: 500,
    });
  }).toPass({ timeout: 10_000 });
}

for (const viewport of PRIMARY_BROWSER_VIEWPORTS) {
  test(`Native persistent cache encodes GPU pixels and seeks decoded video ${viewport.name}`, async ({
    page,
  }, info) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ ...viewport.size });
    const host = await startHostServer();
    const errors: string[] = [];
    const materializerCopies: string[] = [];
    let probing = false;
    let stopProbe: (() => Promise<void>) | undefined;
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (probing && message.text() === 'sniptale-test:hidden-materializer-copy')
        materializerCopies.push(message.text());
    });
    await page.addInitScript(() => {
      const prototype = CanvasRenderingContext2D.prototype;
      prototype.drawImage = new Proxy(prototype.drawImage, {
        apply(target, context: CanvasRenderingContext2D, args: unknown[]) {
          // Detached test readbacks do not belong to the private materializer.
          if (context.canvas.parentElement?.style.left === '-100000px')
            console.debug('sniptale-test:hidden-materializer-copy');
          return Reflect.apply(target, context, args);
        },
      });
    });
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
      const clip = project.clips.find((candidate) => candidate.type === 'VIDEO');
      if (!clip) throw new Error('Persistent cache source fixture is unavailable');
      project.fps = CACHE_PROOF_FPS;
      project.duration = 1;
      clip.duration = clip.sourceDuration = 0.5;
      clip.timelineLaneId = null;
      clip.transform = { ...clip.transform, x: 190, y: 98, width: 1047, height: 689 };
      // Distinct half-second compositions detect a stale decoded frame after seeking.
      project.clips.push({
        ...clip,
        id: `${clip.id}-second`,
        startTime: 0.5,
        transform: { ...clip.transform, x: 570 },
      });
      expect(isValidVideoProject(project)).toBe(true);
      // Five frames keep this a correctness check; the full 2090×1080 raster selects persistence.
      expect(2090 * 1080).toBeGreaterThan(1920 * 1080);
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
            rasterPreset: '1080p',
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
      const video = page.locator('video[data-preview-stage-cached-video]');
      const play = page.getByRole('button', {
        name: translate('videoEditor.timeline.play', 'en'),
        exact: true,
      });
      const ready = page.getByRole('status', {
        name: translate('videoEditor.stage.previewCacheReady', 'en'),
        exact: true,
      });
      const references = [];
      for (const frame of [1, 3]) {
        await seekFrame(playhead, frame);
        await selectPresentedFrame(page, gpu);
        references.push({ frame, pixels: await pixels(gpu) });
      }
      expect(pixelError(references[0]!.pixels, references[1]!.pixels)).toBeGreaterThan(10);
      await seekFrame(playhead, 0);
      await selectPresentedFrame(page, gpu);
      const probe = await playhead.evaluateHandle((node) => {
        const observed = { maximumClock: 0, maximumVideo: 0, decodedEvents: 0 };
        const observer = new MutationObserver(() => {
          observed.maximumClock = Math.max(
            observed.maximumClock,
            Number(node.getAttribute('aria-valuenow'))
          );
        });
        observer.observe(node, { attributes: true, attributeFilter: ['aria-valuenow'] });
        const onVideo = (event: Event) => {
          const target = event.target;
          if (
            !(target instanceof HTMLVideoElement) ||
            !target.hasAttribute('data-preview-stage-cached-video')
          )
            return;
          if (target.readyState >= 2 && !target.paused) {
            observed.maximumVideo = Math.max(observed.maximumVideo, target.currentTime);
            observed.decodedEvents++;
          }
        };
        document.addEventListener('timeupdate', onVideo, true);
        return { observed, observer, onVideo };
      });
      stopProbe = async () => {
        await probe.evaluate((value) => {
          value.observer.disconnect();
          document.removeEventListener('timeupdate', value.onVideo, true);
        });
        await probe.dispose();
      };
      probing = true;
      await page.locator('[data-ui="video.preview.display-settings"]').click();
      const panel = page.locator('[data-ui="video.preview.display-settings.panel"]');
      await panel
        .getByRole('radio', {
          name: translate('videoEditor.stage.previewModeCache', 'en'),
          exact: true,
        })
        .check();
      await panel.press('Escape');
      await expect(panel).toHaveCount(0);
      await play.click();
      await expect(ready).toBeVisible({ timeout: 60_000 });
      // Observe before Play: Ready polling can finish after this short clip reaches EOF.
      await expect
        .poll(() => probe.evaluate((value) => value.observed.maximumClock))
        .toBeGreaterThanOrEqual(0.6);
      await expect
        .poll(() => probe.evaluate((value) => value.observed.maximumVideo))
        .toBeGreaterThanOrEqual(0.5);
      await expect(play).toBeVisible({ timeout: 10_000 });
      await expect.poll(async () => Number(await playhead.getAttribute('aria-valuenow'))).toBe(0);
      const playback = await probe.evaluate((value) => value.observed);
      await stopProbe();
      stopProbe = undefined;
      const hits = [];
      for (const frame of [3, 1, 3]) {
        await seekFrame(playhead, frame);
        await expect(video).toBeVisible();
        await expect
          .poll(() =>
            video.evaluate((element: HTMLVideoElement) => ({
              ready: element.readyState >= 2,
              seeking: element.seeking,
              time: element.currentTime,
              width: element.videoWidth,
              height: element.videoHeight,
            }))
          )
          .toEqual({
            ready: true,
            seeking: false,
            time: frame / CACHE_PROOF_FPS,
            width: 2090,
            height: 1080,
          });
        const reference = references.find((candidate) => candidate.frame === frame)!;
        // Eight channel LSB allow AVC chroma subsampling, quantization and browser conversion.
        await expect
          .poll(async () => pixelError(reference.pixels, await pixels(video)))
          .toBeLessThanOrEqual(8);
        const decodedPixels = await pixels(video);
        const colors = decodedPixels.filter((_, index) => index % 4 !== 3);
        expect(Math.max(...colors) - Math.min(...colors)).toBeGreaterThan(100);
        hits.push({
          frame,
          time: frame / CACHE_PROOF_FPS,
          decodedPixels,
          error: pixelError(reference.pixels, decodedPixels),
        });
      }
      await page.screenshot({
        path: info.outputPath('native-persistent-cache-gpu.png'),
        fullPage: false,
      });
      const proofPath = info.outputPath('native-persistent-cache-gpu-proof.json');
      await writeFile(
        proofPath,
        JSON.stringify(
          {
            viewport: viewport.size,
            raster: { width: 2090, height: 1080 },
            compressionTolerance: 8,
            references,
            hits,
            playback,
            hiddenMaterializerDraws: materializerCopies.length,
          },
          null,
          2
        )
      );
      await info.attach('native-persistent-cache-gpu-proof.json', {
        path: proofPath,
        contentType: 'application/json',
      });
      expect(materializerCopies).toEqual([]);
      expect(errors).toEqual([]);
    } finally {
      probing = false;
      if (stopProbe) await stopProbe().catch(() => {});
      host.server.closeAllConnections();
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}
