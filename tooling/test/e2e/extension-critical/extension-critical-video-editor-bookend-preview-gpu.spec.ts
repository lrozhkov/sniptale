import { readFile } from 'node:fs/promises';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { createVideoProjectFromRecording } from '../../../../apps/extension/src/features/video/project/factories/creation';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { enableGpuPreviewProof } from '../support/gpu-preview-proof';
import { chooseInspectorValue } from '../support/inspector-utilities';
import { readNativeVideoProject } from '../support/native-video-project';
import { seedReviewVideo } from '../support/quick-editor-media-fixture';
import { startHostServer } from '../support/host-server';
import {
  applyHarnessBootstrap,
  GALLERY_HARNESS_PATH,
  VIDEO_EDITOR_HARNESS_PATH,
} from '../extension-critical.helpers';

enableGpuPreviewProof();

async function savedProject(page: Page) {
  const project = await readNativeVideoProject(page);
  if (!project) throw new Error('Bookend project was not persisted');
  return project;
}

async function previewPixels(front: Locator) {
  return front.evaluate((canvas: HTMLCanvasElement) => {
    const readback = document.createElement('canvas');
    readback.width = readback.height = 32;
    try {
      const context = readback.getContext('2d');
      if (!context) throw new Error('Bookend pixel readback is unavailable');
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
    before.reduce((sum, channel, index) => sum + Math.abs(channel - after[index]!), 0) /
    before.length
  );
}

for (const viewport of PRIMARY_BROWSER_VIEWPORTS) {
  test(`Native bookend GPU image and private video preview ${viewport.name}`, async ({
    page,
  }, info) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ ...viewport.size });
    const host = await startHostServer();
    const label = (key: Parameters<typeof translate>[0]) => translate(key, 'en');
    const intro = page.locator('[data-ui="video-editor.scene-bookends.intro"]');
    const preset = intro.locator('[data-ui="video-editor.scene-bookends.preset"]');
    const mini = preset.locator('[data-ui="video-editor.scene-bookends.preview"]');
    const front = mini.locator(
      '[data-ui="video-editor.scene-bookends.preview.gpu-host"] [data-preview-inspector-canvas]'
    );
    const mainVideos = page.locator('[data-ui="video.preview.stage.root"] video');
    const mainTransport = () =>
      mainVideos.evaluateAll((videos: HTMLVideoElement[]) =>
        videos.map((video) => ({
          time: video.currentTime,
          paused: video.paused,
          rate: video.playbackRate,
          seeking: video.seeking,
          source: video.currentSrc,
        }))
      );
    const choose = (key: Parameters<typeof translate>[0], value: Parameters<typeof translate>[0]) =>
      chooseInspectorValue(page, preset, label(key), label(value));
    try {
      const bytes = await readFile(new URL('../fixtures/review-vp8-opus.webm', import.meta.url));
      const project = createVideoProjectFromRecording({
        recordingId: 'beta-v1-recording',
        filename: 'Source.webm',
        width: 160,
        height: 90,
        duration: 12,
        size: bytes.length,
        mimeType: 'video/webm',
        hasAudio: true,
      });
      const sourceAsset = project.assets.find((asset) => asset.type === 'RECORDING');
      if (!sourceAsset) throw new Error('Bookend recording fixture is unavailable');
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
      await seedReviewVideo(page, 'review-vp8-opus.webm', { width: 160, height: 90, duration: 12 });
      await page.goto(
        `${host.origin}${VIDEO_EDITOR_HARNESS_PATH}?project=${project.id}&theme=light`
      );
      await expect(page.locator('[data-ui="video-editor.timeline.surface"]')).toBeVisible();
      await expect(mainVideos).toHaveCount(1);
      await expect
        .poll(() =>
          mainVideos.evaluate(
            (video: HTMLVideoElement) => video.readyState >= 2 && !video.seeking && video.paused
          )
        )
        .toBe(true);
      const pinned = await mainTransport();
      const png = await page.evaluate(() => {
        const canvas = document.createElement('canvas');
        canvas.width = 641;
        canvas.height = 201;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Bookend image fixture is unavailable');
        context.fillStyle = '#ff0000';
        context.fillRect(0, 0, 321, 201);
        context.fillStyle = '#00ffff';
        context.fillRect(321, 0, 320, 201);
        return canvas.toDataURL('image/png').split(',')[1]!;
      });
      const imageName = 'Two-tone bookend.png';
      await page
        .locator('[data-ui="video-editor.materials"] input[type="file"][accept*="image/"]')
        .setInputFiles({
          name: imageName,
          mimeType: 'image/png',
          buffer: Buffer.from(png, 'base64'),
        });
      await expect
        .poll(async () =>
          (await savedProject(page)).assets.some(
            (asset) => asset.type === 'IMAGE' && asset.name === imageName
          )
        )
        .toBe(true);
      const imageAsset = (await savedProject(page)).assets.find(
        (asset) => asset.type === 'IMAGE' && asset.name === imageName
      );
      if (!imageAsset) throw new Error('Bookend image import was not persisted');
      await page
        .getByRole('button', { name: label('videoEditor.sidebar.sceneProperties'), exact: true })
        .click();
      await page
        .getByRole('button', { name: label('videoEditor.sidebar.sceneEdges'), exact: true })
        .click();
      await intro
        .getByRole('button', { name: label('videoEditor.sidebar.bookendPreset'), exact: true })
        .click();
      await choose('videoEditor.sidebar.bookendPreset', 'gallery.videoReview.presentationImage');
      await preset
        .getByRole('button', { name: label('videoEditor.sidebar.bookendChooseImage'), exact: true })
        .click();
      await page
        .getByRole('menu', { name: label('videoEditor.sidebar.bookendChooseImage'), exact: true })
        .getByRole('menuitem', { name: imageName, exact: true })
        .click();
      await expect
        .poll(async () => (await savedProject(page)).bookendPresets?.intro.image?.assetId)
        .toBe(imageAsset.id);
      await expect(mini).toHaveAttribute('aria-busy', 'false');
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
      await expect(front).toHaveCSS('opacity', '1');
      await expect
        .poll(async () => {
          const pixels = await previewPixels(front);
          const left = (16 * 32 + 8) * 4,
            right = (16 * 32 + 24) * 4;
          // Endpoint colors permit 15 LSB for color conversion while rejecting a flat fill.
          return (
            pixels[left]! > 240 &&
            pixels[left + 1]! < 15 &&
            pixels[right]! < 15 &&
            pixels[right + 1]! > 240 &&
            pixels[right + 2]! > 240
          );
        })
        .toBe(true);
      const containPixels = await previewPixels(front);
      expect(
        Math.min(...containPixels.filter((_, index) => index % 4 === 3))
      ).toBeGreaterThanOrEqual(254);
      const framing = preset
        .locator('summary')
        .filter({ hasText: label('gallery.videoReview.presentationFraming') });
      if ((await framing.locator('..').getAttribute('open')) === null) await framing.click();
      await choose('gallery.videoReview.presentationFit', 'gallery.videoReview.presentationCover');
      await expect
        .poll(async () => (await savedProject(page)).bookendPresets?.intro.image?.fit)
        .toBe('cover');
      await expect
        .poll(async () => pixelError(containPixels, await previewPixels(front)))
        .toBeGreaterThan(4);
      const baselinePixels = await previewPixels(front);
      const baseline = await savedProject(page);
      const pan = preset.getByRole('textbox', {
        name: label('gallery.videoReview.presentationPanX'),
        exact: true,
      });
      const slider = preset.getByRole('slider', {
        name: `${label('gallery.videoReview.presentationPanX')} range`,
        exact: true,
      });
      const startPan = async () => {
        await pan.scrollIntoViewIfNeeded();
        await pan.hover();
        const box = (await slider.boundingBox())!;
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width * 0.8, box.y + box.height / 2, { steps: 4 });
      };
      await startPan();
      await expect
        .poll(async () => pixelError(baselinePixels, await previewPixels(front)))
        .toBeGreaterThan(4);
      expect(await savedProject(page)).toEqual(baseline);
      expect(await mainTransport()).toEqual(pinned);
      await page.keyboard.press('Escape');
      await page.mouse.up();
      // The same immutable PNG and framing should agree within one mean channel LSB.
      await expect
        .poll(async () => pixelError(baselinePixels, await previewPixels(front)))
        .toBeLessThanOrEqual(1);
      expect(await savedProject(page)).toEqual(baseline);
      await startPan();
      await expect
        .poll(async () => pixelError(baselinePixels, await previewPixels(front)))
        .toBeGreaterThan(4);
      await page.mouse.up();
      await expect
        .poll(async () => (await savedProject(page)).bookendPresets?.intro.image?.crop.panX)
        .toBeGreaterThan(0.1);
      await page.locator('[data-ui="video-editor.timeline.toolbar.undo"]').click();
      await expect
        .poll(async () => (await savedProject(page)).bookendPresets)
        .toEqual(baseline.bookendPresets);
      await expect
        .poll(async () => pixelError(baselinePixels, await previewPixels(front)))
        .toBeLessThanOrEqual(1);
      expect(await mainTransport()).toEqual(pinned);
      await mini.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: info.outputPath('bookend-image-gpu-restored.png'),
        fullPage: false,
      });
      await choose('videoEditor.sidebar.bookendPreset', 'gallery.videoReview.presentationVideo');
      await preset
        .getByRole('button', { name: label('videoEditor.sidebar.bookendChooseVideo'), exact: true })
        .click();
      await page
        .getByRole('menu', { name: label('videoEditor.sidebar.bookendChooseVideo'), exact: true })
        .getByRole('menuitem', { name: sourceAsset.name, exact: true })
        .click();
      await expect
        .poll(async () => (await savedProject(page)).bookendPresets?.intro.video?.assetId)
        .toBe(sourceAsset.id);
      const trim = preset
        .locator('summary')
        .filter({ hasText: label('gallery.videoReview.presentationTrim') });
      if ((await trim.locator('..').getAttribute('open')) === null) await trim.click();
      const trimStart = preset.getByRole('textbox', {
        name: label('gallery.videoReview.presentationTrimStart'),
        exact: true,
      });
      await trimStart.fill('1.137');
      await trimStart.press('Enter');
      await expect
        .poll(async () => (await savedProject(page)).bookendPresets?.intro.video?.trim.start)
        .toBe(1.137);
      const privateVideo = mini.locator('video');
      await expect
        .poll(() =>
          privateVideo.evaluate(
            (video: HTMLVideoElement) =>
              video.readyState >= 2 &&
              !video.seeking &&
              video.paused &&
              video.muted &&
              Math.abs(video.currentTime - 1.137) < 0.001
          )
        )
        .toBe(true);
      await expect(mini).toHaveAttribute('aria-busy', 'false');
      await expect(front).toHaveCount(1);
      const backing = await front.evaluate((canvas: HTMLCanvasElement) => ({
        width: canvas.width,
        height: canvas.height,
      }));
      const decodedVideoPixels = await privateVideo.evaluate((video: HTMLVideoElement, size) => {
        const fitted = document.createElement('canvas');
        const sample = document.createElement('canvas');
        fitted.width = size.width;
        fitted.height = size.height;
        sample.width = sample.height = 32;
        try {
          const full = fitted.getContext('2d'),
            context = sample.getContext('2d');
          if (!full || !context) throw new Error('Private bookend video readback is unavailable');
          full.drawImage(video, 0, 0, size.width, size.height);
          context.drawImage(fitted, 0, 0, 32, 32);
          return [...context.getImageData(0, 0, 32, 32).data];
        } finally {
          sample.width = sample.height = fitted.width = fitted.height = 0;
        }
      }, backing);
      const sourceFacts = await privateVideo.evaluate((video: HTMLVideoElement) => {
        const frame = new VideoFrame(video);
        const sample = document.createElement('canvas');
        sample.width = sample.height = 32;
        try {
          const context = sample.getContext('2d');
          if (!context) throw new Error('Video frame reference is unavailable');
          context.drawImage(frame, 0, 0, 32, 32);
          return {
            timestamp: frame.timestamp,
            format: frame.format,
            color: frame.colorSpace.toJSON(),
            width: frame.displayWidth,
            height: frame.displayHeight,
            pixels: [...context.getImageData(0, 0, 32, 32).data],
          };
        } finally {
          frame.close();
          sample.width = sample.height = 0;
        }
      });
      await info.attach('bookend-video-pixel-comparison.json', {
        body: Buffer.from(
          JSON.stringify({
            backing,
            sourceFacts,
            reference: decodedVideoPixels,
            gpu: await previewPixels(front),
          })
        ),
        contentType: 'application/json',
      });
      // Match both scaling stages before comparing decoder/GPU color conversion.
      await expect
        .poll(async () => pixelError(decodedVideoPixels, await previewPixels(front)))
        .toBeLessThan(5);
      await expect
        .poll(async () => {
          const pixels = await previewPixels(front);
          return (
            Math.max(...pixels.filter((_, index) => index % 4 !== 3)) -
            Math.min(...pixels.filter((_, index) => index % 4 !== 3))
          );
        })
        .toBeGreaterThan(20);
      expect(await mainTransport()).toEqual(pinned);
      expect((await savedProject(page)).clips).toEqual(baseline.clips);
      await mini.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: info.outputPath('bookend-video-gpu-trim.png'),
        fullPage: false,
      });
    } finally {
      await page.mouse.up().catch(() => {});
      await new Promise<void>((resolve, reject) =>
        host.server.close((error) => (error ? reject(error) : resolve()))
      );
    }
  });
}
