import { hydrateVideoProject } from '../../../../apps/extension/src/features/video/project/hydration';
import { readFile, writeFile } from 'node:fs/promises';
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

async function operate(control: Locator) {
  await control.scrollIntoViewIfNeeded();
  await control.click();
}

async function pixels(
  canvas: Locator,
  frame?: { x: number; y: number; width: number; height: number }
) {
  return canvas.evaluate((node: HTMLCanvasElement, area) => {
    const context = node.getContext('2d');
    if (!context) throw new Error('Missing native camera canvas');
    const x = Math.round((area?.x ?? 0) * node.width) + 2;
    const y = Math.round((area?.y ?? 0) * node.height) + 2;
    const width = Math.round((area?.width ?? 1) * node.width) - 4;
    const height = Math.round((area?.height ?? 1) * node.height) - 4;
    if (width < 4 || height < 4) throw new Error('Camera pixels are unavailable');
    return { width, height, data: [...context.getImageData(x, y, width, height).data] };
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

async function cameraGeometry(page: Page, owner: Locator, capture: (name: string) => string) {
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
    await owner.locator('[aria-pressed]').first().scrollIntoViewIfNeeded();
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

for (const [index, viewport] of PRIMARY_BROWSER_VIEWPORTS.entries()) {
  const locale = index === 0 ? 'en' : 'ru';
  const theme = index === 0 ? 'dark' : 'light';
  test(`camera mirror retains source pixels and montage placement ${viewport.size.width} ${locale}`, async ({
    page,
  }, info) => {
    test.setTimeout(90000);
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
            size: screenBytes.length,
          },
        ],
        webcamVideo: {
          recordingId: 'webcam-clock',
          filename: 'camera-clock.webm',
          width: 160,
          height: 90,
          duration: 12,
          mimeType: 'video/webm',
          size: cameraBytes.length,
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
      const preview = owner.locator('[data-ui="video-editor.camera-crop"] canvas');
      await expect(
        owner.getByRole('button', {
          name: label('videoEditor.sidebar.cameraCropPreview'),
          exact: true,
        })
      ).toBeEnabled();
      const stage = page.locator('[data-preview-stage-canvas]');
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
