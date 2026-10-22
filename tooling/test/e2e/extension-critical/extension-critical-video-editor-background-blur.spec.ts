import { build } from 'esbuild';
import { createSceneGradientBackground } from '../../../../apps/extension/src/features/video/project/scene/background-gradient';
import { readFile, writeFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { createVideoProjectFromRecording } from '../../../../apps/extension/src/features/video/project/factories/creation';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { seedReviewVideo } from '../support/quick-editor-media-fixture';
import { readNativeVideoProject } from '../support/native-video-project';
import { checkInspectorPaintedFont } from '../support/inspector-utilities';
import { startHostServer } from '../support/host-server';
import {
  applyHarnessBootstrap,
  GALLERY_HARNESS_PATH,
  VIDEO_EDITOR_HARNESS_PATH,
  OFFSCREEN_HARNESS_PATH,
  emitTrustedOffscreenHarnessRuntimeMessage,
  getRuntimeMessagesByType,
  VideoMessageType,
} from '../extension-critical.helpers';

const imageColor = [37, 99, 235];
const fallback = [238, 242, 247];

async function openBackground(page: Page, origin: string, locale: 'en' | 'ru', theme: string) {
  const bytes = await readFile(new URL('../fixtures/review-vp8-opus.webm', import.meta.url));
  const project = createVideoProjectFromRecording({
    recordingId: 'beta-v1-recording',
    filename: 'beta-v1.webm',
    width: 160,
    height: 90,
    duration: 12,
    mimeType: 'video/webm',
    size: bytes.length,
  });
  project.version = 16;
  project.sceneBackground = {
    ...createSceneGradientBackground('#123456ff'),
    blur: 12,
    animation: { mode: 'breathe', speed: 42, intensity: 61 },
  };
  project.width = 1280;
  project.height = 720;
  project.clips = project.clips.map((clip) => ({
    ...clip,
    duration: 1.2,
    sourceDuration: 1.2,
    transform: { ...clip.transform, x: 760, y: 180, width: 360, height: 202.5 },
  }));
  project.duration = 1.2;
  await applyHarnessBootstrap(page, {
    preserveMediaLibrary: true,
    videoProjects: [project],
    storage: { 'sniptale-locale-preference': locale, 'sniptale-theme-preference': theme },
  });
  await page.addInitScript((language) => {
    localStorage.setItem('sniptale-locale-preference', language);
    if (sessionStorage.getItem('background-blur-seeded')) {
      const bootstrap: unknown = Reflect.get(window, '__sniptaleHarnessBootstrap');
      if (typeof bootstrap === 'object' && bootstrap !== null)
        Reflect.deleteProperty(bootstrap, 'videoProjects');
    }
  }, locale);
  await page.goto(`${origin}${GALLERY_HARNESS_PATH}?theme=${theme}`);
  await page.locator('[data-ui="gallery.page.root"]').waitFor();
  await seedReviewVideo(page, 'review-vp8-opus.webm', { width: 160, height: 90, duration: 12 });
  await page.evaluate(() => sessionStorage.setItem('background-blur-seeded', 'true'));
  await page.goto(`${origin}${VIDEO_EDITOR_HARNESS_PATH}?project=${project.id}&theme=${theme}`);
  await expect(page.locator('[data-ui="video-editor.timeline.surface"]')).toBeVisible();
  return project;
}

async function selectBackground(page: Page, locale: 'en' | 'ru') {
  await page
    .getByRole('button', {
      name: translate('videoEditor.sidebar.sceneProperties', locale),
      exact: true,
    })
    .click();
  const background = page.getByRole('button', {
    name: translate('videoEditor.sidebar.inspectorGroupBackground', locale),
    exact: true,
  });
  if (await background.isVisible()) await background.click();
  return page.locator('[data-ui="video-editor.scene-background"]');
}

async function importBackground(page: Page, locale: 'en' | 'ru') {
  const owner = await selectBackground(page, locale);
  await owner
    .getByRole('button', {
      name: translate('videoEditor.sidebar.sceneBackgroundImage', locale),
      exact: true,
    })
    .click();
  await owner.locator('[data-ui="background.image.picker"] input[type="file"]').setInputFiles({
    name: 'retained-background.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="160"><rect width="80" height="160" fill="#2563eb"/></svg>'
    ),
  });
  await expect
    .poll(async () => (await readNativeVideoProject(page))?.sceneBackground?.kind)
    .toBe('image');
  return owner;
}

