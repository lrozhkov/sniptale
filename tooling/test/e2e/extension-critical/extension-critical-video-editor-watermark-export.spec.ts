import { createHash } from 'node:crypto';
import {
  parseEffectV1Source,
  resolveEffectV1ControlDefault,
} from '@sniptale/runtime-contracts/effect-v1';
import { assertVideoProjectExportSettingsCompatibleWithProject } from '../../../../apps/extension/src/features/video/project/export/settings-validation';
import { assertExportReadyVideoProject } from '../../../../apps/extension/src/features/video/project/validation/root';
import { readFile, writeFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import {
  createVideoProjectFromRecording,
  createVideoProjectTrack,
} from '../../../../apps/extension/src/features/video/project/factories/creation';
import {
  createQuickEditWatermark,
  getVideoProjectWatermarkAsset,
} from '../../../../apps/extension/src/features/video/project/scene/watermark';
import { parseHydratableVideoProject } from '../../../../apps/extension/src/features/video/project/validation/root';
import type {
  VideoProject,
  VideoProjectExportSettings,
} from '../../../../apps/extension/src/features/video/project/types';
import { planMp4VideoRenderSpans } from '../../../../apps/extension/src/offscreen/project-export/render-mp4/hybrid/planner';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { seedReviewVideo } from '../support/quick-editor-media-fixture';
import { readNativeVideoProject } from '../support/native-video-project';
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

async function acquireLogo(page: Page, origin: string, identity: boolean, decoded: boolean) {
  const filename = identity
    ? 'review-avc-aac.mp4'
    : decoded
      ? 'review-vp9-opus.webm'
      : 'review-vp8-opus.webm';
  const bytes = await readFile(new URL(`../fixtures/${filename}`, import.meta.url));
  const project = createVideoProjectFromRecording({
    recordingId: 'beta-v1-recording',
    filename,
    width: 160,
    height: 90,
    duration: 12,
    mimeType: identity ? 'video/mp4' : 'video/webm',
    size: bytes.length,
    hasAudio: false,
  });
  project.version = 20;
  project.duration = 1.2;
  for (const clip of project.clips) {
    clip.duration = 1.2;
    clip.sourceDuration = 1.2;
    clip.windowCornerRadius = 0;
    clip.shadowIntensity = 0;
    clip.transform = { x: 0, y: 0, width: 160, height: 90, rotation: 0, opacity: 1 };
  }
  expect(parseHydratableVideoProject(project)).toEqual(project);
  await applyHarnessBootstrap(page, {
    preserveMediaLibrary: true,
    videoProjects: [project],
    storage: { 'sniptale-locale-preference': 'en', 'sniptale-theme-preference': 'dark' },
  });
  await page.goto(`${origin}${GALLERY_HARNESS_PATH}?theme=dark`);
  await page.locator('[data-ui="gallery.page.root"]').waitFor();
  await seedReviewVideo(page, filename, { width: 160, height: 90, duration: 12 });
  await page.goto(`${origin}${VIDEO_EDITOR_HARNESS_PATH}?project=${project.id}&theme=dark`);
  await expect(page.locator('[data-ui="video-editor.timeline.surface"]')).toBeVisible();
  const button = (key: Parameters<typeof translate>[0]) =>
    page.getByRole('button', { name: translate(key, 'en'), exact: true });
  await button('videoEditor.sidebar.sceneProperties').click();
  await button('gallery.videoReview.watermark').click();
  const owner = page.locator('[data-ui="video-editor.watermark.inspector"]');
  await owner
    .getByRole('button', {
      name: translate('gallery.videoReview.watermarkImage', 'en'),
      exact: true,
    })
    .click();
  await expect
    .poll(async () => (await readNativeVideoProject(page))?.watermark?.mode)
    .toBe('image');
  const baseline = (await readNativeVideoProject(page))!;
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 80;
    canvas.height = 40;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#2563eb';
    context.fillRect(0, 0, 80, 40);
    return canvas.toDataURL('image/png').split(',')[1]!;
  });
  await owner.locator('input[type="file"]').setInputFiles({
    name: 'encoded-logo.png',
    mimeType: 'image/png',
    buffer: Buffer.from(png, 'base64'),
  });
  await expect
    .poll(async () => (await readNativeVideoProject(page))?.watermark?.image?.width)
    .toBe(80);
  const authored = (await readNativeVideoProject(page))!;
  expect(authored.clips).toEqual(baseline.clips);
  expect(authored.assets).toHaveLength(project.assets.length + 1);
  await page.addInitScript(() => {
    const bootstrap: unknown = Reflect.get(window, '__sniptaleHarnessBootstrap');
    if (typeof bootstrap === 'object' && bootstrap !== null)
      Reflect.deleteProperty(bootstrap, 'videoProjects');
  });
  return authored;
}

