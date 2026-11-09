import { expect, test, type Locator, type Page } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { hydrateVideoProject } from '../../../../apps/extension/src/features/video/project/hydration';
import { createVideoProjectFromMultiSourceRecording } from '../../../../apps/extension/src/features/video/project/factories/multi-source-recording';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import {
  seedReviewWebcamBundle,
  seedReviewVideo,
  addReviewFocus,
  persistedFocus,
} from '../support/quick-editor-media-fixture';
import { readWebcamWorkspace } from '../support/quick-editor-webcam-proof';
import { startHostServer } from '../support/host-server';
import {
  applyHarnessBootstrap,
  GALLERY_HARNESS_PATH,
  VIDEO_EDITOR_HARNESS_PATH,
} from '../extension-critical.helpers';

// These cases prove the Canvas recovery path, independently of the GPU completion proof.
test.use({
  launchOptions: {
    args:
      process.platform === 'linux'
        ? [
            '--enable-unsafe-webgpu',
            '--use-angle=swiftshader',
            '--use-vulkan=swiftshader',
            '--enable-features=Vulkan',
            '--disable-vulkan-surface',
          ]
        : [],
  },
});

async function operate(control: Locator) {
  await control.scrollIntoViewIfNeeded();
  await control.click();
}

async function sourceColors(canvas: Locator, frame = { x: 0, y: 0, width: 1, height: 1 }) {
  return canvas.evaluate((node: HTMLCanvasElement, frame) => {
    const copy = document.createElement('canvas');
    copy.width = node.width;
    copy.height = node.height;
    try {
      const context = copy.getContext('2d');
      if (!context) throw new Error('Camera source color readback is unavailable.');
      context.drawImage(node, 0, 0);
      // These source interiors stay flat in the fixture frames at0s and0.9s.
      const points = [
        { x: 20 / 160, y: 70 / 90 },
        { x: 70 / 160, y: 80 / 90 },
        { x: 145 / 160, y: 65 / 90 },
      ];
      return {
        raster: { width: node.width, height: node.height },
        colors: points.map((point) =>
          [
            ...context.getImageData(
              Math.floor((frame.x + point.x * frame.width) * node.width),
              Math.floor((frame.y + point.y * frame.height) * node.height),
              1,
              1
            ).data,
          ].slice(0, 3)
        ),
      };
    } finally {
      copy.width = copy.height = 0;
    }
  }, frame);
}

function sourceColorError(a: number[][], b: number[][]) {
  expect(a).toHaveLength(3);
  expect(b).toHaveLength(3);
  return Math.max(
    ...a.flatMap((color, index) =>
      color.map((value, channel) => Math.abs(value - b[index]![channel]!))
    )
  );
}

function createCameraFixture(screenSize: number, cameraSize: number) {
  const project = createVideoProjectFromMultiSourceRecording({
    name: 'Camera reflection',
    videos: [
      {
        recordingId: 'beta-v1-recording',
        filename: 'beta-v1.webm',
        width: 160,
        height: 90,
        duration: 12,
        mimeType: 'video/webm',
        size: screenSize,
      },
    ],
    webcamVideo: {
      recordingId: 'webcam-clock',
      filename: 'camera-clock.webm',
      width: 160,
      height: 90,
      duration: 12,
      mimeType: 'video/webm',
      size: cameraSize,
    },
  });
  // Output geometry is independent of the native 160x90 recording dimensions.
  project.width *= 8;
  project.height *= 8;
  project.clips = project.clips.map((clip) => ({
    ...clip,
    transform: {
      ...clip.transform,
      x: clip.transform.x * 8,
      y: clip.transform.y * 8,
      width: clip.transform.width * 8,
      height: clip.transform.height * 8,
    },
  }));
  project.clips = project.clips.map((clip) =>
    clip.type === 'VIDEO' &&
    project.tracks.some((track) => track.id === clip.trackId && track.role === 'CAMERA')
      ? {
          ...clip,
          cameraPositions: [
            {
              id: 'native-position',
              sourceTime: 2,
              transform: { ...clip.transform },
              fitMode: clip.fitMode,
              transition: { kind: 'instant' as const, duration: 0 },
            },
          ],
        }
      : clip
  );
  return project;
}

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