for (const [index, viewport] of PRIMARY_BROWSER_VIEWPORTS.entries()) {
  const locale = index === 0 ? 'en' : 'ru',
    theme = index === 0 ? 'dark' : 'light';
  test(`background blur preserves montage ${viewport.size.width} ${locale}`, async ({
    page,
  }, info) => {
    test.setTimeout(180000);
    await page.setViewportSize({ ...viewport.size });
    await page.emulateMedia({ colorScheme: theme });
    const host = await startHostServer();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    try {
      const project = await openBackground(page, host.origin, locale, theme);
      const owner = await importBackground(page, locale);
      const field = owner.getByRole('textbox', {
        name: translate('editor.scene.backgroundBlurAmount', locale),
        exact: true,
      });
      await expect(field).toHaveValue('12');
      await field.fill('18');
      await field.press('Enter');
      await expect
        .poll(async () => (await readNativeVideoProject(page))?.sceneBackground?.blur)
        .toBe(18);
      await page.locator('[data-ui="video-editor.timeline.toolbar.undo"]').click();
      await expect
        .poll(async () => (await readNativeVideoProject(page))?.sceneBackground?.blur)
        .toBe(12);
      await page.locator('[data-ui="video-editor.timeline.toolbar.redo"]').click();
      await expect
        .poll(async () => (await readNativeVideoProject(page))?.sceneBackground?.blur)
        .toBe(18);
      await field.fill('0');
      await field.press('Enter');
      await expect
        .poll(async () => (await readNativeVideoProject(page))?.sceneBackground?.blur)
        .toBe(0);
      await field.fill('12');
      await field.press('Enter');
      await expect
        .poll(async () => (await readNativeVideoProject(page))?.sceneBackground?.blur)
        .toBe(12);
      await checkInspectorPaintedFont(page, field, 'background-blur');
      const first = (await readNativeVideoProject(page))!.sceneBackground;
      if (first?.kind !== 'image') throw new Error('Missing original image');
      await owner.locator('[data-ui="background.image.picker"] input[type="file"]').setInputFiles({
        name: 'second-blur-background.svg',
        mimeType: 'image/svg+xml',
        buffer: Buffer.from(
          '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="160"><title>Second source</title><rect width="80" height="160" fill="#2563eb"/></svg>'
        ),
      });
      await expect
        .poll(async () => {
          const background = (await readNativeVideoProject(page))?.sceneBackground;
          return background?.kind === 'image' ? background.assetId : first.assetId;
        })
        .not.toBe(first.assetId);
      expect((await readNativeVideoProject(page))?.sceneBackground?.blur).toBe(12);
      const source = owner.locator('button[aria-haspopup="listbox"]');
      await source.click();
      await page.getByRole('option', { name: 'retained-background.png', exact: true }).click();
      await expect
        .poll(async () => {
          const background = (await readNativeVideoProject(page))?.sceneBackground;
          return background?.kind === 'image' ? background.assetId : null;
        })
        .toBe(first.assetId);
      expect((await readNativeVideoProject(page))?.sceneBackground?.blur).toBe(12);
      const initial = (await readNativeVideoProject(page))!;
      if (initial.sceneBackground?.kind !== 'image') throw new Error('Missing background image');
      const imageId = initial.sceneBackground.assetId;
      const fit = owner.getByRole('button', {
        name: translate('videoEditor.sidebar.sceneBackgroundImageContain', locale),
        exact: true,
      });
      await fit.click();
      const readFit = async () => {
        const background = (await readNativeVideoProject(page))?.sceneBackground;
        return background?.kind === 'image' ? background.imageFit : undefined;
      };
      await expect.poll(readFit).toBe('contain');
      await page.locator('[data-ui="video-editor.timeline.toolbar.undo"]').click();
      await expect.poll(readFit).toBeUndefined();
      await page.locator('[data-ui="video-editor.timeline.toolbar.redo"]').click();
      await expect.poll(readFit).toBe('contain');
      const switchKind = async (
        key: 'sceneBackgroundSolid' | 'sceneBackgroundGradient' | 'sceneBackgroundImage'
      ) => {
        await owner
          .getByRole('button', {
            name: translate(`videoEditor.sidebar.${key}`, locale),
            exact: true,
          })
          .click();
        const kind =
          key === 'sceneBackgroundSolid'
            ? 'solid'
            : key === 'sceneBackgroundGradient'
              ? 'gradient'
              : 'image';
        await expect
          .poll(async () => (await readNativeVideoProject(page))?.sceneBackground?.kind)
          .toBe(kind);
      };
      await switchKind('sceneBackgroundGradient');
      const gradient = (await readNativeVideoProject(page))!.sceneBackground;
      await expect(page.locator('[data-ui="video-editor.materials.remove-unused"]')).toBeEnabled();
      expect((await readNativeVideoProject(page))?.assets).toEqual(initial.assets);
      expect(gradient).toMatchObject({ animation: { mode: 'breathe', speed: 42, intensity: 61 } });
      await switchKind('sceneBackgroundSolid');
      expect((await readNativeVideoProject(page))?.sceneBackground?.blur).toBe(12);
      await expect(field).toHaveCount(0);
      await switchKind('sceneBackgroundGradient');
      await expect
        .poll(async () => {
          const value = (await readNativeVideoProject(page))?.sceneBackground;
          return value?.kind === 'gradient' ? value.gradient : null;
        })
        .toEqual(gradient?.kind === 'gradient' ? gradient.gradient : null);
      await switchKind('sceneBackgroundImage');
      await expect.poll(readFit).toBe('contain');
      expect((await readNativeVideoProject(page))?.sceneBackground).toMatchObject({
        assetId: imageId,
      });
      const pixelError = async () =>
        page.locator('[data-preview-stage-canvas]').evaluate(
          (node: HTMLCanvasElement, colors) => {
            const context = node.getContext('2d')!;
            let error = 0,
              count = 0;
            for (const u of [0.1, 0.2, 0.4, 0.5])
              for (const v of [0.15, 0.85]) {
                const data = context.getImageData(
                  Math.round(node.width * u),
                  Math.round(node.height * v),
                  1,
                  1
                ).data;
                const expected = u < 0.359375 ? colors.fallback : colors.imageColor;
                for (let channel = 0; channel < 3; channel++)
                  error += Math.abs(data[channel]! - expected[channel]!);
                count++;
              }
            return { meanError: error / (count * 3), samples: count };
          },
          { imageColor, fallback }
        );
      await expect.poll(async () => (await pixelError()).meanError).toBeLessThanOrEqual(1);
      const blurredBoundary = await page
        .locator('[data-preview-stage-canvas]')
        .evaluate((node: HTMLCanvasElement) => {
          const context = node.getContext('2d')!;
          const erf = (x: number) => {
            const sign = Math.sign(x),
              a = Math.abs(x),
              t = 1 / (1 + 0.3275911 * a);
            return (
              sign *
              (1 -
                ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t +
                  0.254829592) *
                  t *
                  Math.exp(-a * a))
            );
          };
          const results = [];
          for (const delta of [-12, 0, 12]) {
            const x = Math.round(node.width * (0.359375 + delta / 1280));
            const pixel = Array.from(
              context.getImageData(x, Math.round(node.height * 0.85), 1, 1).data
            );
            const weight =
              (1 + erf((((x + 0.5) / node.width) * 1280 - 460) / (12 * Math.SQRT2))) / 2;
            const expected = [238, 242, 247].map(
              (c, i) => c * (1 - weight) + [37, 99, 235][i]! * weight
            );
            results.push({ pixel, expected });
          }
          return results;
        });
      for (const { pixel, expected } of blurredBoundary) {
        expect(pixel[3]).toBe(255);
        for (let c = 0; c < 3; c++) expect(Math.abs(pixel[c]! - expected[c]!)).toBeLessThan(8);
      }

      await owner
        .getByRole('button', {
          name: translate('videoEditor.sidebar.sceneBackgroundImageCover', locale),
          exact: true,
        })
        .click();
      await expect.poll(readFit).toBe('cover');
      await expect
        .poll(async () =>
          page
            .locator('[data-preview-stage-canvas]')
            .evaluate((node: HTMLCanvasElement) =>
              [
                ...node
                  .getContext('2d')!
                  .getImageData(Math.round(node.width * 0.1), Math.round(node.height * 0.15), 1, 1)
                  .data,
              ].slice(0, 3)
            )
        )
        .toEqual(imageColor);
      await fit.click();
      await expect.poll(readFit).toBe('contain');
      await expect.poll(async () => (await pixelError()).meanError).toBeLessThanOrEqual(1);
      await checkInspectorPaintedFont(page, field, 'background-blur');
      await field.scrollIntoViewIfNeeded();
      await page.screenshot({ path: info.outputPath('background-blur.png'), fullPage: false });
      const close = page.locator('[data-ui="video-editor.materials.close"]');
      if (await close.isVisible()) await close.click();
      const inspector = page.locator('[data-ui="video-editor.floating.context-inspector"]');
      const handle = page.locator('[data-ui="video-editor.floating.context-inspector.resize"]');
      const rail = inspector.locator('[data-ui="video-editor.inspector.categories"] > nav');
      for (const size of [359, 360, 361]) {
        const current = (await inspector.boundingBox())!.width,
          box = (await handle.boundingBox())!;
        await page.mouse.move(box.x + box.width / 2, box.y + 12);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width / 2 + current - size, box.y + 12);
        await page.mouse.up();
        await expect
          .poll(async () => Math.round((await inspector.boundingBox())!.width))
          .toBe(size);
        const before = await rail.boundingBox();
        await field.scrollIntoViewIfNeeded();
        expect(
          await owner.evaluate((node) => {
            const body = node.closest('[data-ui="video-editor.inspector.categories"] > div');
            return body instanceof HTMLElement && body.scrollWidth <= body.clientWidth + 1;
          })
        ).toBe(true);
        expect((await rail.boundingBox())?.y).toBe(before?.y);
        await page.screenshot({ path: info.outputPath(`background-${size}.png`), fullPage: false });
      }
      await page.locator('[data-ui="video-editor.inspector.presentation-toggle"]').click();
      await field.scrollIntoViewIfNeeded();
      await page.screenshot({ path: info.outputPath('background-all.png'), fullPage: false });
      await page.reload();
      await expect(page.locator('[data-ui="video-editor.timeline.surface"]')).toBeVisible();
      await selectBackground(page, locale);
      await expect(fit).toHaveAttribute('aria-pressed', 'true');
      const reopened = (await readNativeVideoProject(page))!;
      expect(reopened.assets).toEqual(initial.assets);
      expect(reopened.clips).toEqual(initial.clips);
      expect(reopened.width).toBe(project.width);
      expect(reopened.height).toBe(project.height);
      expect(reopened.version).toBe(16);
      expect(reopened.sceneBackground?.blur).toBe(12);
      expect(reopened.sceneBackground).toMatchObject({
        assetId: imageId,
        imageFit: 'contain',
        remembered: { gradient: expect.any(Object), solid: expect.any(Object) },
      });
      await page.screenshot({ path: info.outputPath('background-reopened.png'), fullPage: false });
      if (index === 0) {
        await page.setViewportSize({ width: 1200, height: 560 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true
        );
      }
      await writeFile(
        info.outputPath('background-proof.json'),
        JSON.stringify(
          {
            pixelProof: await pixelError(),
            assetId: imageId,
            retainedAssets: reopened.assets.length,
          },
          null,
          2
        )
      );
      expect(errors).toEqual([]);
    } finally {
      host.server.closeAllConnections();
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}

for (const format of ['WEBM', 'MP4'] as const) {
  test(`encoded ${format} background blur preserves scene composition`, async ({ page }, info) => {
    test.setTimeout(180000);
    await page.setViewportSize({ width: 1280, height: 560 });
    const host = await startHostServer();
    try {
      await openBackground(page, host.origin, 'en', 'dark');
      const owner = await importBackground(page, 'en');
      await owner
        .getByRole('button', {
          name: translate('videoEditor.sidebar.sceneBackgroundImageContain', 'en'),
          exact: true,
        })
        .click();
      await expect
        .poll(async () => {
          const value = (await readNativeVideoProject(page))?.sceneBackground;
          return value?.kind === 'image' ? value.imageFit : undefined;
        })
        .toBe('contain');
      const project = (await readNativeVideoProject(page))!;
      project.width = 320;
      project.height = 180;
      project.clips = project.clips.map((clip) => ({
        ...clip,
        transform: {
          ...clip.transform,
          x: clip.transform.x / 4,
          y: clip.transform.y / 4,
          width: clip.transform.width / 4,
          height: clip.transform.height / 4,
        },
      }));
      if (project.sceneBackground) project.sceneBackground.blur = 3;
      const before = structuredClone(project);
      await page.goto(`${host.origin}${OFFSCREEN_HARNESS_PATH}`);
      await page.locator('[data-ui="offscreen.harness.root"][data-state="ready"]').waitFor();
      const jobId = `background-blur-${format}`;
      const input = await page.evaluate(
        async ({ jobId, project }) => {
          if (!window.__sniptaleOffscreenHarness) throw new Error('Missing offscreen bridge');
          return window.__sniptaleOffscreenHarness.stageProjectExportInput(jobId, project);
        },
        { jobId, project }
      );
      await emitTrustedOffscreenHarnessRuntimeMessage(page, {
        type: VideoMessageType.OFFSCREEN_START_PROJECT_EXPORT,
        input,
        jobId,
        settings: {
          burnInSubtitles: false,
          downloadAfterExport: false,
          format,
          fps: 5,
          width: 320,
          height: 180,
          quality: 'MEDIUM',
          resolution: 'SOURCE',
          scope: 'project',
          subtitleSidecarFormats: [],
          ...(format === 'MP4' ? { mp4VideoCodec: 'VP9' } : { webmVideoCodec: 'VP9' }),
        },
      });
      await expect
        .poll(
          async () => {
            const failed = await getRuntimeMessagesByType(
              page,
              VideoMessageType.PROJECT_EXPORT_FAILED
            );
            if (failed.some((message) => message.jobId === jobId))
              throw new Error(JSON.stringify(failed));
            return (
              await getRuntimeMessagesByType(page, VideoMessageType.PROJECT_EXPORT_COMPLETED)
            ).some((message) => message.jobId === jobId);
          },
          { timeout: 60000 }
        )
        .toBe(true);
      const completion = (
        await getRuntimeMessagesByType(page, VideoMessageType.PROJECT_EXPORT_COMPLETED)
      ).find((message) => message.jobId === jobId)!;
      if (typeof completion.exportId !== 'string') throw new Error('Missing export');
      const proof = await page.evaluate(
        async ({ exportId, imageColor, fallback }) => {
          const db = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open('sniptale-db');
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);
          });
          const entry: unknown = await new Promise((resolve, reject) => {
            const request = db
              .transaction('project_exports')
              .objectStore('project_exports')
              .get(exportId);
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);
          });
          db.close();
          if (
            typeof entry !== 'object' ||
            entry === null ||
            !('assetId' in entry) ||
            typeof entry.assetId !== 'string'
          )
            throw new Error('Missing encoded asset');
          const objects = await (
            await (await navigator.storage.getDirectory()).getDirectoryHandle('sniptale-assets')
          ).getDirectoryHandle('objects');
          const file = await (await objects.getFileHandle(entry.assetId)).getFile();
          const originalFile = await (
            await objects.getFileHandle('beta-v1-recording-asset')
          ).getFile();
          const originalUrl = URL.createObjectURL(originalFile),
            original = document.createElement('video');
          original.muted = true;
          original.src = originalUrl;
          await new Promise<void>((resolve, reject) => {
            original.onloadeddata = () => resolve();
            original.onerror = () => reject(new Error('Source decode failed'));
          });
          const url = URL.createObjectURL(file),
            video = document.createElement('video');
          video.muted = true;
          video.src = url;
          try {
            await new Promise<void>((resolve, reject) => {
              video.onloadeddata = () => resolve();
              video.onerror = () => reject(new Error('Decode failed'));
            });
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const context = canvas.getContext('2d')!;
            const frames = [];
            for (const time of [0.2, 0.8]) {
              await new Promise<void>((resolve) => {
                video.onseeked = () => resolve();
                video.currentTime = time;
              });
              await new Promise<void>((resolve) => {
                original.onseeked = () => resolve();
                original.currentTime = time;
              });
              context.drawImage(video, 0, 0, canvas.width, canvas.height);
              let error = 0,
                samples = 0;
              for (const u of [0.1, 0.2, 0.4, 0.5])
                for (const v of [0.15, 0.85]) {
                  const data = context.getImageData(
                    Math.round(canvas.width * u),
                    Math.round(canvas.height * v),
                    1,
                    1
                  ).data;
                  const expected = u < 0.359375 ? fallback : imageColor;
                  for (let channel = 0; channel < 3; channel++)
                    error += Math.abs(data[channel]! - expected[channel]!);
                  samples++;
                }
              const boundary = [];
              for (const delta of [-3, 0, 3]) {
                const x = 115 + delta,
                  pixel = Array.from(context.getImageData(x, 150, 1, 1).data);
                const z = (x + 0.5 - 115) / 3;
                const a = Math.abs(z / Math.SQRT2),
                  t = 1 / (1 + 0.3275911 * a);
                const polynomial =
                  ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t +
                    0.254829592) *
                  t;
                const erf = Math.sign(z) * (1 - polynomial * Math.exp(-a * a));
                const w = (1 + erf) / 2;
                const expected = fallback.map((c, i) => c * (1 - w) + imageColor[i]! * w);
                boundary.push({ pixel, expected });
              }
              const reference = document.createElement('canvas');
              reference.width = canvas.width;
              reference.height = canvas.height;
              const sourceContext = reference.getContext('2d')!;
              sourceContext.imageSmoothingQuality = 'high';
              sourceContext.drawImage(original, 190, 45, 90, 50.625);
              let sourceError = 0,
                sourceSamples = 0;
              for (const x of [196, 207, 218, 229, 241, 252, 263, 274])
                for (const y of [72, 80, 88]) {
                  const actual = context.getImageData(x, y, 1, 1).data;
                  const expected = sourceContext.getImageData(x, y, 1, 1).data;
                  for (let channel = 0; channel < 3; channel++)
                    sourceError += Math.abs(actual[channel]! - expected[channel]!);
                  sourceSamples++;
                }
              frames.push({
                time,
                meanError: error / (samples * 3),
                samples,
                sourceMeanError: sourceError / (sourceSamples * 3),
                sourceSamples,
                boundary,
              });
            }
            return {
              width: video.videoWidth,
              height: video.videoHeight,
              duration: video.duration,
              size: file.size,
              frames,
            };
          } finally {
            video.removeAttribute('src');
            URL.revokeObjectURL(url);
            original.removeAttribute('src');
            URL.revokeObjectURL(originalUrl);
          }
        },
        { exportId: completion.exportId, imageColor, fallback }
      );
      expect(proof.width).toBe(320);
      expect(proof.height).toBe(180);
      expect(Math.abs(proof.duration - 1.2)).toBeLessThan(0.03);
      expect(proof.size).toBeGreaterThan(1000);
      for (const frame of proof.frames) {
        expect(frame.meanError).toBeLessThan(14);
        expect(frame.sourceMeanError).toBeLessThan(14);
        for (const { pixel, expected } of frame.boundary)
          for (let c = 0; c < 3; c++) expect(Math.abs(pixel[c]! - expected[c]!)).toBeLessThan(14);
      }
      expect(project).toEqual(before);
      await writeFile(info.outputPath(`background-${format}.json`), JSON.stringify(proof, null, 2));
    } finally {
      host.server.closeAllConnections();
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}

