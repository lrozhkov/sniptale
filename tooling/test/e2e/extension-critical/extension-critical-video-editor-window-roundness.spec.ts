import { hydrateVideoProject } from '../../../../apps/extension/src/features/video/project/hydration';
import { readFile, writeFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import {
  createVideoProjectFromRecording,
  createVideoProjectAsset,
  createVideoProjectTrack,
} from '../../../../apps/extension/src/features/video/project/factories/creation';
import { createVideoClipFromAsset } from '../../../../apps/extension/src/features/video/project/factories/clip';
import {
  DEFAULT_WINDOW_HEADER,
  windowHeaderGeometry,
} from '../../../../packages/runtime-contracts/src/window-header';
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

const svg =
  '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="#22d3ee"/></svg>';

async function openFixture(page: Page, origin: string, locale: 'en' | 'ru' = 'en', theme = 'dark') {
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
  project.width = 320;
  project.height = 180;
  project.duration = 1.2;
  project.version = 15;
  project.backgroundColor = '#123456';
  project.sceneBackground = { kind: 'solid', color: '#123456' };
  const video = project.clips.find((clip) => clip.type === 'VIDEO')!;
  if (video.type !== 'VIDEO') throw new Error('Missing video');
  Object.assign(video, {
    duration: 1.2,
    sourceDuration: 1.2,
    fitMode: 'STRETCH',
    windowCornerRadius: 24,
    windowHeader: { ...DEFAULT_WINDOW_HEADER, title: 'Window' },
    sourceCrop: { x: 0.25, y: 0, width: 0.5, height: 1 },
    transform: { ...video.transform, x: 20, y: 30, width: 140, height: 120 },
  });
  const track = createVideoProjectTrack('Image', 1, 'PRIMARY');
  const imageAsset = createVideoProjectAsset(
    'Image',
    'IMAGE',
    { kind: 'project-asset', projectAssetId: 'radius-image' },
    {
      width: 100,
      height: 100,
      duration: null,
      mimeType: 'image/svg+xml',
      size: new TextEncoder().encode(svg).length,
      hasAudio: false,
      audioPeaks: null,
    }
  );
  const image = createVideoClipFromAsset(track.id, imageAsset, 320, 180);
  if (image.type !== 'IMAGE') throw new Error('Missing image');
  image.duration = 1.2;
  image.windowCornerRadius = 32;
  image.fitMode = 'STRETCH';
  image.transform = { ...image.transform, x: 180, y: 40, width: 120, height: 100 };
  project.tracks.push(track);
  project.assets.push(imageAsset);
  project.clips.push(image);
  Object.assign(project, hydrateVideoProject(project));
  await applyHarnessBootstrap(page, {
    preserveMediaLibrary: true,
    videoProjects: [project],
    storage: { 'sniptale-locale-preference': locale, 'sniptale-theme-preference': theme },
  });
  await page.addInitScript((language) => {
    localStorage.setItem('sniptale-locale-preference', language);
    if (sessionStorage.getItem('radius-seeded')) {
      const bootstrap: unknown = Reflect.get(window, '__sniptaleHarnessBootstrap');
      if (typeof bootstrap === 'object' && bootstrap !== null)
        Reflect.deleteProperty(bootstrap, 'videoProjects');
    }
  }, locale);
  await page.goto(`${origin}${GALLERY_HARNESS_PATH}?theme=${theme}`);
  await page.locator('[data-ui="gallery.page.root"]').waitFor();
  await seedReviewVideo(page, 'review-vp8-opus.webm', { width: 160, height: 90, duration: 12 });
  await page.evaluate(async (svg) => {
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const objects = await (
      await (await navigator.storage.getDirectory()).getDirectoryHandle('sniptale-assets')
    ).getDirectoryHandle('objects');
    const file = await objects.getFileHandle('radius-image-bytes', { create: true });
    const writer = await file.createWritable();
    await writer.write(blob);
    await writer.close();
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open('sniptale-db');
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    const tx = db.transaction(['project_assets', 'asset_refs', 'asset_owners'], 'readwrite');
    const done = new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
    });
    tx.objectStore('project_assets').put({
      id: 'radius-image',
      assetId: 'radius-image-bytes',
      mimeType: blob.type,
      size: blob.size,
      createdAt: 1,
    });
    tx.objectStore('asset_refs').put({
      assetId: 'radius-image-bytes',
      location: { kind: 'opfs', objectKey: 'objects/radius-image-bytes' },
      mimeType: blob.type,
      size: blob.size,
      createdAt: 1,
      sha256: null,
    });
    tx.objectStore('asset_owners').put({
      assetId: 'radius-image-bytes',
      ownerKind: 'project-asset',
      ownerId: 'radius-image',
      role: 'body',
    });
    await done;
    db.close();
    sessionStorage.setItem('radius-seeded', 'true');
  }, svg);
  await page.goto(`${origin}${VIDEO_EDITOR_HARNESS_PATH}?project=${project.id}&theme=${theme}`);
  await expect(page.locator('[data-ui="video-editor.timeline.surface"]')).toBeVisible();
  return { project, video, image };
}

