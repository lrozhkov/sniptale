import { hydrateVideoProject } from '../../../../apps/extension/src/features/video/project/hydration';
import { readFile, writeFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import {
  createVideoProjectFromRecording,
  createVideoProjectAsset,
  createVideoProjectTrack,
} from '../../../../apps/extension/src/features/video/project/factories/creation';
import { createVideoClipFromAsset } from '../../../../apps/extension/src/features/video/project/factories/clip';
import { DEFAULT_WINDOW_HEADER } from '../../../../packages/runtime-contracts/src/window-header';
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

async function openFixture(
  page: Page,
  origin: string,
  locale: 'en' | 'ru' = 'en',
  theme = 'dark',
  authored = false
) {
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
  project.motionRegions = [
    {
      id: 'motion-first',
      startTime: 0,
      duration: 0.35,
      scale: 2.2,
      focusMode: 'MANUAL',
      focusPoint: { x: 100, y: 70 },
      targetAction: null,
      easing: 'LINEAR',
      zoomInDuration: 0.2,
      zoomOutDuration: 0.15,
      motionBlurAmount: 0.45,
    },
    {
      id: 'motion-second',
      startTime: 0.85,
      duration: 0.35,
      scale: 1.7,
      focusMode: 'MANUAL',
      focusPoint: { x: 220, y: 110 },
      targetAction: null,
      easing: 'LINEAR',
      zoomInDuration: 0.15,
      zoomOutDuration: 0.15,
      motionBlurAmount: 0,
      incomingConnection: { fromRegionId: 'motion-first', easing: 'LINEAR' },
    },
  ];
  if (authored) {
    project.version = 17;
    for (const region of project.motionRegions)
      region.motionBlur = {
        enter: { enabled: true, strength: 1 },
        exit: { enabled: true, strength: 1 },
        link: { enabled: true, strength: 1 },
      };
  }
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
    if (sessionStorage.getItem('motion-blur-seeded')) {
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
    sessionStorage.setItem('motion-blur-seeded', 'true');
  }, svg);
  await page.goto(`${origin}${VIDEO_EDITOR_HARNESS_PATH}?project=${project.id}&theme=${theme}`);
  await expect(page.locator('[data-ui="video-editor.timeline.surface"]')).toBeVisible();
  return { project, video, image };
}