test('native background filtering is bounded and preserves animation and opaque edges', async ({
  page,
}, info) => {
  const bundle = await build({
    stdin: {
      contents: `
      import { drawSceneBackground } from './apps/extension/src/features/video/project/scene/background';
      import { createSceneGradientBackground } from './apps/extension/src/features/video/project/scene/background-gradient';
      export async function probe() {
        const canvas = document.createElement('canvas'); canvas.width = 1920; canvas.height = 900;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        const background = { ...createSceneGradientBackground('#000000ff'), blur: 18, animation: { mode: 'rotate', speed: 80, intensity: 70 } };
        const times = [], frames = [];
        for (let i = 0; i < 8; i++) {
          const start = performance.now();
          drawSceneBackground({ context, width: 1920, height: 900, sceneBackground: background, currentTime: i });
          const pixels = [0, 480, 960, 1919].map(x => Array.from(context.getImageData(x, 450, 1, 1).data));
          times.push(performance.now() - start); frames.push(pixels);
        }
        return { times, frames };
      }
    `,
      resolveDir: process.cwd(),
      loader: 'ts',
    },
    bundle: true,
    format: 'esm',
    platform: 'browser',
    write: false,
  });
  const proof = await page.evaluate(async (text) => {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/javascript' }));
    try {
      return (await import(url)).probe();
    } finally {
      URL.revokeObjectURL(url);
    }
  }, bundle.outputFiles[0]!.text);
  for (const frame of proof.frames) for (const pixel of frame) expect(pixel[3]).toBe(255);
  expect(proof.frames[1]).not.toEqual(proof.frames[0]);
  await writeFile(info.outputPath('native-blur-performance.json'), JSON.stringify(proof, null, 2));
});