async function composeFixture(project: VideoProject) {
  project.textDocuments = [
    {
      id: 'watermark-caption',
      binding: { kind: 'project' },
      captions: {
        enabled: true,
        style: { position: 'bottom', fontSize: 0.12, color: '#00ff00ff', background: '#00ff00ff' },
      },
      document: {
        version: 1,
        fragments: [
          {
            id: 'caption',
            text: 'MMMMMMMMMMMMMMMM',
            originalText: 'MMMMMMMMMMMMMMMM',
            start: 0,
            end: 1.2,
            timeDomain: 'result',
            alignment: 'manual',
            revision: 0,
            timingRevision: 0,
            showInVideo: true,
          },
        ],
      },
    },
  ];
  project.width = 640;
  project.height = 480;
  const video = project.clips.find((clip) => clip.type === 'VIDEO');
  if (!video || video.type !== 'VIDEO') throw new Error('Missing fixture video.');
  video.transform = { ...video.transform, x: 20, y: 10, width: 260, height: 150 };
  const upper = createVideoProjectTrack('Upper video', -1, 'PRIMARY');
  project.tracks.push(upper);
  const leading = {
    ...structuredClone(video),
    id: 'leading',
    trackId: upper.id,
    duration: 0.8,
    transform: { ...video.transform, x: 180, y: 40, width: 120, height: 80 },
  };
  const trailing = {
    ...structuredClone(leading),
    id: 'trailing',
    startTime: 0.4,
    sourceStart: 0.4,
    duration: 0.8,
  };
  project.clips.push(leading, trailing);
  project.transitions = [
    {
      id: 'watermark-crossfade',
      leadingClipId: leading.id,
      trailingClipId: trailing.id,
      kind: 'CROSSFADE',
      duration: 0.4,
      easing: 'LINEAR',
    },
  ];
  project.motionRegions = [
    {
      id: 'watermark-camera',
      startTime: 0,
      duration: 1.2,
      scale: 1.2,
      focusMode: 'MANUAL',
      focusPoint: { x: 320, y: 240 },
      targetAction: null,
      easing: 'LINEAR',
      zoomInDuration: 0,
      zoomOutDuration: 0,
      motionBlurAmount: 0,
      phaseTransitions: { enter: 'none', exit: 'none' },
      perspective: { enabled: true, rotateX: 0, rotateY: 20, rotateZ: 0, strength: 1 },
      depthOfField: {
        enabled: true,
        mode: 'area',
        x: 0.1,
        y: 0.1,
        width: 0.2,
        softness: 0.1,
        strength: 0.5,
      },
    },
  ];
  project.effectSnapshots = [];
  project.effectInstances = [];
  for (const effect of [
    { filename: 'sniptale-video-warm', kind: 'targetEffect' },
    { filename: 'sniptale-transition-dissolve', kind: 'transition' },
  ] as const) {
    const source = await readFile(
      new URL(
        `../../../../packages/runtime-contracts/src/effect-v1/fixtures/collection/${effect.filename}.sniptale-effect.json`,
        import.meta.url
      ),
      'utf8'
    );
    const document = parseEffectV1Source(source).document;
    if (!document) throw new Error('Invalid EffectV1 watermark fixture.');
    const sha256 = createHash('sha256').update(source).digest('hex');
    const snapshotId = `effect:${sha256}`;
    const duration = effect.kind === 'transition' ? 0.4 : 1.2;
    project.effectSnapshots.push({
      id: snapshotId,
      sha256,
      source,
      assets: [],
      retainedByteLength: Buffer.byteLength(source),
      schemaVersion: 'sniptale.effect.v1',
      documentId: document.id,
      kind: effect.kind,
    });
    project.effectInstances.push({
      id: effect.filename,
      kind: effect.kind,
      target:
        effect.kind === 'transition'
          ? { kind: 'transition', transitionId: 'watermark-crossfade' }
          : { kind: 'clip', clipId: video.id },
      snapshotId,
      controls: Object.fromEntries(
        document.controls.map((control) => [
          control.id,
          resolveEffectV1ControlDefault(control, 'en'),
        ])
      ),
      ...(effect.kind === 'transition' ? {} : { rangeMode: 'owner' as const }),
      enabled: true,
      startTime: effect.kind === 'transition' ? 0.4 : 0,
      duration,
      playbackRate: document.duration / duration,
    });
  }
  for (const clip of project.clips)
    clip.transform = {
      ...clip.transform,
      x: clip.transform.x * 2,
      y: clip.transform.y * 2,
      width: clip.transform.width * 2,
      height: clip.transform.height * 2,
    };
}