for (const [index, viewport] of PRIMARY_BROWSER_VIEWPORTS.entries()) {
  const locale = index === 0 ? 'en' : 'ru',
    theme = index === 0 ? 'dark' : 'light';
  test(`rounded media windows preserve montage ${viewport.size.width} ${locale}`, async ({
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
      const { project, video, image } = await openFixture(page, host.origin, locale, theme);
      const selected = index === 0 ? video : image;
      const select = async () => {
        await page
          .getByRole('button', { name: label('videoEditor.sidebar.sceneProperties'), exact: true })
          .click();
        await page
          .locator(`[data-project-timeline-clip="${selected.id}"]`)
          .click({ modifiers: ['Control'] });
        const group = page.getByRole('button', {
          name: label('videoEditor.sidebar.inspectorGroupFraming'),
          exact: true,
        });
        if (await group.isVisible()) await group.click();
        const summary = page
          .locator('summary')
          .filter({ hasText: label('videoEditor.sidebar.inspectorGroupAppearance') });
        if ((await summary.count()) && (await summary.locator('..').getAttribute('open')) === null)
          await summary.click();
      };
      await select();
      const field = page.getByRole('textbox', {
        name: label('gallery.videoReview.backgroundCornerRadius'),
        exact: true,
      });
      const readRadius = async () => {
        const clip = (await readNativeVideoProject(page))?.clips.find(
          (clip) => clip.id === selected.id
        );
        return clip && 'windowCornerRadius' in clip ? clip.windowCornerRadius : undefined;
      };
      await field.scrollIntoViewIfNeeded();
      await expect(field).toHaveValue(String(selected.windowCornerRadius));
      await field.fill('48');
      await field.press('Enter');
      await expect.poll(readRadius).toBe(48);
      await page.locator('[data-ui="video-editor.timeline.toolbar.undo"]').click();
      await expect.poll(readRadius).toBe(selected.windowCornerRadius);
      await page.locator('[data-ui="video-editor.timeline.toolbar.redo"]').click();
      await expect.poll(readRadius).toBe(48);
      await field.fill(String(selected.windowCornerRadius));
      await field.press('Enter');
      await expect.poll(readRadius).toBe(selected.windowCornerRadius);
      await checkInspectorPaintedFont(page, field, 'rounded-window');
      const pixels = await page
        .locator('[data-preview-stage-canvas]')
        .evaluate((node: HTMLCanvasElement) => {
          const ctx = node.getContext('2d')!;
          const sample = (x: number, y: number) =>
            Array.from(
              ctx.getImageData(
                Math.round((x * node.width) / 320),
                Math.round((y * node.height) / 180),
                1,
                1
              ).data
            ).slice(0, 3);
          return {
            corners: [
              [21, 31],
              [159, 31],
              [181, 41],
              [299, 41],
            ].map(([x, y]) => sample(x!, y!)),
            image: sample(240, 90),
          };
        });
      for (const pixel of pixels.corners)
        for (const [channel, value] of [18, 52, 86].entries())
          expect(Math.abs(pixel[channel]! - value)).toBeLessThanOrEqual(1);
      for (const [channel, value] of [34, 211, 238].entries())
        expect(Math.abs(pixels.image[channel]! - value)).toBeLessThanOrEqual(1);
      await page.screenshot({ path: info.outputPath('window-radius.png'), fullPage: false });
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
        expect((await rail.boundingBox())?.y).toBe(before?.y);
        expect(await inspector.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(
          true
        );
        await page.screenshot({
          path: info.outputPath(`window-radius-${size}.png`),
          fullPage: false,
        });
      }
      await page.locator('[data-ui="video-editor.inspector.presentation-toggle"]').click();
      await field.scrollIntoViewIfNeeded();
      await page.screenshot({ path: info.outputPath('window-radius-all.png'), fullPage: false });
      await page.reload();
      await expect(page.locator('[data-ui="video-editor.timeline.surface"]')).toBeVisible();
      await expect.poll(readRadius).toBe(selected.windowCornerRadius);
      await select();
      await field.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: info.outputPath('window-radius-reopened.png'),
        fullPage: false,
      });
      const reopened = (await readNativeVideoProject(page))!;
      expect(reopened.clips).toEqual(project.clips);
      expect(reopened.assets).toEqual(project.assets);
      expect(reopened.version).toBe(15);
      if (index === 0) {
        await page.setViewportSize({ width: 1200, height: 560 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true
        );
      }
      await writeFile(
        info.outputPath('window-radius-proof.json'),
        JSON.stringify({ pixels, sourceRetained: true, historyAndReopen: true }, null, 2)
      );
      expect(errors).toEqual([]);
    } finally {
      host.server.closeAllConnections();
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}

for (const format of ['MP4', 'WEBM'] as const) {
  test(`encoded ${format} preserves rounded VIDEO and IMAGE windows`, async ({ page }, info) => {
    test.setTimeout(180000);
    await page.setViewportSize({ width: 1280, height: 560 });
    const host = await startHostServer();
    try {
      const { project } = await openFixture(page, host.origin);
      const before = structuredClone(project);
      await page.goto(`${host.origin}${OFFSCREEN_HARNESS_PATH}`);
      await page.locator('[data-ui="offscreen.harness.root"][data-state="ready"]').waitFor();
      const jobId = `rounded-window-${format}`;
      const input = await page.evaluate(
        async ({ jobId, project }) => {
          if (!window.__sniptaleOffscreenHarness) throw new Error('Missing export bridge');
          return window.__sniptaleOffscreenHarness.stageProjectExportInput(jobId, project);
        },
        { jobId, project }
      );
      await emitTrustedOffscreenHarnessRuntimeMessage(page, {
        input,
        jobId,
        type: VideoMessageType.OFFSCREEN_START_PROJECT_EXPORT,
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
      if (typeof completion.exportId !== 'string') throw new Error('Missing export identity');
      const header = windowHeaderGeometry(DEFAULT_WINDOW_HEADER, { width: 80, height: 90 }).height;
      const join = Math.round((120 * header) / (90 + header));
      const proof = await page.evaluate(
        async ({ exportId, join }) => {
          const db = await new Promise<IDBDatabase>((resolve, reject) => {
            const r = indexedDB.open('sniptale-db');
            r.onsuccess = () => resolve(r.result);
            r.onerror = () => reject(r.error);
          });
          const entry: unknown = await new Promise((resolve, reject) => {
            const r = db
              .transaction('project_exports')
              .objectStore('project_exports')
              .get(exportId);
            r.onsuccess = () => resolve(r.result);
            r.onerror = () => reject(r.error);
          });
          db.close();
          if (
            typeof entry !== 'object' ||
            entry === null ||
            !('assetId' in entry) ||
            typeof entry.assetId !== 'string'
          )
            throw new Error('Missing export asset');
          const objects = await (
            await (await navigator.storage.getDirectory()).getDirectoryHandle('sniptale-assets')
          ).getDirectoryHandle('objects');
          const file = await (await objects.getFileHandle(entry.assetId)).getFile();
          const source = await (await objects.getFileHandle('beta-v1-recording-asset')).getFile();
          const urls: string[] = [];
          const open = async (file: File) => {
            const video = document.createElement('video');
            video.muted = true;
            const url = URL.createObjectURL(file);
            urls.push(url);
            video.src = url;
            await new Promise<void>((resolve, reject) => {
              video.onloadeddata = () => resolve();
              video.onerror = () => reject(new Error('Decode failed'));
            });
            return video;
          };
          const encoded = await open(file),
            original = await open(source);
          const seek = (video: HTMLVideoElement, time: number) =>
            new Promise<void>((resolve) => {
              video.onseeked = () => resolve();
              video.currentTime = time;
            });
          const canvas = document.createElement('canvas'),
            reference = document.createElement('canvas');
          canvas.width = reference.width = 320;
          canvas.height = reference.height = 180;
          const actual = canvas.getContext('2d')!,
            expected = reference.getContext('2d')!;
          const results = [];
          try {
            for (const time of [0.2, 0.8]) {
              await seek(encoded, time);
              await seek(original, time);
              actual.drawImage(encoded, 0, 0, 320, 180);
              expected.clearRect(0, 0, 320, 180);
              expected.imageSmoothingQuality = 'high';
              expected.drawImage(original, 40, 0, 80, 90, 20, 30 + join, 140, 120 - join);
              let backgroundError = 0,
                imageError = 0,
                sourceError = 0,
                sourceSamples = 0;
              for (const [x, y] of [
                [21, 31],
                [159, 31],
                [21, 149],
                [159, 149],
                [181, 41],
                [299, 41],
                [181, 139],
                [299, 139],
              ]) {
                const pixel = actual.getImageData(x!, y!, 1, 1).data;
                for (const [channel, value] of [18, 52, 86].entries())
                  backgroundError += Math.abs(pixel[channel]! - value);
              }
              for (const [x, y] of [
                [225, 80],
                [240, 80],
                [255, 80],
                [225, 90],
                [240, 90],
                [255, 90],
              ]) {
                const pixel = actual.getImageData(x!, y!, 1, 1).data;
                for (const [channel, value] of [34, 211, 238].entries())
                  imageError += Math.abs(pixel[channel]! - value);
              }
              for (const u of [0.25, 0.5, 0.75])
                for (const v of [0.4, 0.6, 0.8]) {
                  const x = Math.round(20 + 140 * u),
                    y = Math.round(30 + join + (120 - join) * v);
                  const a = actual.getImageData(x, y, 1, 1).data,
                    b = expected.getImageData(x, y, 1, 1).data;
                  for (let channel = 0; channel < 3; channel++)
                    sourceError += Math.abs(a[channel]! - b[channel]!);
                  sourceSamples++;
                }
              results.push({
                time,
                backgroundError: backgroundError / 24,
                imageError: imageError / 18,
                sourceError: sourceError / (sourceSamples * 3),
                sourceSamples,
              });
            }
            return {
              width: encoded.videoWidth,
              height: encoded.videoHeight,
              duration: encoded.duration,
              size: file.size,
              frames: results,
            };
          } finally {
            encoded.removeAttribute('src');
            original.removeAttribute('src');
            urls.forEach((url) => URL.revokeObjectURL(url));
          }
        },
        { exportId: completion.exportId, join }
      );
      expect(proof.width).toBe(320);
      expect(proof.height).toBe(180);
      expect(proof.size).toBeGreaterThan(1000);
      expect(Math.abs(proof.duration - 1.2)).toBeLessThan(0.03);
      for (const frame of proof.frames) {
        expect(frame.backgroundError).toBeLessThan(4);
        expect(frame.imageError).toBeLessThan(4);
        expect(frame.sourceError).toBeLessThan(14);
        expect(frame.sourceSamples).toBe(9);
      }
      expect(project).toEqual(before);
      await writeFile(
        info.outputPath(`window-radius-${format}.json`),
        JSON.stringify(proof, null, 2)
      );
    } finally {
      host.server.closeAllConnections();
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}