test('background camera modes match Gallery pixels and keep a second video independent', async ({
  page,
}, info) => {
  const host = await startHostServer();
  try {
    await page.setViewportSize({ width: 1920, height: 900 });
    await page.goto(host.origin);
    await page.setContent('<main></main>');
    const bundle = await build({
      stdin: {
        contents: `
      import { fixture } from './apps/extension/src/features/video/review/project-conversion.test-support';
      import { planReviewProjectConversion } from './apps/extension/src/features/video/review/project-conversion';
      import { createVideoProjectMotionRegion } from './apps/extension/src/features/video/project/motion';
      import { createSceneGradientBackground } from './apps/extension/src/features/video/project/scene/background-gradient';
      import { drawSceneBackground } from './apps/extension/src/features/video/project/scene/background';
      import { computeQuickEditSceneLayout, evaluateQuickEditCameraAtTime } from './apps/extension/src/features/video/review/advanced/scene';
      import { drawReviewSceneFrame } from './apps/extension/src/workflows/video-review/scene-frame';
      import { resolveVideoCompositionFrame } from './apps/extension/src/features/video/composition/timeline/frame';
      import { drawCompositionVisualLayer, drawCompositionVisualLayerBitmap } from './apps/extension/src/features/video/composition/draw/visual';
      import { createEffectHostClip } from './apps/extension/src/features/video/project/factories/overlay-clip';
      import { drawEffectRuntimeVisualLayer } from './apps/extension/src/features/video/composition/draw/effect-runtime';
      import { getFittedMediaContentFrame } from './apps/extension/src/features/video/composition/draw/fitted-media';
      import { sha256EffectV1Bytes } from '@sniptale/runtime-contracts/effect-v1';
      import { shouldLockVisualLayerToViewport } from './apps/extension/src/features/video/composition/motion/layer-camera';
      import { createReviewSpatialRenderer } from './apps/extension/src/features/video/composition/canvas/spatial-renderer';
      import { drawSpatialCompositionGroup } from './apps/extension/src/features/video/composition/draw/spatial';
      import { drawReviewSceneOverlays } from './apps/extension/src/workflows/video-review/render-scene-overlays';
      import { createQuickEditBorder, createQuickEditSpotlight } from './apps/extension/src/features/video/project/scene/focus-appearance';
      import { drawCompositionSceneSpotlights } from './apps/extension/src/features/video/composition/draw/project-spotlight';
      import { drawReviewClicks } from './apps/extension/src/workflows/video-review/render-click-animation';
      import { computeQuickEditSceneCamera } from './apps/extension/src/features/video/review/advanced/scene';
      import { windowHeaderImageKey } from './apps/extension/src/features/video/composition/draw/window-header';
      import { normalizeVideoProjectCursorSkin } from './apps/extension/src/features/video/project/cursor';
      import { drawCursorCompositionState } from './apps/extension/src/features/video/composition/draw/effects/cursor';
      import { drawExportOverlayPass } from './apps/extension/src/offscreen/project-export/renderer/frame-overlays';
      export async function probe() {
        const source = document.createElement('canvas'); source.width = 640; source.height = 360;
        const paint = source.getContext('2d');
        for (let y = 0; y < 360; y += 30) for (let x = 0; x < 640; x += 40) {
          paint.fillStyle = ((x / 40 + y / 30) % 2) ? '#20b060' : '#e04060';
          paint.fillRect(x, y, 40, 30);
        }
        const headerCanvas = document.createElement('canvas'); headerCanvas.width = 640; headerCanvas.height = 40;
        const headerPaint = headerCanvas.getContext('2d'); headerPaint.fillStyle = '#e0d020'; headerPaint.fillRect(0, 0, 640, 40);
        const headerImage = new Image(); headerImage.src = headerCanvas.toDataURL(); await headerImage.decode();
        const annotationSource = ${JSON.stringify(await readFile('packages/runtime-contracts/src/effect-v1/fixtures/valid/neutral-standalone.sniptale-effect.json', 'utf8'))};
        const annotationDocument = JSON.parse(annotationSource);
        const annotationHash = await sha256EffectV1Bytes(new TextEncoder().encode(annotationSource));
        const annotationCanvas = document.createElement('canvas'); annotationCanvas.width = 160; annotationCanvas.height = 80;
        const annotationPaint = annotationCanvas.getContext('2d'); annotationPaint.fillStyle = '#ff00ff';
        annotationPaint.fillRect(10, 10, 140, 60); annotationPaint.fillStyle = '#ffffff'; annotationPaint.fillRect(30, 25, 70, 20);
        const annotationBitmap = await createImageBitmap(annotationCanvas);
        const annotation = { id: 'annotation', snapshotId: 'effect:' + annotationHash, enabled: true, start: 0, end: 2,
          attachment: 'content', order: 0, controls: {}, transform: { x: 0.2, y: 0.35, width: 0.25, height: 0.22, rotation: 0.3 } };
        const annotationFrame = { instance: annotation, bitmap: annotationBitmap, bitmapBounds: { x: 0, y: 0, width: 1, height: 1 } };
        const results = [];
        const galleryRenderer = createReviewSpatialRenderer(), nativeRenderer = createReviewSpatialRenderer();
        try {
        for (const mode of ['window', 'content', 'fixed', 'follow-video']) for (const spatial of [false, true]) for (const appearance of ['none', 'border', 'spotlight', 'click', 'header', 'cursor', 'annotation-content', 'annotation-viewport', 'annotation-crop', 'annotation-header']) {
          if ((appearance === 'click' || appearance === 'cursor') && spatial) continue;
          const input = fixture();
          const primarySource = appearance === 'header' ? document.createElement('canvas') : source;
          if (appearance === 'header') {
            primarySource.width = 640; primarySource.height = 360;
            const solid = primarySource.getContext('2d'); solid.fillStyle = '#20b060'; solid.fillRect(0, 0, 640, 360);
          }
          const gradient = createSceneGradientBackground('#102030ff').gradient;
          gradient.stops[gradient.stops.length - 1].color = '#e0c080ff';
          input.document.advancedContent.background = {
            enabled: true, type: 'gradient', gradient, zoomBehavior: 'window',
            layout: { padding: 40, cornerRadius: 12, blur: 0 },
          };
          if (appearance === 'annotation-crop') input.document.advancedContent.canvas = {
            width: 640, height: 360, crop: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
          };
          if (appearance === 'header' || appearance === 'annotation-header') input.document.advancedContent.windowHeader = {
            kind: 'browser', style: 'windows', theme: 'light', title: '', url: '', faviconEnabled: false,
          };
          const converted = planReviewProjectConversion(input);
          if (converted.status !== 'prepared') throw new Error(JSON.stringify(converted));
          const project = converted.project;
          project.version = 37; project.sceneBackground.zoomBehavior = mode;
          input.document.advancedContent.background.zoomBehavior = mode;
          const clip = project.clips.find(clip => clip.type === 'VIDEO');
          const focus = {
            id: 'focus', start: 0, end: 2,
            transform: { scale: 2.5, centerX: 0.4, centerY: 0.65 },
            enter: { type: 'linear', duration: 0.5 }, exit: { type: 'linear', duration: 0.5 },
            ...(spatial ? { perspective: { enabled: true, rotateX: 18, rotateY: -23, rotateZ: 7, strength: 0.6 } } : {}),
          };
          const decoration = appearance === 'border'
            ? { ...focus, id: 'decoration', border: createQuickEditBorder() }
            : appearance === 'spotlight' ? { ...focus, id: 'decoration', spotlight: createQuickEditSpotlight() } : null;
          const regions = decoration ? [focus, decoration] : [focus];
          const click = { effect: 'magnify', point: { x: 0.4, y: 0.65 }, color: '#ffffffff',
            radius: 18, stroke: 2, opacity: 1, lens: { scale: 2, shape: 'circle', shadow: 0 } };
          project.motionRegions = regions.map(region => ({
            ...createVideoProjectMotionRegion(project, 0, { enter: 'linear', exit: 'linear' }),
            id: region.id, duration: 2, scale: focus.transform.scale, focusMode: 'MANUAL',
            focusPoint: { x: project.width * 0.4, y: project.height * 0.65 },
            zoomInDuration: 0.5, zoomOutDuration: 0.5,
            ...(region.perspective ? { perspective: region.perspective } : {}),
            ...(region.border ? { border: region.border, borderTarget: 'window' } : {}),
            ...(region.spotlight ? { spotlight: region.spotlight, spotlightTarget: 'scene' } : {}),
            sourceBinding: { clipId: clip.id, coordinateSpace: 'source-window', sourceStart: 0,
              sourceEnd: 2, animation: { start: 0, end: 2, duration: 2 } },
          }));
          if (appearance === 'cursor') project.cursorTrack = {
            captureMode: 'separate', skin: { ...normalizeVideoProjectCursorSkin(undefined), shadow: false, preset: 'RING' },
            samples: [{ id: 'pointer', time: 0, x: 0, y: 0, visible: true,
              recordingPoint: { x: 0.3, y: 0.6 }, sourceAnchor: { kind: 'recording-source', recordingId: 'recording', sourceClipId: clip.id, sourceTime: 0 } }],
          };
          const secondary = { x: project.width - 110, y: 10, width: 100, height: 56.25 };
          project.tracks = project.tracks.map(track => ({ ...track, order: track.order + 1 }));
          project.tracks.push({ ...project.tracks[0], id: 'secondary', order: 0, isRoot: false });
          const { sourceCrop: _sourceCrop, ...secondTemplate } = clip;
          project.clips.push({ ...secondTemplate, id: 'second', sourceInstanceId: 'second', trackId: 'secondary',
            windowCornerRadius: 0, transform: { ...clip.transform, ...secondary } });
          let annotationHost;
          if (appearance.startsWith('annotation-')) {
            annotation.attachment = appearance === 'annotation-viewport' ? 'viewport' : 'content';
            project.version = 38;
            project.tracks.push({ ...project.tracks[0], id: 'annotation-track', order: annotation.attachment === 'content' ? 1 : -1, isRoot: false });
            annotationHost = createEffectHostClip({ duration: 2, effectInstanceId: annotation.id, name: 'Annotation',
              projectWidth: project.width, projectHeight: project.height, startTime: 0, trackId: 'annotation-track' });
            annotationHost.attachment = annotation.attachment === 'content'
              ? { kind: 'source', assetId: clip.assetId, sourceInstanceId: clip.sourceInstanceId }
              : { kind: 'viewport' };
            const plane = annotation.attachment === 'content' ? input.source : project;
            annotationHost.transform = { x: annotation.transform.x * plane.width, y: annotation.transform.y * plane.height,
              width: annotation.transform.width * plane.width, height: annotation.transform.height * plane.height,
              rotation: annotation.transform.rotation * 180 / Math.PI, opacity: 1 };
            project.clips.push(annotationHost);
            project.effectSnapshots = [{ id: annotation.snapshotId, sha256: annotationHash, source: annotationSource,
              documentId: annotationDocument.id, kind: 'standalone', schemaVersion: 'sniptale.effect.v1',
              retainedByteLength: new TextEncoder().encode(annotationSource).byteLength, assets: [] }];
            project.effectInstances = [{ id: annotation.id, snapshotId: annotation.snapshotId, enabled: true,
              controls: {}, kind: 'standalone', target: { kind: 'scene' }, startTime: 0, duration: 2, playbackRate: 1.5 }];
          }
          const images = clip.windowHeader ? { [windowHeaderImageKey(clip.id, clip.windowHeader)]: headerImage } : {};
          const scene = { source: input.source, canvas: input.document.advancedContent.canvas, windowHeader: input.document.advancedContent.windowHeader, output: { width: project.width, height: project.height },
            background: input.document.advancedContent.background };
          for (const time of [0.125, 0.5, 1.875]) {
            const gallery = document.createElement('canvas'), native = document.createElement('canvas');
            for (const canvas of [gallery, native]) { canvas.width = project.width; canvas.height = project.height; }
            const expected = gallery.getContext('2d', { willReadFrequently: true });
            const actual = native.getContext('2d', { willReadFrequently: true });
            const layout = computeQuickEditSceneLayout({ ...scene, camera: evaluateQuickEditCameraAtTime(regions, time, scene) });
            drawReviewSceneFrame(expected, { canvas: scene.output, layout, background: scene.background,
              image: null, ...(appearance === 'header' ? { headerImage } : {}), spatialRenderer: galleryRenderer, sample: { draw(ctx, x, y, width, height) { ctx.drawImage(primarySource, x, y, width, height); } } });
            if (appearance === 'annotation-header' || appearance === 'annotation-crop') expected.clearRect(0, 0, gallery.width, gallery.height);
            const overlays = () => drawReviewSceneOverlays({
              scene: { canvas: scene.output, layout, background: scene.background, sourceTime: time },
              renderer: galleryRenderer, context: expected, canvas: gallery,
              spotlightScratch: document.createElement('canvas'), regions,
              globalResultTime: time, cameraScale: evaluateQuickEditCameraAtTime(regions, time, scene).scale,
              sourceWidth: input.source.width,
              ...(annotationHost ? { annotationFrames: [annotationFrame] } : {}),
            });
            if (appearance !== 'spotlight' && appearance !== 'annotation-viewport') overlays();
            if (appearance === 'click') {
              const sampled = document.createElement('canvas'); sampled.width = project.width; sampled.height = project.height;
              sampled.getContext('2d').drawImage(gallery, 0, 0);
              const motion = computeQuickEditSceneCamera(layout, scene.background);
              drawReviewClicks(expected, [click], layout.videoTransform, input.source.width,
                { rect: motion.windowClip, radius: scene.background.layout.cornerRadius * motion.scale },
                { rect: { x: 0, y: 0, width: project.width, height: project.height },
                  draw(ctx, x, y, width, height) { ctx.drawImage(sampled, x, y, width, height); } });
            }
            expected.drawImage(source, secondary.x, secondary.y, secondary.width, secondary.height);
            if (appearance === 'spotlight' || appearance === 'annotation-viewport') overlays();
            const frame = resolveVideoCompositionFrame(project, time);
            if (appearance === 'click') {
              const owner = frame.visualLayers.find(layer => layer.clipId === clip.id);
              owner.actions = [{ renderKind: 'accent', preset: 'CLICK_RIPPLE', point: click.point, gestureFeedback: click }];
            }
            if (appearance !== 'annotation-header' && appearance !== 'annotation-crop') drawSceneBackground({ context: actual, width: project.width, height: project.height,
              projectScale: 1, sceneBackground: project.sceneBackground,
              ...(frame.camera.backgroundCamera ? { camera: frame.camera.backgroundCamera } : {}) });
            const sources = new Map(project.clips.map(clip => [clip.id, {
              sourceWidth: input.source.width, sourceHeight: input.source.height,
              draw(ctx, x, y, width, height) { ctx.drawImage(clip.id === project.clips[0].id ? primarySource : source, x, y, width, height); },
            }]));
            const annotationFrames = new Map(annotationHost ? [[annotation.id, {
              bitmap: annotationBitmap, bitmapBounds: annotationFrame.bitmapBounds, effectInstanceId: annotation.id,
              kind: 'standalone', snapshotId: annotation.snapshotId, width: annotationBitmap.width, height: annotationBitmap.height,
              logicalWidth: annotationHost.transform.width, logicalHeight: annotationHost.transform.height,
              target: { kind: 'scene', clipId: annotationHost.id },
            }]] : []);
            for (const layer of frame.visualLayers) {
              if ((appearance === 'annotation-header' || appearance === 'annotation-crop') && layer.clipId === clip.id) continue;
              actual.save();
              const moving = !shouldLockVisualLayerToViewport(layer, frame.camera);
              if (moving && frame.camera.spatial) {
                drawSpatialCompositionGroup({
                  camera: frame.camera, clipMediaElements: sources, context: actual,
                  destination: { x: 0, y: 0, width: project.width, height: project.height },
                  effectState: { drawnTransitionIds: new Set() }, imageBank: images, layers: [layer], frames: annotationFrames,
                  logicalSize: scene.output, output: scene.output, rasterScale: 1, renderer: nativeRenderer,
                });
              } else {
                if (moving) {
                  actual.scale(frame.camera.scale, frame.camera.scale);
                  actual.translate(-frame.camera.viewportX, -frame.camera.viewportY);
                }
                if (!drawEffectRuntimeVisualLayer({ context: actual, layer, frames: annotationFrames,
                  scaleX: 1, scaleY: 1, state: { drawnTransitionIds: new Set() } }))
                  drawCompositionVisualLayer(actual, layer, 1, 1, images, sources);
              }
              actual.restore();
            }
            drawCompositionSceneSpotlights({ context: actual, project, frame, images,
              viewport: { x: 0, y: 0, width: project.width, height: project.height },
              composition: { x: 0, y: 0, scale: 1 },
            });
            if (appearance === 'cursor') {
              drawCursorCompositionState(expected, { ...project.cursorTrack.skin,
                captureMode: 'separate', visible: true, time,
                x: layout.videoTransform.x + layout.videoTransform.width * 0.3,
                y: layout.videoTransform.y + layout.videoTransform.height * 0.6,
                scale: project.cursorTrack.skin.scale * layout.videoTransform.width / layout.videoRect.width });
              drawExportOverlayPass(actual, frame, 1, 1);
            }
            const a = expected.getImageData(0, 0, project.width, project.height).data;
            const b = actual.getImageData(0, 0, project.width, project.height).data;
            let sum = 0, bad = 0, comparedPixels = 0, annotationInk = 0;
            for (let i = 0; i < a.length; i += 4) {
              if (appearance === 'header') {
                const x = (i / 4) % project.width, y = Math.floor(i / 4 / project.width);
                // Joined rasters round their toolbar join separately. Compare solid interiors, three pixels from those edges.
                const flat = (a[i] === 32 && a[i + 1] === 176 && a[i + 2] === 96) ||
                  (a[i] === 224 && a[i + 1] === 208 && a[i + 2] === 32);
                if (!flat || x < 3 || y < 3 || x >= project.width - 3 || y >= project.height - 3 ||
                  [-3, 0, 3].some(dy => [-3, 0, 3].some(dx => {
                    const j = i + (dy * project.width + dx) * 4;
                    return a[j] !== a[i] || a[j + 1] !== a[i + 1] || a[j + 2] !== a[i + 2];
                  }))) continue;
              }
              comparedPixels++;
              if (a[i] > 200 && a[i + 1] < 32 && a[i + 2] > 200 && a[i + 3] > 200) annotationInk++;
              let maximum = 0;
              for (let c = 0; c < 4; c++) { const delta = Math.abs(a[i + c] - b[i + c]); sum += delta; maximum = Math.max(maximum, delta); }
              if (maximum > 16) bad++;
            }
            const secondaryPixel = Array.from(actual.getImageData(Math.round(secondary.x + 17), 22, 1, 1).data);
            const annotationLayer = annotationHost && frame.visualLayers.find(layer => layer.clipId === annotationHost.id);
            const diagnostic = annotationLayer?.sourceAttachment && !spatial ? {
              videoRect: layout.videoRect, videoTransform: layout.videoTransform,
              sourceRect: getFittedMediaContentFrame(annotationLayer.sourceAttachment.mapping),
              camera: { scale: frame.camera.scale, x: frame.camera.viewportX, y: frame.camera.viewportY,
                inner: frame.camera.sourceContentTransform },
            } : undefined;
            results.push({ mode, spatial, appearance, time, diagnostic, annotationInk, effectiveScale: frame.camera.scale * (frame.camera.sourceContentTransform?.[0] ?? 1), mean: sum / (comparedPixels * 4), bad: bad / comparedPixels, comparedPixels, secondaryPixel });
            if (time === 0.5 && (spatial || appearance === 'click' || appearance === 'cursor')) {
              const row = document.createElement('div'); row.style.display = 'flex'; row.dataset.appearance = appearance;
              for (const canvas of [gallery, native]) { canvas.style.width = '360px'; canvas.style.height = 'auto'; row.append(canvas); }
              document.body.append(row);
            }
          }
        }
        return results;
        } finally { galleryRenderer.dispose(); nativeRenderer.dispose(); annotationBitmap.close(); }
      }
      `,
        resolveDir: process.cwd(),
        loader: 'ts',
      },
      loader: { '.woff2': 'dataurl', '.svg': 'text' },
      bundle: true,
      format: 'esm',
      platform: 'browser',
      write: false,
    });
    const proof = await page.evaluate(async (text) => {
      const url = URL.createObjectURL(new Blob([text], { type: 'text/javascript' }));
      try {
        return (await import(url)).probe();
      } finally {
        URL.revokeObjectURL(url);
      }
    }, bundle.outputFiles[0]!.text);
    await writeFile(info.outputPath('camera-mode-pixels.json'), JSON.stringify(proof, null, 2));
    for (const appearance of [
      'none',
      'border',
      'spotlight',
      'click',
      'header',
      'cursor',
      'annotation-content',
      'annotation-viewport',
      'annotation-crop',
      'annotation-header',
    ]) {
      await page.locator('[data-appearance]').evaluateAll((rows, selected) => {
        for (const row of rows)
          if (row instanceof HTMLElement)
            row.style.display = row.dataset.appearance === selected ? 'flex' : 'none';
      }, appearance);
      await page.screenshot({
        path: info.outputPath('camera-mode-' + appearance + '.png'),
        fullPage: false,
      });
    }
    for (const result of proof) {
      if (result.appearance !== 'spotlight')
        expect(result.secondaryPixel, JSON.stringify(result)).toEqual(proof[0].secondaryPixel);
      expect(result.effectiveScale, JSON.stringify(result)).toBeGreaterThan(1.1);
      expect(result.comparedPixels, JSON.stringify(result)).toBeGreaterThan(1000);
      if (result.appearance.startsWith('annotation-'))
        expect(result.annotationInk, JSON.stringify(result)).toBeGreaterThan(100);
      // Two resampled stroke edges permit one-pixel antialiasing; mean channel error stays below 0.1.
      expect(result.mean, JSON.stringify(result)).toBeLessThan(0.1);
      expect(result.bad, JSON.stringify(result)).toBeLessThan(
        result.appearance === 'border' ? 0.005 : 0.002
      );
    }
  } finally {
    host.server.closeAllConnections();
    await new Promise<void>((resolve) => host.server.close(() => resolve()));
  }
});

