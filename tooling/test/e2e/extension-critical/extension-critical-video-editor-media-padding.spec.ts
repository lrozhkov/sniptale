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
  project.version = 16;
  project.backgroundColor = '#123456';
  project.sceneBackground = { kind: 'solid', color: '#123456' };
  const video = project.clips.find((clip) => clip.type === 'VIDEO')!;
  if (video.type !== 'VIDEO') throw new Error('Missing video');
  Object.assign(video, {
    duration: 1.2,
    sourceDuration: 1.2,
    fitMode: 'STRETCH',
    windowCornerRadius: 0,
    windowHeader: { ...DEFAULT_WINDOW_HEADER, title: 'Window' },
    sourceCrop: { x: 0.25, y: 0, width: 0.5, height: 1 },
    transform: { ...video.transform, x: 20, y: 30, width: 140, height: 120, opacity: 0.37 },
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
  image.windowCornerRadius = 0;
  image.windowHeader = { ...DEFAULT_WINDOW_HEADER };
  image.transform.opacity = 0.61;
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
    if (sessionStorage.getItem('padding-seeded')) {
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
    sessionStorage.setItem('padding-seeded', 'true');
  }, svg);
  await page.goto(`${origin}${VIDEO_EDITOR_HARNESS_PATH}?project=${project.id}&theme=${theme}`);
  await expect(page.locator('[data-ui="video-editor.timeline.surface"]')).toBeVisible();
  return { project, video, image };
}

