import { enableGpuPreviewProof, installCameraFrameObserver } from '../support/gpu-preview-proof';
import { hydrateVideoProject } from '../../../../apps/extension/src/features/video/project/hydration';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { createVideoProjectFromMultiSourceRecording } from '../../../../apps/extension/src/features/video/project/factories/multi-source-recording';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { seedReviewWebcamBundle } from '../support/quick-editor-media-fixture';
import { readNativeVideoProject } from '../support/native-video-project';
import { checkInspectorPaintedFont } from '../support/inspector-utilities';
import { startHostServer } from '../support/host-server';
import {
  applyHarnessBootstrap,
  GALLERY_HARNESS_PATH,
  VIDEO_EDITOR_HARNESS_PATH,
} from '../extension-critical.helpers';

enableGpuPreviewProof();

async function expectGpuCanvas(canvas: Locator) {
  await expect(canvas).toHaveCount(1);
  await expect
    .poll(() =>
      canvas.evaluate((node: HTMLCanvasElement) => {
        try {
          return node.getContext('2d') === null;
        } catch (error) {
          if (error instanceof DOMException && error.name === 'InvalidStateError') return true;
          throw error;
        }
      })
    )
    .toBe(true);
}

async function operate(control: Locator) {
  await control.scrollIntoViewIfNeeded();
  await control.click();
}

async function pixels(
  canvas: Locator,
  frame?: { x: number; y: number; width: number; height: number }
) {
  return canvas.evaluate((node: HTMLCanvasElement, area) => {
    const readback = document.createElement('canvas');
    readback.width = node.width;
    readback.height = node.height;
    try {
      const context = readback.getContext('2d');
      if (!context) throw new Error('Missing native camera canvas');
      context.drawImage(node, 0, 0);
      const x = Math.round((area?.x ?? 0) * node.width) + 2;
      const y = Math.round((area?.y ?? 0) * node.height) + 2;
      const width = Math.round((area?.width ?? 1) * node.width) - 4;
      const height = Math.round((area?.height ?? 1) * node.height) - 4;
      if (width < 4 || height < 4) throw new Error('Camera pixels are unavailable');
      return { width, height, data: [...context.getImageData(x, y, width, height).data] };
    } finally {
      readback.width = 0;
      readback.height = 0;
    }
  }, frame);
}
function pixelError(
  before: Awaited<ReturnType<typeof pixels>>,
  after: Awaited<ReturnType<typeof pixels>>,
  mirror: boolean
) {
  expect([after.width, after.height]).toEqual([before.width, before.height]);
  let error = 0;
  for (let y = 0; y < before.height; y++)
    for (let x = 0; x < before.width; x++)
      for (let channel = 0; channel < 3; channel++) {
        const sourceX = mirror ? before.width - x - 1 : x;
        error += Math.abs(
          before.data[(y * before.width + sourceX) * 4 + channel]! -
            after.data[(y * before.width + x) * 4 + channel]!
        );
      }
  return error / (before.width * before.height * 3);
}

function circleMaskError(
  visible: Awaited<ReturnType<typeof pixels>>,
  hidden: Awaited<ReturnType<typeof pixels>>
) {
  expect([visible.width, visible.height]).toEqual([hidden.width, hidden.height]);
  const width = visible.width + 4,
    height = visible.height + 4;
  const centerX = width / 2 - 2,
    centerY = height / 2 - 2,
    radius = Math.min(width, height) / 2;
  let outside = 0,
    inside = 0,
    outsideCount = 0,
    insideCount = 0;
  for (let y = 0; y < visible.height; y++)
    for (let x = 0; x < visible.width; x++) {
      const distance = Math.hypot(x + 0.5 - centerX, y + 0.5 - centerY);
      let difference = 0;
      for (let channel = 0; channel < 3; channel++)
        difference += Math.abs(
          visible.data[(y * visible.width + x) * 4 + channel]! -
            hidden.data[(y * visible.width + x) * 4 + channel]!
        );
      if (distance > radius + 2) {
        outside += difference;
        outsideCount++;
      }
      if (distance < radius - 4) {
        inside += difference;
        insideCount++;
      }
    }
  if (!outsideCount || !insideCount) throw new Error('Circle pixel samples are unavailable');
  return { outsideError: outside / outsideCount / 3, insideDifference: inside / insideCount / 3 };
}

async function shadowRing(
  canvas: Locator,
  frame: { x: number; y: number; width: number; height: number }
) {
  return canvas.evaluate((node: HTMLCanvasElement, area) => {
    const readback = document.createElement('canvas');
    readback.width = node.width;
    readback.height = node.height;
    try {
      const context = readback.getContext('2d');
      if (!context) throw new Error('Missing native composition context');
      context.drawImage(node, 0, 0);
      const x = Math.round(area.x * node.width),
        y = Math.round(area.y * node.height);
      const width = Math.round(area.width * node.width),
        height = Math.round(area.height * node.height);
      const pixels = context.getImageData(0, 0, node.width, node.height).data;
      let red = 0,
        blue = 0,
        count = 0;
      const pad = Math.max(3, Math.round(height / 6));
      for (let py = Math.max(0, y - pad); py < Math.min(node.height, y + height + pad); py++)
        for (let px = Math.max(0, x - pad); px < Math.min(node.width, x + width + pad); px++) {
          if (px >= x && px < x + width && py >= y && py < y + height) continue;
          const index = (py * node.width + px) * 4;
          red += pixels[index]!;
          blue += pixels[index + 2]!;
          count++;
        }
      if (!count) throw new Error('Shadow ring is empty');
      return { red: red / count, blue: blue / count };
    } finally {
      readback.width = 0;
      readback.height = 0;
    }
  }, frame);
}

async function cameraGeometry(
  page: Page,
  owner: Locator,
  capture: (name: string) => string,
  focus?: Locator
) {
  const closeMaterials = page.locator('[data-ui="video-editor.materials.close"]');
  if (await closeMaterials.isVisible()) await operate(closeMaterials);
  const inspector = page.locator('[data-ui="video-editor.floating.context-inspector"]');
  const handle = page.locator('[data-ui="video-editor.floating.context-inspector.resize"]');
  const rail = inspector.locator('[data-ui="video-editor.inspector.categories"] > nav');
  for (const width of [359, 360, 361]) {
    const current = (await inspector.boundingBox())!.width;
    const box = (await handle.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + 12);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + current - width, box.y + 12);
    await page.mouse.up();
    await expect.poll(async () => Math.round((await inspector.boundingBox())!.width)).toBe(width);
    const before = await rail.boundingBox();
    const colorRow = owner.locator('[data-ui="shared.ui.compact-inspector.color-field"]');
    if (focus) await focus.scrollIntoViewIfNeeded();
    else if (await colorRow.count()) await colorRow.scrollIntoViewIfNeeded();
    else await owner.locator('[aria-pressed]').first().scrollIntoViewIfNeeded();
    expect(
      await owner.evaluate((node) => {
        const body = node.closest('[data-ui="video-editor.inspector.categories"] > div');
        if (!(body instanceof HTMLElement)) throw new Error('Missing inspector scroll owner');
        const bounds = body.getBoundingClientRect();
        return (
          body.scrollWidth <= body.clientWidth + 1 &&
          [...node.querySelectorAll('input,button')].every((control) => {
            const rect = control.getBoundingClientRect();
            return (
              rect.width === 0 || (rect.left >= bounds.left - 1 && rect.right <= bounds.right + 1)
            );
          })
        );
      })
    ).toBe(true);
    const after = await rail.boundingBox();
    expect(after?.x).toBe(before?.x);
    expect(after?.y).toBe(before?.y);
    await page.screenshot({ path: capture(`camera-mirror-${width}.png`), fullPage: false });
  }
}

