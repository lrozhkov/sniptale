import { createHash } from 'node:crypto';
import { DEFAULT_WINDOW_HEADER } from '@sniptale/runtime-contracts/window-header';
import {
  parseEffectV1Source,
  resolveEffectV1ControlDefault,
} from '@sniptale/runtime-contracts/effect-v1';
import { readFile, writeFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import {
  createVideoProjectFromRecording,
  createVideoProjectTrack,
} from '../../../../apps/extension/src/features/video/project/factories/creation';
import type {
  VideoProject,
  VideoProjectExportSettings,
} from '../../../../apps/extension/src/features/video/project/types';
import { VideoTrackKind } from '../../../../apps/extension/src/features/video/project/types';
import { assertExportReadyVideoProject } from '../../../../apps/extension/src/features/video/project/validation/root';
import { REVIEW_CLICK_DEFAULT } from '../../../../apps/extension/src/features/video/project/action-feedback/validation';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { seedReviewVideo } from '../support/quick-editor-media-fixture';
import { readNativeVideoProject } from '../support/native-video-project';
import {
  chooseInspectorValue,
  checkInspectorPaintedFont,
  checkInspectorParameterRows,
} from '../support/inspector-utilities';
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

async function acquire(
  page: Page,
  origin: string,
  locale: 'en' | 'ru',
  theme: 'dark' | 'light',
  moving = false,
  decorated = false
) {
  const bytes = await readFile(new URL('../fixtures/review-vp8-opus.webm', import.meta.url));
  const project = createVideoProjectFromRecording({
    recordingId: 'beta-v1-recording',
    filename: 'pointer.webm',
    width: 160,
    height: 90,
    duration: 12,
    mimeType: 'video/webm',
    size: bytes.length,
    hasAudio: false,
    sourceNormalizedActionEvents: [
      {
        id: 'hold',
        kind: 'CLICK',
        time: 1,
        duration: 1,
        point: { x: 0.5, y: 0.5 },
        label: 'Pointer appearance proof',
        preset: 'NONE',
        data: {
          gestureId: 'hold',
          gestureType: moving ? 'drag' : 'hold',
          button: 0,
          downTime: 1,
          upTime: 2,
          downX: moving ? 40 : 80,
          downY: 45,
          upX: moving ? 120 : 80,
          upY: 45,
          maxExcursionCssPx: moving ? 80 : 0,
          pressDuration: 1,
          completion: 'released',
        },
      },
    ],
  });
  project.version = 20;
  project.width = 640;
  project.height = 360;
  project.duration = 4;
  project.actionPresentation = {
    enabled: true,
    clickPreset: 'CLICK_RIPPLE',
    duration: 0.7,
    offset: 0,
    clickSuppressionInterval: 1,
    showKeystrokes: false,
    clickStyle: { color: '#ff0000ff', size: 70, strokeWidth: 4, opacity: 0.5 },
  };
  const base = project.clips.find((clip) => clip.type === 'VIDEO')!;
  const top = createVideoProjectTrack('Second source instance', -1, VideoTrackKind.PRIMARY);
  project.tracks.push(top);
  const transform = { x: 80, y: 45, width: 480, height: 270, rotation: 0, opacity: 1 };
  project.clips = [
    {
      ...base,
      sourceStart: 0.5,
      sourceDuration: 6,
      duration: 3,
      playbackRate: 2,
      transform,
      windowCornerRadius: 0,
      shadowIntensity: 0,
    },
    {
      ...base,
      id: 'copy',
      sourceInstanceId: 'copy',
      trackId: top.id,
      timelineLaneId: top.logicalLanes[0]!.id,
      startTime: 1,
      sourceStart: 0.5,
      sourceDuration: 3,
      duration: 3,
      playbackRate: 1,
      transform: { ...transform },
      windowCornerRadius: 0,
      shadowIntensity: 0,
    },
  ];
  const group = project.actionFeedback![0]!;
  project.actionFeedback!.push({
    ...structuredClone(group),
    sourceInstanceId: 'copy',
    gestureStyles: [
      {
        ...REVIEW_CLICK_DEFAULT,
        id: 'hold',
        effect: 'press',
        color: '#3366ffff',
        radius: 20,
        opacity: 1,
      },
    ],
  });
  project.actionEvents.push(
    ...project.actionEvents.flatMap((event) =>
      event.anchor.kind === 'recording-source'
        ? [
            {
              ...event,
              id: `${event.id}-copy`,
              anchor: { ...event.anchor, sourceInstanceId: 'copy' },
            },
          ]
        : []
    )
  );
  project.cursorTrack = {
    captureMode: 'embedded-fallback',
    skin: {
      animationPreset: 'NONE',
      color: '#fff',
      hidden: true,
      preset: 'ARROW',
      scale: 1,
      shadow: false,
    },
    samples: [1, 2].map((time) => ({
      id: `cursor-${time}`,
      time: (time - 0.5) / 2,
      x: 80,
      y: 45,
      visible: true,
      captureSegment: 0,
      recordingPoint: { x: moving ? (time === 1 ? 0.25 : 0.75) : 0.5, y: 0.5 },
      sourceAnchor: {
        kind: 'recording-source',
        recordingId: 'beta-v1-recording',
        sourceClipId: base.id,
        sourceTime: time,
      },
    })),
  };
  if (decorated) await composeGestureFixture(project);
  assertExportReadyVideoProject(project);
  await applyHarnessBootstrap(page, {
    preserveMediaLibrary: true,
    videoProjects: [project],
    storage: { 'sniptale-locale-preference': locale, 'sniptale-theme-preference': theme },
  });
  await page.addInitScript(
    ({ locale, theme }) => {
      localStorage.setItem('sniptale-locale-preference', locale);
      localStorage.setItem('sniptale-theme-preference', theme);
      if (sessionStorage.getItem('pointer-seeded')) {
        const value: unknown = Reflect.get(window, '__sniptaleHarnessBootstrap');
        if (typeof value === 'object' && value !== null)
          Reflect.deleteProperty(value, 'videoProjects');
      }
    },
    { locale, theme }
  );
  await page.goto(`${origin}${GALLERY_HARNESS_PATH}?theme=${theme}`);
  await page.locator('[data-ui="gallery.page.root"]').waitFor();
  await seedReviewVideo(page, 'review-vp8-opus.webm', { width: 160, height: 90, duration: 12 });
  await page.goto(`${origin}${VIDEO_EDITOR_HARNESS_PATH}?project=${project.id}&theme=${theme}`);
  await expect(page.locator('[data-ui="video-editor.timeline.surface"]')).toBeVisible();
  await page.evaluate(() => sessionStorage.setItem('pointer-seeded', '1'));
  return project;
}

async function seek(page: Page, time: number) {
  const ruler = page.locator('[data-ui="video-editor.timeline.ruler"]');
  const fps = (await readNativeVideoProject(page))!.fps;
  const ticks = await ruler.locator(':scope > div > span').evaluateAll(
    (labels, fps) =>
      labels.map((label) => {
        const match = /^(\d+):(\d+\.\d+|\d+)$/.exec(label.textContent?.trim() ?? '');
        if (!match || !label.parentElement) throw new Error('Missing ruler tick.');
        const seconds = Number(match[1]) * 60 + Number(match[2]);
        return {
          x: label.parentElement.getBoundingClientRect().x,
          time: Math.round(seconds * fps) / fps,
        };
      }),
    fps
  );
  const first = ticks[0]!,
    second = ticks[1]!;
  const pixelsPerSecond = (second.x - first.x) / (second.time - first.time);
  const box = (await ruler.boundingBox())!;
  await ruler.click({
    position: { x: first.x - box.x + (time - first.time) * pixelsPerSecond, y: 8 },
  });
  await expect
    .poll(async () => {
      const text = await page.locator('[data-playback-counter="true"]').textContent();
      const match = /^(\d+):(\d+\.\d+|\d+)/.exec(text?.trim() ?? '');
      if (!match) throw new Error('Missing playback counter.');
      return Math.abs(Number(match[1]) * 60 + Number(match[2]) - time);
    })
    .toBeLessThanOrEqual(1 / fps + 0.001);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      )
  );
}