for (const [index, viewport] of PRIMARY_BROWSER_VIEWPORTS.entries()) {
  const locale = index === 0 ? 'en' : 'ru',
    theme = index === 0 ? 'dark' : 'light';
  test(`phased motion inspector ${viewport.size.width} ${locale}`, async ({ page }, info) => {
    test.setTimeout(180000);
    await page.setViewportSize({ ...viewport.size });
    await page.emulateMedia({ colorScheme: theme });
    const host = await startHostServer(),
      label = (key: Parameters<typeof translate>[0]) => translate(key, locale),
      errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const read = async () => (await readNativeVideoProject(page))!;
    const first = async () =>
      (await read()).motionRegions!.find((region) => region.id === 'motion-first')!;
    const phase = (name: string) =>
      page.locator(`[data-ui="video-editor.motion.blur"][data-phase="${name}"]`);
    const strength = (name: string) =>
      phase(name).getByRole('textbox', {
        name: label('gallery.videoReview.motionBlurStrength'),
        exact: true,
      });
    const selectFirst = async () => {
      await page
        .locator('[data-timeline-effect-segment="motion-first"]')
        .getByRole('button', {
          name: label('videoEditor.timeline.motionSegment') + ' · 2.20x',
          exact: true,
        })
        .click();
      const group = page.getByRole('button', {
        name: label('videoEditor.sidebar.inspectorGroupAnimation'),
        exact: true,
      });
      if (await group.isVisible()) await group.click();
    };
    try {
      await openFixture(page, host.origin, locale, theme);
      const before = await read();
      await selectFirst();
      await strength('enter').fill('73.1');
      await strength('enter').press('Enter');
      await expect.poll(async () => (await first()).motionBlur?.enter?.strength).toBe(0.731);
      await strength('exit').fill('35.2');
      await strength('exit').press('Enter');
      await expect.poll(async () => (await first()).motionBlur?.exit?.strength).toBe(35.2 / 100);
      await phase('enter').getByRole('switch').click();
      await expect
        .poll(async () => (await first()).motionBlur?.enter)
        .toEqual({ enabled: false, strength: 0.731 });
      await expect(strength('enter')).toHaveCount(0);
      await page.locator('[data-ui="video-editor.timeline.toolbar.undo"]').click();
      await expect(strength('enter')).toHaveValue('73.1');
      await page.locator('[data-ui="video-editor.timeline.toolbar.redo"]').click();
      await expect(strength('enter')).toHaveCount(0);
      await phase('enter').getByRole('switch').click();
      await expect.poll(async () => (await first()).motionBlur?.enter?.enabled).toBe(true);
      const unchanged = await read();
      await strength('enter').fill('73.1');
      await strength('enter').press('Enter');
      expect(await read()).toEqual(unchanged);
      await checkInspectorPaintedFont(page, strength('enter'), 'phase-enter');
      await strength('enter').scrollIntoViewIfNeeded();
      await page.screenshot({ path: info.outputPath('motion-phases.png'), fullPage: false });
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
        const position = await rail.boundingBox();
        await strength('exit').scrollIntoViewIfNeeded();
        expect((await rail.boundingBox())?.y).toBe(position?.y);
        expect(await inspector.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(
          true
        );
        await page.screenshot({
          path: info.outputPath(`motion-phases-${size}.png`),
          fullPage: false,
        });
      }
      await page.locator('[data-ui="video-editor.inspector.presentation-toggle"]').click();
      await strength('enter').scrollIntoViewIfNeeded();
      await page.screenshot({ path: info.outputPath('motion-phases-all.png'), fullPage: false });
      await page.locator('[data-ui="video-editor.inspector.presentation-toggle"]').click();
      await page
        .locator(
          '[data-ui="video-editor.timeline.framing-connection"][data-framing-destination="motion-second"]'
        )
        .click();
      await phase('link').getByRole('switch').click();
      await expect(strength('link')).toHaveCount(0);
      await phase('link').getByRole('switch').click();
      await expect(strength('link')).toHaveValue('45');
      await strength('link').fill('68.2');
      await strength('link').press('Enter');
      await expect.poll(async () => (await first()).motionBlur?.link?.strength).toBe(68.2 / 100);
      await checkInspectorPaintedFont(page, strength('link'), 'phase-link');
      await page.screenshot({ path: info.outputPath('motion-phases-link.png'), fullPage: false });
      const accepted = await read();
      expect(accepted.version).toBe(17);
      expect(accepted.clips).toEqual(before.clips);
      expect(accepted.assets).toEqual(before.assets);
      expect(accepted.motionRegions![1]).toEqual(before.motionRegions![1]);
      expect(accepted.transitions).toEqual(before.transitions);
      await page.reload();
      await expect(page.locator('[data-ui="video-editor.timeline.surface"]')).toBeVisible();
      await selectFirst();
      await expect(strength('enter')).toHaveValue('73.1');
      await expect(strength('exit')).toHaveValue('35.2');
      expect((await first()).motionBlur).toEqual(accepted.motionRegions![0]!.motionBlur);
      await strength('enter').scrollIntoViewIfNeeded();
      await page.screenshot({
        path: info.outputPath('motion-phases-reopened.png'),
        fullPage: false,
      });
      if (index === 0) {
        await page.setViewportSize({ width: 1200, height: 560 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true
        );
      }
      await writeFile(
        info.outputPath('motion-phases-proof.json'),
        JSON.stringify(
          { accepted, history: true, sourceOwner: true, otherRegionRetained: true },
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

for (const format of ['MP4', 'WEBM'] as const)
  test(`encoded ${format} exposes all three motion phases`, async ({ page }, info) => {
    test.setTimeout(180000);
    await page.setViewportSize({ width: 1280, height: 560 });
    const host = await startHostServer();
    try {
      await openFixture(page, host.origin, 'en', 'dark', true);
      await expect.poll(async () => (await readNativeVideoProject(page))?.version).toBe(17);
      const project = (await readNativeVideoProject(page))!;
      await page.goto(`${host.origin}${OFFSCREEN_HARNESS_PATH}`);
      await page.locator('[data-ui="offscreen.harness.root"][data-state="ready"]').waitFor();
      const jobId = `motion-phases-${format}`;
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
          fps: 40,
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
          { timeout: 120000 }
        )
        .toBe(true);
      const completion = (
        await getRuntimeMessagesByType(page, VideoMessageType.PROJECT_EXPORT_COMPLETED)
      ).find((message) => message.jobId === jobId)!;
      if (typeof completion.exportId !== 'string') throw new Error('Missing export identity');
      const proof = await page.evaluate(async (exportId) => {
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open('sniptale-db');
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        const entry: unknown = await new Promise((resolve, reject) => {
          const request = db
            .transaction('project_exports')
            .objectStore('project_exports')
            .get(exportId);
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
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
        const video = document.createElement('video'),
          url = URL.createObjectURL(file);
        video.muted = true;
        video.src = url;
        await new Promise<void>((resolve, reject) => {
          video.onloadeddata = () => resolve();
          video.onerror = () => reject(new Error('Decode failed'));
        });
        const canvas = document.createElement('canvas');
        canvas.width = 320;
        canvas.height = 180;
        const context = canvas.getContext('2d')!;
        const samples = [];
        try {
          for (const [time, x, phase] of [
            [0.1, 254, 'enter'],
            [0.6, 196, 'link'],
            [1.125, 132, 'exit'],
            [0.25, 310, 'hold'],
          ] as const) {
            await new Promise<void>((resolve) => {
              video.onseeked = () => resolve();
              video.currentTime = time;
            });
            context.drawImage(video, 0, 0);
            const pixel = Array.from(context.getImageData(x, 100, 1, 1).data),
              expected = [18, 52, 86].map((value, i) =>
                phase === 'hold' ? value : value + (0.61 / 3) * ([34, 211, 238][i]! - value)
              );
            samples.push({
              time,
              x,
              phase,
              pixel,
              expected,
              error: expected.reduce((sum, value, i) => sum + Math.abs(pixel[i]! - value), 0) / 3,
            });
          }
          return {
            width: video.videoWidth,
            height: video.videoHeight,
            duration: video.duration,
            size: file.size,
            samples,
          };
        } finally {
          video.removeAttribute('src');
          URL.revokeObjectURL(url);
        }
      }, completion.exportId);
      await writeFile(
        info.outputPath(`motion-phases-${format}.json`),
        JSON.stringify(proof, null, 2)
      );
      expect(proof.width).toBe(320);
      expect(proof.height).toBe(180);
      expect(proof.size).toBeGreaterThan(1000);
      expect(Math.abs(proof.duration - 1.2)).toBeLessThan(0.025001);
      for (const sample of proof.samples) {
        expect(sample.pixel[3]).toBe(255);
        expect(sample.error, JSON.stringify(sample)).toBeLessThan(sample.phase === 'hold' ? 4 : 14);
      }
    } finally {
      host.server.closeAllConnections();
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