async function cameraFrameImports(canvas: Locator) {
  return canvas.evaluate((node: HTMLCanvasElement) => {
    const read: unknown = Reflect.get(window, 'sniptaleCameraFrameImports');
    if (typeof read !== 'function') throw new Error('Camera source observation is unavailable.');
    const value: unknown = Reflect.apply(read, undefined, [node]);
    if (!Array.isArray(value)) throw new Error('Camera source observations are invalid.');
    const times = value.filter(
      (time: unknown): time is number => typeof time === 'number' && Number.isSafeInteger(time)
    );
    if (times.length !== value.length) throw new Error('Camera source timestamps are invalid.');
    return times;
  });
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

for (const [index, viewport] of PRIMARY_BROWSER_VIEWPORTS.entries()) {
  const locale = index === 0 ? 'en' : 'ru';
  const theme = index === 0 ? 'dark' : 'light';
  test(`camera window retains source pixels and montage placement ${viewport.size.width} ${locale}`, async ({
    page,
  }, info) => {
    test.setTimeout(180000);
    await page.setViewportSize({ ...viewport.size });
    await page.emulateMedia({ colorScheme: theme });
    const host = await startHostServer();
    const label = (key: Parameters<typeof translate>[0]) => translate(key, locale);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    try {
      const screenBytes = await readFile(
        new URL('../fixtures/review-vp8-opus.webm', import.meta.url)
      );
      const cameraBytes = await readFile(
        new URL('../fixtures/review-vp8-opus.webm', import.meta.url)
      );
      const project = createCameraFixture(screenBytes.length, cameraBytes.length);
      Object.assign(project, hydrateVideoProject(project));
      await applyHarnessBootstrap(page, {
        preserveMediaLibrary: true,
        videoProjects: [project],
        storage: { 'sniptale-locale-preference': locale, 'sniptale-theme-preference': theme },
      });
      await page.addInitScript((language) => {
        localStorage.setItem('sniptale-locale-preference', language);
        if (sessionStorage.getItem('camera-mirror-seeded')) {
          const bootstrap: unknown = Reflect.get(window, '__sniptaleHarnessBootstrap');
          if (typeof bootstrap === 'object' && bootstrap !== null)
            Reflect.deleteProperty(bootstrap, 'videoProjects');
        }
      }, locale);
      await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}?theme=${theme}`);
      await page.locator('[data-ui="gallery.page.root"]').waitFor();
      await seedReviewWebcamBundle(page, 'review-vp8-opus.webm');
      await page.evaluate(() => sessionStorage.setItem('camera-mirror-seeded', 'true'));
      await page.goto(
        `${host.origin}${VIDEO_EDITOR_HARNESS_PATH}?project=${project.id}&theme=${theme}`
      );
      await expect(page.locator('[data-ui="video-editor.timeline.surface"]')).toBeVisible();
      const track = project.tracks.find((item) => item.role === 'CAMERA');
      const camera = project.clips.find((clip) => clip.trackId === track?.id);
      if (!camera || camera.type !== 'VIDEO') throw new Error('Missing camera clip');
      await operate(
        page.getByRole('button', {
          name: label('videoEditor.sidebar.sceneProperties'),
          exact: true,
        })
      );
      await page
        .locator(`[data-project-timeline-clip="${camera.id}"]`)
        .click({ modifiers: ['Control'] });
      await operate(
        page.getByRole('button', {
          name: label('videoEditor.sidebar.inspectorGroupStyle'),
          exact: true,
        })
      );
      const owner = page.locator('[data-ui="video-editor.camera-appearance"]');
      await expect(owner).toBeVisible();
      const crop = owner
        .locator('summary')
        .filter({ hasText: label('videoEditor.sidebar.cameraCropSection') });
      if ((await crop.locator('..').getAttribute('open')) === null) await operate(crop);
      const preview = owner.locator(
        '[data-ui="video-editor.camera-crop"] [data-preview-inspector-canvas]'
      );
      await expect(
        owner.getByRole('button', {
          name: label('videoEditor.sidebar.cameraCropPreview'),
          exact: true,
        })
      ).toBeEnabled();
      const stage = page.locator('[data-preview-stage-canvas]');
      await expectGpuCanvas(stage);
      await expectGpuCanvas(preview);
      await expect(page.locator('[data-preview-stage-canvas]')).toHaveCount(1);
      const frame = {
        x: camera.transform.x / project.width,
        y: camera.transform.y / project.height,
        width: camera.transform.width / project.width,
        height: camera.transform.height / project.height,
      };
      await expect
        .poll(async () => pixelError(await pixels(stage, frame), await pixels(stage, frame), true))
        .toBeGreaterThan(5);
      const before = await pixels(stage, frame);
      const cropBefore = await pixels(preview);
      await expect
        .poll(async () =>
          sourceColorError(
            (await sourceColors(stage, frame)).colors,
            (await sourceColors(preview)).colors
          )
        )
        .toBeLessThan(4);
      await writeFile(
        info.outputPath('camera-source-colors.json'),
        JSON.stringify(
          {
            viewport: viewport.size,
            sourceSHA256: createHash('sha256').update(cameraBytes).digest('hex'),
            main: await sourceColors(stage, frame),
            inspector: await sourceColors(preview),
          },
          null,
          2
        )
      );
      const original = await readNativeVideoProject(page);
      const horizontal = owner.getByRole('button', {
        name: label('gallery.videoReview.webcamMirrorOn'),
        exact: true,
      });
      await checkInspectorPaintedFont(page, horizontal, 'camera-mirror-choice');
      await operate(horizontal);
      const mirrored = async () => {
        const clip = (await readNativeVideoProject(page))?.clips.find(
          (item) => item.id === camera.id
        );
        return clip?.type === 'VIDEO' ? (clip.cameraMirrored ?? false) : false;
      };
      await expect.poll(mirrored).toBe(true);
      await expect
        .poll(async () => pixelError(before, await pixels(stage, frame), true))
        .toBeLessThan(5);
      await expect
        .poll(async () => pixelError(cropBefore, await pixels(preview), true))
        .toBeLessThan(5);
      const accepted = await readNativeVideoProject(page);
      expect(accepted?.version).toBe(8);
      expect(accepted?.clips.filter((clip) => clip.id !== camera.id)).toEqual(
        original?.clips.filter((clip) => clip.id !== camera.id)
      );
      expect(accepted?.clips.find((clip) => clip.id === camera.id)).toEqual({
        ...original?.clips.find((clip) => clip.id === camera.id),
        cameraMirrored: true,
      });
      await page.screenshot({ path: info.outputPath('camera-mirrored.png'), fullPage: false });
      await writeFile(
        info.outputPath('camera-pixels.json'),
        JSON.stringify(
          {
            sceneMirrorError: pixelError(before, await pixels(stage, frame), true),
            sceneAsymmetry: pixelError(before, before, true),
            cropMirrorError: pixelError(cropBefore, await pixels(preview), true),
          },
          null,
          2
        )
      );
      await operate(page.locator('[data-ui="video-editor.timeline.toolbar.undo"]'));
      await expect.poll(mirrored).toBe(false);
      await operate(page.locator('[data-ui="video-editor.timeline.toolbar.redo"]'));
      await expect.poll(mirrored).toBe(true);
      await cameraGeometry(page, owner, (name) => info.outputPath(name));
      await operate(page.locator('[data-ui="video-editor.inspector.presentation-toggle"]'));
      await horizontal.scrollIntoViewIfNeeded();
      await expect(horizontal).toHaveAttribute('aria-pressed', 'true');
      await page.screenshot({ path: info.outputPath('camera-all-sections.png'), fullPage: false });
      await page.reload();
      await expect(page.locator('[data-ui="video-editor.timeline.surface"]')).toBeVisible();
      await expect.poll(mirrored).toBe(true);
      expect((await readNativeVideoProject(page))?.clips).toEqual(accepted?.clips);
      await expect
        .poll(async () => {
          const framePixels = await pixels(stage, frame);
          return [framePixels.width, framePixels.height];
        })
        .toEqual([before.width, before.height]);
      await expect
        .poll(async () => pixelError(before, await pixels(stage, frame), true))
        .toBeLessThan(5);
      await operate(
        page.getByRole('button', {
          name: label('videoEditor.sidebar.sceneProperties'),
          exact: true,
        })
      );
      await page
        .locator(`[data-project-timeline-clip="${camera.id}"]`)
        .click({ modifiers: ['Control'] });
      await operate(
        page.getByRole('button', {
          name: label('videoEditor.sidebar.inspectorGroupStyle'),
          exact: true,
        })
      );
      await horizontal.scrollIntoViewIfNeeded();
      await expect(horizontal).toHaveAttribute('aria-pressed', 'true');
      await page.screenshot({ path: info.outputPath('camera-reopened.png'), fullPage: false });
      const shadow = page.locator('[data-ui="video-editor.media-shadow"]');
      const shadowLabel = label('gallery.videoReview.webcamShadowColor');
      const intensity = shadow.getByRole('textbox', {
        name: label('videoEditor.sidebar.mediaShadowIntensityLabel'),
        exact: true,
      });
      const readCamera = async () =>
        (await readNativeVideoProject(page))?.clips.find((clip) => clip.id === camera.id);
      const setColor = async (color: string) => {
        await operate(shadow.getByRole('button', { name: shadowLabel, exact: true }));
        const input = shadow.getByRole('textbox', { name: shadowLabel, exact: true });
        await input.fill(color);
        await input.press('Enter');
        await expect
          .poll(async () => {
            const clip = await readCamera();
            return clip && 'shadowColor' in clip ? clip.shadowColor : null;
          })
          .toBe(color);
        await page.evaluate(
          () =>
            new Promise<void>((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
            )
        );
      };
      await intensity.scrollIntoViewIfNeeded();
      await intensity.fill('80');
      await intensity.press('Enter');
      const sourcePixels = await pixels(stage, frame);
      await setColor('#ff0000');
      const red = await shadowRing(stage, frame);
      await operate(shadow.locator('[data-ui="shared.ui.color-selector.picker-trigger"]'));
      const picker = page.locator('[data-ui="shared.ui.color-selector.picker"]');
      await expect(picker).toBeVisible();
      const pickerBox = await picker.boundingBox();
      expect(pickerBox!.x).toBeGreaterThanOrEqual(0);
      expect(pickerBox!.x + pickerBox!.width).toBeLessThanOrEqual(viewport.size.width + 1);
      await page.screenshot({ path: info.outputPath('shadow-picker.png'), fullPage: false });
      await page.keyboard.press('Escape');
      await expect(picker).toBeHidden();
      expect(await readCamera()).toMatchObject({ shadowColor: '#ff0000' });

      await operate(shadow.getByRole('button', { name: shadowLabel, exact: true }));
      const canceledColor = shadow.getByRole('textbox', { name: shadowLabel, exact: true });
      await canceledColor.fill('#00ff00');
      await canceledColor.press('Escape');
      await expect(shadow.getByRole('button', { name: shadowLabel, exact: true })).toContainText(
        '#FF0000'
      );
      expect(await readCamera()).toMatchObject({ shadowColor: '#ff0000' });
      await setColor('#0000ff');
      await expect
        .poll(async () => {
          const blue = await shadowRing(stage, frame);
          return Math.min(red.red - blue.red, blue.blue - red.blue);
        })
        .toBeGreaterThan(0.3);
      expect(pixelError(sourcePixels, await pixels(stage, frame), false)).toBeLessThan(1);
      expect((await readNativeVideoProject(page))?.version).toBe(9);
      await checkInspectorPaintedFont(
        page,
        shadow.getByRole('button', { name: shadowLabel, exact: true }),
        'camera-shadow-color'
      );
      await shadow
        .locator('[data-ui="shared.ui.compact-inspector.color-field"]')
        .scrollIntoViewIfNeeded();
      await page.screenshot({ path: info.outputPath('shadow-colored.png'), fullPage: false });
      await writeFile(
        info.outputPath('shadow-pixels.json'),
        JSON.stringify(
          {
            red,
            blue: await shadowRing(stage, frame),
            sourceError: pixelError(sourcePixels, await pixels(stage, frame), false),
          },
          null,
          2
        )
      );
      await operate(page.locator('[data-ui="video-editor.timeline.toolbar.undo"]'));
      await expect
        .poll(async () => {
          const clip = await readCamera();
          return clip && 'shadowColor' in clip ? clip.shadowColor : null;
        })
        .toBe('#ff0000');
      await operate(page.locator('[data-ui="video-editor.timeline.toolbar.redo"]'));
      await expect
        .poll(async () => {
          const clip = await readCamera();
          return clip && 'shadowColor' in clip ? clip.shadowColor : null;
        })
        .toBe('#0000ff');
      await intensity.fill('0');
      await intensity.press('Enter');
      await expect
        .poll(async () => {
          const clip = await readCamera();
          return clip && 'shadowIntensity' in clip ? clip.shadowIntensity : null;
        })
        .toBe(0);
      await cameraGeometry(page, shadow, (name) =>
        info.outputPath(name.replace('camera-mirror', 'shadow-color'))
      );
      await operate(page.locator('[data-ui="video-editor.inspector.presentation-toggle"]'));
      await shadow
        .locator('[data-ui="shared.ui.compact-inspector.color-field"]')
        .scrollIntoViewIfNeeded();
      await page.screenshot({ path: info.outputPath('shadow-all-sections.png'), fullPage: false });
      await page.reload();
      await expect(page.locator('[data-ui="video-editor.timeline.surface"]')).toBeVisible();
      await expect
        .poll(async () => {
          const clip = await readCamera();
          return clip && 'shadowColor' in clip ? clip.shadowColor : null;
        })
        .toBe('#0000ff');
      const reopenedCamera = await readCamera();
      expect(reopenedCamera).toMatchObject({
        cameraMirrored: true,
        shadowIntensity: 0,
        shadowColor: '#0000ff',
      });
      await operate(
        page.getByRole('button', {
          name: label('videoEditor.sidebar.sceneProperties'),
          exact: true,
        })
      );
      await page
        .locator(`[data-project-timeline-clip="${camera.id}"]`)
        .click({ modifiers: ['Control'] });
      await operate(
        page.getByRole('button', {
          name: label('videoEditor.sidebar.inspectorGroupStyle'),
          exact: true,
        })
      );
      await shadow
        .locator('[data-ui="shared.ui.compact-inspector.color-field"]')
        .scrollIntoViewIfNeeded();
      await expect(shadow.getByRole('button', { name: shadowLabel, exact: true })).toContainText(
        '#0000FF'
      );
      await page.screenshot({ path: info.outputPath('shadow-reopened.png'), fullPage: false });
      const beforeCircle = await readNativeVideoProject(page);
      const beforeCircleCamera = await readCamera();
      const circleChoice = owner.getByRole('button', {
        name: label('gallery.videoReview.webcamCircle'),
        exact: true,
      });
      const cameraShape = async () => {
        const clip = await readCamera();
        return clip?.type === 'VIDEO' ? (clip.cameraAppearance?.shape ?? 'rounded') : null;
      };
      const shapeSelect = owner.getByRole('button', {
        name: label('videoEditor.sidebar.cameraShape'),
        exact: true,
      });
      if (await shapeSelect.count()) {
        await operate(shapeSelect);
        await operate(
          page.getByRole('option', {
            name: label('gallery.videoReview.webcamCircle'),
            exact: true,
          })
        );
      } else await operate(circleChoice);
      await expect.poll(cameraShape).toBe('circle');
      expect((await readNativeVideoProject(page))?.version).toBe(10);
      expect((await readCamera())?.transform).toEqual(beforeCircleCamera?.transform);
      expect(
        (await readNativeVideoProject(page))?.clips.filter((clip) => clip.id !== camera.id)
      ).toEqual(beforeCircle?.clips.filter((clip) => clip.id !== camera.id));
      await operate(page.locator('[data-ui="video-editor.timeline.toolbar.undo"]'));
      await expect.poll(cameraShape).not.toBe('circle');
      await operate(page.locator('[data-ui="video-editor.timeline.toolbar.redo"]'));
      await expect.poll(cameraShape).toBe('circle');
      await operate(
        page.getByRole('button', {
          name: label('videoEditor.sidebar.inspectorGroupCamera'),
          exact: true,
        })
      );
      const opacity = page.getByRole('textbox', {
        name: label('videoEditor.sidebar.opacityLabel'),
        exact: true,
      });
      await opacity.scrollIntoViewIfNeeded();
      await opacity.fill('0');
      await opacity.press('Enter');
      await expect.poll(async () => (await readCamera())?.transform.opacity).toBe(0);
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
          )
      );
      const hiddenPixels = await pixels(stage, frame);
      await operate(page.locator('[data-ui="video-editor.timeline.toolbar.undo"]'));
      await expect.poll(async () => (await readCamera())?.transform.opacity).toBe(1);
      await expect
        .poll(
          async () => circleMaskError(await pixels(stage, frame), hiddenPixels).insideDifference
        )
        .toBeGreaterThan(1);
      const circlePixels = circleMaskError(await pixels(stage, frame), hiddenPixels);
      expect(circlePixels.outsideError).toBeLessThan(1);
      await writeFile(info.outputPath('circle-pixels.json'), JSON.stringify(circlePixels, null, 2));
      await operate(
        page.getByRole('button', {
          name: label('videoEditor.sidebar.inspectorGroupStyle'),
          exact: true,
        })
      );
      const diameter = owner.getByRole('textbox', {
        name: label('gallery.videoReview.webcamDiameter'),
        exact: true,
      });
      await diameter.scrollIntoViewIfNeeded();
      await checkInspectorPaintedFont(
        page,
        (await shapeSelect.count()) ? shapeSelect : circleChoice,
        'camera-circle-choice'
      );
      if ((await crop.locator('..').getAttribute('open')) === null) await operate(crop);
      await expect
        .poll(async () =>
          preview.evaluate((node: HTMLCanvasElement) => Math.abs(node.width - node.height))
        )
        .toBeLessThanOrEqual(1);
      await page.screenshot({ path: info.outputPath('circle-camera.png'), fullPage: false });
      await cameraGeometry(page, owner, (name) =>
        info.outputPath(name.replace('camera-mirror', 'circle-camera'))
      );
      await operate(page.locator('[data-ui="video-editor.inspector.presentation-toggle"]'));
      await diameter.scrollIntoViewIfNeeded();
      await page.screenshot({ path: info.outputPath('circle-all-sections.png'), fullPage: false });
      await page.reload();
      await expect(page.locator('[data-ui="video-editor.timeline.surface"]')).toBeVisible();
      await expect.poll(cameraShape).toBe('circle');
      await operate(
        page.getByRole('button', {
          name: label('videoEditor.sidebar.sceneProperties'),
          exact: true,
        })
      );
      await page
        .locator(`[data-project-timeline-clip="${camera.id}"]`)
        .click({ modifiers: ['Control'] });
      await operate(
        page.getByRole('button', {
          name: label('videoEditor.sidebar.inspectorGroupStyle'),
          exact: true,
        })
      );
      if (await shapeSelect.count()) {
        await shapeSelect.scrollIntoViewIfNeeded();
        await expect(shapeSelect).toContainText(label('gallery.videoReview.webcamCircle'));
      } else {
        await circleChoice.scrollIntoViewIfNeeded();
        await expect(circleChoice).toHaveAttribute('aria-pressed', 'true');
      }
      expect(await readCamera()).toMatchObject({
        transform: beforeCircleCamera?.transform,
        shadowColor: '#0000ff',
        cameraMirrored: true,
        cameraAppearance: { shape: 'circle' },
      });
      await page.screenshot({ path: info.outputPath('circle-reopened.png'), fullPage: false });
      const selectDestination = async () => {
        await operate(
          page.getByRole('button', {
            name: label('videoEditor.sidebar.inspectorGroupCamera'),
            exact: true,
          })
        );
        await operate(
          page.getByRole('button', {
            name: label('videoEditor.sidebar.cameraPosition'),
            exact: true,
          })
        );
        await operate(page.getByRole('option', { name: '0:02.000', exact: true }));
        await operate(
          page.getByRole('button', {
            name: label('videoEditor.sidebar.inspectorGroupStyle'),
            exact: true,
          })
        );
        if ((await crop.locator('..').getAttribute('open')) === null) await operate(crop);
      };
      await selectDestination();
      const cropVideo = owner.locator('video');
      await expect
        .poll(() => cropVideo.evaluate((node: HTMLVideoElement) => node.currentTime))
        .toBeCloseTo(2, 3);
      const zoom = owner.getByRole('textbox', {
        name: label('videoEditor.sidebar.cameraCropZoom'),
        exact: true,
      });
      await zoom.scrollIntoViewIfNeeded();
      await expect(zoom).toHaveValue('100');
      const destinationBefore = await readCamera();
      const beforeCropPixels = await pixels(stage, frame);
      const positionCrop = async () => {
        const camera = await readCamera();
        return camera?.type === 'VIDEO' ? (camera.cameraPositions?.[0]?.crop ?? null) : null;
      };
      await zoom.fill('200');
      await zoom.press('Enter');
      await expect.poll(positionCrop).toEqual({ zoom: 2, panX: 0, panY: 0 });
      expect((await readNativeVideoProject(page))?.version).toBe(11);
      const positionCamera = await readCamera();
      expect(positionCamera?.cameraAppearance).toEqual(destinationBefore?.cameraAppearance);
      expect(positionCamera?.transform).toEqual(destinationBefore?.transform);
      await expect
        .poll(
          async () => circleMaskError(await pixels(stage, frame), beforeCropPixels).insideDifference
        )
        .toBeGreaterThan(5);
      const cropPixels = circleMaskError(await pixels(stage, frame), beforeCropPixels);
      expect(cropPixels.outsideError).toBeLessThan(1);
      await writeFile(
        info.outputPath('position-crop-pixels.json'),
        JSON.stringify(cropPixels, null, 2)
      );
      await operate(page.locator('[data-ui="video-editor.timeline.toolbar.undo"]'));
      await expect.poll(positionCrop).toBeNull();
      await operate(page.locator('[data-ui="video-editor.timeline.toolbar.redo"]'));
      await expect.poll(positionCrop).toEqual({ zoom: 2, panX: 0, panY: 0 });
      const resetCrop = owner.getByRole('button', {
        name: label('videoEditor.sidebar.cameraCropResetPosition'),
        exact: true,
      });
      await resetCrop.scrollIntoViewIfNeeded();
      await checkInspectorPaintedFont(page, zoom, 'camera-position-crop');
      await expect(resetCrop.locator('svg')).toBeVisible();
      await operate(resetCrop);
      await expect.poll(positionCrop).toBeNull();
      await expect(resetCrop).toBeDisabled();
      await operate(page.locator('[data-ui="video-editor.timeline.toolbar.undo"]'));
      await expect.poll(positionCrop).toEqual({ zoom: 2, panX: 0, panY: 0 });
      await expect(resetCrop).toBeEnabled();
      await zoom.scrollIntoViewIfNeeded();
      await page.screenshot({ path: info.outputPath('position-crop.png'), fullPage: false });
      await cameraGeometry(
        page,
        owner,
        (name) => info.outputPath(name.replace('camera-mirror', 'position-crop')),
        zoom
      );
      await operate(page.locator('[data-ui="video-editor.inspector.presentation-toggle"]'));
      await zoom.scrollIntoViewIfNeeded();
      await page.screenshot({ path: info.outputPath('position-crop-all.png'), fullPage: false });
      await page.reload();
      await expect(page.locator('[data-ui="video-editor.timeline.surface"]')).toBeVisible();
      await expect.poll(positionCrop).toEqual({ zoom: 2, panX: 0, panY: 0 });
      await operate(
        page.getByRole('button', {
          name: label('videoEditor.sidebar.sceneProperties'),
          exact: true,
        })
      );
      await page
        .locator(`[data-project-timeline-clip="${camera.id}"]`)
        .click({ modifiers: ['Control'] });
      await selectDestination();
      await zoom.scrollIntoViewIfNeeded();
      await expect(zoom).toHaveValue('200');
      await expect(resetCrop).toBeEnabled();
      await page.screenshot({
        path: info.outputPath('position-crop-reopened.png'),
        fullPage: false,
      });
      await expect
        .poll(() =>
          cropVideo.evaluate((node: HTMLVideoElement) => node.readyState >= 2 && !node.seeking)
        )
        .toBe(true);
      await cropVideo.evaluate((node: HTMLVideoElement) => {
        const load = node.load.bind(node);
        node.dataset['nativeLoadCount'] = '0';
        node.load = () => {
          node.dataset['nativeLoadCount'] = String(Number(node.dataset['nativeLoadCount']) + 1);
          load();
        };
      });
      await operate(
        page.getByRole('button', { name: label('videoEditor.timeline.nextFrame'), exact: true })
      );
      await expect
        .poll(() => cropVideo.evaluate((node: HTMLVideoElement) => node.currentTime))
        .toBeCloseTo(2 + 1 / project.fps, 3);
      expect(await cropVideo.getAttribute('data-native-load-count')).toBe('0');

      await operate(
        page.getByRole('button', {
          name: label('videoEditor.sidebar.inspectorGroupCamera'),
          exact: true,
        })
      );
      const visibility = page.locator('[data-ui="video-editor.camera-visibility"]');
      const visibilitySummary = visibility.locator('summary');
      if ((await visibilitySummary.locator('..').getAttribute('open')) === null)
        await operate(visibilitySummary);
      const hideInterval = visibility.getByRole('button', {
        name: label('videoEditor.sidebar.cameraHideInterval'),
        exact: true,
      });
      const removeInterval = visibility.getByRole('button', {
        name: label('videoEditor.sidebar.cameraShowInterval'),
        exact: true,
      });
      const hiddenRanges = async () => {
        const camera = await readCamera();
        return camera?.type === 'VIDEO' ? (camera.cameraHiddenRanges ?? []) : [];
      };
      const beforeHidden = await readCamera();
      const beforeHiddenProject = await readNativeVideoProject(page);
      const visiblePixels = await pixels(stage, frame);
      await expect(hideInterval).toBeEnabled();
      await operate(hideInterval);
      await expect.poll(hiddenRanges).toEqual([
        {
          id: expect.any(String),
          start: expect.closeTo(2 + 1 / project.fps, 6),
          end: expect.closeTo(3 + 1 / project.fps, 6),
        },
      ]);
      const authoredHidden = await hiddenRanges();
      expect((await readNativeVideoProject(page))?.version).toBe(12);
      const hiddenCamera = await readCamera();
      expect(hiddenCamera).toEqual({ ...beforeHidden, cameraHiddenRanges: authoredHidden });
      expect((await readNativeVideoProject(page))?.assets).toEqual(beforeHiddenProject?.assets);
      expect(
        (await readNativeVideoProject(page))?.clips.filter((clip) => clip.id !== camera.id)
      ).toEqual(beforeHiddenProject?.clips.filter((clip) => clip.id !== camera.id));
      await expect
        .poll(async () => pixelError(visiblePixels, await pixels(stage, frame), false))
        .toBeGreaterThan(5);
      const intervalPixels = await pixels(stage, frame);
      await opacity.scrollIntoViewIfNeeded();
      await opacity.fill('0');
      await opacity.press('Enter');
      await expect
        .poll(async () => {
          const camera = await readCamera();
          return camera?.type === 'VIDEO' ? camera.cameraPositions?.[0]?.transform.opacity : null;
        })
        .toBe(0);
      await expect
        .poll(async () => pixelError(intervalPixels, await pixels(stage, frame), false))
        .toBeLessThan(1);
      await operate(page.locator('[data-ui="video-editor.timeline.toolbar.undo"]'));
      await expect
        .poll(async () => {
          const camera = await readCamera();
          return camera?.type === 'VIDEO' ? camera.cameraPositions?.[0]?.transform.opacity : null;
        })
        .toBe(1);
      await operate(page.locator('[data-ui="video-editor.timeline.toolbar.undo"]'));
      await expect.poll(hiddenRanges).toEqual([]);
      await expect
        .poll(async () => pixelError(visiblePixels, await pixels(stage, frame), false))
        .toBeLessThan(1);
      await operate(page.locator('[data-ui="video-editor.timeline.toolbar.redo"]'));
      await expect.poll(hiddenRanges).toEqual(authoredHidden);
      await operate(removeInterval);
      await expect.poll(hiddenRanges).toEqual([]);
      await expect
        .poll(async () => pixelError(visiblePixels, await pixels(stage, frame), false))
        .toBeLessThan(1);
      await operate(page.locator('[data-ui="video-editor.timeline.toolbar.undo"]'));
      await expect.poll(hiddenRanges).toEqual(authoredHidden);
      const endField = visibility.getByRole('textbox', {
        name: label('videoEditor.sidebar.cameraHiddenEnd'),
        exact: true,
      });
      const startField = visibility.getByRole('textbox', {
        name: label('videoEditor.sidebar.cameraHiddenStart'),
        exact: true,
      });
      await endField.scrollIntoViewIfNeeded();
      await endField.fill('4');
      await endField.press('Enter');
      await expect.poll(hiddenRanges).toEqual([{ ...authoredHidden[0], end: 4 }]);
      const retainedHidden = await hiddenRanges();
      await checkInspectorPaintedFont(page, endField, 'camera-hidden');
      await expect(hideInterval.locator('svg')).toBeVisible();
      await expect(removeInterval.locator('svg')).toBeVisible();
      await page.screenshot({ path: info.outputPath('camera-hidden.png'), fullPage: false });
      await cameraGeometry(
        page,
        visibility,
        (name) => info.outputPath(name.replace('camera-mirror', 'camera-hidden')),
        endField
      );
      await operate(page.locator('[data-ui="video-editor.inspector.presentation-toggle"]'));
      await endField.scrollIntoViewIfNeeded();
      await page.screenshot({ path: info.outputPath('camera-hidden-all.png'), fullPage: false });
      await page.reload();
      await expect(page.locator('[data-ui="video-editor.timeline.surface"]')).toBeVisible();
      await expect.poll(hiddenRanges).toEqual(retainedHidden);
      await operate(
        page.getByRole('button', {
          name: label('videoEditor.sidebar.sceneProperties'),
          exact: true,
        })
      );
      await page
        .locator(`[data-project-timeline-clip="${camera.id}"]`)
        .click({ modifiers: ['Control'] });
      await operate(
        page.getByRole('button', {
          name: label('videoEditor.sidebar.inspectorGroupCamera'),
          exact: true,
        })
      );
      if ((await visibilitySummary.locator('..').getAttribute('open')) === null)
        await operate(visibilitySummary);
      await endField.scrollIntoViewIfNeeded();
      await expect(endField).toHaveValue('4');
      await expect(startField).toHaveValue((2 + 1 / project.fps).toFixed(3));
      await expect(removeInterval).toBeEnabled();
      await page.screenshot({
        path: info.outputPath('camera-hidden-reopened.png'),
        fullPage: false,
      });
      await writeFile(
        info.outputPath('camera-hidden-proof.json'),
        JSON.stringify(
          {
            ranges: retainedHidden,
            difference: pixelError(visiblePixels, intervalPixels, false),
            cameraDataRetained: true,
          },
          null,
          2
        )
      );

      if (index === 0) {
        await page.setViewportSize({ width: 1200, height: 560 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true
        );
        const workspace = page.locator('[data-ui="video-editor.workspace.root"]');
        expect(await workspace.evaluate((node) => node.scrollWidth > node.clientWidth)).toBe(true);
        await workspace.evaluate((node) => {
          node.scrollLeft = node.scrollWidth;
        });
        expect(await workspace.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0);
      }
      expect(errors).toEqual([]);
    } finally {
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}

for (const variant of [
  { viewport: PRIMARY_BROWSER_VIEWPORTS[1], source: true, physical: false, fractional: false },
  { viewport: PRIMARY_BROWSER_VIEWPORTS[1], source: true, physical: false, fractional: true },
  { viewport: PRIMARY_BROWSER_VIEWPORTS[1], source: true, physical: true, fractional: false },
  { viewport: PRIMARY_BROWSER_VIEWPORTS[0], source: false, physical: false, fractional: false },
]) {
  const behavior = variant.fractional
    ? 'fractional retained source'
    : variant.physical
      ? 'physical EOF'
      : variant.source
        ? 'retained source'
        : 'crop gestures';
  test(`Native camera ${behavior} ${variant.viewport.name}`, async ({ page }, info) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ ...variant.viewport.size });
    if (variant.source) await page.addInitScript(installCameraFrameObserver);
    const host = await startHostServer();
    const label = (key: Parameters<typeof translate>[0]) => translate(key, 'en');
    try {
      const bytes = await readFile(new URL('../fixtures/review-vp8-opus.webm', import.meta.url));
      const project = createCameraFixture(bytes.length, bytes.length);
      project.fps = 10;
      const track = project.tracks.find((item) => item.role === 'CAMERA');
      const camera = project.clips.find((clip) => clip.trackId === track?.id);
      if (!camera || camera.type !== 'VIDEO') throw new Error('Missing retained camera fixture.');
      camera.duration = camera.sourceDuration = variant.physical ? 12 : 1;
      camera.cameraPositions = [];
      if (variant.fractional) {
        camera.sourceDuration = 0.7;
        camera.playbackRate = 0.3;
        camera.duration = camera.sourceDuration / camera.playbackRate;
      }
      if (variant.physical) {
        camera.cameraTiming = { offsetSeconds: -2, transitions: 'bounded' };
        project.version = 32;
      }
      Object.assign(project, hydrateVideoProject(project));
      await applyHarnessBootstrap(page, {
        preserveMediaLibrary: true,
        videoProjects: [project],
        storage: { 'sniptale-locale-preference': 'en', 'sniptale-theme-preference': 'light' },
      });
      await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}?theme=light`);
      await page.locator('[data-ui="gallery.page.root"]').waitFor();
      await seedReviewWebcamBundle(page, 'review-vp8-opus.webm');
      await page.goto(
        `${host.origin}${VIDEO_EDITOR_HARNESS_PATH}?project=${project.id}&theme=light`
      );
      await expect(page.locator('[data-ui="video-editor.timeline.surface"]')).toBeVisible();
      await operate(
        page.getByRole('button', {
          name: label('videoEditor.sidebar.sceneProperties'),
          exact: true,
        })
      );
      await page
        .locator(`[data-project-timeline-clip="${camera.id}"]`)
        .click({ modifiers: ['Control'] });
      await operate(
        page.getByRole('button', {
          name: label('videoEditor.sidebar.inspectorGroupStyle'),
          exact: true,
        })
      );
      const owner = page.locator('[data-ui="video-editor.camera-appearance"]');
      const summary = owner
        .locator('summary')
        .filter({ hasText: label('videoEditor.sidebar.cameraCropSection') });
      if ((await summary.locator('..').getAttribute('open')) === null) await operate(summary);
      const crop = owner.getByRole('button', {
        name: label('videoEditor.sidebar.cameraCropPreview'),
        exact: true,
      });
      const front = owner.locator(
        '[data-ui="video-editor.camera-crop"] [data-preview-inspector-canvas]'
      );
      await crop.scrollIntoViewIfNeeded();
      await expect(crop).toBeEnabled();
      await expectGpuCanvas(front);
      const readCamera = async () => {
        const clip = (await readNativeVideoProject(page))?.clips.find(
          (item) => item.id === camera.id
        );
        if (!clip || clip.type !== 'VIDEO') throw new Error('Missing saved camera.');
        return clip;
      };
      if (variant.fractional) {
        const playhead = page.locator('[data-ui="video-editor.timeline.playhead-handle"]');
        await playhead.focus();
        await playhead.press('Home');
        for (let index = 0; index < 23; index++) await playhead.press('ArrowRight');
        await expect
          .poll(async () => Number(await playhead.getAttribute('aria-valuenow')))
          .toBeCloseTo(2.3, 6);
        await expect.poll(() => cameraFrameImports(front)).toContain(600_000);
        const reference = await pixels(front);
        await playhead.press('End');
        await expect
          .poll(async () => Number(await playhead.getAttribute('aria-valuenow')))
          .toBeGreaterThan(camera.startTime + camera.duration);
        await expect(crop).toBeEnabled();
        await expect
          .poll(async () => pixelError(reference, await pixels(front), false))
          .toBeLessThan(1);
        const imports = await cameraFrameImports(front);
        expect(imports.at(-1)).toBe(600_000);
        expect(imports).not.toContain(700_000);
        expect((await readCamera()).sourceDuration).toBe(0.7);
        expect((await readCamera()).playbackRate).toBe(0.3);
        await writeFile(
          info.outputPath('camera-fractional-retained-source.json'),
          JSON.stringify(
            {
              viewport: variant.viewport.size,
              sourceSHA256: createHash('sha256').update(bytes).digest('hex'),
              retainedEnd: 0.7,
              playbackRate: 0.3,
              clipDuration: camera.duration,
              projectTime: Number(await playhead.getAttribute('aria-valuenow')),
              expectedPTS: 0.6,
              imports,
              pixelError: pixelError(reference, await pixels(front), false),
              inspector: await sourceColors(front),
            },
            null,
            2
          )
        );
      } else if (variant.physical) {
        const screen = project.clips.find((clip) => clip.type === 'VIDEO' && clip.id !== camera.id);
        if (!screen) throw new Error('Missing screen clock fixture.');
        const playhead = page.locator('[data-ui="video-editor.timeline.playhead-handle"]');
        const ruler = page.locator('[data-ui="video-editor.timeline.ruler"]');
        const seek = async (time: number) => {
          const [clipBox, rulerBox] = await Promise.all([
            page.locator(`[data-project-timeline-clip="${screen.id}"]`).boundingBox(),
            ruler.boundingBox(),
          ]);
          if (!clipBox || !rulerBox) throw new Error('Timeline clock geometry is unavailable.');
          await ruler.click({
            position: {
              x:
                clipBox.x -
                rulerBox.x +
                ((time - screen.startTime) / screen.duration) * clipBox.width,
              y: 8,
            },
          });
        };
        const clock = async () => Number(await playhead.getAttribute('aria-valuenow'));
        await seek(9.94);
        await expect.poll(clock).toBeGreaterThanOrEqual(9.9 - 0.000001);
        await expect.poll(clock).toBeLessThan(10);
        await expect.poll(() => cameraFrameImports(front)).toContain(11_900_000);
        const referenceTime = await clock();
        const reference = await pixels(front);
        await seek(11);
        await expect.poll(clock).toBeGreaterThan(10.9);
        await expect.poll(clock).toBeLessThan(11.1);
        await expect(crop).toBeEnabled();
        await expect
          .poll(async () => pixelError(reference, await pixels(front), false))
          .toBeLessThan(1);
        const imports = await cameraFrameImports(front);
        expect(imports.at(-1)).toBe(11_900_000);
        expect((await readCamera()).cameraTiming?.offsetSeconds).toBe(-2);
        expect((await readCamera()).sourceDuration).toBe(12);
        await writeFile(
          info.outputPath('camera-physical-eof.json'),
          JSON.stringify(
            {
              viewport: variant.viewport.size,
              sourceSHA256: createHash('sha256').update(bytes).digest('hex'),
              verifiedSourceEnd: 12,
              expectedPTS: 11.9,
              retainedRange: { start: 2, end: 14 },
              referenceProjectTime: referenceTime,
              projectTime: await clock(),
              mappedSourceTime: (await clock()) + 2,
              imports,
              inspector: await sourceColors(front),
              pixelError: pixelError(reference, await pixels(front), false),
            },
            null,
            2
          )
        );
      } else if (variant.source) {
        const playhead = page.locator('[data-ui="video-editor.timeline.playhead-handle"]');
        await playhead.focus();
        await playhead.press('Home');
        for (let index = 0; index < 9; index++) await playhead.press('ArrowRight');
        await expect
          .poll(async () => Number(await playhead.getAttribute('aria-valuenow')))
          .toBeCloseTo(0.9, 6);
        await expect.poll(() => cameraFrameImports(front)).toContain(900_000);
        const retained = await pixels(front);
        await expect
          .poll(() => cameraFrameImports(page.locator('[data-preview-stage-canvas]')))
          .toContain(900_000);
        const sourceFrame = {
          x: camera.transform.x / project.width,
          y: camera.transform.y / project.height,
          width: camera.transform.width / project.width,
          height: camera.transform.height / project.height,
        };
        await expect
          .poll(async () =>
            sourceColorError(
              (await sourceColors(page.locator('[data-preview-stage-canvas]'), sourceFrame)).colors,
              (await sourceColors(front)).colors
            )
          )
          .toBeLessThan(4);
        const matchedSourceColors = {
          main: await sourceColors(page.locator('[data-preview-stage-canvas]'), sourceFrame),
          inspector: await sourceColors(front),
        };
        for (let index = 0; index < 11; index++) await playhead.press('ArrowRight');
        await expect
          .poll(async () => Number(await playhead.getAttribute('aria-valuenow')))
          .toBeCloseTo(2, 6);
        await expect(crop).toBeEnabled();
        await expect
          .poll(async () => pixelError(retained, await pixels(front), false))
          .toBeLessThan(1);
        const imports = await cameraFrameImports(front);
        expect(imports.at(-1)).toBe(900_000);
        expect(imports).not.toContain(1_000_000);
        expect((await readCamera()).sourceDuration).toBe(1);
        const retainedError = pixelError(retained, await pixels(front), false);
        const gpuColors = await sourceColors(front);
        await expect
          .poll(
            async () =>
              sourceColorError(
                matchedSourceColors.main.colors,
                (await sourceColors(page.locator('[data-preview-stage-canvas]'), sourceFrame))
                  .colors
              ),
            {
              message:
                'A different main frame must replace the GPU reference before Standard is selected',
            }
          )
          .toBeGreaterThan(4);
        await page.locator('[data-ui="video.preview.display-settings"]').click();
        const display = page.locator('[data-ui="video.preview.display-settings.panel"]');
        await display
          .getByRole('radio', {
            name: label('editor.scene.previewRendererLegacy'),
            exact: true,
          })
          .check();
        await display.press('Escape');
        await expect
          .poll(() =>
            front.evaluate((node: HTMLCanvasElement) => {
              try {
                return node.getContext('2d') !== null;
              } catch {
                return false;
              }
            })
          )
          .toBe(true);
        await expect
          .poll(async () => sourceColorError(gpuColors.colors, (await sourceColors(front)).colors))
          .toBeLessThan(4);
        await playhead.focus();
        await playhead.press('Home');
        for (let index = 0; index < 9; index++) await playhead.press('ArrowRight');
        await expect
          .poll(async () => Number(await playhead.getAttribute('aria-valuenow')))
          .toBeCloseTo(0.9, 6);
        await expect
          .poll(
            async () =>
              sourceColorError(
                matchedSourceColors.main.colors,
                (await sourceColors(page.locator('[data-preview-stage-canvas]'), sourceFrame))
                  .colors
              ),
            { message: 'Standard main source pixels must match the canonical GPU reference' }
          )
          .toBeLessThan(4);
        const standardMain = await sourceColors(
          page.locator('[data-preview-stage-canvas]'),
          sourceFrame
        );
        await writeFile(
          info.outputPath('camera-retained-source.json'),
          JSON.stringify(
            {
              viewport: variant.viewport.size,
              sourceSHA256: createHash('sha256').update(bytes).digest('hex'),
              sourceDimensions: { width: 160, height: 90 },
              outputDimensions: { width: project.width, height: project.height },
              inspector: await sourceColors(front),
              requestedTime: 1,
              expectedPTS: 0.9,
              expectedNextPTS: 1,
              imports,
              pixelError: retainedError,
              matchedSourceColors,
              standardMain,
              gpu: gpuColors,
              canvas: await sourceColors(front),
            },
            null,
            2
          )
        );
      } else {
        const zoom = owner.getByRole('textbox', {
          name: label('videoEditor.sidebar.cameraCropZoom'),
          exact: true,
        });
        const unzoomed = await pixels(front);
        await zoom.scrollIntoViewIfNeeded();
        await zoom.fill('200');
        await zoom.press('Enter');
        await expect.poll(async () => (await readCamera()).cameraAppearance?.zoom).toBe(2);
        await expect
          .poll(async () => pixelError(unzoomed, await pixels(front), false))
          .toBeGreaterThan(5);
        const before = await readCamera();
        const schemaVersion = (await readNativeVideoProject(page))!.version;
        const baseline = await pixels(front);
        const readCrop = async () => (await readCamera()).cameraAppearance;
        await crop.scrollIntoViewIfNeeded();
        const box = await crop.boundingBox();
        if (!box) throw new Error('Camera crop bounds are unavailable.');
        const x = box.x + box.width / 2,
          y = box.y + box.height / 2;
        await page.mouse.move(x, y);
        await page.mouse.down();
        await page.mouse.move(x + 18, y + 8);
        await expect
          .poll(async () => pixelError(baseline, await pixels(front), false))
          .toBeGreaterThan(1);
        expect(await readCrop()).toEqual(before.cameraAppearance);
        expect((await readNativeVideoProject(page))!.version).toBe(schemaVersion);
        await crop.press('Escape');
        await page.mouse.up();
        expect(await readCrop()).toEqual(before.cameraAppearance);
        await expect
          .poll(async () => pixelError(baseline, await pixels(front), false))
          .toBeLessThan(1);
        await page.mouse.move(x, y);
        await page.mouse.down();
        await page.mouse.move(x + 18, y + 8);
        await page.mouse.up();
        await expect.poll(readCrop).not.toEqual(before.cameraAppearance);
        await expect
          .poll(async () => (await readNativeVideoProject(page))!.version)
          .toBe(schemaVersion);
        await operate(page.locator('[data-ui="video-editor.timeline.toolbar.undo"]'));
        await expect.poll(readCrop).toEqual(before.cameraAppearance);
        await expect
          .poll(async () => pixelError(baseline, await pixels(front), false))
          .toBeLessThan(1);
      }
      await page.screenshot({
        path: info.outputPath('camera-source-inspector.png'),
        fullPage: false,
      });
    } finally {
      host.server.closeAllConnections();
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}