async function expectVisibleSource(preview: Locator) {
  await expect(preview).toHaveAttribute('data-status', 'ready');
  const canvas = preview.locator('canvas').first();
  await canvas.scrollIntoViewIfNeeded();
  await expect
    .poll(
      async () => {
        const screenshot = await canvas.screenshot();
        return canvas.evaluate(async (source: HTMLCanvasElement, encoded) => {
          const image = new Image();
          image.src = `data:image/png;base64,${encoded}`;
          await image.decode();
          const visible = document.createElement('canvas');
          visible.width = image.width;
          visible.height = image.height;
          const context = visible.getContext('2d')!;
          context.drawImage(image, 0, 0);
          const original = source.getContext('2d')!;
          let error = 0,
            chroma = 0;
          for (const [x, y] of [
            [0.44, 0.44],
            [0.56, 0.44],
            [0.44, 0.56],
            [0.56, 0.56],
          ]) {
            const expected = original.getImageData(
              Math.floor(source.width * x!),
              Math.floor(source.height * y!),
              1,
              1
            ).data;
            const actual = context.getImageData(
              Math.floor(image.width * x!),
              Math.floor(image.height * y!),
              1,
              1
            ).data;
            chroma += Math.max(...expected.slice(0, 3)) - Math.min(...expected.slice(0, 3));
            for (let channel = 0; channel < 3; channel++)
              error += Math.abs(expected[channel]! - actual[channel]!);
          }
          return { paintedSource: chroma > 100, visibleSource: error / 12 < 20 };
        }, screenshot.toString('base64'));
      },
      { message: 'The painted video must remain visible above the scene background' }
    )
    .toEqual({ paintedSource: true, visibleSource: true });
}