async function encode(
  page: Page,
  jobId: string,
  project: VideoProject,
  settings: VideoProjectExportSettings
) {
  const input = await page.evaluate(
    async ({ jobId, project }) => {
      if (!window.__sniptaleOffscreenHarness) throw new Error('Missing offscreen bridge.');
      return window.__sniptaleOffscreenHarness.stageProjectExportInput(jobId, project);
    },
    { jobId, project }
  );
  await emitTrustedOffscreenHarnessRuntimeMessage(page, {
    type: VideoMessageType.OFFSCREEN_START_PROJECT_EXPORT,
    input,
    jobId,
    settings,
  });
  await expect
    .poll(
      async () => {
        const failures = await getRuntimeMessagesByType(
          page,
          VideoMessageType.PROJECT_EXPORT_FAILED
        );
        if (failures.some((message) => message.jobId === jobId))
          throw new Error(JSON.stringify(failures));
        return (
          await getRuntimeMessagesByType(page, VideoMessageType.PROJECT_EXPORT_COMPLETED)
        ).some((message) => message.jobId === jobId);
      },
      { timeout: 60000 }
    )
    .toBe(true);
  const completed = (
    await getRuntimeMessagesByType(page, VideoMessageType.PROJECT_EXPORT_COMPLETED)
  ).find((message) => message.jobId === jobId)!;
  if (typeof completed.exportId !== 'string') throw new Error('Missing encoded export.');
  const proof = await page.evaluate(
    async ({ exportId, width, height }) => {
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
        throw new Error('Missing export asset.');
      const objects = await (
        await (await navigator.storage.getDirectory()).getDirectoryHandle('sniptale-assets')
      ).getDirectoryHandle('objects');
      const file = await (await objects.getFileHandle(entry.assetId)).getFile();
      const url = URL.createObjectURL(file),
        video = document.createElement('video');
      video.muted = true;
      try {
        await new Promise<void>((resolve, reject) => {
          video.onloadeddata = () => resolve();
          video.onerror = () => reject(new Error('Encoded video decode failed.'));
          video.src = url;
        });
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const context = canvas.getContext('2d')!;
        const margin = Math.min(width, height) * 0.02,
          logoWidth = width * 0.2,
          logoHeight = logoWidth / 2;
        const left = Math.ceil(width - margin - logoWidth),
          top = Math.ceil(height - margin - logoHeight);
        const frames = [];
        for (const time of [0.2, 0.6, 1.0]) {
          await new Promise<void>((resolve) => {
            video.onseeked = () => resolve();
            video.currentTime = time;
          });
          context.drawImage(video, 0, 0);
          let logoError = 0,
            samples = 0,
            redPixels = 0;
          for (let y = top + 4; y < height - margin - 4; y += 2)
            for (let x = left + 4; x < width - margin - 4; x += 2) {
              const pixel = context.getImageData(x, y, 1, 1).data;
              logoError +=
                Math.abs(pixel[0]! - 37) + Math.abs(pixel[1]! - 99) + Math.abs(pixel[2]! - 235);
              samples++;
            }
          const pixels = context.getImageData(
            Math.floor(width * 0.5),
            Math.floor(height * 0.6),
            Math.floor(width * 0.5),
            Math.floor(height * 0.4)
          ).data;
          for (let i = 0; i < pixels.length; i += 4)
            if (pixels[i]! > 170 && pixels[i + 1]! < 65 && pixels[i + 2]! < 65) redPixels++;
          const captionPixel = [
            ...context.getImageData(Math.round(width * 0.8), Math.round(height * 0.9), 1, 1).data,
          ].slice(0, 3);
          frames.push({
            time,
            captionPixel,
            logoError: logoError / (3 * samples),
            redPixels,
            png: canvas.toDataURL('image/png').split(',')[1]!,
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
        video.load();
        URL.revokeObjectURL(url);
      }
    },
    { exportId: completed.exportId, width: settings.width, height: settings.height }
  );
  const progress = (await getRuntimeMessagesByType(page, VideoMessageType.PROJECT_EXPORT_PROGRESS))
    .filter((message) => message.jobId === jobId)
    .flatMap((message) => {
      const status = message.status;
      return typeof status === 'object' &&
        status !== null &&
        'message' in status &&
        typeof status.message === 'string'
        ? [status.message]
        : [];
    });
  return { ...proof, progress, exportId: completed.exportId };
}

for (const scenario of [
  { name: 'WebM final canvas', format: 'WEBM', identity: false },
  { name: 'MP4 decoded composition', format: 'MP4', identity: false },
  { name: 'MP4 identity source', format: 'MP4', identity: true },
] as const) {
  test(`encoded watermark preserves ${scenario.name}`, async ({ page }, info) => {
    test.setTimeout(240000);
    await page.setViewportSize({ width: 1280, height: 560 });
    const host = await startHostServer();
    try {
      const authored = await acquireLogo(
        page,
        host.origin,
        scenario.identity,
        scenario.format === 'MP4'
      );
      const project = structuredClone(authored);
      if (!scenario.identity) await composeFixture(project);
      const image = project.watermark!.image!;
      project.watermark = {
        ...createQuickEditWatermark('WM'),
        mode: 'none',
        image: { ...image, size: 0.2, opacity: 1 },
      };
      project.watermark.text = {
        ...project.watermark.text,
        size: 0.2,
        color: '#ff0000ff',
        shadow: false,
      };
      const settings: VideoProjectExportSettings = {
        format: scenario.format,
        fps: 5,
        width: scenario.identity ? 160 : 480,
        height: scenario.identity ? 90 : 360,
        quality: 'MEDIUM',
        resolution: scenario.identity ? 'SOURCE' : '360P',
        scope: 'project',
        burnInSubtitles: false,
        subtitleSidecarFormats: [],
        downloadAfterExport: false,
        ...(scenario.format === 'MP4' ? { mp4VideoCodec: 'VP9' } : { webmVideoCodec: 'VP9' }),
      };
      await page.goto(`${host.origin}${OFFSCREEN_HARNESS_PATH}`);
      await page.locator('[data-ui="offscreen.harness.root"][data-state="ready"]').waitFor();
      expect(await readNativeVideoProject(page)).toEqual(authored);
      const results = [];
      for (const mode of ['none', 'image', 'text'] as const) {
        project.watermark.mode = mode;
        const before = structuredClone(project);
        expect(parseHydratableVideoProject(project)).toEqual(project);
        assertExportReadyVideoProject(project);
        assertVideoProjectExportSettingsCompatibleWithProject(project, settings);
        const spans = planMp4VideoRenderSpans(project, settings);
        if (scenario.identity)
          expect(
            spans.every(
              (span) => span.kind === (mode === 'none' ? 'clean-source' : 'accelerated-composite')
            )
          ).toBe(true);
        else
          expect(
            spans.every(
              (span) =>
                span.kind === (scenario.format === 'WEBM' ? 'composite' : 'accelerated-composite')
            )
          ).toBe(true);
        const proof = await encode(
          page,
          `${scenario.format}-${scenario.identity}-${mode}`,
          project,
          settings
        );
        if (scenario.format === 'MP4' && !scenario.identity) {
          expect(proof.progress).toContain(
            translate('offscreenExport.hybridAcceleratedCompositeRender', 'en')
          );
          expect(proof.progress).not.toContain(
            translate('offscreenExport.hybridAcceleratedCompositeFallback', 'en')
          );
        }
        expect(project).toEqual(before);
        expect(await readNativeVideoProject(page)).toEqual(authored);
        expect(proof.width).toBe(settings.width);
        expect(proof.height).toBe(settings.height);
        expect(proof.size).toBeGreaterThan(100);
        for (const frame of proof.frames) {
          await writeFile(
            info.outputPath(`${mode}-${frame.time}.png`),
            Buffer.from(frame.png, 'base64')
          );
          if (mode === 'none' && !scenario.identity)
            expect(
              (Math.abs(frame.captionPixel[0]! - 0) +
                Math.abs(frame.captionPixel[1]! - 255) +
                Math.abs(frame.captionPixel[2]! - 0)) /
                3
            ).toBeLessThanOrEqual(14);
          if (mode === 'image') expect(frame.logoError).toBeLessThanOrEqual(14);
          if (mode === 'text') {
            const baseline = results[0]!.frames.find((candidate) => candidate.time === frame.time)!;
            expect(frame.redPixels - baseline.redPixels).toBeGreaterThan(5);
          }
        }
        results.push({
          mode,
          spans: spans.map((span) => span.kind),
          ...proof,
          frames: proof.frames.map(({ png: _png, ...frame }) => frame),
        });
      }
      await writeFile(info.outputPath('encoded-proof.json'), JSON.stringify(results, null, 2));
    } finally {
      host.server.closeAllConnections();
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}

test('failed logo export preserves authored data and completed output before a fresh retry', async ({
  page,
}, info) => {
  test.setTimeout(180000);
  await page.setViewportSize({ width: 1280, height: 560 });
  const host = await startHostServer();
  try {
    const authored = await acquireLogo(page, host.origin, false, false);
    const logo = getVideoProjectWatermarkAsset(authored);
    if (logo?.source.kind !== 'project-asset') throw new Error('Missing private logo fixture.');
    const privateId = logo.source.projectAssetId;
    await page.goto(`${host.origin}${OFFSCREEN_HARNESS_PATH}`);
    await page.locator('[data-ui="offscreen.harness.root"][data-state="ready"]').waitFor();
    expect(await readNativeVideoProject(page)).toEqual(authored);
    const fingerprint = (store: 'project_assets' | 'project_exports', id: string) =>
      page.evaluate(
        async ({ store, id }) => {
          const db = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open('sniptale-db');
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);
          });
          const entry: unknown = await new Promise((resolve, reject) => {
            const request = db.transaction(store).objectStore(store).get(id);
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
            throw new Error('Missing retained resource.');
          const objects = await (
            await (await navigator.storage.getDirectory()).getDirectoryHandle('sniptale-assets')
          ).getDirectoryHandle('objects');
          const file = await (await objects.getFileHandle(entry.assetId)).getFile();
          const digest = new Uint8Array(
            await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
          );
          return {
            size: file.size,
            sha256: [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join(''),
          };
        },
        { store, id }
      );
    const settings: VideoProjectExportSettings = {
      format: 'WEBM',
      fps: 5,
      width: 160,
      height: 90,
      quality: 'MEDIUM',
      resolution: 'SOURCE',
      scope: 'project',
      burnInSubtitles: false,
      subtitleSidecarFormats: [],
      downloadAfterExport: false,
      webmVideoCodec: 'VP9',
    };
    const baseline = structuredClone(authored);
    baseline.watermark!.mode = 'none';
    const accepted = await encode(page, 'watermark-retained-output', baseline, settings);
    const acceptedFingerprint = await fingerprint('project_exports', accepted.exportId);
    const privateFingerprint = await fingerprint('project_assets', privateId);
    const failed = structuredClone(authored);
    const failedLogo = getVideoProjectWatermarkAsset(failed)!;
    failedLogo.source = {
      kind: 'project-asset',
      projectAssetId: 'missing-private-watermark-source',
    };
    assertExportReadyVideoProject(failed);
    assertVideoProjectExportSettingsCompatibleWithProject(failed, settings);
    const jobId = 'watermark-missing-source';
    const input = await page.evaluate(
      async ({ jobId, project }) => {
        if (!window.__sniptaleOffscreenHarness) throw new Error('Missing offscreen bridge.');
        return window.__sniptaleOffscreenHarness.stageProjectExportInput(jobId, project);
      },
      { jobId, project: failed }
    );
    await emitTrustedOffscreenHarnessRuntimeMessage(page, {
      type: VideoMessageType.OFFSCREEN_START_PROJECT_EXPORT,
      input,
      jobId,
      settings,
    });
    await expect
      .poll(
        async () =>
          (await getRuntimeMessagesByType(page, VideoMessageType.PROJECT_EXPORT_FAILED)).some(
            (message) => message.jobId === jobId
          ),
        { timeout: 60000 }
      )
      .toBe(true);
    expect(
      (await getRuntimeMessagesByType(page, VideoMessageType.PROJECT_EXPORT_COMPLETED)).some(
        (message) => message.jobId === jobId
      )
    ).toBe(false);
    expect(await fingerprint('project_exports', accepted.exportId)).toEqual(acceptedFingerprint);
    expect(await fingerprint('project_assets', privateId)).toEqual(privateFingerprint);
    expect(await readNativeVideoProject(page)).toEqual(authored);
    const retryProject = structuredClone(authored);
    retryProject.watermark!.image!.size = 0.2;
    retryProject.watermark!.image!.opacity = 1;
    const retry = await encode(page, 'watermark-valid-source-retry', retryProject, settings);
    for (const frame of retry.frames) {
      expect(frame.logoError).toBeLessThanOrEqual(14);
      await writeFile(info.outputPath(`retry-${frame.time}.png`), Buffer.from(frame.png, 'base64'));
    }
    expect(await fingerprint('project_exports', accepted.exportId)).toEqual(acceptedFingerprint);
    expect(await fingerprint('project_assets', privateId)).toEqual(privateFingerprint);
    expect(await readNativeVideoProject(page)).toEqual(authored);
    await writeFile(
      info.outputPath('retry-proof.json'),
      JSON.stringify(
        {
          failedJobId: jobId,
          privateFingerprint,
          acceptedFingerprint,
          retryExportId: retry.exportId,
          frames: retry.frames.map(({ png: _png, ...frame }) => frame),
        },
        null,
        2
      )
    );
  } finally {
    host.server.closeAllConnections();
    await new Promise<void>((resolve) => host.server.close(() => resolve()));
  }
});