async function paint(page: Page, color: 'red' | 'green' | 'blue') {
  return page
    .locator('[data-preview-stage-canvas]')
    .evaluate((canvas: HTMLCanvasElement, color) => {
      const context = canvas.getContext('2d')!;
      const scale = canvas.width / 640;
      const cx = 320 * scale,
        cy = 180 * scale,
        half = 60 * scale;
      const image = context.getImageData(0, 0, canvas.width, canvas.height);
      const target =
        color === 'red' ? [255, 0, 0] : color === 'green' ? [0, 255, 0] : [51, 102, 255];
      let left = Infinity,
        top = Infinity,
        right = -Infinity,
        bottom = -Infinity,
        count = 0;
      for (let y = Math.ceil(cy - half); y < cy + half; y++)
        for (let x = Math.ceil(cx - half); x < cx + half; x++) {
          const i = (y * canvas.width + x) * 4;
          if (target.every((value, channel) => Math.abs(image.data[i + channel]! - value) <= 8)) {
            left = Math.min(left, x);
            right = Math.max(right, x);
            top = Math.min(top, y);
            bottom = Math.max(bottom, y);
            count++;
          }
        }
      const centre = (Math.round(cy) * canvas.width + Math.round(cx)) * 4;
      return {
        count,
        left,
        top,
        right,
        bottom,
        scale,
        centre: [...image.data.slice(centre, centre + 3)],
      };
    }, color);
}