test('identity group FX preserves source scene masks over the composed backdrop', async ({
  page,
}, info) => {
  const host = await startHostServer();
  try {
    await page.setViewportSize({ width: 1920, height: 900 });
    await page.goto(host.origin);
    await page.setContent('<main></main>');
    const bundle = await build({
      stdin: {
        contents: `
          import {createVideoProjectFromRecording} from './apps/extension/src/features/video/project/factories/creation';
          import {createVideoProjectMotionRegion} from './apps/extension/src/features/video/project/motion';
          import {bindMotionRegionToClip} from './apps/extension/src/features/video/project/motion/source-binding';
          import {createQuickEditBorder, createQuickEditSpotlight} from './apps/extension/src/features/video/project/scene/focus-appearance';
          import {resolveVideoCompositionFrame} from './apps/extension/src/features/video/composition/timeline/frame';
          import {drawCompositionVisualLayer} from './apps/extension/src/features/video/composition/draw/visual';
          import {drawCompositionSceneSpotlights} from './apps/extension/src/features/video/composition/draw/project-spotlight';
          import {drawEffectRuntimeVisualLayer, createEffectRuntimeDrawState} from './apps/extension/src/features/video/composition/draw/effect-runtime';
          import {createEffectRuntimeInputMaterializer} from './apps/extension/src/features/video/composition/effect-runtime/frame/inputs';
          export async function probe() {
            const project = createVideoProjectFromRecording({recordingId: 'source', filename: 'source.webm',
              width: 320, height: 180, duration: 4, mimeType: 'video/webm', size: 1});
            project.version = 39;
            const clip = project.clips.find((clip) => clip.type === 'VIDEO');
            clip.transform = {...clip.transform, x: 80, y: 45, width: 160, height: 90};
            clip.windowCornerRadius = 0;
            const lower = {...clip, id: 'lower', sourceInstanceId: 'lower', trackId: 'lower-track',
              transform: {...clip.transform, x: 20, y: 20, width: 280, height: 140}};
            project.tracks.push({...project.tracks[0], id: lower.trackId, order: project.tracks[0].order + 1, isRoot: false});
            project.clips.push(lower);
            const region = bindMotionRegionToClip({...createVideoProjectMotionRegion(project, 0), duration: 4,
              spotlight: {...createQuickEditSpotlight(), area: {x: .45, y: .45, width: .1, height: .1}},
              spotlightTarget: 'source-scene'}, clip);
            region.sourceBinding.coordinateSpace = 'source-window';
            project.motionRegions = [region];
            const source = document.createElement('canvas'); source.width = 320; source.height = 180;
            source.getContext('2d').fillStyle = '#30a0e0'; source.getContext('2d').fillRect(0, 0, 320, 180);
            const sources = new Map([[clip.id, {sourceWidth: 320, sourceHeight: 180,
              draw(ctx, x, y, width, height) {ctx.drawImage(source, x, y, width, height);}}]]);
            const drawBackground = (ctx) => {
              for (let y = 0; y < 180; y += 8) for (let x = 0; x < 320; x += 8) {
                ctx.fillStyle = (x / 8 + y / 8) % 2 ? '#d0a020' : '#9030c0';
                ctx.fillRect(x, y, 8, 8);
              }
            };
            sources.set(lower.id, {sourceWidth: 320, sourceHeight: 180,
              draw(ctx, x, y, width, height) {ctx.fillStyle = '#e09030';ctx.fillRect(x, y, width, height);}});
            const processed = document.createElement('canvas'); processed.width = 320; processed.height = 180;
            processed.getContext('2d').fillStyle = '#e03090'; processed.getContext('2d').fillRect(20, 20, 280, 140);
            const lowerBitmap = await createImageBitmap(processed);
            const lowerFrames = new Map([['lower-fx', {bitmap: lowerBitmap, effectInstanceId: 'lower-fx',
              snapshotId: 'lower-fx', kind: 'targetEffect', width: 320, height: 180, logicalWidth: 320, logicalHeight: 180,
              target: {kind: 'track', trackId: lower.trackId, clipIds: [lower.id]}}]]);
            const results = [];
            for (const scope of ['video-group', 'track', 'track-with-lower-FX']) for (const effect of ['none', 'dim', 'blur']) {
              region.spotlight.effect = effect === 'none' ? 'dim' : effect;
              const frame = resolveVideoCompositionFrame(project, 1.5);
              if (effect === 'none') frame.sceneSpotlights = [];
              const owner = frame.visualLayers.find((layer) => layer.clipId === clip.id);
              owner.borders = [{id: 'border', border: createQuickEditBorder(), clock: {
                time: 1.5, duration: 4, enter: {type: 'none', duration: 0}, exit: {type: 'none', duration: 0},
              }}];
              owner.actions = [{renderKind: 'accent', preset: 'CLICK_RIPPLE', point: {x: .2, y: .5},
                gestureFeedback: {effect: 'ripple', point: {x: .2, y: .5}, color: '#ffffffff',
                  radius: 20, stroke: 3, opacity: 1}}];
              const canvases = [document.createElement('canvas'), document.createElement('canvas')];
              for (const canvas of canvases) {
                canvas.width = 320; canvas.height = 180;
                const ctx = canvas.getContext('2d');
                drawBackground(ctx);
                document.querySelector('main').append(canvas);
              }
              const [expectedCanvas, actualCanvas] = canvases;
              const expected = expectedCanvas.getContext('2d', {willReadFrequently: true});
              const frames = scope === 'track-with-lower-FX' ? lowerFrames : new Map();
              const members = scope === 'video-group' ? frame.visualLayers : frame.visualLayers.filter((layer) => layer.clipId === clip.id);
              const expectedState = createEffectRuntimeDrawState();
              for (const layer of frame.visualLayers) {
                if (!drawEffectRuntimeVisualLayer({context: expected, layer, frames, scaleX: 1, scaleY: 1, state: expectedState}))
                  drawCompositionVisualLayer(expected, layer.clipId === clip.id && effect !== 'none'
                    ? {...layer, actions: [], borders: []} : layer, 1, 1, {}, sources);
                drawCompositionSceneSpotlights({context: expected, project, frame, images: {}, afterClipId: layer.clipId,
                  viewport: {x: 0, y: 0, width: 320, height: 180}, composition: {x: 0, y: 0, scale: 1}});
                if (layer.clipId === clip.id && effect !== 'none')
                  drawCompositionVisualLayer(expected, {...layer, effectActionsOnly: true, deferSourceBorders: true}, 1, 1, {}, sources);
              }
              const materializer = createEffectRuntimeInputMaterializer({camera: frame.camera,
                scene: {project, frame}, drawBackground, visualLayers: members, clipMediaElements: sources, imageBank: {}});
              const bitmap = await materializer.materializeTargetSource({
                target: scope === 'video-group' ? {kind: 'video-group', clipIds: members.map((layer) => layer.clipId)}
                  : {kind: 'track', trackId: clip.trackId, clipIds: [clip.id]},
                kind: 'targetEffect', effectInstanceId: 'neutral', snapshotId: 'neutral', documentSha256: 'a'.repeat(64),
                documentSource: '{}', assets: [], controls: {}, dimensions: {width: 320, height: 180},
                renderDimensions: {width: 320, height: 180}, duration: 4, fps: 30, frameIndex: 45, time: 1.5, progress: .375,
              }, frames);
              const actual = actualCanvas.getContext('2d', {willReadFrequently: true});
              const actualState = createEffectRuntimeDrawState();
              for (const layer of frame.visualLayers.filter((layer) => !members.some((member) => member.clipId === layer.clipId)))
                if (!drawEffectRuntimeVisualLayer({context: actual, layer, frames, scaleX: 1, scaleY: 1, state: actualState}))
                  drawCompositionVisualLayer(actual, layer, 1, 1, {}, sources);
              actual.drawImage(bitmap, 0, 0); bitmap.close();
              drawCompositionVisualLayer(actual, {...owner, effectActionsOnly: true}, 1, 1, {}, sources);
              const a = expected.getImageData(0, 0, 320, 180).data;
              const b = actual.getImageData(0, 0, 320, 180).data;
              let sum = 0, max = 0;
              for (let i = 0; i < a.length; i++) if (i % 4 !== 3) {
                const error = Math.abs(a[i] - b[i]); sum += error; max = Math.max(max, error);
              }
              results.push({scope, effect, mean: sum / (320 * 180 * 3), max});
            }
            lowerBitmap.close();
            return results;
          }
        `,
        resolveDir: process.cwd(),
        loader: 'ts',
      },
      loader: { '.woff2': 'dataurl', '.svg': 'text' },
      bundle: true,
      format: 'esm',
      platform: 'browser',
      write: false,
    });
    const proof = await page.evaluate(async (text) => {
      const url = URL.createObjectURL(new Blob([text], { type: 'text/javascript' }));
      try {
        return (await import(url)).probe();
      } finally {
        URL.revokeObjectURL(url);
      }
    }, bundle.outputFiles[0]!.text);
    await writeFile(
      info.outputPath('source-scene-group-backdrop.json'),
      JSON.stringify(proof, null, 2)
    );
    await page.screenshot({
      path: info.outputPath('source-scene-group-backdrop.png'),
      fullPage: false,
    });
    for (const result of proof) expect(result.mean, JSON.stringify(result)).toBeLessThanOrEqual(1);
  } finally {
    host.server.closeAllConnections();
    await new Promise<void>((resolve) => host.server.close(() => resolve()));
  }
});