test('Native main and camera recover when VideoFrame is absent', async ({ page }, info) => {
  await page.setViewportSize({ width: 1920, height: 900 });
  await page.addInitScript(() => {
    for (const name of ['VideoFrame', 'VideoDecoder'])
      Object.defineProperty(globalThis, name, { configurable: true, value: undefined });
  });
  const host = await startHostServer();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    const [screenBytes, cameraBytes] = await Promise.all([
      readFile(new URL('../fixtures/review-vp8-opus.webm', import.meta.url)),
      readFile(new URL('../fixtures/review-webcam-clock.webm', import.meta.url)),
    ]);
    const project = createCameraFixture(screenBytes.length, cameraBytes.length);
    Object.assign(project, hydrateVideoProject(project));
    await applyHarnessBootstrap(page, {
      preserveMediaLibrary: true,
      videoProjects: [project],
      storage: { 'sniptale-locale-preference': 'en', 'sniptale-theme-preference': 'light' },
    });
    await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}?theme=light`);
    await page.locator('[data-ui="gallery.page.root"]').waitFor();
    await seedReviewWebcamBundle(page);
    await page.goto(`${host.origin}${VIDEO_EDITOR_HARNESS_PATH}?project=${project.id}&theme=light`);
    await expect(page.locator('[data-ui="video-editor.timeline.surface"]')).toBeVisible();
    expect(await page.evaluate(() => [typeof VideoFrame, typeof VideoDecoder])).toEqual([
      'undefined',
      'undefined',
    ]);
    const track = project.tracks.find((item) => item.role === 'CAMERA');
    const camera = project.clips.find((clip) => clip.trackId === track?.id);
    const screen = project.clips.find((clip) => clip.type === 'VIDEO' && clip.id !== camera?.id);
    if (!camera || camera.type !== 'VIDEO' || !screen)
      throw new Error('Camera source fixture is unavailable.');
    const frame = {
      x: camera.transform.x / project.width,
      y: camera.transform.y / project.height,
      width: camera.transform.width / project.width,
      height: camera.transform.height / project.height,
    };
    const stage = page.locator('[data-preview-stage-canvas]');
    await expect
      .poll(
        async () => {
          const colors = (await sourceColors(stage, frame)).colors;
          return colors.every((color) => color[2]! - color[0]! > 50);
        },
        { message: 'The camera source must be visible through the API-absent Canvas fallback' }
      )
      .toBe(true);
    const before = await sourceColors(stage, frame);
    const ruler = page.locator('[data-ui="video-editor.timeline.ruler"]');
    const [clipBox, rulerBox] = await Promise.all([
      page.locator(`[data-project-timeline-clip="${screen.id}"]`).boundingBox(),
      ruler.boundingBox(),
    ]);
    if (!clipBox || !rulerBox) throw new Error('Source seek geometry is unavailable.');
    await ruler.click({
      position: { x: clipBox.x - rulerBox.x + (3 / screen.duration) * clipBox.width, y: 8 },
    });
    const clock = page.locator('[data-ui="video-editor.timeline.playhead-handle"]');
    await expect
      .poll(async () => Number(await clock.getAttribute('aria-valuenow')))
      .toBeGreaterThan(2.9);
    await expect
      .poll(
        async () => sourceColorError(before.colors, (await sourceColors(stage, frame)).colors),
        { message: 'A new source frame must replace the first fallback image after seeking' }
      )
      .toBeGreaterThan(10);
    await operate(
      page.getByRole('button', {
        name: translate('videoEditor.sidebar.sceneProperties', 'en'),
        exact: true,
      })
    );
    await page
      .locator(`[data-project-timeline-clip="${camera.id}"]`)
      .click({ modifiers: ['Control'] });
    await operate(
      page.getByRole('button', {
        name: translate('videoEditor.sidebar.inspectorGroupStyle', 'en'),
        exact: true,
      })
    );
    const owner = page.locator('[data-ui="video-editor.camera-appearance"]');
    await expect(owner).toBeVisible();
    const crop = owner
      .locator('summary')
      .filter({ hasText: translate('videoEditor.sidebar.cameraCropSection', 'en') });
    if ((await crop.locator('..').getAttribute('open')) === null) await operate(crop);
    const preview = owner.locator(
      '[data-ui="video-editor.camera-crop"] [data-preview-inspector-canvas]'
    );
    await expect
      .poll(async () =>
        (await sourceColors(preview)).colors.every((color) => color[2]! - color[0]! > 20)
      )
      .toBe(true);
    expect(errors).toEqual([]);
    await writeFile(
      info.outputPath('native-api-absence.json'),
      JSON.stringify(
        {
          viewport: page.viewportSize(),
          before,
          after: await sourceColors(stage, frame),
          inspector: await sourceColors(preview),
          errors,
          limitation:
            'Functional recovery and changed camera image only. HTML source PTS, ' +
            'successor intervals and canonical color equivalence remain separate ' +
            'acceptance.',
        },
        null,
        2
      )
    );
    await page.screenshot({ path: info.outputPath('native-api-absence.png'), fullPage: false });
  } finally {
    await new Promise<void>((resolve) => host.server.close(() => resolve()));
  }
});

test('Gallery main and webcam recover when VideoFrame is absent', async ({ page }, info) => {
  await page.setViewportSize({ width: 1920, height: 900 });
  await page.addInitScript(() => {
    for (const name of ['VideoFrame', 'VideoDecoder'])
      Object.defineProperty(globalThis, name, { configurable: true, value: undefined });
  });
  const host = await startHostServer();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const dialog = page.locator('dialog');
  const label = (key: Parameters<typeof translate>[0]) => translate(key, 'en');
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
    await dialog
      .getByRole('button', { name: label('gallery.videoReview.advancedEditing'), exact: true })
      .click();
    expect(await page.evaluate(() => [typeof VideoFrame, typeof VideoDecoder])).toEqual([
      'undefined',
      'undefined',
    ]);
    const main = dialog.locator(
      '[data-ui="gallery.videoReview.manualPreview"] canvas[data-preview-front="true"]'
    );
    await dialog.locator('[data-review-header-track="webcam"] [data-review-track-select]').click();
    await dialog
      .getByRole('group', { name: label('gallery.videoReview.inspector'), exact: true })
      .getByRole('button', { name: label('gallery.videoReview.webcam'), exact: true })
      .click();
    const camera = await currentCameraSettings(page);
    const stored = await readWebcamWorkspace(page);
    const fadeIn = stored?.advanced.presentation?.fadeIn;
    expect(fadeIn?.enabled).toBe(true);
    expect(fadeIn?.duration).toBeLessThan(1.02);
    await expect
      .poll(
        async () =>
          (await cameraRectangleColors(main, camera.placement)).colors.every((color) =>
            color.every((channel) => channel === 0)
          ),
        { message: 'The authored fade starts with a fully black composition, including the webcam' }
      )
      .toBe(true);
    const ruler = dialog.locator('[data-ui="gallery.videoReview.ruler"]');
    const plane = dialog.locator('[data-ui="gallery.videoReview.timePlane"]');
    const box = await ruler.boundingBox();
    const duration = Number(await plane.getAttribute('aria-valuemax'));
    if (!box || !Number.isFinite(duration) || duration <= 0)
      throw new Error('Source timeline is unavailable.');
    await ruler.click({ position: { x: (box.width * 1.02) / duration, y: 8 } });
    await expect
      .poll(async () => Number(await plane.getAttribute('aria-valuenow')))
      .toBeGreaterThan(1);
    await expect
      .poll(
        async () =>
          (await cameraRectangleColors(main, camera.placement)).colors.every(
            (color) => color[2]! - color[0]! > 50
          ),
        { message: 'A camera image must be composed without the native frame API' }
      )
      .toBe(true);
    const before = await cameraRectangleColors(main, camera.placement);
    await ruler.click({ position: { x: (box.width * 3) / duration, y: 8 } });
    await expect
      .poll(async () => Number(await plane.getAttribute('aria-valuenow')))
      .toBeGreaterThan(2.9);
    await expect
      .poll(
        async () => {
          const after = await cameraRectangleColors(main, camera.placement);
          return Math.max(
            ...before.colors.flatMap((color, index) =>
              color.map((value, channel) => Math.abs(value - after.colors[index]![channel]!))
            )
          );
        },
        { message: 'Seek must replace the first fallback camera image' }
      )
      .toBeGreaterThan(10);
    const after = await cameraRectangleColors(main, camera.placement);
    await dialog.locator('[data-review-header-track="webcam"] [data-review-track-select]').click();
    await dialog
      .getByRole('group', { name: label('gallery.videoReview.inspector'), exact: true })
      .getByRole('button', { name: label('gallery.videoReview.webcam'), exact: true })
      .click();
    const overlay = dialog
      .locator('[data-ui="gallery.videoReview.webcamOverlay"]')
      .getByRole('group', { name: label('gallery.videoReview.webcamSettings'), exact: true });
    await expect(overlay).toBeVisible();
    await overlay.focus();
    await overlay.press('ArrowLeft');
    await expect
      .poll(async () => (await currentCameraSettings(page)).placement.x)
      .toBeLessThan(camera.placement.x);
    await dialog
      .getByRole('button', { name: label('gallery.videoReview.undo'), exact: true })
      .click();
    await expect.poll(async () => await currentCameraSettings(page)).toEqual(camera);
    expect(errors).toEqual([]);
    await writeFile(
      info.outputPath('gallery-api-absence.json'),
      JSON.stringify(
        {
          viewport: page.viewportSize(),
          before,
          after,
          authoredFadeIn: fadeIn,
          firstVisibleSourceTime: 1.02,
          errors,
          limitation:
            'Functional source/camera recovery, seek and Undo only. HTML PTS, successor ' +
            'and canonical color equivalence remain separate acceptance.',
        },
        null,
        2
      )
    );
    await page.screenshot({ path: info.outputPath('gallery-api-absence.png'), fullPage: false });
  } finally {
    await new Promise<void>((resolve) => host.server.close(() => resolve()));
  }
});

test('Gallery paused and live focus recover when VideoFrame is absent', async ({ page }, info) => {
  await page.setViewportSize({ width: 1920, height: 900 });
  await page.addInitScript(() => {
    for (const name of ['VideoFrame', 'VideoDecoder'])
      Object.defineProperty(globalThis, name, { configurable: true, value: undefined });
  });
  const host = await startHostServer();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const dialog = page.locator('dialog');
  const button = (key: Parameters<typeof translate>[0]) =>
    dialog.getByRole('button', { name: translate(key, 'en'), exact: true });
  try {
    await applyHarnessBootstrap(page, {
      preserveMediaLibrary: true,
      storage: { 'sniptale-locale-preference': 'en', 'sniptale-theme-preference': 'light' },
    });
    await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}?theme=light`);
    await page.locator('[data-ui="gallery.page.root"]').waitFor();
    await seedReviewVideo(page, 'review-vp8-opus.webm', { width: 160, height: 90, duration: 12 });
    await page.reload();
    await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).first().click();
    await page.locator('[data-ui="gallery.videoReview.enter"]').click();
    await button('gallery.videoReview.advancedEditing').click();
    await addReviewFocus(page);
    const preview = dialog.locator('[data-ui="gallery.videoReview.zoomPreview"]');
    await expectVisibleSource(preview);
    const selected = await persistedFocus(page);
    if (!selected) throw new Error('Focus selection was not saved.');
    const canvas = preview.locator('canvas').first();
    await canvas.focus();
    await canvas.press('ArrowRight');
    await expect
      .poll(async () => (await persistedFocus(page))?.transform.centerX)
      .toBeGreaterThan(selected.transform.centerX);
    await button('gallery.videoReview.undo').click();
    await expect
      .poll(async () => (await persistedFocus(page))?.transform)
      .toEqual(selected.transform);
    await button('gallery.videoReview.play').click();
    await button('gallery.videoReview.pause').waitFor();
    await dialog
      .locator('[data-ui="gallery.videoReview.zoomLane"] [role="button"]')
      .first()
      .click();
    await expect(preview).toHaveAttribute('data-playing', 'true');
    const images = new Set<string>();
    await expect
      .poll(
        async () => {
          const fingerprint = await canvas.evaluate((node: HTMLCanvasElement) => {
            const copy = document.createElement('canvas');
            copy.width = 32;
            copy.height = 18;
            const context = copy.getContext('2d');
            if (!context) throw new Error('Live source readback is unavailable.');
            context.drawImage(node, 0, 0, 32, 18);
            return [...context.getImageData(0, 0, 32, 18).data].join(',');
          });
          images.add(fingerprint);
          return images.size;
        },
        { message: 'Live fallback must publish more than one painted image' }
      )
      .toBeGreaterThan(1);
    await button('gallery.videoReview.pause').click();
    await dialog
      .locator('[data-ui="gallery.videoReview.zoomLane"] [role="button"]')
      .first()
      .click();
    await expectVisibleSource(preview);
    expect(await page.evaluate(() => [typeof VideoFrame, typeof VideoDecoder])).toEqual([
      'undefined',
      'undefined',
    ]);
    expect(errors).toEqual([]);
    await writeFile(
      info.outputPath('focus-api-absence.json'),
      JSON.stringify(
        {
          viewport: page.viewportSize(),
          actualRaster: await canvas.evaluate((node: HTMLCanvasElement) => ({
            width: node.width,
            height: node.height,
          })),
          distinctLiveImages: images.size,
          errors,
          limitation:
            'Functional paused/live Canvas recovery and Undo. Image changes are not native PTS or cadence evidence.',
        },
        null,
        2
      )
    );
    await page.screenshot({ path: info.outputPath('focus-api-absence.png'), fullPage: false });
  } finally {
    await new Promise<void>((resolve) => host.server.close(() => resolve()));
  }
});