for (const [index, viewport] of PRIMARY_BROWSER_VIEWPORTS.entries()) {
  const locale = index === 0 ? 'en' : 'ru';
  const theme = index === 0 ? 'dark' : 'light';
  test(`Native gesture inspector edits the rendered source appearance ${viewport.size.width} ${locale}`, async ({
    page,
  }, info) => {
    test.setTimeout(180000);
    page.setDefaultTimeout(15000);
    await page.setViewportSize({ ...viewport.size });
    await page.emulateMedia({ colorScheme: theme });
    const host = await startHostServer();
    const label = (key: Parameters<typeof translate>[0]) => translate(key, locale);
    const owner = page.locator('[data-ui="video-editor.inspector.history-event"]');
    const category = (key: Parameters<typeof translate>[0]) =>
      owner.locator('nav').getByRole('button', { name: label(key), exact: true });
    const select = async () => {
      await page.locator('[data-ui="video-editor.timeline.history-event"]').first().click();
    };
    const field = (key: Parameters<typeof translate>[0]) =>
      owner.getByRole('textbox', { name: label(key), exact: true });
    const number = async (key: Parameters<typeof translate>[0], value: string) => {
      const input = field(key);
      await input.scrollIntoViewIfNeeded();
      await input.fill(value);
      await input.press('Enter');
    };
    const color = async (value: string) => {
      await owner
        .getByRole('button', { name: label('gallery.videoReview.clickColor'), exact: true })
        .click();
      const input = field('gallery.videoReview.clickColor');
      await input.fill(value);
      await input.press('Enter');
    };
    try {
      const initial = await acquire(page, host.origin, locale, theme);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await select();
      await expect(category('videoEditor.sidebar.historyTransitions')).toHaveCount(0);
      await expect(category('videoEditor.sidebar.inspectorGroupPlacement')).toHaveCount(0);
      await category('gallery.videoReview.clickAppearance').click();
      await expect(field('gallery.videoReview.clickRadius')).toHaveValue('70');
      await checkInspectorPaintedFont(page, field('gallery.videoReview.clickRadius'), 'numeric');
      await number('gallery.videoReview.clickRadius', '12');
      await color('#ff0000ff');
      await expect
        .poll(
          async () => (await readNativeVideoProject(page))?.actionFeedback?.[0]?.gestureStyles?.[0]
        )
        .toMatchObject({ radius: 12, color: '#ff0000ff', opacity: 1, stroke: 4 });
      const accepted = (await readNativeVideoProject(page))!;
      await seek(page, 0.5);
      await expect.poll(async () => (await paint(page, 'red')).count).toBeGreaterThan(50);
      const red = await paint(page, 'red');
      expect(Math.abs((red.right - red.left + 1) / red.scale - 32.4)).toBeLessThan(2);
      expect(Math.abs((red.left + red.right) / 2 / red.scale - 320)).toBeLessThan(2);
      await color('#00ff00ff');
      await number('gallery.videoReview.clickRadius', '24');
      await expect
        .poll(async () => (await paint(page, 'green')).count)
        .toBeGreaterThan(red.count * 3);
      const green = await paint(page, 'green');
      expect(Math.abs((green.right - green.left + 1) / green.scale - 64.8)).toBeLessThan(2);
      await page.locator('[data-ui="video-editor.timeline.toolbar.undo"]').click();
      await expect
        .poll(
          async () =>
            (await readNativeVideoProject(page))?.actionFeedback?.[0]?.gestureStyles?.[0]?.radius
        )
        .toBe(12);
      await page.locator('[data-ui="video-editor.timeline.toolbar.redo"]').click();
      await expect
        .poll(
          async () =>
            (await readNativeVideoProject(page))?.actionFeedback?.[0]?.gestureStyles?.[0]?.radius
        )
        .toBe(24);
      await seek(page, 1.75);
      await expect.poll(async () => (await paint(page, 'blue')).count).toBeGreaterThan(50);
      expect((await paint(page, 'blue')).centre).toEqual([51, 102, 255]);
      await seek(page, 0.9);
      expect((await paint(page, 'green')).count).toBe(0);
      await category('videoEditor.sidebar.historyClickEffects').click();
      await chooseInspectorValue(
        page,
        owner,
        label('gallery.videoReview.gestureAppearance'),
        label('gallery.videoReview.gesture_area')
      );
      const details = owner.locator('details');
      await details.locator('summary').click();
      for (const [key, value] of [
        ['x', '25'],
        ['y', '25'],
        ['width', '50'],
        ['height', '50'],
      ] as const)
        await number(`gallery.videoReview.gestureArea_${key}`, value);
      await category('gallery.videoReview.clickAppearance').click();
      await number('gallery.videoReview.clickStroke', '6');
      await checkInspectorParameterRows(owner);
      await seek(page, 0.5);
      await page.screenshot({ path: info.outputPath('gesture-style.png'), fullPage: false });
      await category('videoEditor.sidebar.historyClickEffects').click();
      const reset = owner.locator('[data-ui="video-editor.gesture.reset"]');
      await expect(reset.locator('svg')).toHaveCount(1);
      const inspector = page.locator('[data-ui="video-editor.floating.context-inspector"]');
      const rail = inspector.locator('[data-ui="video-editor.inspector.categories"] > nav');
      const handle = page.locator('[data-ui="video-editor.floating.context-inspector.resize"]');
      if (index === 0) await page.locator('[data-ui="video-editor.materials.close"]').click();
      for (const width of [359, 360, 361]) {
        const current = (await inspector.boundingBox())!.width;
        const bounds = (await handle.boundingBox())!;
        await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + 12);
        await page.mouse.down();
        await page.mouse.move(bounds.x + bounds.width / 2 + current - width, bounds.y + 12);
        await page.mouse.up();
        await expect
          .poll(async () => Math.round((await inspector.boundingBox())!.width))
          .toBe(width);
        const before = (await rail.boundingBox())!.y;
        await reset.scrollIntoViewIfNeeded();
        const resetBounds = (await reset.boundingBox())!;
        const iconBounds = (await reset.locator('svg').boundingBox())!;
        expect(iconBounds.x).toBeGreaterThanOrEqual(resetBounds.x);
        expect(iconBounds.x + iconBounds.width).toBeLessThanOrEqual(
          resetBounds.x + resetBounds.width
        );
        expect(await reset.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
        expect((await rail.boundingBox())!.y).toBe(before);
        expect(
          await owner.evaluate((node) => {
            const body = node.querySelector('[data-ui="video-editor.inspector.categories"] > div');
            return body instanceof HTMLElement && body.scrollWidth <= body.clientWidth + 1;
          })
        ).toBe(true);
        await page.screenshot({
          path: info.outputPath(`gesture-inspector-${width}.png`),
          fullPage: false,
        });
      }
      const authored = (await readNativeVideoProject(page))!;
      expect(authored.actionEvents).toEqual(initial.actionEvents);
      expect(authored.clips).toEqual(accepted.clips);
      expect(authored.actionFeedback![1]).toEqual(initial.actionFeedback![1]);
      expect(authored.assets).toEqual(initial.assets);
      await page.reload();
      await select();
      await category('videoEditor.sidebar.historyClickEffects').click();
      await expect
        .poll(
          async () =>
            (await readNativeVideoProject(page))?.actionFeedback?.[0]?.gestureStyles?.[0]?.stroke
        )
        .toBe(6);
      await owner.locator('[data-ui="video-editor.gesture.reset"]').click();
      await expect
        .poll(
          async () =>
            (await readNativeVideoProject(page))?.actionFeedback?.[0]?.gestureStyles?.length
        )
        .toBe(0);
      expect((await readNativeVideoProject(page))?.actionFeedback?.[1]).toEqual(
        initial.actionFeedback![1]
      );
      if (index === 0) {
        await page.setViewportSize({ width: 1200, height: 560 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true
        );
      }
      await writeFile(
        info.outputPath('gesture-preview-proof.json'),
        JSON.stringify({ red, green }, null, 2)
      );
    } finally {
      host.server.closeAllConnections();
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}

function measureFrame(canvas: HTMLCanvasElement, tolerance: number) {
  const context = canvas.getContext('2d')!;
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const scale = canvas.width / 640;
  const masks = {} as Record<
    'red' | 'green' | 'blue',
    { count: number; width: number; centreX: number }
  >;
  for (const [name, target] of [
    ['red', [255, 0, 0]],
    ['green', [0, 255, 0]],
    ['blue', [51, 102, 255]],
  ] as const) {
    let count = 0,
      left = Infinity,
      right = -Infinity;
    for (let y = Math.ceil(120 * scale); y < 240 * scale; y++)
      for (let x = Math.ceil(260 * scale); x < 380 * scale; x++) {
        const offset = (y * canvas.width + x) * 4;
        if (
          target.every(
            (value, channel) => Math.abs(image.data[offset + channel]! - value) <= tolerance
          )
        ) {
          count++;
          left = Math.min(left, x);
          right = Math.max(right, x);
        }
      }
    masks[name] = {
      count,
      width: count ? (right - left + 1) / scale : 0,
      centreX: count ? (right + left) / 2 / scale : 0,
    };
  }
  let edgeTop = Infinity,
    edgeBottom = -Infinity,
    edgeCount = 0;
  for (let y = Math.ceil(95 * scale); y < 132 * scale; y++)
    for (let x = Math.ceil(310 * scale); x < 330 * scale; x++) {
      const offset = (y * canvas.width + x) * 4;
      if (
        [0, 255, 255].every(
          (value, channel) => Math.abs(image.data[offset + channel]! - value) <= tolerance
        )
      ) {
        edgeCount++;
        edgeTop = Math.min(edgeTop, y);
        edgeBottom = Math.max(edgeBottom, y);
      }
    }
  let pathTop = Infinity,
    pathBottom = -Infinity,
    pathCount = 0;
  for (let y = Math.ceil(160 * scale); y < 200 * scale; y++)
    for (let x = Math.ceil(250 * scale); x < 270 * scale; x++) {
      const offset = (y * canvas.width + x) * 4;
      if (
        [0, 255, 255].every(
          (value, channel) => Math.abs(image.data[offset + channel]! - value) <= tolerance
        )
      ) {
        pathCount++;
        pathTop = Math.min(pathTop, y);
        pathBottom = Math.max(pathBottom, y);
      }
    }
  const samples = Object.fromEntries(
    (
      [
        ['visible', 320, 120],
        ['outside', 70, 120],
        ['header', 320, 48],
        ['occluded', 380, 120],
      ] as const
    ).map(([name, x, y]) => {
      const offset = (Math.round(y * scale) * canvas.width + Math.round(x * scale)) * 4;
      return [name, [...image.data.slice(offset, offset + 3)]];
    })
  );
  return {
    samples,
    masks,
    path: { count: pathCount, thickness: pathCount ? (pathBottom - pathTop + 1) / scale : 0 },
    edge: { count: edgeCount, thickness: edgeCount ? (edgeBottom - edgeTop + 1) / scale : 0 },
    png: canvas.toDataURL('image/png').split(',')[1]!,
  };
}

async function encodeGesture(
  page: Page,
  project: VideoProject,
  format: 'WEBM' | 'MP4',
  jobId: string,
  times = [0.5, 0.9, 1.75]
) {
  const settings: VideoProjectExportSettings = {
    format,
    fps: 20,
    width: 640,
    height: 360,
    quality: 'MEDIUM',
    resolution: '360P',
    scope: 'project',
    burnInSubtitles: false,
    subtitleSidecarFormats: [],
    downloadAfterExport: false,
    ...(format === 'MP4' ? { mp4VideoCodec: 'VP9' } : { webmVideoCodec: 'VP9' }),
  };
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
      { timeout: 90000 }
    )
    .toBe(true);
  const completed = (
    await getRuntimeMessagesByType(page, VideoMessageType.PROJECT_EXPORT_COMPLETED)
  ).find((message) => message.jobId === jobId)!;
  if (typeof completed.exportId !== 'string') throw new Error('Missing encoded export.');
  const dimensions = await page.evaluate(async (exportId) => {
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
    const video = document.createElement('video');
    video.id = 'gesture-proof-decoder';
    video.muted = true;
    video.hidden = true;
    document.body.append(video);
    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => reject(new Error('Encoded gesture decode failed.'));
      video.src = URL.createObjectURL(file);
    });
    const canvas = document.createElement('canvas');
    canvas.id = 'gesture-proof-frame';
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.hidden = true;
    document.body.append(canvas);
    return {
      width: video.videoWidth,
      height: video.videoHeight,
      duration: video.duration,
      size: file.size,
    };
  }, completed.exportId);
  try {
    const frames = [];
    for (const time of times) {
      await page.evaluate(async (time) => {
        const video = document.querySelector<HTMLVideoElement>('#gesture-proof-decoder')!;
        await new Promise<void>((resolve, reject) => {
          video.onseeked = () => resolve();
          video.onerror = () => reject(new Error('Encoded frame seek failed.'));
          video.currentTime = time;
        });
        const canvas = document.querySelector<HTMLCanvasElement>('#gesture-proof-frame')!;
        canvas.getContext('2d')!.drawImage(video, 0, 0);
      }, time);
      frames.push({
        time,
        ...(await page.locator('#gesture-proof-frame').evaluate(measureFrame, 32)),
      });
    }
    return { ...dimensions, frames };
  } finally {
    await page.evaluate(() => {
      const video = document.querySelector<HTMLVideoElement>('#gesture-proof-decoder');
      if (video) {
        const url = video.src;
        video.removeAttribute('src');
        video.load();
        video.remove();
        URL.revokeObjectURL(url);
      }
      document.querySelector('#gesture-proof-frame')?.remove();
    });
  }
}

for (const format of ['WEBM', 'MP4'] as const) {
  test(`Native authored gesture pixels survive ${format} encode with cut, speed and independent instances`, async ({
    page,
  }, info) => {
    test.setTimeout(480000);
    await page.setViewportSize({ width: 1280, height: 560 });
    const host = await startHostServer();
    const label = (key: Parameters<typeof translate>[0]) => translate(key, 'en');
    try {
      await acquire(page, host.origin, 'en', 'dark', true);
      await page.locator('[data-ui="video-editor.timeline.history-event"]').first().click();
      const owner = page.locator('[data-ui="video-editor.inspector.history-event"]');
      const category = (key: Parameters<typeof translate>[0]) =>
        owner.locator('nav').getByRole('button', { name: label(key), exact: true });
      const number = async (key: Parameters<typeof translate>[0], value: string) => {
        const input = owner.getByRole('textbox', { name: label(key), exact: true });
        await input.fill(value);
        await input.press('Enter');
      };
      const color = async (value: string) => {
        await owner
          .getByRole('button', { name: label('gallery.videoReview.clickColor'), exact: true })
          .click();
        const input = owner.getByRole('textbox', {
          name: label('gallery.videoReview.clickColor'),
          exact: true,
        });
        await input.fill(value);
        await input.press('Enter');
      };
      const authored: {
        name: string;
        project: VideoProject;
        native: ReturnType<typeof measureFrame>;
      }[] = [];
      for (const [name, radius, value] of [
        ['red', '12', '#ff0000ff'],
        ['green', '24', '#00ff00ff'],
      ] as const) {
        await category('gallery.videoReview.clickAppearance').click();
        await number('gallery.videoReview.clickRadius', radius);
        await color(value);
        await expect
          .poll(
            async () =>
              (await readNativeVideoProject(page))?.actionFeedback?.[0]?.gestureStyles?.[0]?.color
          )
          .toBe(value);
        await seek(page, 0.5);
        await expect.poll(async () => (await paint(page, name)).count).toBeGreaterThan(50);
        authored.push({
          name,
          project: (await readNativeVideoProject(page))!,
          native: await page.locator('[data-preview-stage-canvas]').evaluate(measureFrame, 8),
        });
      }
      await category('videoEditor.sidebar.historyClickEffects').click();
      await chooseInspectorValue(
        page,
        owner,
        label('gallery.videoReview.gestureAppearance'),
        label('gallery.videoReview.gesture_area')
      );
      const details = owner.locator('details');
      if (!(await details.evaluate((node) => node.hasAttribute('open'))))
        await details.locator('summary').click();
      for (const [key, value] of [
        ['x', '25'],
        ['y', '25'],
        ['width', '50'],
        ['height', '50'],
      ] as const)
        await number(`gallery.videoReview.gestureArea_${key}`, value);
      await category('gallery.videoReview.clickAppearance').click();
      await color('#00ffffff');
      for (const stroke of [2, 6]) {
        await number('gallery.videoReview.clickStroke', String(stroke));
        await expect
          .poll(
            async () =>
              (await readNativeVideoProject(page))?.actionFeedback?.[0]?.gestureStyles?.[0]?.stroke
          )
          .toBe(stroke);
        await seek(page, 0.5);
        await expect
          .poll(
            async () =>
              (await page.locator('[data-preview-stage-canvas]').evaluate(measureFrame, 8)).edge
                .thickness
          )
          .toBeGreaterThan(stroke * 3 - 2);
        const native = await page.locator('[data-preview-stage-canvas]').evaluate(measureFrame, 8);
        expect(Math.abs(native.edge.thickness - stroke * 3)).toBeLessThanOrEqual(2);
        authored.push({
          name: `area-${stroke}`,
          project: (await readNativeVideoProject(page))!,
          native,
        });
      }
      await category('videoEditor.sidebar.historyClickEffects').click();
      await chooseInspectorValue(
        page,
        owner,
        label('gallery.videoReview.gestureAppearance'),
        label('gallery.videoReview.gesture_path')
      );
      await category('gallery.videoReview.clickAppearance').click();
      await number('gallery.videoReview.clickRadius', '2');
      await seek(page, 0.5);
      await expect
        .poll(
          async () =>
            (await page.locator('[data-preview-stage-canvas]').evaluate(measureFrame, 8)).path
              .thickness
        )
        .toBeGreaterThan(16);
      const pathNative = await page
        .locator('[data-preview-stage-canvas]')
        .evaluate(measureFrame, 8);
      expect(Math.abs(pathNative.path.thickness - 18)).toBeLessThanOrEqual(2);
      await expect
        .poll(
          async () => (await readNativeVideoProject(page))?.actionFeedback?.[0]?.gestureStyles?.[0]
        )
        .toMatchObject({ gestureAppearance: 'path', radius: 2, stroke: 6, color: '#00ffffff' });
      authored.push({
        name: 'path-6',
        project: (await readNativeVideoProject(page))!,
        native: pathNative,
      });
      await page.goto(`${host.origin}${OFFSCREEN_HARNESS_PATH}`);
      await page.locator('[data-ui="offscreen.harness.root"][data-state="ready"]').waitFor();
      const proof = [];
      for (const state of authored) {
        const result = await encodeGesture(
          page,
          state.project,
          format,
          `gesture-${format}-${state.name}`
        );
        await writeFile(
          info.outputPath(`${state.name}-metrics.json`),
          JSON.stringify(
            {
              native: {
                masks: state.native.masks,
                edge: state.native.edge,
                path: state.native.path,
              },
              frames: result.frames.map(({ png: _png, ...frame }) => frame),
            },
            null,
            2
          )
        );
        for (const frame of result.frames)
          await writeFile(
            info.outputPath(`${state.name}-${frame.time}.png`),
            Buffer.from(frame.png, 'base64')
          );
        expect(result.width).toBe(640);
        expect(result.height).toBe(360);
        expect(result.size).toBeGreaterThan(1000);
        const first = result.frames[0]!,
          outside = result.frames[1]!,
          second = result.frames[2]!;
        if (state.name === 'red' || state.name === 'green') {
          const mask = first.masks[state.name];
          expect(mask.count).toBeGreaterThan(50);
          expect(Math.abs(mask.width - (state.name === 'red' ? 32.4 : 64.8))).toBeLessThanOrEqual(
            4
          );
          expect(Math.abs(mask.centreX - 320)).toBeLessThanOrEqual(4);
          expect(outside.masks[state.name].count).toBe(0);
        } else if (state.name === 'path-6') {
          expect(first.path.count).toBeGreaterThan(30);
          expect(Math.abs(first.path.thickness - 18)).toBeLessThanOrEqual(4);
          expect(outside.path.count).toBe(0);
        } else {
          expect(first.edge.count).toBeGreaterThan(30);
          expect(
            Math.abs(first.edge.thickness - (state.name === 'area-2' ? 6 : 18))
          ).toBeLessThanOrEqual(4);
          expect(outside.edge.count).toBe(0);
        }
        expect(second.masks.blue.count).toBeGreaterThan(50);
        proof.push({
          name: state.name,
          native: { masks: state.native.masks, edge: state.native.edge, path: state.native.path },
          ...result,
          frames: result.frames.map(({ png: _png, ...frame }) => frame),
        });
      }
      await writeFile(
        info.outputPath('encoded-gesture-proof.json'),
        JSON.stringify(proof, null, 2)
      );
    } finally {
      host.server.closeAllConnections();
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}

async function composeGestureFixture(project: VideoProject) {
  const main = project.clips.find((clip) => clip.type === 'VIDEO')!;
  if (main.type !== 'VIDEO') throw new Error('Missing gesture video.');
  main.fitMode = 'STRETCH';
  main.sourceCrop = { x: 0.25, y: 0, width: 0.5, height: 1 };
  main.windowHeader = {
    ...DEFAULT_WINDOW_HEADER,
    kind: 'application',
    title: 'Gesture composition',
  };
  const copy = project.clips.find((clip) => clip.id === 'copy')!;
  if (copy.type !== 'VIDEO') throw new Error('Missing upper gesture video.');
  copy.fitMode = 'STRETCH';
  copy.startTime = 0;
  copy.duration = 4;
  copy.sourceDuration = 4;
  copy.transform = { ...copy.transform, x: 360, y: 100, width: 80, height: 100 };
  const trailing = {
    ...structuredClone(main),
    id: 'gesture-trailing',
    startTime: 2.6,
    duration: 1.4,
    sourceStart: 1,
    sourceDuration: 2.8,
  };
  main.transitionOut = 'CROSSFADE';
  main.timelineLaneId = null;
  trailing.transitionIn = 'CROSSFADE';
  trailing.timelineLaneId = null;
  project.clips.push(trailing);
  project.transitions = [
    {
      id: 'gesture-crossfade',
      leadingClipId: main.id,
      trailingClipId: trailing.id,
      kind: 'CROSSFADE',
      duration: 0.4,
      easing: 'LINEAR',
    },
  ];
  project.actionFeedback![0]!.gestureStyles = [
    {
      ...REVIEW_CLICK_DEFAULT,
      id: 'hold',
      effect: 'off',
      color: '#00ffffff',
      radius: 2,
      opacity: 1,
      stroke: 6,
      gestureAppearance: 'area',
      gestureArea: { x: 0, y: 0.25, width: 1, height: 0.5 },
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
    if (!document) throw new Error('Invalid gesture EffectV1 fixture.');
    const sha256 = createHash('sha256').update(source).digest('hex');
    const snapshotId = `effect:${sha256}`;
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
    const duration = effect.kind === 'transition' ? 0.4 : 4;
    project.effectInstances.push({
      id: effect.filename,
      kind: effect.kind,
      target:
        effect.kind === 'transition'
          ? { kind: 'transition', transitionId: 'gesture-crossfade' }
          : { kind: 'clip', clipId: copy.id },
      snapshotId,
      controls: Object.fromEntries(
        document.controls.map((control) => [
          control.id,
          resolveEffectV1ControlDefault(control, 'en'),
        ])
      ),
      ...(effect.kind === 'transition' ? {} : { rangeMode: 'owner' as const }),
      enabled: true,
      startTime: effect.kind === 'transition' ? 2.6 : 0,
      duration,
      playbackRate: document.duration / duration,
    });
  }
}

for (const format of ['WEBM', 'MP4'] as const) {
  test(`Native gesture composition retains crop, header, EffectV1 and crossfade in ${format}`, async ({
    page,
  }, info) => {
    test.setTimeout(360000);
    await page.setViewportSize({ width: 1280, height: 560 });
    const host = await startHostServer();
    const times = [0.5, 0.9, 2.8];
    const label = (key: Parameters<typeof translate>[0]) => translate(key, 'en');
    try {
      const initial = await acquire(page, host.origin, 'en', 'dark', false, true);
      await page.locator('[data-ui="video-editor.timeline.history-event"]').first().click();
      const owner = page.locator('[data-ui="video-editor.inspector.history-event"]');
      await owner
        .locator('nav')
        .getByRole('button', {
          name: label('videoEditor.sidebar.historyClickEffects'),
          exact: true,
        })
        .click();
      const display = owner.getByRole('switch', {
        name: label('gallery.videoReview.gestureFeedback'),
        exact: true,
      });
      await expect(display).toHaveAttribute('aria-checked', 'false');
      const states = [];
      for (const enabled of [false, true]) {
        if (enabled) await display.click();
        await expect
          .poll(
            async () =>
              (await readNativeVideoProject(page))?.actionFeedback?.[0]?.gestureStyles?.[0]?.effect
          )
          .toBe(enabled ? 'press' : 'off');
        const frames = [];
        for (const time of times) {
          await seek(page, time);
          if (enabled && time === 0.5)
            await expect
              .poll(async () => {
                const sample = (
                  await page.locator('[data-preview-stage-canvas]').evaluate(measureFrame, 8)
                ).samples['visible']!;
                return Math.max(
                  ...sample.map((value, channel) => Math.abs(value - [0, 255, 255][channel]!))
                );
              })
              .toBeLessThanOrEqual(8);
          let previous = '',
            stable = 0;
          await expect
            .poll(async () => {
              const metrics = await page
                .locator('[data-preview-stage-canvas]')
                .evaluate(measureFrame, 8);
              const current = JSON.stringify(metrics.samples);
              stable = current === previous ? stable + 1 : 0;
              previous = current;
              return stable;
            })
            .toBeGreaterThanOrEqual(2);
          frames.push({
            time,
            ...(await page.locator('[data-preview-stage-canvas]').evaluate(measureFrame, 8)),
          });
        }
        states.push({ enabled, project: (await readNativeVideoProject(page))!, frames });
      }
      const difference = (left: readonly number[], right: readonly number[]) =>
        Math.max(...left.map((value, index) => Math.abs(value - right[index]!)));
      const verify = (
        off: (typeof states)[number]['frames'],
        on: typeof off,
        tolerance: number
      ) => {
        expect(difference(on[0]!.samples['visible']!, [0, 255, 255])).toBeLessThanOrEqual(
          tolerance
        );
        for (let index = 0; index < times.length; index++)
          for (const key of ['outside', 'header', 'occluded'])
            expect(
              difference(on[index]!.samples[key]!, off[index]!.samples[key]!)
            ).toBeLessThanOrEqual(tolerance);
        expect(
          difference(on[1]!.samples['visible']!, off[1]!.samples['visible']!)
        ).toBeLessThanOrEqual(tolerance);
        const midpoint = difference(on[2]!.samples['visible']!, off[2]!.samples['visible']!);
        expect(midpoint).toBeGreaterThan(35);
        expect(midpoint).toBeLessThanOrEqual(127.5 + tolerance);
      };
      await writeFile(
        info.outputPath('native-composition-diagnostic.json'),
        JSON.stringify(
          states.map((state) => ({
            enabled: state.enabled,
            frames: state.frames.map(({ png: _png, ...frame }) => frame),
          })),
          null,
          2
        )
      );
      for (const state of states)
        for (const frame of state.frames)
          await writeFile(
            info.outputPath(`native-composition-${state.enabled}-${frame.time}.png`),
            Buffer.from(frame.png, 'base64')
          );
      verify(states[0]!.frames, states[1]!.frames, 8);
      expect(states[1]!.project.clips).toEqual(initial.clips);
      expect(states[1]!.project.actionEvents).toEqual(initial.actionEvents);
      expect(states[1]!.project.effectInstances).toEqual(initial.effectInstances);
      await page.goto(`${host.origin}${OFFSCREEN_HARNESS_PATH}`);
      await page.locator('[data-ui="offscreen.harness.root"][data-state="ready"]').waitFor();
      const results = [];
      for (const state of states)
        results.push(
          await encodeGesture(
            page,
            state.project,
            format,
            `composition-${format}-${state.enabled}`,
            times
          )
        );
      verify(results[0]!.frames, results[1]!.frames, 32);
      for (const [index, result] of results.entries())
        for (const [frameIndex, frame] of result.frames.entries()) {
          for (const key of ['visible', 'outside', 'header', 'occluded'])
            expect(
              difference(frame.samples[key]!, states[index]!.frames[frameIndex]!.samples[key]!)
            ).toBeLessThanOrEqual(32);
          await writeFile(
            info.outputPath(`composition-${index}-${frame.time}.png`),
            Buffer.from(frame.png, 'base64')
          );
        }
      await writeFile(
        info.outputPath('composition-gesture-proof.json'),
        JSON.stringify(
          {
            times,
            native: states.map((state) => ({
              enabled: state.enabled,
              frames: state.frames.map(({ png: _png, ...frame }) => frame),
            })),
            encoded: results.map((result) => ({
              ...result,
              frames: result.frames.map(({ png: _png, ...frame }) => frame),
            })),
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
}