test('source scene masks retain Gallery border and click order through perspective', async ({
  page,
}, info) => {
  const host = await startHostServer();
  try {
    await page.setViewportSize({ width: 1920, height: 900 });
    await page.goto(host.origin);
    await page.setContent('<main></main>');
    const bundle = await build({
      stdin: {
        contents: `
          import {fixture} from './apps/extension/src/features/video/review/project-conversion.test-support';
          import {planReviewProjectConversion} from './apps/extension/src/features/video/review/project-conversion';
          import {createQuickEditBorder, createQuickEditSpotlight} from './apps/extension/src/features/video/project/scene/focus-appearance';
          import {computeQuickEditSceneLayout, evaluateQuickEditCameraAtTime} from './apps/extension/src/features/video/review/advanced/scene';
          import {drawReviewSceneFrame} from './apps/extension/src/workflows/video-review/scene-frame';
          import {drawReviewSceneOverlays} from './apps/extension/src/workflows/video-review/render-scene-overlays';
          import {evaluateReviewClicks} from './apps/extension/src/features/video/review/click-animation';
          import {REVIEW_CLICK_DEFAULT} from './apps/extension/src/features/video/project/action-feedback/validation';
          import {drawSceneBackground} from './apps/extension/src/features/video/project/scene/background';
          import {resolveVideoCompositionFrame} from './apps/extension/src/features/video/composition/timeline/frame';
          import {splitVisualLayersForSourceSpotlights} from './apps/extension/src/features/video/composition/visual-pass-layers';
          import {drawCompositionVisualLayer} from './apps/extension/src/features/video/composition/draw/visual';
          import {drawCompositionSceneSpotlights} from './apps/extension/src/features/video/composition/draw/project-spotlight';
          import {drawSpatialCompositionGroup} from './apps/extension/src/features/video/composition/draw/spatial';
          import {createReviewSpatialRenderer} from './apps/extension/src/features/video/composition/canvas/spatial-renderer';
          export async function probe() {
            const results = [];
            const source = document.createElement('canvas'); source.width = 640; source.height = 360;
            source.getContext('2d').fillStyle = '#305080'; source.getContext('2d').fillRect(0, 0, 640, 360);
            const galleryRenderer = createReviewSpatialRenderer(), nativeRenderer = createReviewSpatialRenderer();
            try {
              for (const spatial of [false, true]) for (const utility of ['border', 'click', 'both']) {
                const input = fixture(); input.document.edits = []; input.ui.tracks.zoom = true;
                input.document.advancedContent.background = {enabled: true, type: 'solid', color: '#102030ff', zoomBehavior: 'window',
                  layout: {padding: 40, cornerRadius: 0, blur: 0}};
                const focus = {id: 'focus', start: 0, end: 2, transform: {scale: 1.5, centerX: .5, centerY: .5},
                  enter: {type: 'none', duration: 0}, exit: {type: 'none', duration: 0},
                  ...(spatial ? {perspective: {enabled: true, rotateX: 18, rotateY: -23, rotateZ: 7, strength: .6}} : {})};
                const spotlight = {...focus, id: 'spotlight', spotlight: {...createQuickEditSpotlight(),
                  area: {x: .45, y: .45, width: .1, height: .1}}};
                const border = {...focus, id: 'border', border: {...createQuickEditBorder(), width: 12,
                  area: {x: .1, y: .1, width: .8, height: .8}}};
                const regions = [focus, spotlight, ...(utility === 'click' ? [] : [border])];
                input.document.advancedContent.zoom = {enabled: true, regions};
                const conversion = planReviewProjectConversion(input);
                if (conversion.status !== 'prepared') throw new Error(JSON.stringify(conversion));
                const project = conversion.project, time = .75;
                const scene = {source: input.source, output: {width: project.width, height: project.height},
                  background: input.document.advancedContent.background};
                const camera = evaluateQuickEditCameraAtTime(regions, time, scene);
                const layout = computeQuickEditSceneLayout({...scene, camera});
                const cue = {id: 'click', settings: {...REVIEW_CLICK_DEFAULT, effect: 'ripple', before: 0, after: 1, color: '#ffffffff', opacity: 1, radius: 28, stroke: 5},
                  point: {x: .2, y: .5}, anchor: .5, start: .5, end: 1.5};
                const clicks = utility === 'border' ? [] : [cue];
                const expectedCanvas = document.createElement('canvas'), actualCanvas = document.createElement('canvas');
                for (const canvas of [expectedCanvas, actualCanvas]) {
                  canvas.width = project.width; canvas.height = project.height;
                  canvas.style.width = '480px'; canvas.style.height = 'auto';
                }
                const row = document.createElement('div'); row.style.display = 'flex'; row.dataset.spatial = String(spatial);
                row.append(expectedCanvas, actualCanvas); document.querySelector('main').append(row);
                const expected = expectedCanvas.getContext('2d', {willReadFrequently: true});
                const actual = actualCanvas.getContext('2d', {willReadFrequently: true});
                drawReviewSceneFrame(expected, {canvas: scene.output, layout, background: scene.background, image: null,
                  spatialRenderer: galleryRenderer, sample: {draw(ctx, x, y, width, height) {ctx.drawImage(source, x, y, width, height);}}});
                drawReviewSceneOverlays({scene: {canvas: scene.output, layout, background: scene.background, sourceTime: time},
                  renderer: galleryRenderer, context: expected, canvas: expectedCanvas, spotlightScratch: document.createElement('canvas'),
                  regions, globalResultTime: time, cameraScale: camera.scale, sourceWidth: 640, clicks});
                const frame = resolveVideoCompositionFrame(project, time);
                const owner = frame.visualLayers.find((layer) => layer.kind === 'video');
                owner.actions = evaluateReviewClicks(clicks, time).map((gestureFeedback) => ({gestureFeedback,
                  renderKind: 'accent', preset: 'CLICK_RIPPLE', point: gestureFeedback.point}));
                const sources = new Map([[owner.clipId, {sourceWidth: 640, sourceHeight: 360,
                  draw(ctx, x, y, width, height) {ctx.drawImage(source, x, y, width, height);}}]]);
                drawSceneBackground({context: actual, width: project.width, height: project.height, projectScale: 1,
                  sceneBackground: project.sceneBackground, ...(frame.camera.backgroundCamera ? {camera: frame.camera.backgroundCamera} : {})});
                for (const part of splitVisualLayersForSourceSpotlights([owner], frame.sceneSpotlights)) {
                  if (spatial) drawSpatialCompositionGroup({camera: frame.camera, context: actual, layers: part.layers,
                    clipMediaElements: sources, imageBank: {}, effectState: {drawnTransitionIds: new Set()},
                    logicalSize: scene.output, output: scene.output, rasterScale: 1, renderer: nativeRenderer,
                    destination: {x: 0, y: 0, ...scene.output}});
                  else {
                    actual.save(); actual.scale(frame.camera.scale, frame.camera.scale);
                    actual.translate(-frame.camera.viewportX, -frame.camera.viewportY);
                    for (const layer of part.layers) drawCompositionVisualLayer(actual, layer, 1, 1, {}, sources);
                    actual.restore();
                  }
                  if (part.afterClipId) drawCompositionSceneSpotlights({context: actual, project, frame, afterClipId: part.afterClipId,
                    images: {}, viewport: {x: 0, y: 0, ...scene.output}, composition: {x: 0, y: 0, scale: 1}});
                }
                const a = expected.getImageData(0, 0, project.width, project.height).data;
                const b = actual.getImageData(0, 0, project.width, project.height).data;
                let sum = 0, bad = 0, utilityInk = 0;
                for (let i = 0; i < a.length; i += 4) {
                  let max = 0;
                  if ((a[i] > 180 && a[i + 1] > 70 && a[i + 2] < 40) || (a[i] > 100 && a[i + 1] > 110 && a[i + 2] > 150)) utilityInk++;
                  for (let c = 0; c < 3; c++) {const delta = Math.abs(a[i + c] - b[i + c]); sum += delta; max = Math.max(max, delta);}
                  if (max > 16) bad++;
                }
                results.push({spatial, utility, utilityInk, clickOpacity: evaluateReviewClicks(clicks, time)[0]?.opacity, mean: sum / (project.width * project.height * 3), bad: bad / (project.width * project.height)});
              }
            } finally {galleryRenderer.dispose(); nativeRenderer.dispose();}
            return results;
          }
        `,
        resolveDir: process.cwd(),
        loader: 'ts',
      },
      loader: { '.woff2': 'dataurl', '.svg': 'text' },
      bundle: true,
      format: 'esm',
      platform: 'browser',
      write: false,
    });
    const proof = await page.evaluate(async (text) => {
      const url = URL.createObjectURL(new Blob([text], { type: 'text/javascript' }));
      try {
        return (await import(url)).probe();
      } finally {
        URL.revokeObjectURL(url);
      }
    }, bundle.outputFiles[0]!.text);
    await writeFile(
      info.outputPath('source-utilities-gallery-pixels.json'),
      JSON.stringify(proof, null, 2)
    );
    for (const spatial of ['false', 'true']) {
      await page.locator('[data-spatial]').evaluateAll((rows, selected) => {
        for (const row of rows)
          if (row instanceof HTMLElement)
            row.style.display = row.dataset.spatial === selected ? 'flex' : 'none';
      }, spatial);
      await page.screenshot({
        path: info.outputPath(`source-utilities-gallery-${spatial}.png`),
        fullPage: false,
      });
    }
    for (const result of proof) {
      expect(result.utilityInk, JSON.stringify(result)).toBeGreaterThan(100);
      // Match the established camera matrix budget for independently resampled sharp strokes.
      expect(result.mean, JSON.stringify(result)).toBeLessThan(0.1);
      expect(result.bad, JSON.stringify(result)).toBeLessThan(0.005);
    }
  } finally {
    host.server.closeAllConnections();
    await new Promise<void>((resolve) => host.server.close(resolve));
  }
});