for (const [index, viewport] of PRIMARY_BROWSER_VIEWPORTS.entries()) {
  const locale = index === 0 ? 'en' : 'ru',
    theme = index === 0 ? 'dark' : 'light';
  test(`media padding preserves free montage ${viewport.size.width} ${locale}`, async ({
    page,
  }, info) => {
    test.setTimeout(180000);
    await page.setViewportSize({ ...viewport.size });
    await page.emulateMedia({ colorScheme: theme });
    const host = await startHostServer(),
      label = (key: Parameters<typeof translate>[0]) => translate(key, locale),
      errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    try {
      const { project, video, image } = await openFixture(page, host.origin, locale, theme),
        selected = index === 0 ? video : image;
      const read = async () =>
        (await readNativeVideoProject(page))!.clips.find((clip) => clip.id === selected.id)!;
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
      const field = page.getByRole('textbox', {
        name: label('gallery.videoReview.backgroundPadding'),
        exact: true,
      });
      await field.scrollIntoViewIfNeeded();
      const before = (await readNativeVideoProject(page))!,
        initialValue = await field.inputValue();
      const source = index === 0 ? { width: 80, height: 90 } : { width: 100, height: 100 };
      const headerHeight = windowHeaderGeometry(DEFAULT_WINDOW_HEADER, source).height;
      const expectedX = (320 - (120 * source.width) / (source.height + headerHeight)) / 2;
      const waitForPadding = () =>
        expect.poll(async () => (await read()).transform.x).toBeCloseTo(expectedX, 8);
      await field.fill('30');
      await field.press('Enter');
      await expect(field).toHaveValue('30');
      await waitForPadding();
      const padded = await read();
      expect(padded.transform.opacity).toBe(selected.transform.opacity);
      expect(padded.transform.rotation).toBe(0);
      await page.locator('[data-ui="video-editor.timeline.toolbar.undo"]').click();
      await expect(field).toHaveValue(initialValue);
      await expect.poll(read).toEqual(before.clips.find((clip) => clip.id === selected.id));
      await page.locator('[data-ui="video-editor.timeline.toolbar.redo"]').click();
      await expect(field).toHaveValue('30');
      await waitForPadding();
      const retry = await readNativeVideoProject(page);
      await field.press('Enter');
      expect(await readNativeVideoProject(page)).toEqual(retry);
      await page
        .getByRole('button', {
          name: label('videoEditor.sidebar.inspectorGroupTransform'),
          exact: true,
        })
        .click();
      const rotation = page.getByRole('textbox', {
        name: label('videoEditor.sidebar.rotationLabel'),
        exact: true,
      });
      await rotation.fill('17');
      await rotation.press('Enter');
      await expect.poll(async () => (await read()).transform.rotation).toBe(17);
      const exact = page
        .locator('summary')
        .filter({ hasText: label('videoEditor.sidebar.inspectorExactPlacement') });
      if ((await exact.count()) && (await exact.locator('..').getAttribute('open')) === null)
        await exact.click();
      const x = page.getByRole('textbox', { name: 'X', exact: true });
      await x.fill('111.25');
      await x.press('Enter');
      await expect.poll(async () => (await read()).transform.x).toBe(111.25);
      await group.click();
      await field.scrollIntoViewIfNeeded();
      const free = await readNativeVideoProject(page);
      await field.press('Enter');
      expect(await readNativeVideoProject(page)).toEqual(free);
      await field.fill('30');
      await field.press('Enter');
      await expect(field).toHaveValue('30');
      await waitForPadding();
      await checkInspectorPaintedFont(page, field, 'media-padding');
      const pixels = await page
        .locator('[data-preview-stage-canvas]')
        .evaluate((node: HTMLCanvasElement) => {
          const context = node.getContext('2d')!,
            sample = (x: number, y: number) =>
              Array.from(
                context.getImageData(
                  Math.round((x * node.width) / 320),
                  Math.round((y * node.height) / 180),
                  1,
                  1
                ).data
              );
          return {
            background: [
              [5, 5],
              [315, 175],
              [160, 15],
            ].map(([x, y]) => sample(x!, y!)),
            header: sample(160, 31),
          };
        });
      for (const pixel of pixels.background)
        for (const [channel, value] of [18, 52, 86].entries())
          expect(Math.abs(pixel[channel]! - value)).toBeLessThanOrEqual(2);
      expect(
        pixels.header
          .slice(0, 3)
          .reduce((sum, value, i) => sum + Math.abs(value - [18, 52, 86][i]!), 0)
      ).toBeGreaterThan(20);
      await page.screenshot({ path: info.outputPath('media-padding.png'), fullPage: false });
      const close = page.locator('[data-ui="video-editor.materials.close"]');
      if (await close.isVisible()) await close.click();
      const inspector = page.locator('[data-ui="video-editor.floating.context-inspector"]'),
        handle = page.locator('[data-ui="video-editor.floating.context-inspector.resize"]'),
        rail = inspector.locator('[data-ui="video-editor.inspector.categories"] > nav');
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
          path: info.outputPath(`media-padding-${size}.png`),
          fullPage: false,
        });
      }
      await page.locator('[data-ui="video-editor.inspector.presentation-toggle"]').click();
      await field.scrollIntoViewIfNeeded();
      await page.screenshot({ path: info.outputPath('media-padding-all.png'), fullPage: false });
      const accepted = (await readNativeVideoProject(page))!;
      await page.reload();
      await expect(page.locator('[data-ui="video-editor.timeline.surface"]')).toBeVisible();
      await expect.poll(read).toEqual(accepted.clips.find((clip) => clip.id === selected.id));
      await page
        .getByRole('button', { name: label('videoEditor.sidebar.sceneProperties'), exact: true })
        .click();
      await page
        .locator(`[data-project-timeline-clip="${selected.id}"]`)
        .click({ modifiers: ['Control'] });
      if (await group.isVisible()) await group.click();
      await field.scrollIntoViewIfNeeded();
      await expect(field).toHaveValue('30');
      await page.screenshot({
        path: info.outputPath('media-padding-reopened.png'),
        fullPage: false,
      });
      const reopened = (await readNativeVideoProject(page))!;
      expect(reopened.assets).toEqual(before.assets);
      expect(reopened.clips.filter((clip) => clip.id !== selected.id)).toEqual(
        before.clips.filter((clip) => clip.id !== selected.id)
      );
      expect(reopened.version).toBe(16);
      expect(reopened.width).toBe(project.width);
      expect(reopened.height).toBe(project.height);
      if (index === 0) {
        await page.setViewportSize({ width: 1200, height: 560 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true
        );
      }
      await writeFile(
        info.outputPath('media-padding-proof.json'),
        JSON.stringify(
          {
            pixels,
            padded,
            free,
            accepted,
            historyAndReopen: true,
            freePlacementRetained: true,
            otherClipsRetained: true,
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

for (const format of ['MP4', 'WEBM'] as const) {
  test(`encoded ${format} preserves padded cropped window and unchanged second clip`, async ({
    page,
  }, info) => {
    test.setTimeout(180000);
    await page.setViewportSize({ width: 1280, height: 560 });
    const host = await startHostServer();
    try {
      const { video } = await openFixture(page, host.origin);
      await page
        .getByRole('button', {
          name: translate('videoEditor.sidebar.sceneProperties', 'en'),
          exact: true,
        })
        .click();
      await page
        .locator(`[data-project-timeline-clip="${video.id}"]`)
        .click({ modifiers: ['Control'] });
      const group = page.getByRole('button', {
        name: translate('videoEditor.sidebar.inspectorGroupFraming', 'en'),
        exact: true,
      });
      if (await group.isVisible()) await group.click();
      const padding = page.getByRole('textbox', {
        name: translate('gallery.videoReview.backgroundPadding', 'en'),
        exact: true,
      });
      await padding.fill('30');
      await padding.press('Enter');
      await expect(padding).toHaveValue('30');
      // The save writer is asynchronous; a typed field value does not prove persisted geometry.
      const header = windowHeaderGeometry(DEFAULT_WINDOW_HEADER, { width: 80, height: 90 }).height;
      const join = (120 * header) / (90 + header);
      const width = (120 * 80) / (90 + header);
      const left = (320 - width) / 2;
      await expect
        .poll(
          async () =>
            (await readNativeVideoProject(page))!.clips.find((clip) => clip.id === video.id)!
              .transform.x
        )
        .toBeCloseTo(left, 8);
      const project = (await readNativeVideoProject(page))!;
      const before = structuredClone(project);
      await page.goto(`${host.origin}${OFFSCREEN_HARNESS_PATH}`);
      await page.locator('[data-ui="offscreen.harness.root"][data-state="ready"]').waitFor();
      const jobId = `media-padding-${format}`;
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

      const proof = await page.evaluate(
        async ({ exportId, join, width, left }) => {
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
              expected.globalAlpha = 1;
              expected.fillStyle = '#123456';
              expected.fillRect(0, 0, 320, 180);
              expected.globalAlpha = 0.37;
              expected.imageSmoothingQuality = 'high';
              expected.drawImage(original, 40, 0, 80, 90, left, 30 + join, width, 120 - join);
              const backgroundPixels = [];
              let backgroundError = 0,
                imageError = 0,
                sourceError = 0,
                sourceSamples = 0;
              for (const [x, y] of [
                [5, 5],
                [315, 5],
                [5, 175],
                [315, 175],
                [160, 15],
                [160, 165],
                [105, 100],
                [310, 100],
              ]) {
                const pixel = actual.getImageData(x!, y!, 1, 1).data;
                backgroundPixels.push({ x, y, rgb: Array.from(pixel).slice(0, 3) });
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
                for (const [channel, value] of [34, 211, 238]
                  .map((value, i) => value * 0.61 + [18, 52, 86][i]! * 0.39)
                  .entries())
                  imageError += Math.abs(pixel[channel]! - value);
              }
              for (const u of [0.15, 0.35, 0.55])
                for (const v of [0.4, 0.6, 0.8]) {
                  const x = Math.round(left + width * u),
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
                backgroundPixels,
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
        { exportId: completion.exportId, join, width, left }
      );
      await writeFile(
        info.outputPath(`media-padding-${format}.json`),
        JSON.stringify(proof, null, 2)
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
    } finally {
      host.server.closeAllConnections();
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}
