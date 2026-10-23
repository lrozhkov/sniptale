import { encodedNativeVideoSamples } from '../support/native-video-export-proof';
import { normalizeVideoProjectCursorSkin } from '../../../../apps/extension/src/features/video/project/cursor';
import { resolveProjectCursorCameraPlan } from '../../../../apps/extension/src/features/video/composition/motion/project-follow';
import { resolveVideoCompositionCamera } from '../../../../apps/extension/src/features/video/composition/motion';
import { createHash } from 'node:crypto';
import {
  parseEffectV1Source,
  resolveEffectV1ControlDefault,
} from '@sniptale/runtime-contracts/effect-v1';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import {
  chooseInspectorValue,
  checkInspectorPaintedFont,
  checkInspectorParameterRows,
} from '../support/inspector-utilities';
import { isHydratableVideoProject } from '../../../../apps/extension/src/features/video/project/validation/root';
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
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
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

const svg =
  '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="#22d3ee"/></svg>';

async function openFixture(
  page: Page,
  origin: string,
  locale: 'en' | 'ru' = 'en',
  theme = 'dark',
  options: {
    overlays?: boolean;
    effectRegion?: boolean;
    cursorFollow?: boolean;
    sourceActionFocus?: boolean;
    sourceWindowFollow?: boolean;
    sourceWindowFollowTransition?: boolean;
    sourceWindowArea?: boolean;
    crossfade?: boolean;
    effectTransition?: boolean;
    sourceFx?: 'clip' | 'track' | 'video-group';
  } = {}
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
    ...(options.sourceWindowFollow ||
    options.sourceWindowFollowTransition ||
    options.sourceWindowArea
      ? {
          cursorTrack: {
            captureMode: 'separate' as const,
            skin: normalizeVideoProjectCursorSkin({
              preset: 'DOT',
              color: '#00ff00',
              shadow: false,
            }),
            samples: [0, 12].map((time) => ({
              id: `rotated-cursor:${time}`,
              time,
              x: options.sourceWindowArea ? 104 : options.sourceWindowFollowTransition ? 80 : 158.4,
              y: options.sourceWindowArea ? 36 : options.sourceWindowFollowTransition ? 45 : 89.1,
              visible: true,
              observation: 'observed' as const,
              captureSegment: 0,
              recordingPoint: options.sourceWindowArea
                ? { x: 0.65, y: 0.4 }
                : options.sourceWindowFollowTransition
                  ? { x: 0.5, y: 0.5 }
                  : { x: 0.99, y: 0.99 },
            })),
          },
        }
      : {}),
  });
  project.width = 320;
  project.height = 180;
  project.duration = 1.2;
  project.version = 19;
  project.motionRegions = [
    {
      id: 'spatial-camera',
      startTime: 0,
      duration: 1.2,
      scale: 1,
      focusMode: 'MANUAL',
      focusPoint: { x: 160, y: 90 },
      targetAction: null,
      easing: 'LINEAR',
      zoomInDuration: 0,
      zoomOutDuration: 0,
      motionBlurAmount: 0,
      phaseTransitions: { enter: 'none', exit: 'none' },
      perspective: { enabled: true, rotateX: 0, rotateY: 35, rotateZ: 0, strength: 1 },
      spatialReference: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
    },
  ];
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
    transform: { ...video.transform, x: 20, y: 30, width: 100, height: 120, opacity: 0.37 },
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
  if (options.overlays) {
    project.motionRegions[0]!.depthOfField = {
      enabled: true,
      mode: 'area',
      x: 0,
      y: 0,
      width: 0.02,
      softness: 0.02,
      strength: 1,
    };
    project.actionEvents = [
      {
        id: 'manual-sharp-click',
        kind: 'CLICK',
        anchor: { kind: 'project', time: 0 },
        point: { x: 290, y: 30 },
        label: 'Click',
        data: {},
        presentation: {
          preset: 'CLICK_PRESS',
          duration: 1.4,
          offset: -0.2,
          easing: 'LINEAR',
          clickStyle: { color: '#ff0000', size: 24, opacity: 1, strokeWidth: 2 },
        },
      },
    ];
    project.cursorTrack = {
      captureMode: 'separate',
      samples: [
        { id: 'global-cursor', time: 0, timeBasis: 'project', visible: true, x: 260, y: 140 },
      ],
      skin: {
        animationPreset: 'NONE',
        color: '#00ff00',
        hidden: false,
        preset: 'DOT',
        scale: 1,
        shadow: false,
      },
    };
  }
  if (options.crossfade) {
    image.duration = 0.8;
    image.transform.opacity = options.effectTransition ? 1 : 0.2;
    const trailing = {
      ...image,
      id: 'crossfade-trailing',
      startTime: 0.4,
      transform: { ...image.transform, opacity: 1 },
    };
    project.clips.push(trailing);
    project.transitions = [
      {
        id: 'ordinary-spatial-crossfade',
        leadingClipId: image.id,
        trailingClipId: trailing.id,
        kind: 'CROSSFADE',
        duration: 0.4,
        easing: 'LINEAR',
      },
    ];
  }
  if (options.cursorFollow) {
    project.motionRegions[0]!.focusMode = 'CURSOR';
    project.motionRegions[0]!.scale = 1.5;
  }
  if (options.sourceFx) {
    if (!video.sourceInstanceId) throw new Error('Missing source action identity');
    video.transform.opacity = 1;
    project.actionEvents.push({
      id: 'source-sharp-click',
      kind: 'CLICK',
      label: 'Source click',
      data: {},
      point: { x: 0.5, y: 0.5 },
      anchor: {
        kind: 'recording-source',
        recordingId: 'beta-v1-recording',
        sourceInstanceId: video.sourceInstanceId,
        sourceEventId: 'source-click',
        sourceTime: 0,
      },
      presentation: {
        preset: 'CLICK_PRESS',
        duration: 1.4,
        offset: -0.2,
        easing: 'LINEAR',
        clickStyle: { color: '#ff0000', size: 24, opacity: 1, strokeWidth: 2 },
      },
    });
  }
  if (options.effectRegion || options.sourceFx || options.effectTransition) {
    if (options.effectRegion) image.transform.rotation = 25;
    const source = await readFile(
      new URL(
        `../../../../packages/runtime-contracts/src/effect-v1/fixtures/collection/${options.effectTransition ? 'sniptale-transition-dissolve' : options.sourceFx ? 'sniptale-video-warm' : 'sniptale-spotlight'}.sniptale-effect.json`,
        import.meta.url
      ),
      'utf8'
    );
    const document = parseEffectV1Source(source).document;
    if (!document) throw new Error('Invalid EffectV1 region fixture');
    const sha256 = createHash('sha256').update(source).digest('hex');
    const snapshotId = `effect:${sha256}`;
    project.effectSnapshots = [
      {
        id: snapshotId,
        sha256,
        source,
        assets: [],
        retainedByteLength: Buffer.byteLength(source),
        schemaVersion: 'sniptale.effect.v1',
        documentId: document.id,
        kind: options.effectTransition ? 'transition' : 'targetEffect',
      },
    ];
    project.effectInstances = [
      {
        id: 'projected-region',
        kind: options.effectTransition ? 'transition' : 'targetEffect',
        target: options.effectTransition
          ? { kind: 'transition', transitionId: 'ordinary-spatial-crossfade' }
          : options.sourceFx === 'track'
            ? { kind: 'track', trackId: video.trackId }
            : options.sourceFx === 'video-group'
              ? { kind: 'video-group' }
              : { kind: 'clip', clipId: options.sourceFx ? video.id : image.id },
        snapshotId,
        controls: Object.fromEntries(
          document.controls.map((control) => [
            control.id,
            resolveEffectV1ControlDefault(control, locale),
          ])
        ),
        ...(options.sourceFx
          ? {
              controls: {
                ...Object.fromEntries(
                  document.controls.map((control) => [
                    control.id,
                    resolveEffectV1ControlDefault(control, locale),
                  ])
                ),
                strength: 100,
                edge: 0,
                saturation: 0,
                tint: '#00ff00',
              },
            }
          : {}),
        ...(options.effectTransition ? {} : { rangeMode: 'owner' as const }),
        enabled: true,
        startTime: options.effectTransition ? 0.4 : 0,
        duration: options.effectTransition ? 0.4 : 1.2,
        playbackRate: document.duration / (options.effectTransition ? 0.4 : image.duration),
      },
    ];
  }
  if (options.sourceActionFocus) {
    if (!video.sourceInstanceId) throw new Error('Missing source action identity');
    video.transform.rotation = 30;
    project.version = 34;
    project.actionEvents = [
      {
        id: 'window-action',
        kind: 'CLICK',
        label: 'Click',
        data: {},
        point: { x: 0.35, y: 0.6 },
        anchor: {
          kind: 'recording-source',
          recordingId: 'beta-v1-recording',
          sourceInstanceId: video.sourceInstanceId,
          sourceEventId: 'window-click',
          sourceTime: 0,
        },
        presentation: { enabled: false },
      },
    ];
    Object.assign(project.motionRegions[0]!, {
      scale: 1.6,
      focusMode: 'ACTION',
      targetAction: { eventId: 'window-action', clipId: video.id },
      perspective: { enabled: false, rotateX: 0, rotateY: 0, rotateZ: 0, strength: 0 },
      sourceBinding: {
        clipId: video.id,
        coordinateSpace: 'source-window',
        sourceStart: 0,
        sourceEnd: 1.2,
        animation: { start: 0, end: 1.2, duration: 1.2 },
      },
    });
  }
  if (
    options.sourceWindowFollow ||
    options.sourceWindowFollowTransition ||
    options.sourceWindowArea
  ) {
    project.width = 400;
    project.height = 400;
    project.version = 34;
    video.transform = {
      ...video.transform,
      x: 0,
      y: 0,
      width: 400,
      height: 400,
      rotation: options.sourceWindowFollow ? 45 : 30,
      opacity: 1,
    };
    delete video.windowHeader;
    delete video.sourceCrop;
    Object.assign(project.motionRegions[0]!, {
      scale: 2,
      focusMode: options.sourceWindowArea ? 'MANUAL_AREA' : 'CURSOR',
      ...(options.sourceWindowArea
        ? { focusArea: { x: 100, y: 100, width: 200, height: 200 } }
        : {}),
      focusPoint: { x: 200, y: 200 },
      perspective: { enabled: false, rotateX: 0, rotateY: 0, rotateZ: 0, strength: 0 },
      sourceBinding: {
        clipId: video.id,
        coordinateSpace: 'source-window',
        sourceStart: 0,
        sourceEnd: 1.2,
        animation: { start: 0, end: 1.2, duration: 1.2 },
      },
    });
  }
  if (options.sourceWindowFollowTransition) {
    project.duration = 1.8;
    project.clips.push({
      ...video,
      id: 'moving-next-video',
      sourceInstanceId: 'moving-next-instance',
      startTime: 0.6,
      groupId: null,
    });
    project.transitions = [
      {
        id: 'moving-source-transition',
        leadingClipId: video.id,
        trailingClipId: 'moving-next-video',
        kind: 'PUSH',
        duration: 0.6,
        easing: 'EASE_IN_OUT',
        direction: 'RIGHT',
        intensity: 'BOLD',
      },
    ];
  }
  Object.assign(project, hydrateVideoProject(project));
  expect(isHydratableVideoProject(project)).toBe(true);
  await applyHarnessBootstrap(page, {
    preserveMediaLibrary: true,
    videoProjects: [project],
    storage: { 'sniptale-locale-preference': locale, 'sniptale-theme-preference': theme },
  });
  await page.addInitScript((language) => {
    if (window !== window.top) return;
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

// Independent Y-rotation oracle: x'=160+cos(35°)*(x-160)/(1+g*(x-160)),
// g=.7*sin(35°)/hypot(256,144). The cyan right edge is ~256, versus 300 in 2D.
for (const [index, viewport] of PRIMARY_BROWSER_VIEWPORTS.entries()) {
  test(`spatial framing inspector Result and neutral Overview ${viewport.size.width}`, async ({
    page,
  }, info) => {
    test.setTimeout(180000);
    await page.setViewportSize({ ...viewport.size });
    const locale = index === 0 ? 'en' : 'ru',
      theme = index === 0 ? 'dark' : 'light';
    await page.emulateMedia({ colorScheme: theme });
    const label = (key: Parameters<typeof translate>[0]) => translate(key, locale);
    const host = await startHostServer();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    try {
      await openFixture(page, host.origin, locale, theme);
      await page
        .locator('[data-timeline-effect-segment="spatial-camera"]')
        .getByRole('button', {
          name: label('videoEditor.timeline.motionSegment') + ' · 1.00x',
          exact: true,
        })
        .click();
      const owner = page.locator('[data-ui="video-editor.framing-preview"]');
      await expect(owner).toBeVisible();
      const canvas = owner.locator('canvas');
      const categories = page.locator('[data-ui="video-editor.inspector.categories"]');
      const rail = categories.locator(':scope > nav');
      const content = categories.locator(':scope > div');
      const exposeFrame = async () => {
        const railBefore = await rail.boundingBox();
        await canvas.scrollIntoViewIfNeeded();
        const frame = await canvas.boundingBox(),
          scroll = await content.boundingBox();
        if (!frame || !scroll || !railBefore) throw new Error('Missing inspector scroll bounds');
        expect(frame.y).toBeGreaterThanOrEqual(scroll.y - 1);
        expect(frame.y + frame.height).toBeLessThanOrEqual(scroll.y + scroll.height + 1);
        expect((await rail.boundingBox())?.y).toBe(railBefore.y);
      };
      const sample = () =>
        canvas.evaluate((node: HTMLCanvasElement) => {
          const context = node.getContext('2d')!;
          return [220, 280].map((x) =>
            Array.from(
              context.getImageData(
                Math.round((x * node.width) / 320),
                Math.round((90 * node.height) / 180),
                1,
                1
              ).data
            )
          );
        });
      const cyan = [18, 52, 86].map((value, i) => value + 0.61 * ([34, 211, 238][i]! - value));
      const before = await readNativeVideoProject(page);
      await expect
        .poll(
          async () =>
            Math.max(
              ...(await sample())[1]!.slice(0, 3).map((value, i) => Math.abs(value - cyan[i]!))
            ),
          { timeout: 30000 }
        )
        .toBeLessThan(3);
      await chooseInspectorValue(
        page,
        owner,
        label('videoEditor.sidebar.framingPreviewLabel'),
        label('videoEditor.sidebar.framingResultView')
      );
      await expect
        .poll(
          async () =>
            Math.max(
              ...(await sample())[1]!
                .slice(0, 3)
                .map((value, i) => Math.abs(value - [18, 52, 86][i]!))
            ),
          { timeout: 30000 }
        )
        .toBeLessThan(3);
      expect(
        Math.max(...(await sample())[0]!.slice(0, 3).map((value, i) => Math.abs(value - cyan[i]!)))
      ).toBeLessThan(3);
      const mode = owner.getByRole('button', {
        name: label('videoEditor.sidebar.framingResultView'),
        exact: true,
      });
      const modeTarget = (await mode.isVisible())
        ? mode
        : owner.getByRole('button', {
            name: label('videoEditor.sidebar.framingPreviewLabel'),
            exact: true,
          });
      await checkInspectorPaintedFont(page, modeTarget, 'spatial-framing-result');
      await exposeFrame();
      await page.screenshot({
        path: info.outputPath('spatial-framing-result.png'),
        fullPage: false,
      });
      await chooseInspectorValue(
        page,
        owner,
        label('videoEditor.sidebar.framingPreviewLabel'),
        label('videoEditor.sidebar.framingAreaView')
      );
      await expect
        .poll(
          async () =>
            Math.max(
              ...(await sample())[1]!.slice(0, 3).map((value, i) => Math.abs(value - cyan[i]!))
            ),
          { timeout: 30000 }
        )
        .toBeLessThan(3);
      expect(await readNativeVideoProject(page)).toEqual(before);
      await expect(
        owner.getByText(label('videoEditor.sidebar.framingPreviewHint'), { exact: true })
      ).toHaveCount(0);
      await exposeFrame();
      await page.screenshot({
        path: info.outputPath('spatial-framing-overview.png'),
        fullPage: false,
      });
      await page.setViewportSize({ width: 1199, height: 560 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= document.documentElement.clientWidth
        )
      ).toBe(true);
      expect(errors).toEqual([]);
    } finally {
      host.server.closeAllConnections();
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}

test('materialized DOF framing keeps the selected camera focus and sharp cursor', async ({
  page,
}) => {
  test.setTimeout(180000);
  await page.setViewportSize({ width: 1280, height: 560 });
  const host = await startHostServer();
  try {
    await openFixture(page, host.origin, 'en', 'dark', { overlays: true });
    await page
      .locator('[data-timeline-effect-segment="spatial-camera"]')
      .getByRole('button', {
        name: translate('videoEditor.timeline.motionSegment', 'en') + ' · 1.00x',
        exact: true,
      })
      .click();
    const owner = page.locator('[data-ui="video-editor.framing-preview"]');
    await chooseInspectorValue(
      page,
      owner,
      translate('videoEditor.sidebar.framingPreviewLabel', 'en'),
      translate('videoEditor.sidebar.framingResultView', 'en')
    );
    const sample = () =>
      owner.locator('canvas').evaluate((node: HTMLCanvasElement) => {
        const context = node.getContext('2d')!;
        return [
          [257, 90],
          [232, 134],
        ].map(([x, y]) =>
          Array.from(
            context.getImageData(
              Math.round((x! * node.width) / 320),
              Math.round((y! * node.height) / 180),
              1,
              1
            ).data
          )
        );
      });
    // Functional pixel proof; the two viewport cases above own the bounded UI inspection.
    await expect.poll(async () => (await sample())[1]![1], { timeout: 30000 }).toBeGreaterThan(240);
    const pixels = await sample();
    expect(pixels[0]![1]).toBeGreaterThan(60);
    expect(pixels[0]![1]).toBeLessThan(120);
    expect(pixels[1]![0]).toBeLessThan(8);
    expect(pixels[1]![2]).toBeLessThan(8);
  } finally {
    host.server.closeAllConnections();
    await new Promise<void>((resolve) => host.server.close(() => resolve()));
  }
});

for (const viewport of PRIMARY_BROWSER_VIEWPORTS) {
  test(`spatial preview projects mixed media ${viewport.size.width}`, async ({ page }, info) => {
    test.setTimeout(180000);
    await page.setViewportSize({ ...viewport.size });
    const host = await startHostServer();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    try {
      const fixture = await openFixture(page, host.origin);
      const canvas = page.locator('[data-preview-stage-canvas]');
      await expect(canvas).toBeVisible();
      const sample = () =>
        canvas.evaluate((node: HTMLCanvasElement) => {
          const context = node.getContext('2d')!;
          // The scene canvas uses a contained project viewport, centered in its backing store.
          const scale = Math.min(node.width / 320, node.height / 180);
          const offsetX = (node.width - 320 * scale) / 2;
          const offsetY = (node.height - 180 * scale) / 2;
          return [220, 280].map((x) =>
            Array.from(
              context.getImageData(
                Math.round(offsetX + x * scale),
                Math.round(offsetY + 90 * scale),
                1,
                1
              ).data
            )
          );
        });
      const expected = [
        [18, 52, 86].map((v, i) => v + 0.61 * ([34, 211, 238][i]! - v)),
        [18, 52, 86],
      ];
      await expect
        .poll(
          async () => {
            const actual = await sample();
            return Math.max(
              ...actual.flatMap((pixel, n) => expected[n]!.map((v, i) => Math.abs(v - pixel[i]!)))
            );
          },
          { timeout: 30000 }
        )
        .toBeLessThan(3);
      await writeFile(
        info.outputPath('spatial-preview-pixels.json'),
        JSON.stringify(await sample())
      );
      await page.screenshot({ path: info.outputPath('spatial-preview.png'), fullPage: false });
      expect(errors).toEqual([]);
      await page.reload();
      await expect(page.locator('[data-ui="video-editor.timeline.surface"]')).toBeVisible();
      await expect.poll(async () => (await readNativeVideoProject(page))?.version).toBe(19);
      await expect
        .poll(
          async () => {
            const actual = await sample();
            return Math.max(
              ...actual.flatMap((pixel, n) => expected[n]!.map((v, i) => Math.abs(v - pixel[i]!)))
            );
          },
          { timeout: 30000 }
        )
        .toBeLessThan(3);
      const magnet = page.getByRole('button', { name: 'Magnet', exact: true });
      if ((await magnet.getAttribute('aria-pressed')) === 'true') await magnet.click();
      const bounds = await canvas.boundingBox();
      if (!bounds) throw new Error('Missing scene bounds');
      const scale = Math.min(bounds.width / 320, bounds.height / 180);
      const client = (x: number, y: number) => ({
        x: bounds.x + (bounds.width - 320 * scale) / 2 + x * scale,
        y: bounds.y + (bounds.height - 180 * scale) / 2 + y * scale,
      });
      const start = client(220, 90),
        end = client(230, 95);
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      await page.mouse.move(end.x, end.y, { steps: 4 });
      await page.mouse.up();
      const inverse = (x: number, y: number) => {
        const radians = (35 * Math.PI) / 180;
        const g = (0.7 * Math.sin(radians)) / Math.hypot(256, 144);
        const dx = (x - 160) / (Math.cos(radians) - g * (x - 160));
        return { x: 160 + dx, y: 90 + (y - 90) * (1 + g * dx) };
      };
      const p0 = inverse(220, 90),
        p1 = inverse(230, 95);
      const transform = async () =>
        (await readNativeVideoProject(page))!.clips.find((clip) => clip.id === fixture.image.id)!
          .transform;
      // CSS pointer coordinates preserve the plane delta to 0.05 project pixels.
      await expect
        .poll(async () => Math.abs((await transform()).x - (180 + p1.x - p0.x)))
        .toBeLessThan(0.05);
      expect(Math.abs((await transform()).y - (40 + p1.y - p0.y))).toBeLessThan(0.05);
      const selection = page.locator('[data-preview-selection-state="editable"]');
      await expect(selection).toBeVisible();
      expect(await selection.evaluate((node) => getComputedStyle(node).transform)).toMatch(
        /^matrix3d/
      );
      const handles = await page.locator('[data-preview-selection-handle]').evaluateAll((nodes) =>
        nodes.map((node) => {
          const rect = node.getBoundingClientRect();
          return { width: rect.width, height: rect.height };
        })
      );
      expect(handles).toHaveLength(4);
      for (const handle of handles) {
        expect(Math.abs(handle.width - handle.height)).toBeLessThan(0.1);
        expect(handle.width).toBeGreaterThanOrEqual(14);
      }
      await page.screenshot({ path: info.outputPath('spatial-selection.png'), fullPage: false });
      await page.locator('[data-ui="video-editor.timeline.toolbar.undo"]').click();
      await expect.poll(async () => (await transform()).x).toBe(180);
      await expect.poll(async () => (await transform()).y).toBe(40);
      expect(errors).toEqual([]);
    } finally {
      host.server.closeAllConnections();
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}

for (const viewport of PRIMARY_BROWSER_VIEWPORTS) {
  test(`sharp global overlays remain projected above DOF ${viewport.size.width}`, async ({
    page,
  }, info) => {
    test.setTimeout(180000);
    await page.setViewportSize({ ...viewport.size });
    const host = await startHostServer();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    try {
      await openFixture(page, host.origin, 'en', 'dark', { overlays: true });
      const canvas = page.locator('[data-preview-stage-canvas]');
      const sample = () =>
        canvas.evaluate((node: HTMLCanvasElement) => {
          const scale = Math.min(node.width / 320, node.height / 180);
          const ox = (node.width - 320 * scale) / 2,
            oy = (node.height - 180 * scale) / 2;
          const context = node.getContext('2d')!;
          return [
            [232, 134],
            [250, 40],
            [257, 90],
          ].map(([x, y]) =>
            Array.from(
              context.getImageData(Math.round(ox + x! * scale), Math.round(oy + y! * scale), 1, 1)
                .data
            )
          );
        });
      await expect
        .poll(async () => (await sample())[0]![1], { timeout: 30000 })
        .toBeGreaterThan(240);
      const pixels = await sample();
      expect(pixels[0]![0]).toBeLessThan(8);
      expect(pixels[0]![2]).toBeLessThan(8);
      expect(pixels[1]![0]).toBeGreaterThan(80);
      expect(pixels[1]![0]! - pixels[1]![1]!).toBeGreaterThan(45);
      // At x257 the unblurred plane is absent; DOF must soften the cyan edge into it.
      expect(pixels[2]![1]).toBeGreaterThan(60);
      await writeFile(info.outputPath('sharp-global-pixels.json'), JSON.stringify(pixels));
      await page.screenshot({
        path: info.outputPath('sharp-global-overlays.png'),
        fullPage: false,
      });
      expect(errors).toEqual([]);
    } finally {
      host.server.closeAllConnections();
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}

for (const overlays of [false, true])
  for (const format of ['MP4', 'WEBM'] as const)
    test(`encoded ${format} matches independent spatial projection landmarks sharp=${overlays}`, async ({
      page,
    }, info) => {
      test.setTimeout(180000);
      await page.setViewportSize({ width: 1280, height: 560 });
      const host = await startHostServer();
      try {
        await openFixture(page, host.origin, 'en', 'dark', {
          overlays,
          ...(overlays ? { sourceFx: 'clip' as const } : {}),
        });
        await expect.poll(async () => (await readNativeVideoProject(page))?.version).toBe(19);
        const project = (await readNativeVideoProject(page))!;
        // Exercise the acute arrow outline in native MP4 as well as the DOT in WebM.
        if (overlays && format === 'MP4' && project.cursorTrack)
          project.cursorTrack.skin.preset = 'ARROW';
        await page.goto(`${host.origin}${OFFSCREEN_HARNESS_PATH}`);
        await page.locator('[data-ui="offscreen.harness.root"][data-state="ready"]').waitFor();
        const jobId = `camera-spatial-${format}`;
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
        const proof = await page.evaluate(
          async ({ exportId, overlays, arrow }) => {
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
            document.body.append(video);
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
            const overlaySamples: number[][] = [];
            const sourceActionSamples: number[][] = [];
            try {
              // Perspective moves cyan's right edge to ~256. Flat output fails the right sample.
              for (const [time, x, phase, cyan] of [
                [0.2, 220, 'projected-interior', true],
                [0.2, 280, 'outside-projected-plane', false],
                [1.1, 220, 'retained-interior', true],
                [1.1, 280, 'retained-exterior', false],
              ] as const) {
                if (video.currentTime !== time)
                  await new Promise<void>((resolve) => {
                    const presented: VideoFrameRequestCallback = (_now, metadata) => {
                      if (Math.abs(metadata.mediaTime - time) < 0.012501) resolve();
                      else video.requestVideoFrameCallback(presented);
                    };
                    video.requestVideoFrameCallback(presented);
                    video.currentTime = time;
                  });
                context.drawImage(video, 0, 0);
                const pixel = Array.from(context.getImageData(x, 100, 1, 1).data),
                  expected = [18, 52, 86].map((value, i) =>
                    cyan ? value + 0.61 * ([34, 211, 238][i]! - value) : value
                  );
                if (overlays && time === 0.2 && cyan) {
                  // Inverse Y35° places (235,144) at arrow-local (4.7,11.7), inside the
                  // body and away from its white stroke and the codec chroma footprint.
                  for (const [px, py] of [arrow ? [235, 144] : [232, 134], [250, 40], [257, 90]])
                    overlaySamples.push(Array.from(context.getImageData(px!, py!, 1, 1).data));
                  const angle = (35 * Math.PI) / 180;
                  const sourceX =
                    160 +
                    (Math.cos(angle) * -90) /
                      (1 + (0.7 * Math.sin(angle) * -90) / Math.hypot(256, 144));
                  sourceActionSamples.push(
                    Array.from(context.getImageData(Math.round(sourceX), 90, 1, 1).data)
                  );
                }
                samples.push({
                  time,
                  x,
                  phase,
                  pixel,
                  expected,
                  error:
                    expected.reduce((sum, value, i) => sum + Math.abs(pixel[i]! - value), 0) / 3,
                });
              }
              return {
                width: video.videoWidth,
                height: video.videoHeight,
                duration: video.duration,
                size: file.size,
                samples,
                overlaySamples,
                sourceActionSamples,
              };
            } finally {
              video.removeAttribute('src');
              video.remove();
              URL.revokeObjectURL(url);
            }
          },
          { exportId: completion.exportId, overlays, arrow: format === 'MP4' }
        );
        await writeFile(
          info.outputPath(`camera-spatial-${format}-sharp-${overlays}.json`),
          JSON.stringify(proof, null, 2)
        );
        if (overlays) {
          expect(proof.overlaySamples).toHaveLength(3);
          expect(proof.overlaySamples[0]![1]).toBeGreaterThan(220);
          expect(proof.overlaySamples[0]![0]).toBeLessThan(35);
          expect(proof.overlaySamples[0]![2]).toBeLessThan(35);
          expect(proof.overlaySamples[1]![0]).toBeGreaterThan(80);
          expect(proof.overlaySamples[1]![0]! - proof.overlaySamples[1]![1]!).toBeGreaterThan(40);
          expect(proof.overlaySamples[2]![1]).toBeGreaterThan(58);
          expect(proof.sourceActionSamples).toHaveLength(1);
          const source = proof.sourceActionSamples[0]!;
          const alpha = 0.5 * (1 - 0.4 / 1.4);
          // The encoded solid center permits 14 channel levels for VP9 resampling.
          expect(Math.abs(source[0]! - source[2]! - alpha * 255)).toBeLessThan(14);
          expect(Math.abs(source[1]! - source[2]! - (1 - alpha) * 0.18 * 255)).toBeLessThan(14);
        }
        expect(proof.width).toBe(320);
        expect(proof.height).toBe(180);
        expect(proof.size).toBeGreaterThan(1000);
        expect(Math.abs(proof.duration - 1.2)).toBeLessThan(0.025001);
        for (const sample of proof.samples) {
          expect(sample.pixel[3]).toBe(255);
          expect(sample.error, JSON.stringify(sample)).toBeLessThan(14);
        }
      } finally {
        host.server.closeAllConnections();
        await new Promise<void>((resolve) => host.server.close(() => resolve()));
      }
    });

for (const [index, viewport] of PRIMARY_BROWSER_VIEWPORTS.entries()) {
  test(`spatial parameters preview cancel accept and reopen ${viewport.size.width}`, async ({
    page,
  }, info) => {
    test.setTimeout(180000);
    await page.setViewportSize({ ...viewport.size });
    const locale = index === 0 ? 'en' : 'ru',
      theme = index === 0 ? 'dark' : 'light';
    await page.emulateMedia({ colorScheme: theme });
    await page.addInitScript(
      (preference) => localStorage.setItem('sniptale-theme-preference', preference),
      theme
    );
    const label = (key: Parameters<typeof translate>[0]) => translate(key, locale);
    const host = await startHostServer();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    try {
      const { project } = await openFixture(page, host.origin, locale, theme);
      const select = async () =>
        page
          .locator('[data-timeline-effect-segment="spatial-camera"]')
          .getByRole('button', {
            name: label('videoEditor.timeline.motionSegment') + ' · 1.00x',
            exact: true,
          })
          .click();
      await select();
      const categories = page.locator('[data-ui="video-editor.inspector.categories"]');
      const rail = categories.locator(':scope > nav');
      const content = categories.locator(':scope > div');
      const group = async (key: Parameters<typeof translate>[0], dataUi: string) => {
        await rail.getByRole('button', { name: label(key), exact: true }).click();
        const owner = page.locator(`[data-ui="${dataUi}"]`);
        await expect(owner).toBeVisible();
        await checkInspectorParameterRows(owner);
        return owner;
      };
      const accepted = async () =>
        (await readNativeVideoProject(page))!.motionRegions!.find(
          (region) => region.id === 'spatial-camera'
        )!;
      const canvas = page.locator('[data-preview-stage-canvas]');
      const pixels = () =>
        canvas.evaluate(async (node: HTMLCanvasElement) => {
          const pixels = node.getContext('2d')!.getImageData(0, 0, node.width, node.height).data;
          const hash = await crypto.subtle.digest('SHA-256', new Uint8Array(pixels));
          return Array.from(new Uint8Array(hash), (byte) =>
            byte.toString(16).padStart(2, '0')
          ).join('');
        });
      // An independent projected landmark establishes that the source frame is ready.
      await expect
        .poll(() =>
          canvas.evaluate((node: HTMLCanvasElement) => {
            const scale = Math.min(node.width / 320, node.height / 180);
            const ox = (node.width - 320 * scale) / 2,
              oy = (node.height - 180 * scale) / 2;
            return node
              .getContext('2d')!
              .getImageData(Math.round(ox + 220 * scale), Math.round(oy + 100 * scale), 1, 1)
              .data[1]!;
          })
        )
        .toBeGreaterThan(100);
      const perspective = await group(
        'gallery.videoReview.perspective',
        'video-editor.motion.perspective'
      );
      const tilt = perspective.getByRole('textbox', {
        name: label('gallery.videoReview.perspectiveY'),
        exact: true,
      });
      await expect(tilt).toHaveValue('35');
      await checkInspectorPaintedFont(
        page,
        perspective.locator('.sniptale-parameter-name').first(),
        `spatial-${locale}`
      );
      await checkInspectorPaintedFont(page, tilt, 'spatial-numeric');
      const before = await pixels();
      await tilt.hover();
      const range = perspective.getByRole('slider', {
        name: label('gallery.videoReview.perspectiveY') + ' range',
        exact: true,
      });
      await range.focus();
      await page.keyboard.down('Home');
      await expect(range).toHaveValue('-60');
      await expect.poll(pixels).not.toBe(before);
      expect((await accepted()).perspective!.rotateY).toBe(35);
      await page.keyboard.press('Escape');
      await page.keyboard.up('Home');
      await expect(range).toHaveValue('35');
      await expect.poll(pixels).toBe(before);
      expect((await accepted()).perspective!.rotateY).toBe(35);
      const track = (await range.boundingBox())!;
      await page.mouse.move(track.x + track.width * 0.75, track.y + track.height / 2);
      await page.mouse.down();
      await page.mouse.move(track.x + track.width * 0.2, track.y + track.height / 2);
      await expect(range).not.toHaveValue('35');
      await expect.poll(pixels).not.toBe(before);
      expect((await accepted()).perspective!.rotateY).toBe(35);
      await range.dispatchEvent('pointercancel', {
        pointerId: 1,
        pointerType: 'mouse',
        bubbles: true,
      });
      await page.mouse.up();
      await expect(range).toHaveValue('35');
      await expect.poll(pixels).toBe(before);
      expect((await accepted()).perspective!.rotateY).toBe(35);
      await tilt.fill('25');
      await tilt.press('Enter');
      await expect.poll(async () => (await accepted()).perspective!.rotateY).toBe(25);
      await page.locator('[data-ui="video-editor.timeline.toolbar.undo"]').click();
      await expect.poll(async () => (await accepted()).perspective!.rotateY).toBe(35);
      await page.locator('[data-ui="video-editor.timeline.toolbar.redo"]').click();
      await expect.poll(async () => (await accepted()).perspective!.rotateY).toBe(25);
      const apply = perspective.getByRole('switch', {
        name: label('gallery.videoReview.spatialEnabled'),
        exact: true,
      });
      await apply.click();
      await expect(tilt).toBeDisabled();
      await expect.poll(async () => (await accepted()).perspective!.enabled).toBe(false);
      expect((await accepted()).perspective!.rotateY).toBe(25);
      await apply.click();
      await expect(tilt).toBeEnabled();
      await page.mouse.move(0, 0);
      await page.screenshot({
        path: info.outputPath('native-perspective-fields.png'),
        fullPage: false,
      });
      const depth = await group('gallery.videoReview.depthOfField', 'video-editor.motion.depth');
      await depth
        .getByRole('switch', { name: label('gallery.videoReview.spatialEnabled'), exact: true })
        .click();
      await chooseInspectorValue(
        page,
        depth,
        label('gallery.videoReview.depthMode'),
        label('gallery.videoReview.depthModeArea')
      );
      const blur = depth.getByRole('textbox', {
        name: label('gallery.videoReview.depthStrength'),
        exact: true,
      });
      await blur.fill('80');
      await blur.press('Enter');
      await expect
        .poll(async () => (await accepted()).depthOfField)
        .toMatchObject({ enabled: true, mode: 'area', strength: 0.8 });
      const railBefore = await rail.boundingBox();
      await depth
        .getByRole('button', { name: label('gallery.videoReview.spatialReset'), exact: true })
        .scrollIntoViewIfNeeded();
      const railAfter = await rail.boundingBox();
      expect(railAfter!.y).toBeCloseTo(railBefore!.y, 1);
      expect(railAfter!.height).toBeCloseTo(railBefore!.height, 1);
      expect(await content.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
      await page.mouse.move(0, 0);
      await page.screenshot({ path: info.outputPath('native-depth-fields.png'), fullPage: false });
      const reference = await group(
        'videoEditor.sidebar.inspectorGroupSpatialReference',
        'video-editor.motion.spatial-reference'
      );
      const width = reference.getByRole('textbox', {
        name: label('videoEditor.sidebar.widthLabel'),
        exact: true,
      });
      await expect(width).toHaveValue('80');
      await width.fill('70');
      await width.press('Enter');
      const x = reference.getByRole('textbox', {
        name: label('videoEditor.sidebar.motionAreaXLabel'),
        exact: true,
      });
      await x.fill('20');
      await x.press('Enter');
      await expect
        .poll(async () => (await accepted()).spatialReference)
        .toMatchObject({ x: 0.2, y: 0.1, width: 0.7, height: 0.8 });
      expect((await accepted()).sourceBinding).toEqual(project.motionRegions![0]!.sourceBinding);
      expect((await accepted()).duration).toBe(project.motionRegions![0]!.duration);
      await page.mouse.move(0, 0);
      await page.screenshot({
        path: info.outputPath('native-reference-fields.png'),
        fullPage: false,
      });
      await reference
        .getByRole('button', {
          name: label('videoEditor.sidebar.spatialReferenceReset'),
          exact: true,
        })
        .click();
      await expect.poll(async () => (await accepted()).spatialReference).toBeUndefined();
      await page.reload();
      await select();
      const reopened = await group(
        'gallery.videoReview.perspective',
        'video-editor.motion.perspective'
      );
      await expect(
        reopened.getByRole('textbox', {
          name: label('gallery.videoReview.perspectiveY'),
          exact: true,
        })
      ).toHaveValue('25');
      expect((await accepted()).depthOfField).toMatchObject({
        enabled: true,
        mode: 'area',
        strength: 0.8,
      });
      const reopenedTilt = reopened.getByRole('textbox', {
        name: label('gallery.videoReview.perspectiveY'),
        exact: true,
      });
      const cameraLane = page
        .locator('[data-project-timeline-effect-lane-row]')
        .filter({ has: page.locator('[data-ui="video-editor.timeline.motion-lane-select"]') });
      await cameraLane
        .getByRole('button', { name: label('videoEditor.timeline.laneEditable'), exact: true })
        .click();
      await expect(reopenedTilt).toBeDisabled();
      expect((await accepted()).perspective!.rotateY).toBe(25);
      await cameraLane
        .getByRole('button', { name: label('videoEditor.timeline.laneLocked'), exact: true })
        .click();
      await expect(reopenedTilt).toBeEnabled();
      if (viewport.size.width === 1920) {
        const inspector = page.locator('[data-ui="video-editor.floating.context-inspector"]');
        const handle = page.locator('[data-ui="video-editor.floating.context-inspector.resize"]');
        for (const width of [359, 360, 361]) {
          const current = (await inspector.boundingBox())!.width,
            bounds = (await handle.boundingBox())!;
          await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + 12);
          await page.mouse.down();
          await page.mouse.move(bounds.x + bounds.width / 2 + current - width, bounds.y + 12);
          await page.mouse.up();
          await expect
            .poll(async () => Math.round((await inspector.boundingBox())!.width))
            .toBe(width);
          await checkInspectorParameterRows(reopened);
          expect(await content.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(
            true
          );
          await page.screenshot({
            path: info.outputPath(`native-spatial-inspector-${width}.png`),
            fullPage: false,
          });
        }
      }
      const changes = await reopened.evaluateHandle((owner) => {
        const changes = [
          ...owner.querySelectorAll<HTMLElement>('.sniptale-parameter-name, label'),
        ].map((node) => ({ node, original: node.textContent ?? '' }));
        for (const { node, original } of changes)
          node.textContent = `⟦${original}${original.length <= 12 ? original : original.slice(0, Math.ceil(original.length / 2))}⟧`;
        return changes;
      });
      try {
        await checkInspectorParameterRows(reopened);
        expect(await content.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(
          true
        );
        await page.screenshot({
          path: info.outputPath('native-spatial-label-stress.png'),
          fullPage: false,
        });
      } finally {
        await changes.evaluate((items) => {
          for (const { node, original } of items) if (node.isConnected) node.textContent = original;
        });
        await changes.dispose();
      }
      await page.setViewportSize({ width: 1199, height: 560 });
      await reopenedTilt.scrollIntoViewIfNeeded();
      expect(await content.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
      await page.screenshot({
        path: info.outputPath('native-spatial-below-minimum.png'),
        fullPage: false,
      });
      expect(errors).toEqual([]);
    } finally {
      host.server.closeAllConnections();
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}

for (const [index, viewport] of PRIMARY_BROWSER_VIEWPORTS.entries()) {
  test(`spatial inspector all groups and text zoom ${viewport.size.width}`, async ({
    page,
  }, info) => {
    test.setTimeout(180000);
    await page.setViewportSize({ ...viewport.size });
    const locale = index === 0 ? 'en' : 'ru',
      theme = index === 0 ? 'dark' : 'light';
    const label = (key: Parameters<typeof translate>[0]) => translate(key, locale);
    await page.emulateMedia({ colorScheme: theme });
    await page.addInitScript((value) => {
      if (window === window.top) localStorage.setItem('sniptale-theme-preference', value);
    }, theme);
    const host = await startHostServer();
    try {
      await openFixture(page, host.origin, locale, theme);
      await page
        .locator('[data-timeline-effect-segment="spatial-camera"]')
        .getByRole('button', {
          name: label('videoEditor.timeline.motionSegment') + ' · 1.00x',
          exact: true,
        })
        .click();
      const before = await readNativeVideoProject(page);
      await page.locator('[data-ui="video-editor.inspector.presentation-toggle"]').click();
      const all = page.locator(
        '[data-ui="video-editor.inspector.sections"][data-presentation="all"]'
      );
      await expect(all).toBeVisible();
      const thumbnail = page.locator('[data-ui="video-editor.framing-preview"]');
      await chooseInspectorValue(
        page,
        thumbnail,
        label('videoEditor.sidebar.framingPreviewLabel'),
        label('videoEditor.sidebar.framingResultView')
      );
      await expect(thumbnail.locator('[data-video-editor-local-navigation]')).toBeEnabled();
      const hashCanvas = (selector: string) =>
        page.locator(selector).evaluate(async (node: HTMLCanvasElement) => {
          const pixels = node.getContext('2d')!.getImageData(0, 0, node.width, node.height).data;
          const hash = await crypto.subtle.digest('SHA-256', new Uint8Array(pixels));
          return Array.from(new Uint8Array(hash), (byte) =>
            byte.toString(16).padStart(2, '0')
          ).join('');
        });
      const thumbSelector = '[data-ui="video-editor.framing-preview"] canvas';
      const mainBefore = await hashCanvas('[data-preview-stage-canvas]'),
        thumbBefore = await hashCanvas(thumbSelector);
      const tilt = all
        .locator('[data-ui="video-editor.motion.perspective"]')
        .getByRole('textbox', { name: label('gallery.videoReview.perspectiveY'), exact: true });
      await tilt.hover();
      const slider = all
        .locator('[data-ui="video-editor.motion.perspective"]')
        .getByRole('slider', {
          name: label('gallery.videoReview.perspectiveY') + ' range',
          exact: true,
        });
      await slider.focus();
      await page.keyboard.down('Home');
      await expect.poll(() => hashCanvas('[data-preview-stage-canvas]')).not.toBe(mainBefore);
      await expect.poll(() => hashCanvas(thumbSelector)).not.toBe(thumbBefore);
      expect(await readNativeVideoProject(page)).toEqual(before);
      await page.keyboard.press('Escape');
      await page.keyboard.up('Home');
      await expect.poll(() => hashCanvas('[data-preview-stage-canvas]')).toBe(mainBefore);
      await expect.poll(() => hashCanvas(thumbSelector)).toBe(thumbBefore);
      for (const name of ['perspective', 'depth', 'spatial-reference']) {
        const section = all.locator(`[data-section="${name}"]`);
        await expect(section).toHaveCount(1);
        const detail = section.locator('details').first();
        if (!(await detail.evaluate((node: HTMLDetailsElement) => node.open)))
          await detail.locator('summary').click();
        const owner = section.locator(`[data-ui="video-editor.motion.${name}"]`);
        await owner.getByRole('textbox').first().scrollIntoViewIfNeeded();
        await expect(owner.getByRole('textbox').first()).toBeInViewport();
        await checkInspectorParameterRows(owner);
        await page.screenshot({ path: info.outputPath(`native-all-${name}.png`), fullPage: false });
      }
      const reference = all.locator('[data-ui="video-editor.motion.spatial-reference"]');
      const zoom = await reference.evaluateHandle((root) => {
        const original = [...root.querySelectorAll<HTMLElement>('span, input, button, label')].map(
          (node) => ({
            node,
            style: node.getAttribute('style'),
            size: parseFloat(getComputedStyle(node).fontSize),
          })
        );
        for (const item of original) item.node.style.fontSize = `${item.size * 1.25}px`;
        return original;
      });
      try {
        await reference.getByRole('textbox').first().scrollIntoViewIfNeeded();
        await checkInspectorParameterRows(reference);
        const geometry = await reference.evaluate((root) => {
          const owner = root.closest('[data-ui="video-editor.inspector.body"]')!;
          const bounds = owner.getBoundingClientRect();
          const controls = [...root.querySelectorAll<HTMLElement>('input, button')]
            .filter((node) => node.getClientRects().length > 0)
            .map((node) => {
              const box = node.getBoundingClientRect();
              return {
                label: node.getAttribute('aria-label') ?? node.textContent,
                left: box.left,
                right: box.right,
              };
            });
          return {
            group: { client: root.clientWidth, scroll: root.scrollWidth },
            owner: {
              left: bounds.left,
              right: bounds.right,
              client: owner.clientWidth,
              scroll: owner.scrollWidth,
            },
            controls,
          };
        });
        await writeFile(
          info.outputPath('native-spatial-text-zoom-geometry.json'),
          JSON.stringify(geometry, null, 2)
        );
        // The numeric stepper uses the verified group gutter; the body owns horizontal overflow.
        expect(geometry.owner.scroll).toBeLessThanOrEqual(geometry.owner.client + 1);
        for (const control of geometry.controls) {
          expect(control.left, JSON.stringify(control)).toBeGreaterThanOrEqual(
            geometry.owner.left - 1
          );
          expect(control.right, JSON.stringify(control)).toBeLessThanOrEqual(
            geometry.owner.right + 1
          );
        }
        await page.screenshot({
          path: info.outputPath('native-spatial-text-zoom.png'),
          fullPage: false,
        });
      } finally {
        await zoom.evaluate((items) => {
          for (const { node, style } of items) {
            if (style === null) node.removeAttribute('style');
            else node.setAttribute('style', style);
          }
        });
        await zoom.dispose();
      }
      expect(await readNativeVideoProject(page)).toEqual(before);
    } finally {
      host.server.closeAllConnections();
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}

for (const [index, viewport] of PRIMARY_BROWSER_VIEWPORTS.entries()) {
  test(`EffectV1 region has round projected handles and native resize ${viewport.size.width}`, async ({
    page,
  }, info) => {
    test.setTimeout(180000);
    await page.setViewportSize({ ...viewport.size });
    const locale = index === 0 ? 'en' : 'ru',
      theme = index === 0 ? 'dark' : 'light';
    await page.emulateMedia({ colorScheme: theme });
    await page.addInitScript((value) => {
      if (window === window.top) localStorage.setItem('sniptale-theme-preference', value);
    }, theme);
    const host = await startHostServer();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    try {
      await openFixture(page, host.origin, locale, theme, { effectRegion: true });
      const stage = page.locator('[data-ui="video.preview.stage.root"]');
      const select = async () => {
        await page.locator('[data-clip-fx="projected-region"]').getByRole('button').first().click();
        await stage.focus();
        await expect(stage).toHaveAttribute('data-canvas-interaction-active', 'true');
      };
      await select();
      const frame = page.locator('[data-effect-editor-region="projected-region"]');
      const handles = page.locator('[data-effect-region-handle]');
      await expect(frame).toBeVisible();
      await expect(handles).toHaveCount(4);
      const geometry = await frame.evaluate((node: HTMLElement) => {
        const parent = node.offsetParent;
        if (!(parent instanceof HTMLElement)) throw new Error('Missing frame placement owner');
        const bounds = parent.getBoundingClientRect(),
          style = getComputedStyle(node);
        const matrix = new DOMMatrixReadOnly(style.transform);
        const width = parseFloat(style.width),
          height = parseFloat(style.height);
        return [...parent.querySelectorAll<HTMLElement>('[data-effect-region-handle]')].map(
          (handle) => {
            const key = handle.dataset['effectRegionHandle']!;
            const point = matrix.transformPoint(
              new DOMPoint(key.includes('e') ? width : 0, key.includes('s') ? height : 0)
            );
            const rect = handle.getBoundingClientRect();
            const x = rect.x + rect.width / 2,
              y = rect.y + rect.height / 2;
            return {
              key,
              width: rect.width,
              height: rect.height,
              projectedParent: node.contains(handle),
              hit: document.elementFromPoint(x, y) === handle,
              error: Math.hypot(
                x - (bounds.x + parseFloat(style.left) + point.x / point.w),
                y - (bounds.y + parseFloat(style.top) + point.y / point.w)
              ),
            };
          }
        );
      });
      expect(geometry).toHaveLength(4);
      for (const handle of geometry) {
        expect(handle.projectedParent).toBe(false);
        expect(handle.width).toBeCloseTo(14, 2);
        expect(handle.height).toBeCloseTo(14, 2);
        expect(handle.error, JSON.stringify(handle)).toBeLessThan(0.25);
        expect(handle.hit, JSON.stringify(handle)).toBe(true);
      }
      await writeFile(
        info.outputPath('projected-region-geometry.json'),
        JSON.stringify(geometry, null, 2)
      );
      await page.screenshot({
        path: info.outputPath('projected-effect-region.png'),
        fullPage: false,
      });
      const readControls = async () =>
        (await readNativeVideoProject(page))!.effectInstances!.find(
          (item) => item.id === 'projected-region'
        )!.controls;
      const before = await readControls();
      const southeast = page.locator('[data-effect-region-handle="se"]');
      const start = (await southeast.boundingBox())!;
      await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
      await page.mouse.down();
      await page.mouse.move(start.x + start.width / 2 + 12, start.y + start.height / 2 + 10);
      expect(await readControls()).toEqual(before);
      await page.mouse.up();
      await expect.poll(readControls).not.toEqual(before);
      const edited = await readControls();
      await page.locator('[data-ui="video-editor.timeline.toolbar.undo"]').click();
      await expect.poll(readControls).toEqual(before);
      await page.locator('[data-ui="video-editor.timeline.toolbar.redo"]').click();
      await expect.poll(readControls).toEqual(edited);
      await stage.focus();
      const again = (await southeast.boundingBox())!;
      await page.mouse.move(again.x + again.width / 2, again.y + again.height / 2);
      await page.mouse.down();
      await page.mouse.move(again.x + again.width / 2 - 10, again.y + again.height / 2 - 8);
      await page.keyboard.press('Escape');
      await page.mouse.up();
      expect(await readControls()).toEqual(edited);
      await page.reload();
      await select();
      await expect(frame).toBeVisible();
      expect(await readControls()).toEqual(edited);
      expect(errors).toEqual([]);
    } finally {
      host.server.closeAllConnections();
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}

for (const viewport of PRIMARY_BROWSER_VIEWPORTS) {
  test(`perspective CURSOR plan keeps the real rendered cursor visible ${viewport.size.width}`, async ({
    page,
  }, info) => {
    test.setTimeout(180000);
    await page.setViewportSize({ ...viewport.size });
    const host = await startHostServer();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    try {
      await openFixture(page, host.origin, 'en', 'dark', { overlays: true, cursorFollow: true });
      const before = (await readNativeVideoProject(page))!;
      expect(resolveProjectCursorCameraPlan(before, before.motionRegions![0]!).status).toBe(
        'ready'
      );
      const camera = resolveVideoCompositionCamera({
        project: before,
        currentTime: 0,
        actions: [],
        cursorSample: null,
      });
      const radians = (35 * Math.PI) / 180;
      const denominator = 1 + (0.7 * Math.sin(radians) * 100) / Math.hypot(256, 144);
      const expected = {
        x: camera.scale * (160 + (Math.cos(radians) * 100) / denominator - camera.viewportX),
        y: camera.scale * (90 + 50 / denominator - camera.viewportY),
      };
      expect(expected.x).toBeGreaterThan(0);
      expect(expected.x).toBeLessThan(320);
      expect(expected.y).toBeGreaterThan(0);
      expect(expected.y).toBeLessThan(180);
      const canvas = page.locator('[data-preview-stage-canvas]');
      const sample = () =>
        canvas.evaluate((node: HTMLCanvasElement, point) => {
          const scale = Math.min(node.width / 320, node.height / 180);
          const x = (node.width - 320 * scale) / 2 + point.x * scale;
          const y = (node.height - 180 * scale) / 2 + point.y * scale;
          return Array.from(
            node.getContext('2d')!.getImageData(Math.round(x), Math.round(y), 1, 1).data
          );
        }, expected);
      for (const reopened of [false, true]) {
        if (reopened) await page.reload();
        await expect(canvas).toBeVisible();
        await expect.poll(async () => (await sample())[1], { timeout: 30000 }).toBeGreaterThan(240);
        const pixel = await sample();
        expect(pixel[0]).toBeLessThan(8);
        expect(pixel[2]).toBeLessThan(8);
        expect(await readNativeVideoProject(page)).toEqual(before);
      }
      await writeFile(
        info.outputPath('perspective-cursor-proof.json'),
        JSON.stringify({ expected, pixel: await sample() }, null, 2)
      );
      await page.screenshot({ path: info.outputPath('perspective-cursor.png'), fullPage: false });
      expect(errors).toEqual([]);
    } finally {
      host.server.closeAllConnections();
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}

for (const scope of ['clip', 'track', 'video-group'] as const) {
  for (const viewport of PRIMARY_BROWSER_VIEWPORTS) {
    test(`source actions remain sharp after ${scope} FX and perspective DOF ${viewport.size.width}`, async ({
      page,
    }, info) => {
      test.setTimeout(180000);
      await page.setViewportSize({ ...viewport.size });
      const host = await startHostServer();
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      try {
        await openFixture(page, host.origin, 'en', 'dark', { overlays: true, sourceFx: scope });
        const before = await readNativeVideoProject(page);
        const angle = (35 * Math.PI) / 180;
        const sourceX = 70,
          denominator = 1 + (0.7 * Math.sin(angle) * (sourceX - 160)) / Math.hypot(256, 144);
        const projectedX = 160 + (Math.cos(angle) * (sourceX - 160)) / denominator;
        const points = [
          { x: projectedX, y: 90 },
          { x: projectedX, y: 90 + 25 / denominator },
        ];
        const canvas = page.locator('[data-preview-stage-canvas]');
        const sample = () =>
          canvas.evaluate((node: HTMLCanvasElement, positions) => {
            const scale = Math.min(node.width / 320, node.height / 180),
              ox = (node.width - 320 * scale) / 2,
              oy = (node.height - 180 * scale) / 2;
            return positions.map((point) =>
              Array.from(
                node
                  .getContext('2d')!
                  .getImageData(
                    Math.round(ox + point.x * scale),
                    Math.round(oy + point.y * scale),
                    1,
                    1
                  ).data
              )
            );
          }, points);
        for (const reopened of [false, true]) {
          if (reopened) await page.reload();
          await expect(canvas).toBeVisible();
          // CLICK_PRESS uses half of its temporal envelope for the center fill.
          // Outside grayscale/green FX, red minus blue depends only on the marker alpha.
          const alpha = 0.5 * (1 - 0.2 / 1.4);
          await expect
            .poll(
              async () => {
                const action = (await sample())[0]!;
                return Math.abs(action[0]! - action[2]! - alpha * 255);
              },
              { timeout: 30000 }
            )
            .toBeLessThan(4);
          const [action, processed] = await sample();
          expect(Math.abs(action![1]! - action![2]! - (1 - alpha) * 0.18 * 255)).toBeLessThan(5);
          expect(processed![1]! - processed![0]!).toBeGreaterThan(25);
          expect(Math.abs(processed![2]! - processed![0]!)).toBeLessThan(15);
          expect(await readNativeVideoProject(page)).toEqual(before);
        }
        await writeFile(
          info.outputPath('source-action-fx-pixels.json'),
          JSON.stringify({ scope, points, pixels: await sample() }, null, 2)
        );
        await page.screenshot({ path: info.outputPath('source-action-fx.png'), fullPage: false });
        expect(errors).toEqual([]);
      } finally {
        host.server.closeAllConnections();
        await new Promise<void>((resolve) => host.server.close(() => resolve()));
      }
    });
  }
}

for (const effectTransition of [false, true])
  for (const viewport of PRIMARY_BROWSER_VIEWPORTS) {
    test(`${effectTransition ? 'EffectV1 dissolve' : 'ordinary crossfade'} keeps two clip opacity contributions on the projected plane ${viewport.size.width}`, async ({
      page,
    }, info) => {
      test.setTimeout(180000);
      await page.setViewportSize({ ...viewport.size });
      const host = await startHostServer();
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      try {
        await openFixture(page, host.origin, 'en', 'dark', { crossfade: true, effectTransition });
        const before = (await readNativeVideoProject(page))!;
        expect(before.transitions).toHaveLength(1);
        const slider = page.locator('[data-ui="video-editor.timeline.playhead-handle"]');
        const canvas = page.locator('[data-preview-stage-canvas]');
        const sample = () =>
          canvas.evaluate((node: HTMLCanvasElement) => {
            const scale = Math.min(node.width / 320, node.height / 180);
            return Array.from(
              node
                .getContext('2d')!
                .getImageData(
                  Math.round((node.width - 320 * scale) / 2 + 220 * scale),
                  Math.round((node.height - 180 * scale) / 2 + 100 * scale),
                  1,
                  1
                ).data
            );
          });
        const proof = [];
        let frame = 0;
        for (const [time, alpha] of [
          [0.2, effectTransition ? 1 : 0.2],
          [0.6, effectTransition ? 1 : 0.55],
          [1, 1],
        ] as const) {
          const target = Math.round(time * before.fps);
          while (frame < target) {
            await slider.press('ArrowRight');
            frame++;
          }
          await expect
            .poll(async () => Number(await slider.getAttribute('aria-valuenow')))
            .toBeCloseTo(time, 7);
          // Independent source-over: midpoint alpha=.1+.5*(1-.1)=.55.
          const expected = [18, 52, 86].map(
            (channel, i) => channel + alpha * ([34, 211, 238][i]! - channel)
          );
          await expect
            .poll(async () => {
              const pixel = await sample();
              return Math.max(...expected.map((channel, i) => Math.abs(channel - pixel[i]!)));
            })
            .toBeLessThan(3);
          proof.push({ time, alpha, pixel: await sample(), expected });
        }
        expect(await readNativeVideoProject(page)).toEqual(before);
        await writeFile(
          info.outputPath('ordinary-transition-pixels.json'),
          JSON.stringify(proof, null, 2)
        );
        await page.screenshot({
          path: info.outputPath('ordinary-transition.png'),
          fullPage: false,
        });
        expect(errors).toEqual([]);
      } finally {
        host.server.closeAllConnections();
        await new Promise<void>((resolve) => host.server.close(() => resolve()));
      }
    });
  }

for (const viewport of PRIMARY_BROWSER_VIEWPORTS) {
  test(`lost spatial WebGL context retains the completed frame and retries through the existing UI ${viewport.size.width}`, async ({
    page,
  }, info) => {
    test.setTimeout(180000);
    await page.setViewportSize({ ...viewport.size });
    await page.addInitScript(() => {
      if (window !== window.top) return;
      const contexts: WebGLRenderingContext[] = [];
      Reflect.set(window, '__sniptaleTestSpatialContexts', contexts);
      const original = HTMLCanvasElement.prototype.getContext;
      Reflect.set(
        HTMLCanvasElement.prototype,
        'getContext',
        function (this: HTMLCanvasElement, ...args: unknown[]) {
          const result = Reflect.apply(original, this, args);
          if (result instanceof WebGLRenderingContext && !contexts.includes(result))
            contexts.push(result);
          return result;
        }
      );
    });
    const host = await startHostServer();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    try {
      await openFixture(page, host.origin);
      const before = await readNativeVideoProject(page);
      const canvas = page.locator('[data-preview-stage-canvas]');
      const sample = () =>
        canvas.evaluate((node: HTMLCanvasElement) => {
          const scale = Math.min(node.width / 320, node.height / 180);
          return Array.from(
            node
              .getContext('2d')!
              .getImageData(
                Math.round((node.width - 320 * scale) / 2 + 220 * scale),
                Math.round((node.height - 180 * scale) / 2 + 90 * scale),
                1,
                1
              ).data
          );
        });
      const expected = [18, 52, 86].map(
        (channel, i) => channel + 0.61 * ([34, 211, 238][i]! - channel)
      );
      const correctFrame = async () => {
        const pixel = await sample();
        return Math.max(...expected.map((channel, i) => Math.abs(channel - pixel[i]!)));
      };
      await expect.poll(correctFrame).toBeLessThan(3);
      const completed = await canvas.evaluate((node: HTMLCanvasElement) => node.toDataURL());
      const contextCount = await page.evaluate(async () => {
        const contexts: unknown = Reflect.get(window, '__sniptaleTestSpatialContexts');
        if (!Array.isArray(contexts)) throw new Error('Missing captured WebGL contexts');
        const context = contexts.find(
          (value) => value instanceof WebGLRenderingContext && !value.isContextLost()
        );
        if (!(context instanceof WebGLRenderingContext))
          throw new Error('Missing live spatial WebGL context');
        const extension = context.getExtension('WEBGL_lose_context');
        if (!extension) throw new Error('Required WebGL context loss extension is unavailable');
        await new Promise<void>((resolve) => {
          context.canvas.addEventListener('webglcontextlost', () => resolve(), { once: true });
          extension.loseContext();
        });
        return contexts.length;
      });
      const failure = page.locator('[data-ui="video.preview.effect-runtime-error"]');
      await expect(failure).toBeVisible();
      expect(await canvas.evaluate((node: HTMLCanvasElement) => node.toDataURL())).toBe(completed);
      expect(await readNativeVideoProject(page)).toEqual(before);
      await page.screenshot({ path: info.outputPath('spatial-context-lost.png'), fullPage: false });
      await failure.getByRole('button').click();
      await expect(failure).toBeHidden();
      await expect
        .poll(() =>
          page.evaluate(() => {
            const contexts: unknown = Reflect.get(window, '__sniptaleTestSpatialContexts');
            return Array.isArray(contexts) ? contexts.length : 0;
          })
        )
        .toBeGreaterThan(contextCount);
      await expect.poll(correctFrame).toBeLessThan(3);
      expect(await readNativeVideoProject(page)).toEqual(before);
      await page.screenshot({
        path: info.outputPath('spatial-context-recovered.png'),
        fullPage: false,
      });
      expect(errors).toEqual([]);
    } finally {
      host.server.closeAllConnections();
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}

for (const [index, viewport] of PRIMARY_BROWSER_VIEWPORTS.entries()) {
  test(`source ACTION focus survives inspector trim and reopen ${viewport.size.width}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ ...viewport.size });
    const locale = index === 0 ? 'en' : 'ru',
      theme = index === 0 ? 'dark' : 'light';
    await page.emulateMedia({ colorScheme: theme });
    const label = (key: Parameters<typeof translate>[0]) => translate(key, locale);
    const host = await startHostServer();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    try {
      const { video, image } = await openFixture(page, host.origin, locale, theme, {
        sourceActionFocus: true,
      });
      const before = (await readNativeVideoProject(page))!;
      const camera = (project: typeof before) =>
        resolveVideoCompositionCamera({
          project,
          currentTime: 0.4,
          actions: [],
          cursorSample: null,
        });
      const expected = camera(before);
      await page.locator(`[data-project-timeline-clip="${video.id}"]`).click();
      await page
        .locator('nav')
        .getByRole('button', {
          name: label('videoEditor.sidebar.inspectorGroupTiming'),
          exact: true,
        })
        .click();
      await page
        .locator('[data-ui="video-editor.inspector.disclosure"]')
        .filter({
          has: page.getByRole('heading', {
            name: label('videoEditor.sidebar.inspectorSourceBounds'),
            exact: true,
          }),
        })
        .locator('summary')
        .click();
      const sourceIn = page.getByRole('textbox', {
        name: label('videoEditor.sidebar.sourceIn'),
        exact: true,
      });
      await sourceIn.fill('0.2');
      await sourceIn.press('Tab');
      await expect
        .poll(
          async () =>
            (await readNativeVideoProject(page))?.clips.find((clip) => clip.id === video.id)
              ?.sourceStart
        )
        .toBe(0.2);
      await checkInspectorPaintedFont(page, sourceIn, 'source-action-trim');
      const after = (await readNativeVideoProject(page))!;
      expect(after.motionRegions![0]!.focusMode).toBe('MANUAL');
      expect(after.motionRegions![0]!.targetAction).toBeNull();
      expect(after.actionEvents).toEqual(before.actionEvents);
      expect(after.clips.find((clip) => clip.id === image.id)).toEqual(
        before.clips.find((clip) => clip.id === image.id)
      );
      const assertFocus = (project: typeof before) => {
        const actual = camera(project);
        for (const axis of ['x', 'y'] as const)
          expect(actual.focusPoint[axis]).toBeCloseTo(expected.focusPoint[axis], 7);
        expect(actual.viewportX).toBeCloseTo(expected.viewportX, 7);
        expect(actual.viewportY).toBeCloseTo(expected.viewportY, 7);
      };
      assertFocus(after);
      await page.locator('[data-ui="video-editor.timeline.toolbar.undo"]').click();
      await expect
        .poll(async () => (await readNativeVideoProject(page))?.motionRegions)
        .toEqual(before.motionRegions);
      await page.locator('[data-ui="video-editor.timeline.toolbar.redo"]').click();
      await expect
        .poll(async () => (await readNativeVideoProject(page))?.motionRegions)
        .toEqual(after.motionRegions);
      await page.reload();
      await expect(page.locator('[data-preview-stage-canvas]')).toBeVisible();
      const reopened = (await readNativeVideoProject(page))!;
      expect(reopened.motionRegions).toEqual(after.motionRegions);
      assertFocus(reopened);
      const playhead = page.locator('[data-ui="video-editor.timeline.playhead-handle"]');
      await playhead.press('Home');
      for (let frame = 0; frame < Math.round(reopened.fps * 0.4); frame++)
        await playhead.press('ArrowRight');
      await page
        .locator('[data-timeline-effect-segment="spatial-camera"]')
        .getByRole('button', {
          name: label('videoEditor.timeline.motionSegment') + ' · 1.60x',
          exact: true,
        })
        .click();
      await page
        .locator('nav')
        .getByRole('button', {
          name: label('videoEditor.sidebar.inspectorGroupFraming'),
          exact: true,
        })
        .click();
      const focus = page.getByRole('group', {
        name: label('videoEditor.sidebar.motionFocusLabel'),
        exact: true,
      });
      if (await focus.count()) {
        const manual = focus.getByRole('button', {
          name: label('videoEditor.sidebar.motionFocusManual'),
          exact: true,
        });
        await expect(manual).toHaveAttribute('aria-pressed', 'true');
        await manual.scrollIntoViewIfNeeded();
      } else {
        const manual = page.getByRole('button', {
          name: label('videoEditor.sidebar.motionFocusLabel'),
          exact: true,
        });
        await expect(manual).toContainText(label('videoEditor.sidebar.motionFocusManual'));
        await manual.scrollIntoViewIfNeeded();
      }
      await page.screenshot({
        path: info.outputPath('source-action-trim-reopened.png'),
        fullPage: false,
      });
      expect(errors).toEqual([]);
    } finally {
      host.server.closeAllConnections();
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}

for (const [index, viewport] of PRIMARY_BROWSER_VIEWPORTS.entries()) {
  test(`rotated source-window follow recovers through clip inspector ${viewport.size.width}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ ...viewport.size });
    const locale = index === 0 ? 'en' : 'ru',
      theme = index === 0 ? 'dark' : 'light';
    await page.emulateMedia({ colorScheme: theme });
    const label = (key: Parameters<typeof translate>[0]) => translate(key, locale);
    const host = await startHostServer();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    try {
      const { video } = await openFixture(page, host.origin, locale, theme, {
        sourceWindowFollow: true,
      });
      const before = (await readNativeVideoProject(page))!;
      expect(resolveProjectCursorCameraPlan(before, before.motionRegions![0]!).status).toBe(
        'conflict'
      );
      const selectMotion = async () => {
        await page
          .locator('[data-timeline-effect-segment="spatial-camera"]')
          .getByRole('button', {
            name: label('videoEditor.timeline.motionSegment') + ' · 2.00x',
            exact: true,
          })
          .click();
        await page
          .locator('nav')
          .getByRole('button', {
            name: label('videoEditor.sidebar.inspectorGroupFraming'),
            exact: true,
          })
          .click();
      };
      await selectMotion();
      const warning = page.getByText(label('videoEditor.app.exportCameraConflict'), {
        exact: true,
      });
      await expect(warning).toBeVisible();
      await warning.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: info.outputPath('rotated-follow-conflict.png'),
        fullPage: false,
      });
      await page.locator(`[data-project-timeline-clip="${video.id}"]`).click();
      await page
        .locator('nav')
        .getByRole('button', {
          name: label('videoEditor.sidebar.inspectorGroupTransform'),
          exact: true,
        })
        .click();
      const rotation = page.getByRole('textbox', {
        name: label('videoEditor.sidebar.rotationLabel'),
        exact: true,
      });
      await rotation.fill('90');
      await rotation.press('Tab');
      await expect
        .poll(
          async () =>
            (await readNativeVideoProject(page))?.clips.find((clip) => clip.id === video.id)
              ?.transform.rotation
        )
        .toBe(90);
      await checkInspectorPaintedFont(page, rotation, 'follow-source-rotation');
      const accepted = (await readNativeVideoProject(page))!;
      expect(accepted.cursorTrack).toEqual(before.cursorTrack);
      expect(resolveProjectCursorCameraPlan(accepted, accepted.motionRegions![0]!).status).toBe(
        'ready'
      );
      await page.reload();
      await expect(page.locator('[data-preview-stage-canvas]')).toBeVisible();
      const reopened = (await readNativeVideoProject(page))!;
      expect(reopened).toEqual(accepted);
      await selectMotion();
      await expect(warning).toHaveCount(0);
      const camera = resolveVideoCompositionCamera({
        project: reopened,
        currentTime: 0,
        actions: [],
        cursorSample: null,
      });
      const expected = {
        x: (4 - camera.viewportX) * camera.scale,
        y: (396 - camera.viewportY) * camera.scale,
      };
      const sample = () =>
        page.locator('[data-preview-stage-canvas]').evaluate((node: HTMLCanvasElement, point) => {
          const scale = Math.min(node.width / 400, node.height / 400);
          const x = (node.width - 400 * scale) / 2 + point.x * scale;
          const y = (node.height - 400 * scale) / 2 + point.y * scale;
          return Array.from(
            node.getContext('2d')!.getImageData(Math.round(x), Math.round(y), 1, 1).data
          );
        }, expected);
      await expect.poll(async () => (await sample())[1]).toBeGreaterThan(240);
      const pixel = await sample();
      expect(pixel[0]).toBeLessThan(8);
      expect(pixel[2]).toBeLessThan(8);
      await page.screenshot({
        path: info.outputPath('rotated-follow-recovered.png'),
        fullPage: false,
      });
      const format = index === 0 ? 'WEBM' : 'MP4';
      const encoded = await encodedNativeVideoSamples(page, host.origin, reopened, format, [
        {
          time: 0.4,
          x: Math.round(expected.x),
          y: Math.round(expected.y),
          expected: [0, 255, 0],
        },
      ]);
      expect(encoded.width).toBe(400);
      expect(encoded.height).toBe(400);
      expect(encoded.size).toBeGreaterThan(0);
      expect(encoded.samples[0]!.error).toBeLessThan(12);
      await writeFile(
        info.outputPath('rotated-follow-encoded.json'),
        JSON.stringify(encoded, null, 2)
      );
      expect(errors).toEqual([]);
    } finally {
      host.server.closeAllConnections();
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}

for (const [index, viewport] of PRIMARY_BROWSER_VIEWPORTS.entries()) {
  test(`moving transition retains explicit follow policy through reopen and export ${viewport.size.width}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ ...viewport.size });
    const locale = index === 0 ? 'en' : 'ru',
      theme = index === 0 ? 'dark' : 'light';
    await page.emulateMedia({ colorScheme: theme });
    const label = (key: Parameters<typeof translate>[0]) => translate(key, locale);
    const host = await startHostServer();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    try {
      await openFixture(page, host.origin, locale, theme, { sourceWindowFollowTransition: true });
      const before = (await readNativeVideoProject(page))!;
      expect(resolveProjectCursorCameraPlan(before, before.motionRegions![0]!).status).toBe(
        'conflict'
      );
      const select = async () => {
        await page
          .locator('[data-timeline-effect-segment="spatial-camera"]')
          .getByRole('button', {
            name: label('videoEditor.timeline.motionSegment') + ' · 2.00x',
            exact: true,
          })
          .click();
        await page
          .locator('nav')
          .getByRole('button', {
            name: label('videoEditor.sidebar.inspectorGroupFraming'),
            exact: true,
          })
          .click();
      };
      await select();
      const warning = page.getByText(label('videoEditor.app.exportCameraConflict'), {
        exact: true,
      });
      await expect(warning).toBeVisible();
      await warning.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: info.outputPath('moving-source-follow-conflict.png'),
        fullPage: false,
      });
      const settings = page.locator('[data-ui="cameraFollow.settings"]');
      const fine = settings.locator('details').first();
      if (!(await fine.evaluate((node: HTMLDetailsElement) => node.open)))
        await fine.locator('summary').click();
      const preserve = settings.getByRole('switch', {
        name: label('videoEditor.sidebar.cameraPreservePointer'),
        exact: true,
      });
      await expect(preserve).toHaveAttribute('aria-checked', 'true');
      await preserve.click();
      await expect
        .poll(
          async () =>
            (await readNativeVideoProject(page))?.motionRegions![0]!.cameraFollow?.preservePointer
        )
        .toBe(false);
      const accepted = (await readNativeVideoProject(page))!;
      expect(resolveProjectCursorCameraPlan(accepted, accepted.motionRegions![0]!).status).toBe(
        'ready'
      );
      expect(accepted.transitions).toEqual(before.transitions);
      expect(accepted.clips).toEqual(before.clips);
      expect(accepted.cursorTrack).toEqual(before.cursorTrack);
      await page.locator('[data-ui="video-editor.timeline.toolbar.undo"]').click();
      await expect
        .poll(async () => (await readNativeVideoProject(page))?.motionRegions)
        .toEqual(before.motionRegions);
      await page.locator('[data-ui="video-editor.timeline.toolbar.redo"]').click();
      await expect
        .poll(async () => (await readNativeVideoProject(page))?.motionRegions)
        .toEqual(accepted.motionRegions);
      const restored = (await readNativeVideoProject(page))!;
      expect({ ...restored, updatedAt: accepted.updatedAt }).toEqual(accepted);
      await page.reload();
      await expect(page.locator('[data-preview-stage-canvas]')).toBeVisible();
      expect(await readNativeVideoProject(page)).toEqual(restored);
      await select();
      await expect(warning).toHaveCount(0);
      if (!(await fine.evaluate((node: HTMLDetailsElement) => node.open)))
        await fine.locator('summary').click();
      const playhead = page.locator('[data-ui="video-editor.timeline.playhead-handle"]');
      await playhead.press('Home');
      for (let frame = 0; frame < Math.round(accepted.fps * 0.9); frame++)
        await playhead.press('ArrowRight');
      await expect(preserve).toHaveAttribute('aria-checked', 'false');
      await checkInspectorPaintedFont(
        page,
        settings.getByText(label('videoEditor.sidebar.cameraPreservePointer'), { exact: true }),
        'source-transition-policy'
      );
      await preserve.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: info.outputPath('moving-source-follow-policy-reopened.png'),
        fullPage: false,
      });
      const camera = resolveVideoCompositionCamera({
        project: restored,
        currentTime: 0.2,
        actions: [],
        cursorSample: null,
      });
      const point = {
        x: Math.round((200 - camera.viewportX) * camera.scale),
        y: Math.round((200 - camera.viewportY) * camera.scale),
      };
      const encoded = await encodedNativeVideoSamples(
        page,
        host.origin,
        restored,
        index === 0 ? 'WEBM' : 'MP4',
        [{ time: 0.2, ...point, expected: [0, 255, 0] }]
      );
      expect(encoded.width).toBe(400);
      expect(encoded.height).toBe(400);
      expect(encoded.samples[0]!.error).toBeLessThan(12);
      await writeFile(
        info.outputPath('moving-source-follow-encoded.json'),
        JSON.stringify(encoded, null, 2)
      );
      expect(errors).toEqual([]);
    } finally {
      host.server.closeAllConnections();
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}

for (const [index, viewport] of PRIMARY_BROWSER_VIEWPORTS.entries()) {
  test(`saved rotated area remains editable and matches encoded perspective ${viewport.size.width}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ ...viewport.size });
    const locale = index === 0 ? 'en' : 'ru',
      theme = index === 0 ? 'dark' : 'light';
    await page.emulateMedia({ colorScheme: theme });
    const label = (key: Parameters<typeof translate>[0]) => translate(key, locale);
    const host = await startHostServer();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    try {
      const { video } = await openFixture(page, host.origin, locale, theme, {
        sourceWindowArea: true,
      });
      const before = (await readNativeVideoProject(page))!;
      const select = async () => {
        await page
          .locator('[data-timeline-effect-segment="spatial-camera"]')
          .getByRole('button', {
            name:
              label('videoEditor.timeline.motionSegment') +
              ((await readNativeVideoProject(page))?.motionRegions![0]!.sourceBinding
                ?.coordinateSpace === 'source-window'
                ? ' · 2.00x'
                : ' · 1.38x'),
            exact: true,
          })
          .click();
        await page
          .locator('nav')
          .getByRole('button', {
            name: label('videoEditor.sidebar.inspectorGroupFraming'),
            exact: true,
          })
          .click();
      };
      await select();
      await chooseInspectorValue(
        page,
        page.locator('[data-ui="video-editor.inspector.categories"]'),
        label('videoEditor.sidebar.motionCoverage'),
        label('videoEditor.sidebar.spotlightCoverageScene')
      );
      await expect
        .poll(
          async () =>
            (await readNativeVideoProject(page))?.motionRegions![0]!.sourceBinding?.coordinateSpace
        )
        .not.toBe('source-window');
      await expect(
        page.locator('[data-timeline-effect-segment="spatial-camera"]').getByRole('button', {
          name: label('videoEditor.timeline.motionSegment') + ' · 1.46x',
          exact: true,
        })
      ).toBeVisible();
      const exact = page.locator('[data-ui="video-editor.inspector.disclosure"]').filter({
        has: page.getByRole('heading', {
          name: label('videoEditor.sidebar.inspectorExactPlacement'),
          exact: true,
        }),
      });
      if (!(await exact.evaluate((node: HTMLDetailsElement) => node.open)))
        await exact.locator('summary').click();
      const width = page.getByRole('textbox', {
        name: label('videoEditor.sidebar.motionAreaWidthLabel'),
        exact: true,
      });
      await width.fill('220');
      await width.press('Tab');
      await expect
        .poll(async () => (await readNativeVideoProject(page))?.motionRegions![0]!.focusArea?.width)
        .toBeCloseTo(220, 6);
      await checkInspectorPaintedFont(page, width, 'persisted-area-width');
      const radians = Math.PI / 6,
        c = Math.cos(radians),
        s = Math.sin(radians);
      const origin = { x: 200 - 100 * c + 100 * s, y: 200 - 100 * s - 100 * c };
      const assertArea = (project: typeof before) => {
        const area = project.motionRegions![0]!.focusArea!;
        expect(area.axes).toBeDefined();
        expect(area.width).toBeCloseTo(220, 6);
        expect(area.height).toBeCloseTo(200, 6);
        for (const [x, y] of [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
        ]) {
          const actual = {
            x: area.x + x! * area.width * area.axes!.x.x + y! * area.height * area.axes!.y.x,
            y: area.y + x! * area.width * area.axes!.x.y + y! * area.height * area.axes!.y.y,
          };
          expect(actual.x).toBeCloseTo(origin.x + x! * 220 * c - y! * 200 * s, 6);
          expect(actual.y).toBeCloseTo(origin.y + x! * 220 * s + y! * 200 * c, 6);
        }
        expect(project.clips).toEqual(before.clips);
        expect(project.cursorTrack).toEqual(before.cursorTrack);
        expect(project.motionRegions![0]!.sourceBinding?.clipId).toBe(video.id);
      };
      assertArea((await readNativeVideoProject(page))!);
      await page
        .locator('nav')
        .getByRole('button', { name: label('gallery.videoReview.perspective'), exact: true })
        .click();
      const perspective = page.locator('[data-ui="video-editor.motion.perspective"]');
      await perspective
        .getByRole('switch', { name: label('gallery.videoReview.spatialEnabled'), exact: true })
        .click();
      for (const [key, value] of [
        ['gallery.videoReview.perspectiveY', '20'],
        ['gallery.videoReview.perspectiveStrength', '50'],
      ] as const) {
        const field = perspective.getByRole('textbox', { name: label(key), exact: true });
        await field.fill(value);
        await field.press('Tab');
      }
      await expect
        .poll(async () => (await readNativeVideoProject(page))?.motionRegions![0]!.perspective)
        .toEqual({ enabled: true, rotateX: 0, rotateY: 20, rotateZ: 0, strength: 0.5 });
      const accepted = (await readNativeVideoProject(page))!;
      assertArea(accepted);
      await page.reload();
      await expect(page.locator('[data-preview-stage-canvas]')).toBeVisible();
      const restored = (await readNativeVideoProject(page))!;
      expect(restored).toEqual(accepted);
      assertArea(restored);
      await select();
      await expect(page.locator('polygon[data-preview-stage-area-body="true"]')).toBeVisible();
      const playhead = page.locator('[data-ui="video-editor.timeline.playhead-handle"]');
      await playhead.press('Home');
      for (let frame = 0; frame < Math.round(restored.fps * 0.4); frame++)
        await playhead.press('ArrowRight');
      const boundsSize = Math.max(220 * c + 200 * s, 220 * s + 200 * c);
      const scale = 400 / boundsSize;
      const center = { x: 200 + 10 * c, y: 200 + 10 * s };
      const pan = { x: center.x - boundsSize / 2, y: center.y - boundsSize / 2 };
      const dx = 60 * c + 40 * s,
        dy = 60 * s - 40 * c;
      const tilt = (20 * Math.PI) / 180;
      const denominator = 1 + (0.7 * 0.5 * Math.sin(tilt) * dx) / Math.hypot(320, 320);
      const expected = {
        x: scale * (200 + (Math.cos(tilt) * dx) / denominator - pan.x),
        y: scale * (200 + dy / denominator - pan.y),
      };
      const sample = () =>
        page.locator('[data-preview-stage-canvas]').evaluate((node: HTMLCanvasElement, point) => {
          const scale = Math.min(node.width / 400, node.height / 400);
          return Array.from(
            node
              .getContext('2d')!
              .getImageData(
                Math.round((node.width - 400 * scale) / 2 + point.x * scale),
                Math.round((node.height - 400 * scale) / 2 + point.y * scale),
                1,
                1
              ).data
          );
        }, expected);
      await expect.poll(async () => (await sample())[1]).toBeGreaterThan(240);
      const pixel = await sample();
      expect(pixel[0]).toBeLessThan(8);
      expect(pixel[2]).toBeLessThan(8);
      await page.screenshot({
        path: info.outputPath('saved-rotated-area-perspective.png'),
        fullPage: false,
      });
      const encoded = await encodedNativeVideoSamples(
        page,
        host.origin,
        restored,
        index === 0 ? 'WEBM' : 'MP4',
        [{ time: 0.4, x: Math.round(expected.x), y: Math.round(expected.y), expected: [0, 255, 0] }]
      );
      expect(encoded.width).toBe(400);
      expect(encoded.height).toBe(400);
      expect(encoded.samples[0]!.error).toBeLessThan(12);
      await writeFile(
        info.outputPath('saved-rotated-area-encoded.json'),
        JSON.stringify({ expected, area: restored.motionRegions![0]!.focusArea, encoded }, null, 2)
      );
      expect(errors).toEqual([]);
    } finally {
      host.server.closeAllConnections();
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}