test('source transition masks blend phase coverage without losing authored strength', async ({
  page,
}, info) => {
  const host = await startHostServer();
  try {
    await page.setViewportSize({ width: 1920, height: 900 });
    await page.goto(host.origin);
    await page.setContent('<main></main>');
    const bundle = await build({
      stdin: {
        contents: `
      import {createSceneSpotlightMasks, drawSceneSpotlights} from './apps/extension/src/features/video/composition/draw/spotlight';
      export function probe() {
        const results = [];
        for (const phases of [[1, 1], [.2, .8]]) for (const weight of [.25, .5, .75]) {
          const frames = phases.map((phase, index) => ({opening: {x: index ? 50 : 10, y: 10, width: 10, height: 10},
            radius: 0, dim: .65 * phase, blur: 0, presence: index ? 1 - weight : weight,
            blend: {groupId: 'source-transition', weight: index ? 1 - weight : weight}}));
          const masks = createSceneSpotlightMasks({width: 80, height: 40}, frames);
          try {
            const ctx = masks.dim.getContext('2d');
            const values = [[5,5], [15,15], [55,15]].map(([x,y]) => ctx.getImageData(x,y,1,1).data[3]);
            const expected = [255 * .65 * (weight * phases[0] + (1 - weight) * phases[1]),
              255 * .65 * (1 - weight) * phases[1], 255 * .65 * weight * phases[0]];
            results.push({phases, weight, values, expected});
          } finally {masks.dispose();}
        }
        const canvas = document.createElement('canvas'); canvas.width=80; canvas.height=40;
        const context=canvas.getContext('2d'); context.fillStyle='#ffffff'; context.fillRect(0,0,80,40);
        drawSceneSpotlights(context,canvas,null,[{opening:{x:10,y:10,width:10,height:10},radius:0,dim:.65,blur:0,
          blend:{groupId:'single',weight:.25}}]);
        results.push({single:true,values:[context.getImageData(5,5,1,1).data[0]],expected:[255*(1-.65*.25)]});
        const control = createSceneSpotlightMasks({width: 80, height: 40}, [
          {opening: {x:10,y:10,width:10,height:10}, radius:0, dim:.2,blur:0},
          {opening: {x:50,y:10,width:10,height:10}, radius:0, dim:.8,blur:0}]);
        try {results.push({control: true, values:[control.dim.getContext('2d').getImageData(5,5,1,1).data[3]], expected:[204]});}
        finally {control.dispose();}
        return results;
      }
    `,
        resolveDir: process.cwd(),
        loader: 'ts',
      },
      loader: { '.woff2': 'dataurl', '.svg': 'text' },
      bundle: true,
      format: 'esm',
      platform: 'browser',
      write: false,
    });
    const proof = await page.evaluate(async (text) => {
      const url = URL.createObjectURL(new Blob([text], { type: 'text/javascript' }));
      try {
        return (await import(url)).probe();
      } finally {
        URL.revokeObjectURL(url);
      }
    }, bundle.outputFiles[0]!.text);
    await writeFile(
      info.outputPath('source-transition-mask-coverage.json'),
      JSON.stringify(proof, null, 2)
    );
    for (const result of proof)
      for (let index = 0; index < result.values.length; index++)
        expect(
          Math.abs(result.values[index]! - result.expected[index]!),
          JSON.stringify(result)
        ).toBeLessThanOrEqual(1);
  } finally {
    host.server.closeAllConnections();
    await new Promise<void>((resolve) => host.server.close(resolve));
  }
});
