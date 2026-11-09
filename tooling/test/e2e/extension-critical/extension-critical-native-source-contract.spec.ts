import { createVideoProjectFromMultiSourceRecording } from '../../../../apps/extension/src/features/video/project/factories/multi-source-recording';
import { hydrateVideoProject } from '../../../../apps/extension/src/features/video/project/hydration';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { expect, test, type Locator } from '@playwright/test';
import { createVideoProjectFromRecording } from '../../../../apps/extension/src/features/video/project/factories/creation';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { enableGpuPreviewProof, installCameraFrameObserver } from '../support/gpu-preview-proof';
import { startHostServer } from '../support/host-server';
import { readNativeVideoProject } from '../support/native-video-project';
import { seedReviewVideo, seedReviewWebcamBundle } from '../support/quick-editor-media-fixture';
import {
  applyHarnessBootstrap,
  GALLERY_HARNESS_PATH,
  VIDEO_EDITOR_HARNESS_PATH,
} from '../extension-critical.helpers';

enableGpuPreviewProof();

async function sourcePixels(front: Locator) {
  return front.evaluate((canvas: HTMLCanvasElement) => {
    const copy = document.createElement('canvas');
    copy.width = canvas.width;
    copy.height = canvas.height;
    try {
      const context = copy.getContext('2d');
      if (!context) throw new Error('Native source readback is unavailable.');
      context.drawImage(canvas, 0, 0);
      return {
        raster: { width: canvas.width, height: canvas.height },
        colors: [0.35, 0.5, 0.65].map((x) =>
          [
            ...context.getImageData(
              Math.floor(x * canvas.width),
              Math.floor(canvas.height / 2),
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
}

function referencePixels(time: number) {
  const bytes = execFileSync(
    '/usr/bin/ffmpeg',
    [
      '-v',
      'error',
      '-ss',
      String(time),
      '-i',
      fileURLToPath(new URL('../fixtures/review-cut-vfr.webm', import.meta.url)),
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
  return [0.35, 0.5, 0.65].map((x) => {
    const offset = (45 * 160 + Math.floor(x * 160)) * 4;
    return [...bytes.subarray(offset, offset + 3)];
  });
}

function colorError(expected: number[][], actual: number[][]) {
  expect(actual).toHaveLength(expected.length);
  return Math.max(
    ...expected.flatMap((color, index) =>
      color.map((channel, c) => Math.abs(channel - actual[index]![c]!))
    )
  );
}

test('Native unsupported source preserves VFR identity and color in GPU and Standard', async ({
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
  try {
    const filename = 'review-cut-vfr.webm';
    const bytes = await readFile(new URL(`../fixtures/${filename}`, import.meta.url));
    const project = createVideoProjectFromRecording({
      recordingId: 'beta-v1-recording',
      filename,
      width: 160,
      height: 90,
      duration: 6,
      size: bytes.length,
      mimeType: 'video/webm',
      hasAudio: false,
    });
    project.width = 1280;
    project.height = 720;
    project.clips = project.clips.map((clip) => ({
      ...clip,
      transform: { ...clip.transform, x: 0, y: 0, width: 1280, height: 720 },
    }));
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
    await seedReviewVideo(page, filename, { width: 160, height: 90, duration: 6 });
    await page.goto(`${host.origin}${VIDEO_EDITOR_HARNESS_PATH}?project=${project.id}&theme=light`);
    await expect(page.locator('[data-ui="video-editor.timeline.surface"]')).toBeVisible();
    const before = await readNativeVideoProject(page);
    const playhead = page.locator('[data-ui="video-editor.timeline.playhead-handle"]');
    const gpu = page.locator('[data-preview-gpu-host] [data-preview-stage-canvas]');
    const samples = [];
    for (const [frame, pts] of [
      [31, 0.9],
      [37, 1.2],
    ] as const) {
      await playhead.focus();
      await playhead.press('Home');
      for (let index = 0; index < frame; index++) await playhead.press('ArrowRight');
      await expect
        .poll(async () => Number(await playhead.getAttribute('aria-valuenow')))
        .toBeCloseTo(frame / project.fps, 6);
      await expect(gpu).toBeVisible();
      await expect
        .poll(() =>
          gpu.evaluate((canvas) => {
            const read: unknown = Reflect.get(window, 'sniptaleCurrentInspectorFrame');
            if (typeof read !== 'function')
              throw new Error('GPU frame identity evidence is unavailable.');
            const value: unknown = read(canvas);
            if (value !== null && typeof value !== 'number')
              throw new Error('Invalid GPU frame timestamp.');
            return value;
          })
        )
        .toBe(pts * 1e6);
      const reference = referencePixels(pts);
      await expect
        .poll(async () => colorError(reference, (await sourcePixels(gpu)).colors))
        .toBeLessThan(4);
      samples.push({
        request: frame / project.fps,
        expectedPTS: pts,
        reference,
        actual: await sourcePixels(gpu),
      });
    }
    const acceptedTime = await playhead.getAttribute('aria-valuenow');
    await page.locator('[data-ui="video.preview.display-settings"]').click();
    const panel = page.locator('[data-ui="video.preview.display-settings.panel"]');
    await panel
      .getByRole('radio', {
        name: translate('editor.scene.previewRendererLegacy', 'en'),
        exact: true,
      })
      .check();
    await panel.press('Escape');
    await expect(gpu).toHaveCount(0);
    const standard = page.locator('canvas[data-preview-stage-canvas]').filter({ visible: true });
    const standardReference = referencePixels(1.2);
    await expect
      .poll(async () => colorError(standardReference, (await sourcePixels(standard)).colors))
      .toBeLessThan(4);
    expect(await playhead.getAttribute('aria-valuenow')).toBe(acceptedTime);
    const after = await readNativeVideoProject(page);
    expect(after?.clips).toEqual(before?.clips);
    expect(after?.assets).toEqual(before?.assets);
    expect(errors).toEqual([]);
    await writeFile(
      info.outputPath('native-source-contract.json'),
      JSON.stringify(
        {
          viewport: page.viewportSize(),
          sourceRaster: { width: 160, height: 90 },
          sourceSHA256: createHash('sha256').update(bytes).digest('hex'),
          samples,
          standard: await sourcePixels(standard),
          acceptedTime,
          errors,
          limitation:
            'Forced upfront configuration refusal. This proves the native sampling adapter, not a genuinely unsupported codec or FPS acceptance.',
        },
        null,
        2
      )
    );
    await page.screenshot({ path: info.outputPath('native-source-contract.png'), fullPage: false });
  } finally {
    await new Promise<void>((resolve, reject) =>
      host.server.close((error) => (error ? reject(error) : resolve()))
    );
  }
});

for (const declined of [false, true]) {
  test(`Native cold camera retained keyframe ${declined ? 'declined' : 'canonical'} source`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width: 1920, height: 900 });
    await page.addInitScript(installCameraFrameObserver);
    if (declined)
      await page.addInitScript(() => {
        VideoDecoder.isConfigSupported = async (config) => ({ supported: false, config });
      });
    const host = await startHostServer();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const label = (key: Parameters<typeof translate>[0]) => translate(key, 'en');
    try {
      const [screenBytes, cameraBytes] = await Promise.all([
        readFile(new URL('../fixtures/review-vp8-opus.webm', import.meta.url)),
        readFile(new URL('../fixtures/review-cut-vfr.webm', import.meta.url)),
      ]);
      const project = createVideoProjectFromMultiSourceRecording({
        name: 'Cold retained camera',
        videos: [
          {
            recordingId: 'beta-v1-recording',
            filename: 'Screen.webm',
            width: 160,
            height: 90,
            duration: 12,
            size: screenBytes.length,
            mimeType: 'video/webm',
          },
        ],
        webcamVideo: {
          recordingId: 'webcam-clock',
          filename: 'Camera.webm',
          width: 160,
          height: 90,
          duration: 6,
          size: cameraBytes.length,
          mimeType: 'video/webm',
        },
      });
      project.fps = 10;
      const cameraTrack = project.tracks.find((track) => track.role === 'CAMERA');
      const camera = project.clips.find(
        (clip) => clip.type === 'VIDEO' && clip.trackId === cameraTrack?.id
      );
      if (!camera || camera.type !== 'VIDEO') throw new Error('Camera fixture is unavailable.');
      camera.duration = camera.sourceDuration = 2.1;
      camera.cameraPositions = [];
      Object.assign(project, hydrateVideoProject(project));
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
      await seedReviewWebcamBundle(page, 'review-cut-vfr.webm');
      await page.goto(
        `${host.origin}${VIDEO_EDITOR_HARNESS_PATH}?project=${project.id}&theme=light`
      );
      await expect(page.locator('[data-ui="video-editor.timeline.surface"]')).toBeVisible();
      const clock = page.locator('[data-ui="video-editor.timeline.playhead-handle"]');
      // Open the inspector after seeking beyond the camera. Its private provider has no prior frame.
      await clock.focus();
      await clock.press('Home');
      for (let index = 0; index < 30; index++) await clock.press('ArrowRight');
      await expect.poll(async () => Number(await clock.getAttribute('aria-valuenow'))).toBe(3);
      await page
        .getByRole('button', { name: label('videoEditor.sidebar.sceneProperties'), exact: true })
        .click();
      await page
        .locator(`[data-project-timeline-clip="${camera.id}"]`)
        .click({ modifiers: ['Control'] });
      await page
        .getByRole('button', {
          name: label('videoEditor.sidebar.inspectorGroupStyle'),
          exact: true,
        })
        .click();
      const owner = page.locator('[data-ui="video-editor.camera-appearance"]');
      const summary = owner
        .locator('summary')
        .filter({ hasText: label('videoEditor.sidebar.cameraCropSection') });
      if ((await summary.locator('..').getAttribute('open')) === null) await summary.click();
      await expect(clock).toHaveAttribute('aria-valuenow', '3');
      const gpu = owner.locator(
        '[data-ui="video-editor.camera-crop.gpu-host"] [data-preview-inspector-canvas]'
      );
      await expect(gpu).toBeVisible();
      await expect
        .poll(() =>
          gpu.evaluate((canvas) => {
            const read: unknown = Reflect.get(window, 'sniptaleCurrentInspectorFrame');
            if (typeof read !== 'function')
              throw new Error('Camera GPU PTS evidence is unavailable.');
            const value: unknown = read(canvas);
            if (value !== null && typeof value !== 'number') throw new Error('Invalid camera PTS.');
            return value;
          })
        )
        .toBe(1_800_000);
      const reference = referencePixels(1.8);
      await expect
        .poll(async () => colorError(reference, (await sourcePixels(gpu)).colors))
        .toBeLessThan(4);
      const before = await sourcePixels(gpu);
      const initial = await readNativeVideoProject(page);
      await page.locator('[data-ui="video.preview.display-settings"]').click();
      const panel = page.locator('[data-ui="video.preview.display-settings.panel"]');
      await panel
        .getByRole('radio', { name: label('editor.scene.previewRendererLegacy'), exact: true })
        .check();
      await panel.press('Escape');
      await expect(gpu).toHaveCount(0);
      const standard = owner.locator('[data-ui="video-editor.camera-crop"] button > canvas');
      await expect
        .poll(async () => colorError(reference, (await sourcePixels(standard)).colors))
        .toBeLessThan(4);
      expect(await clock.getAttribute('aria-valuenow')).toBe('3');
      const final = await readNativeVideoProject(page);
      expect(final?.clips).toEqual(initial?.clips);
      expect(final?.assets).toEqual(initial?.assets);
      expect(errors).toEqual([]);
      await writeFile(
        info.outputPath('cold-camera-source.json'),
        JSON.stringify(
          {
            viewport: page.viewportSize(),
            sourceRaster: { width: 160, height: 90 },
            declined,
            retainedEnd: 2.1,
            expectedPTS: 1.8,
            reference,
            gpu: before,
            standard: await sourcePixels(standard),
            mainTime: 3,
            errors,
          },
          null,
          2
        )
      );
      await owner.scrollIntoViewIfNeeded();
      await page.screenshot({ path: info.outputPath('cold-camera-source.png'), fullPage: false });
    } finally {
      await new Promise<void>((resolve, reject) =>
        host.server.close((error) => (error ? reject(error) : resolve()))
      );
    }
  });
}
