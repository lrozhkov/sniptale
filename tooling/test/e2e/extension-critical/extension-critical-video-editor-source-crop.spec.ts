import { createVideoProjectMotionRegion } from '../../../../apps/extension/src/features/video/project/motion';
import { normalizeVideoProjectCursorSkin } from '../../../../apps/extension/src/features/video/project/cursor';
import { createHash } from 'node:crypto';
import {
  DEFAULT_WINDOW_HEADER,
  windowHeaderGeometry,
} from '../../../../packages/runtime-contracts/src/window-header';
import { parseEffectV1Source } from '../../../../packages/runtime-contracts/src/effect-v1/validation/index';
import { isValidVideoProject } from '../../../../apps/extension/src/features/video/project/validation/root';
import { readFile, writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { hydrateVideoProject } from '../../../../apps/extension/src/features/video/project/hydration';
import { createVideoProjectFromMultiSourceRecording } from '../../../../apps/extension/src/features/video/project/factories/multi-source-recording';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { seedReviewWebcamBundle } from '../support/quick-editor-media-fixture';
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

for (const [index, viewport] of PRIMARY_BROWSER_VIEWPORTS.entries()) {
  const locale = index === 0 ? 'en' : 'ru';
  const theme = index === 0 ? 'dark' : 'light';
  test(`source crop preserves montage ${viewport.size.width} ${locale}`, async ({ page }, info) => {
    test.setTimeout(180000);
    await page.setViewportSize({ ...viewport.size });
    await page.emulateMedia({ colorScheme: theme });
    const host = await startHostServer();
    const label = (key: Parameters<typeof translate>[0]) => translate(key, locale);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    try {
      const bytes = await readFile(new URL('../fixtures/review-vp8-opus.webm', import.meta.url));
      const project = createVideoProjectFromMultiSourceRecording({
        name: 'Source crop',
        videos: [
          {
            recordingId: 'beta-v1-recording',
            filename: 'beta-v1.webm',
            width: 160,
            height: 90,
            duration: 12,
            mimeType: 'video/webm',
            size: bytes.length,
          },
        ],
        webcamVideo: {
          recordingId: 'webcam-clock',
          filename: 'camera-clock.webm',
          width: 160,
          height: 90,
          duration: 12,
          mimeType: 'video/webm',
          size: bytes.length,
        },
      });
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
      const clip = project.clips.find(
        (clip) =>
          clip.type === 'VIDEO' &&
          project.tracks.some((track) => track.id === clip.trackId && track.role !== 'CAMERA')
      )!;
      if (clip.type !== 'VIDEO') throw new Error('Missing main video');
      await applyHarnessBootstrap(page, {
        preserveMediaLibrary: true,
        videoProjects: [project],
        storage: { 'sniptale-locale-preference': locale, 'sniptale-theme-preference': theme },
      });
      await page.addInitScript((language) => {
        localStorage.setItem('sniptale-locale-preference', language);
        if (sessionStorage.getItem('source-crop-seeded')) {
          const bootstrap: unknown = Reflect.get(window, '__sniptaleHarnessBootstrap');
          if (typeof bootstrap === 'object' && bootstrap !== null)
            Reflect.deleteProperty(bootstrap, 'videoProjects');
        }
      }, locale);
      await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}?theme=${theme}`);
      await page.locator('[data-ui="gallery.page.root"]').waitFor();
      await seedReviewWebcamBundle(page, 'review-vp8-opus.webm');
      await page.evaluate(() => sessionStorage.setItem('source-crop-seeded', 'true'));
      await page.goto(
        `${host.origin}${VIDEO_EDITOR_HARNESS_PATH}?project=${project.id}&theme=${theme}`
      );
      await expect(page.locator('[data-ui="video-editor.timeline.surface"]')).toBeVisible();
      const select = async () => {
        await page
          .getByRole('button', { name: label('videoEditor.sidebar.sceneProperties'), exact: true })
          .click();
        await page
          .locator(`[data-project-timeline-clip="${clip.id}"]`)
          .click({ modifiers: ['Control'] });
        const framing = page.getByRole('button', {
          name: label('videoEditor.sidebar.inspectorGroupFraming'),
          exact: true,
        });
        if (await framing.isVisible()) await framing.click();
      };
      await select();
      const summary = page
        .locator('summary')
        .filter({ hasText: label('videoEditor.sidebar.mediaCrop') });
      if ((await summary.locator('..').getAttribute('open')) === null) await summary.click();
      const owner = page.locator('[data-ui="video-editor.media-crop"]');
      const field = (key: Parameters<typeof translate>[0]) =>
        owner.getByRole('textbox', { name: label(key), exact: true });
      const width = field('videoEditor.sidebar.mediaCropWidth');
      const readClip = async () =>
        (await readNativeVideoProject(page))?.clips.find((item) => item.id === clip.id);
      const readCrop = async () => {
        const value = await readClip();
        return value && 'sourceCrop' in value ? value.sourceCrop : undefined;
      };
      const preview = owner.locator('video');
      await expect(
        owner.getByRole('button', { name: label('videoEditor.sidebar.mediaCropPreview') })
      ).toBeEnabled();
      await preview.evaluate((node: HTMLVideoElement) => {
        node.dataset['nativeLoadCount'] = '0';
        node.addEventListener('loadstart', () => {
          node.dataset['nativeLoadCount'] = String(Number(node.dataset['nativeLoadCount']) + 1);
        });
      });
      await width.scrollIntoViewIfNeeded();
      await width.fill('50');
      await width.press('Enter');
      await expect.poll(readCrop).toEqual({ x: 0, y: 0, width: 0.5, height: 1 });
      const left = field('videoEditor.sidebar.mediaCropLeft');
      await left.fill('25');
      await left.press('Enter');
      await expect.poll(readCrop).toEqual({ x: 0.25, y: 0, width: 0.5, height: 1 });
      const accepted = await readClip();
      expect(accepted).toEqual({ ...clip, sourceCrop: { x: 0.25, y: 0, width: 0.5, height: 1 } });
      expect((await readNativeVideoProject(page))?.assets).toEqual(project.assets);
      await owner
        .getByRole('button', { name: label('videoEditor.sidebar.mediaCropPreview') })
        .press('ArrowRight');
      await expect.poll(readCrop).toEqual({ x: 0.26, y: 0, width: 0.5, height: 1 });
      await page.locator('[data-ui="video-editor.timeline.toolbar.undo"]').click();
      await expect.poll(readCrop).toEqual({ x: 0.25, y: 0, width: 0.5, height: 1 });
      await page.locator('[data-ui="video-editor.timeline.toolbar.redo"]').click();
      await expect.poll(readCrop).toEqual({ x: 0.26, y: 0, width: 0.5, height: 1 });
      const reset = owner.getByRole('button', {
        name: label('gallery.videoReview.sourceCropReset'),
        exact: true,
      });
      await reset.scrollIntoViewIfNeeded();
      await reset.click();
      await expect.poll(readCrop).toBeUndefined();
      await page.locator('[data-ui="video-editor.timeline.toolbar.undo"]').click();
      await expect.poll(readCrop).toEqual({ x: 0.26, y: 0, width: 0.5, height: 1 });
      expect(await preview.getAttribute('data-native-load-count')).toBe('0');
      const pixelProof = await page.locator('[data-preview-stage-canvas]').evaluate(
        (node: HTMLCanvasElement, input) => {
          const preview = document.querySelector(
            '[data-ui="video-editor.media-crop-preview"] video'
          );
          if (!(preview instanceof HTMLVideoElement)) throw new Error('Missing source decoder');
          const expected = document.createElement('canvas');
          expected.width = node.width;
          expected.height = node.height;
          const context = expected.getContext('2d')!,
            actual = node.getContext('2d')!;
          const sx = node.width / input.width,
            sy = node.height / input.height;
          const frame = {
            x: input.clip.transform.x * sx,
            y: input.clip.transform.y * sy,
            width: input.clip.transform.width * sx,
            height: input.clip.transform.height * sy,
          };
          const crop = { x: 0.26, y: 0, width: 0.5, height: 1 };
          const sourceWidth = preview.videoWidth * crop.width,
            sourceHeight = preview.videoHeight * crop.height;
          const fit = input.clip.fitMode;
          const scale =
            fit === 'CONTAIN'
              ? Math.min(frame.width / sourceWidth, frame.height / sourceHeight)
              : fit === 'COVER'
                ? Math.max(frame.width / sourceWidth, frame.height / sourceHeight)
                : null;
          const drawWidth = scale === null ? frame.width : sourceWidth * scale,
            drawHeight = scale === null ? frame.height : sourceHeight * scale;
          const x = frame.x + (frame.width - drawWidth) / 2,
            y = frame.y + (frame.height - drawHeight) / 2;
          context.drawImage(
            preview,
            preview.videoWidth * crop.x,
            0,
            sourceWidth,
            sourceHeight,
            x,
            y,
            drawWidth,
            drawHeight
          );
          let error = 0,
            count = 0;
          for (let row = 1; row < 8; row++)
            for (let column = 1; column < 8; column++) {
              const px = Math.round(x + (drawWidth * column) / 8),
                py = Math.round(y + (drawHeight * row) / 8);
              if (
                px < frame.x + 2 ||
                px > frame.x + frame.width - 3 ||
                py < frame.y + 2 ||
                py > frame.y + frame.height - 3
              )
                continue;
              if (
                input.camera &&
                px >= input.camera.x * sx - 3 &&
                px <= (input.camera.x + input.camera.width) * sx + 3 &&
                py >= input.camera.y * sy - 3 &&
                py <= (input.camera.y + input.camera.height) * sy + 3
              )
                continue;
              const a = actual.getImageData(px, py, 1, 1).data,
                b = context.getImageData(px, py, 1, 1).data;
              for (let channel = 0; channel < 3; channel++)
                error += Math.abs(a[channel]! - b[channel]!);
              count++;
            }
          return {
            samples: count,
            meanError: error / (count * 3),
            sourceTime: preview.currentTime,
          };
        },
        {
          width: project.width,
          height: project.height,
          clip,
          camera: project.clips.find((item) =>
            project.tracks.some((track) => item.trackId === track.id && track.role === 'CAMERA')
          )?.transform,
        }
      );
      expect(pixelProof.samples).toBeGreaterThan(20);
      expect(pixelProof.meanError).toBeLessThan(2);
      await checkInspectorPaintedFont(page, width, 'media-crop');
      await expect(reset.locator('svg')).toBeVisible();
      await owner.locator('[data-ui="video-editor.media-crop-preview"]').scrollIntoViewIfNeeded();
      await page.screenshot({ path: info.outputPath('source-crop.png'), fullPage: false });
      const close = page.locator('[data-ui="video-editor.materials.close"]');
      if (await close.isVisible()) await close.click();
      const inspector = page.locator('[data-ui="video-editor.floating.context-inspector"]');
      const handle = page.locator('[data-ui="video-editor.floating.context-inspector.resize"]');
      const rail = inspector.locator('[data-ui="video-editor.inspector.categories"] > nav');
      for (const size of [359, 360, 361]) {
        const current = (await inspector.boundingBox())!.width;
        const box = (await handle.boundingBox())!;
        await page.mouse.move(box.x + box.width / 2, box.y + 12);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width / 2 + current - size, box.y + 12);
        await page.mouse.up();
        await expect
          .poll(async () => Math.round((await inspector.boundingBox())!.width))
          .toBe(size);
        const before = await rail.boundingBox();
        await reset.scrollIntoViewIfNeeded();
        expect(
          await owner.evaluate((node) => {
            const body = node.closest('[data-ui="video-editor.inspector.categories"] > div');
            if (!(body instanceof HTMLElement)) throw new Error('Missing scroll owner');
            return body.scrollWidth <= body.clientWidth + 1;
          })
        ).toBe(true);
        expect((await rail.boundingBox())?.y).toBe(before?.y);
        await page.screenshot({
          path: info.outputPath(`source-crop-${size}.png`),
          fullPage: false,
        });
      }
      await page.locator('[data-ui="video-editor.inspector.presentation-toggle"]').click();
      await width.scrollIntoViewIfNeeded();
      await page.screenshot({ path: info.outputPath('source-crop-all.png'), fullPage: false });
      await page.reload();
      await expect(page.locator('[data-ui="video-editor.timeline.surface"]')).toBeVisible();
      await expect.poll(readCrop).toEqual({ x: 0.26, y: 0, width: 0.5, height: 1 });
      await select();
      if ((await summary.locator('..').getAttribute('open')) === null) await summary.click();
      await width.scrollIntoViewIfNeeded();
      await expect(width).toHaveValue('50');
      await page.screenshot({ path: info.outputPath('source-crop-reopened.png'), fullPage: false });
      if (index === 0) {
        await page.setViewportSize({ width: 1200, height: 560 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true
        );
      }
      await writeFile(
        info.outputPath('source-crop-proof.json'),
        JSON.stringify(
          { crop: await readCrop(), assetDataRetained: true, decoderReloads: 0, pixelProof },
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
  test(`encoded ${format} source crop composes with headers, camera, transitions and EffectV1`, async ({
    page,
  }, info) => {
    test.setTimeout(180000);
    await page.setViewportSize({ width: 1280, height: 560 });
    const host = await startHostServer();
    try {
      const bytes = await readFile(new URL('../fixtures/review-vp8-opus.webm', import.meta.url));
      const source = await readFile(
        new URL('../fixtures/effect-v1/demo-target-overlay.sniptale-effect.json', import.meta.url),
        'utf8'
      );
      const parsed = parseEffectV1Source(source);
      if (!parsed.ok || !parsed.document) throw new Error('Invalid effect fixture');
      const document = parsed.document,
        sha256 = createHash('sha256').update(source).digest('hex');
      const project = createVideoProjectFromMultiSourceRecording({
        name: 'Encoded crop matrix',
        videos: [
          {
            recordingId: 'beta-v1-recording',
            filename: 'beta-v1.webm',
            width: 160,
            height: 90,
            duration: 12,
            mimeType: 'video/webm',
            size: bytes.length,
          },
        ],
        webcamVideo: {
          recordingId: 'webcam-clock',
          filename: 'camera-clock.webm',
          width: 160,
          height: 90,
          duration: 12,
          mimeType: 'video/webm',
          size: bytes.length,
        },
      });
      const main = project.clips.find(
        (clip) =>
          clip.type === 'VIDEO' &&
          project.tracks.some((track) => track.id === clip.trackId && track.role !== 'CAMERA')
      );
      const camera = project.clips.find(
        (clip) =>
          clip.type === 'VIDEO' &&
          project.tracks.some((track) => track.id === clip.trackId && track.role === 'CAMERA')
      );
      if (main?.type !== 'VIDEO' || camera?.type !== 'VIDEO') throw new Error('Missing media');
      project.width = 320;
      project.height = 180;
      project.version = 13;
      project.duration = 1.4;
      const first = {
        ...main,
        duration: 0.8,
        sourceStart: 0,
        sourceDuration: 1.6,
        playbackRate: 2,
        fitMode: 'STRETCH' as const,
        sourceCrop: { x: 0.5, y: 0, width: 0.5, height: 1 },
        windowHeader: { ...DEFAULT_WINDOW_HEADER, title: 'Crop' },
        transform: { x: 0, y: 0, width: 320, height: 180, rotation: 0, opacity: 1 },
      };
      const second = {
        ...first,
        id: 'crop-second',
        sourceInstanceId: 'crop-second-instance',
        startTime: 0.6,
        duration: 0.8,
        sourceStart: 3,
        windowHeader: undefined,
        sourceCrop: { x: 0.1, y: 0, width: 0.5, height: 1 },
      };
      const { windowHeader: _header, ...secondClip } = second;
      project.clips = [
        first,
        secondClip,
        {
          ...camera,
          duration: 1.4,
          sourceDuration: 1.4,
          cameraMirrored: true,
          cameraAppearance: { shape: 'circle', roundness: 50, zoom: 1.3, panX: 0.1, panY: 0 },
          transform: { ...camera.transform, x: 250, y: 130, width: 60, height: 40 },
        },
      ];
      project.transitions = [
        {
          id: 'crop-crossfade',
          leadingClipId: first.id,
          trailingClipId: secondClip.id,
          duration: 0.2,
          kind: 'CROSSFADE',
          easing: 'LINEAR',
        },
      ];
      const snapshotId = `effect:${sha256}`;
      project.effectSnapshots = [
        {
          assets: [],
          documentId: document.id,
          id: snapshotId,
          kind: document.kind,
          retainedByteLength: new TextEncoder().encode(source).byteLength,
          schemaVersion: 'sniptale.effect.v1',
          sha256,
          source,
        },
      ];
      const controls = Object.fromEntries(
        document.controls.map(({ defaultValue, id }) => [id, defaultValue])
      );
      project.effectInstances = [
        {
          id: 'crop-clip-fx',
          controls,
          duration: 0.8,
          enabled: true,
          kind: document.kind,
          playbackRate: document.duration / 0.8,
          snapshotId,
          startTime: 0,
          target: { kind: 'clip', clipId: first.id },
        },
        {
          id: 'crop-track-fx',
          controls,
          duration: 0.6,
          enabled: true,
          kind: document.kind,
          playbackRate: document.duration / 0.6,
          snapshotId,
          startTime: 0.8,
          target: { kind: 'track', trackId: main.trackId },
        },
      ];
      const cameraClip = project.clips.find((clip) => clip.id === camera.id);
      if (cameraClip?.type !== 'VIDEO') throw new Error('Missing export camera');
      cameraClip.cameraPositions = [
        {
          id: 'export-move',
          sourceTime: 0.45,
          transform: { ...cameraClip.transform, x: 245 },
          fitMode: cameraClip.fitMode,
          transition: { kind: 'smooth', duration: 0.1 },
        },
      ];
      project.cursorTrack = {
        captureMode: 'separate',
        skin: normalizeVideoProjectCursorSkin(undefined),
        samples: [0, 1.4].map((time) => ({
          id: `camera-cursor-${time}`,
          time,
          x: 160,
          y: 90,
          visible: true,
          recordingPoint: { x: 0.5, y: 0.5 },
          captureSegment: 0,
          sourceAnchor: {
            kind: 'recording-source',
            recordingId: 'webcam-clock',
            sourceClipId: cameraClip.id,
            sourceTime: time,
          },
        })),
      };
      project.motionRegions = [
        {
          ...createVideoProjectMotionRegion(project, 0.4),
          duration: 0.2,
          focusMode: 'CURSOR',
          scale: 2,
          zoomInDuration: 0,
          zoomOutDuration: 0,
        },
      ];
      expect(isValidVideoProject(project)).toBe(true);
      const before = structuredClone(project);
      await applyHarnessBootstrap(page, { preserveMediaLibrary: true });
      await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}`);
      await page.locator('[data-ui="gallery.page.root"]').waitFor();
      await seedReviewWebcamBundle(page, 'review-vp8-opus.webm');
      await page.goto(`${host.origin}${OFFSCREEN_HARNESS_PATH}`);
      await page.locator('[data-ui="offscreen.harness.root"][data-state="ready"]').waitFor();
      const jobId = `source-crop-${format}`;
      const input = await page.evaluate(
        async ({ jobId, project }) => {
          if (!window.__sniptaleOffscreenHarness) throw new Error('Missing offscreen bridge');
          return window.__sniptaleOffscreenHarness.stageProjectExportInput(jobId, project);
        },
        { jobId, project }
      );
      const settings = {
        burnInSubtitles: false,
        downloadAfterExport: false,
        format,
        fps: 5,
        width: 320,
        height: 180,
        quality: 'MEDIUM' as const,
        resolution: 'SOURCE' as const,
        scope: 'project' as const,
        subtitleSidecarFormats: [],
        ...(format === 'MP4'
          ? { mp4VideoCodec: 'VP9' as const }
          : { webmVideoCodec: 'VP9' as const }),
      };
      await emitTrustedOffscreenHarnessRuntimeMessage(page, {
        input,
        jobId,
        settings,
        type: VideoMessageType.OFFSCREEN_START_PROJECT_EXPORT,
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
      const join = Math.round(
        (180 * windowHeaderGeometry(first.windowHeader, { width: 80, height: 90 }).height) /
          (90 + windowHeaderGeometry(first.windowHeader, { width: 80, height: 90 }).height)
      );
      const proof = await page.evaluate(
        async ({ exportId, join }) => {
          const entry = await new Promise<unknown>((resolve, reject) => {
            const request = indexedDB.open('sniptale-db');
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
              const db = request.result;
              const read = db
                .transaction('project_exports')
                .objectStore('project_exports')
                .get(exportId);
              read.onerror = () => {
                db.close();
                reject(read.error);
              };
              read.onsuccess = () => {
                db.close();
                resolve(read.result);
              };
            };
          });
          if (
            typeof entry !== 'object' ||
            entry === null ||
            !('assetId' in entry) ||
            typeof entry.assetId !== 'string'
          )
            throw new Error('Missing exported asset');
          const objects = await (
            await (await navigator.storage.getDirectory()).getDirectoryHandle('sniptale-assets')
          ).getDirectoryHandle('objects');
          const exportedFile = await (await objects.getFileHandle(entry.assetId)).getFile();
          const originalFile = await (
            await objects.getFileHandle('beta-v1-recording-asset')
          ).getFile();
          const open = async (file: File) => {
            const url = URL.createObjectURL(file),
              video = document.createElement('video');
            video.muted = true;
            video.preload = 'auto';
            video.src = url;
            await new Promise<void>((resolve, reject) => {
              video.onloadeddata = () => resolve();
              video.onerror = () => reject(new Error('Decode failed'));
            });
            return { video, url };
          };
          const encoded = await open(exportedFile),
            original = await open(originalFile);
          const seek = async (video: HTMLVideoElement, time: number) => {
            await new Promise<void>((resolve) => {
              video.onseeked = () => resolve();
              video.currentTime = time;
            });
          };
          const canvas = document.createElement('canvas');
          canvas.width = 320;
          canvas.height = 180;
          const context = canvas.getContext('2d')!;
          const reference = document.createElement('canvas');
          reference.width = 320;
          reference.height = 180;
          const expected = reference.getContext('2d')!;
          const results = [];
          try {
            for (const frame of [
              { time: 0.2, sourceTime: 0.4, x: 0.5, join },
              { time: 1, sourceTime: 3.8, x: 0.1, join: 0 },
            ]) {
              await seek(encoded.video, frame.time);
              await seek(original.video, frame.sourceTime);
              context.drawImage(encoded.video, 0, 0, 320, 180);
              expected.clearRect(0, 0, 320, 180);
              expected.drawImage(
                original.video,
                original.video.videoWidth * frame.x,
                0,
                original.video.videoWidth * 0.5,
                original.video.videoHeight,
                0,
                frame.join,
                320,
                180 - frame.join
              );
              let error = 0,
                count = 0;
              for (const u of [0.15, 0.3, 0.45, 0.6])
                for (const v of [0.75, 0.85, 0.95]) {
                  const x = Math.round(u * 320),
                    y = Math.round(frame.join + v * (180 - frame.join));
                  const a = context.getImageData(x, y, 1, 1).data,
                    b = expected.getImageData(x, y, 1, 1).data;
                  for (let channel = 0; channel < 3; channel++)
                    error += Math.abs(a[channel]! - b[channel]!);
                  count++;
                }
              results.push({ time: frame.time, meanError: error / (count * 3), samples: count });
            }
            return {
              size: exportedFile.size,
              width: encoded.video.videoWidth,
              height: encoded.video.videoHeight,
              duration: encoded.video.duration,
              frames: results,
            };
          } finally {
            encoded.video.removeAttribute('src');
            original.video.removeAttribute('src');
            URL.revokeObjectURL(encoded.url);
            URL.revokeObjectURL(original.url);
          }
        },
        { exportId: completion.exportId, join }
      );
      expect(proof.width).toBe(320);
      expect(proof.height).toBe(180);
      expect(proof.size).toBeGreaterThan(1000);
      expect(Math.abs(proof.duration - 1.4)).toBeLessThan(0.03);
      for (const frame of proof.frames) expect(frame.meanError).toBeLessThan(14);
      expect(project).toEqual(before);
      await writeFile(
        info.outputPath(`source-crop-${format}.json`),
        JSON.stringify(proof, null, 2)
      );
    } finally {
      host.server.closeAllConnections();
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}
