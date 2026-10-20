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
  VideoProjectExportSettings,
  VideoProject,
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
  configure?: (project: VideoProject) => void | Promise<void>
) {
  const bytes = await readFile(new URL('../fixtures/review-vp8-opus.webm', import.meta.url));
  const project = createVideoProjectFromRecording({
    recordingId: 'beta-v1-recording',
    filename: 'click.webm',
    width: 160,
    height: 90,
    duration: 12,
    mimeType: 'video/webm',
    size: bytes.length,
    hasAudio: false,
    sourceNormalizedActionEvents: [
      {
        id: 'click',
        kind: 'CLICK',
        time: 1,
        duration: 1,
        point: { x: 0.5, y: 0.5 },
        label: 'Click feedback proof',
        preset: 'NONE',
        data: {},
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
        id: 'click',
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
      recordingPoint: { x: 0.5, y: 0.5 },
      sourceAnchor: {
        kind: 'recording-source',
        recordingId: 'beta-v1-recording',
        sourceClipId: base.id,
        sourceTime: time,
      },
    })),
  };
  await configure?.(project);
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
  const current = (await readNativeVideoProject(page))!;
  const sourceTimes = current.clips.flatMap((clip) =>
    clip.type === 'VIDEO' && time >= clip.startTime && time < clip.startTime + clip.duration
      ? [clip.sourceStart + (time - clip.startTime) * (clip.playbackRate ?? 1)]
      : []
  );
  await expect
    .poll(() =>
      page
        .locator('video')
        .evaluateAll(
          (videos, times) =>
            times.every((target) =>
              videos.some(
                (video) =>
                  video.readyState >= 2 &&
                  !video.seeking &&
                  Math.abs(video.currentTime - target) <= 0.05
              )
            ),
          sourceTimes
        )
    )
    .toBe(true);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      )
  );
}

for (const [index, viewport] of PRIMARY_BROWSER_VIEWPORTS.entries()) {
  const locale = index === 0 ? 'en' : 'ru';
  const theme = index === 0 ? 'dark' : 'light';
  test(`Native click inspector uses shared controls ${viewport.size.width} ${locale}`, async ({
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
    const field = (key: Parameters<typeof translate>[0]) =>
      owner.getByRole('textbox', { name: label(key), exact: true });
    const number = async (key: Parameters<typeof translate>[0], value: string) => {
      await field(key).scrollIntoViewIfNeeded();
      await field(key).fill(value);
      await field(key).press('Enter');
    };
    const effect = async (value: 'off' | 'ripple' | 'press' | 'glow' | 'magnify') => {
      await category('videoEditor.sidebar.historyClickEffects').click();
      await chooseInspectorValue(
        page,
        owner,
        label('gallery.videoReview.clickEffect'),
        label(`gallery.videoReview.click_${value}`)
      );
    };
    try {
      const initial = await acquire(page, host.origin, locale, theme);
      await page.locator('[data-ui="video-editor.timeline.history-event"]').first().click();
      await expect(category('gallery.videoReview.clickTiming')).toHaveCount(0);
      await effect('ripple');
      await category('gallery.videoReview.clickAppearance').click();
      await number('gallery.videoReview.clickRadius', '24');
      await number('gallery.videoReview.clickStroke', '4');
      await checkInspectorPaintedFont(page, field('gallery.videoReview.clickRadius'), 'numeric');
      await checkInspectorParameterRows(owner);
      await category('gallery.videoReview.clickTiming').click();
      await number('gallery.videoReview.clickBefore', '200');
      await number('gallery.videoReview.clickAfter', '600');
      await number('gallery.videoReview.clickOffset', '100');
      await number('gallery.videoReview.clickPulses', '2');
      await category('gallery.videoReview.clickPosition').click();
      await number('gallery.videoReview.clickX', '10');
      await number('gallery.videoReview.clickY', '-5');
      await expect
        .poll(
          async () => (await readNativeVideoProject(page))?.actionFeedback?.[0]?.gestureStyles?.[0]
        )
        .toMatchObject({
          effect: 'ripple',
          before: 0.2,
          after: 0.6,
          offset: 0.1,
          pulses: 2,
          x: 0.1,
          y: -0.05,
        });
      await seek(page, 0.5);
      await expect(
        owner.getByRole('button', {
          name: label('videoEditor.sidebar.selectPointOnStage'),
          exact: true,
        })
      ).toBeEnabled();
      for (const value of ['press', 'glow', 'magnify'] as const) {
        await effect(value);
        await category('gallery.videoReview.clickAppearance').click();
        if (value === 'magnify') {
          await expect(
            owner.getByRole('group', {
              name: label('gallery.videoReview.clickLensShape'),
              exact: true,
            })
          ).toBeVisible();
          await chooseInspectorValue(
            page,
            owner,
            label('gallery.videoReview.clickLensShape'),
            label('gallery.videoReview.clickLens_rounded')
          );
          await number('gallery.videoReview.clickLensShadow', '35');
          await owner
            .getByRole('button', {
              name: label('gallery.videoReview.clickLensBorder'),
              exact: true,
            })
            .click();
          const color = field('gallery.videoReview.clickLensBorder');
          await color.fill('#12345680');
          await color.press('Enter');
          await number('gallery.videoReview.clickMagnification', '2');
        }
        await checkInspectorParameterRows(owner);
        await page.screenshot({ path: info.outputPath(`click-${value}.png`), fullPage: false });
      }
      await page.locator('[data-ui="video-editor.timeline.toolbar.undo"]').click();
      await expect
        .poll(
          async () =>
            (await readNativeVideoProject(page))?.actionFeedback?.[0]?.gestureStyles?.[0]
              ?.magnification
        )
        .not.toBe(2);
      await page.locator('[data-ui="video-editor.timeline.toolbar.redo"]').click();
      await expect
        .poll(
          async () =>
            (await readNativeVideoProject(page))?.actionFeedback?.[0]?.gestureStyles?.[0]
              ?.magnification
        )
        .toBe(2);
      await expect
        .poll(
          async () => (await readNativeVideoProject(page))?.actionFeedback?.[0]?.gestureStyles?.[0]
        )
        .toMatchObject({
          lensShape: 'rounded',
          lensShadow: 35,
          color: '#12345680',
          opacity: 1,
          magnification: 2,
        });
      const saved = (await readNativeVideoProject(page))!;
      await effect('off');
      await expect(category('gallery.videoReview.clickTiming')).toHaveCount(0);
      await expect(category('gallery.videoReview.clickPosition')).toHaveCount(0);
      await effect('magnify');
      await expect
        .poll(
          async () =>
            (await readNativeVideoProject(page))?.actionFeedback?.[0]?.gestureStyles?.[0]
              ?.magnification
        )
        .toBe(2);
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
        const railY = (await rail.boundingBox())!.y;
        for (const key of [
          'gallery.videoReview.clickAppearance',
          'gallery.videoReview.clickTiming',
          'gallery.videoReview.clickPosition',
        ] as const) {
          await category(key).click();
          await checkInspectorParameterRows(owner);
          if (key === 'gallery.videoReview.clickAppearance')
            await expect(
              owner.getByRole('group', {
                name: label('gallery.videoReview.clickLensShape'),
                exact: true,
              })
            ).toBeVisible();
          expect((await rail.boundingBox())!.y).toBe(railY);
          expect(
            await owner.evaluate((node) => {
              const body = node.querySelector(
                '[data-ui="video-editor.inspector.categories"] > div'
              );
              return body instanceof HTMLElement && body.scrollWidth <= body.clientWidth + 1;
            })
          ).toBe(true);
          await page.screenshot({
            path: info.outputPath(`click-${key.split('.').at(-1)}-${width}.png`),
            fullPage: false,
          });
        }
      }
      expect((await readNativeVideoProject(page))!.actionEvents).toEqual(initial.actionEvents);
      expect((await readNativeVideoProject(page))!.actionFeedback![1]).toEqual(
        initial.actionFeedback![1]
      );
      await page.reload();
      await page.locator('[data-ui="video-editor.timeline.history-event"]').first().click();
      await expect
        .poll(async () => (await readNativeVideoProject(page))?.actionFeedback?.[0]?.gestureStyles)
        .toEqual(saved.actionFeedback![0]!.gestureStyles);
      await category('videoEditor.sidebar.historyClickEffects').click();
      const reset = owner.locator('[data-ui="video-editor.click.reset"]');
      await expect(reset.locator('svg')).toHaveCount(1);
      await reset.click();
      await expect
        .poll(
          async () =>
            (await readNativeVideoProject(page))?.actionFeedback?.[0]?.gestureStyles?.length
        )
        .toBe(0);
      if (index === 0) {
        await page.setViewportSize({ width: 1200, height: 560 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true
        );
      }
      await writeFile(
        info.outputPath('click-authored-proof.json'),
        JSON.stringify(saved.actionFeedback, null, 2)
      );
    } finally {
      host.server.closeAllConnections();
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}

test('Native click point and history drags preserve source facts and support refusal and cancellation', async ({
  page,
}, info) => {
  test.setTimeout(180000);
  await page.setViewportSize({ width: 1920, height: 900 });
  const host = await startHostServer();
  try {
    const initial = await acquire(page, host.origin, 'en', 'dark');
    const event = page.locator('[data-ui="video-editor.timeline.history-event"]').first();
    await event.click();
    await seek(page, 0.5);
    const handle = page.locator('[data-preview-stage-point-handle]');
    await expect(handle).toBeVisible();
    const box = (await handle.boundingBox())!;
    const canvas = (await page.locator('[data-preview-stage-canvas]').boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      box.x + box.width / 2 + canvas.width * 0.075,
      box.y + box.height / 2 - canvas.height * 0.075
    );
    await page.mouse.up();
    const style = async () =>
      (await readNativeVideoProject(page))?.actionFeedback?.[0]?.gestureStyles?.[0] ??
      REVIEW_CLICK_DEFAULT;
    await expect.poll(async () => (await style()).x).toBeCloseTo(0.1, 2);
    await expect.poll(async () => (await style()).y).toBeCloseTo(-0.1, 2);
    expect((await style()).effect).toBe('off');
    expect((await readNativeVideoProject(page))!.actionEvents).toEqual(initial.actionEvents);
    const selected = (await readNativeVideoProject(page))!;
    const ruler = page.locator('[data-ui="video-editor.timeline.ruler"]');
    const ticks = await ruler.locator(':scope > div > span').evaluateAll((labels) =>
      labels.slice(0, 2).map((node) => ({
        x: node.parentElement!.getBoundingClientRect().x,
        value: node.textContent!.trim(),
      }))
    );
    const seconds = (value: string) => {
      const parts = value.split(':');
      return Number(parts[0]) * 60 + Number(parts[1]);
    };
    const rate =
      (ticks[1]!.x - ticks[0]!.x) / (seconds(ticks[1]!.value) - seconds(ticks[0]!.value));
    const drag = async (cancel: boolean) => {
      const marker = (await event.boundingBox())!;
      await page.mouse.move(marker.x + 8, marker.y + marker.height / 2);
      await page.mouse.down();
      await page.mouse.move(marker.x + 8 + rate * 0.2, marker.y + marker.height / 2);
      if (cancel) await page.keyboard.press('Escape');
      await page.mouse.up();
    };
    await drag(true);
    expect((await readNativeVideoProject(page))!.actionFeedback).toEqual(selected.actionFeedback);
    await drag(false);
    await expect.poll(async () => (await style()).offset).toBeCloseTo(0.2, 1);
    expect((await readNativeVideoProject(page))!.actionEvents).toEqual(initial.actionEvents);
    await page.locator('[data-ui="video-editor.timeline.toolbar.undo"]').click();
    await expect.poll(async () => (await style()).offset).toBe(0);
    await page.locator('[data-ui="video-editor.timeline.toolbar.redo"]').click();
    await expect.poll(async () => (await style()).offset).toBeCloseTo(0.2, 1);
    const lock = page
      .locator('[data-ui="timeline.utility-lane-state"]')
      .filter({ has: page.locator('svg.lucide-unlock') })
      .first();
    await lock.click();
    await expect
      .poll(async () => (await readNativeVideoProject(page))?.utilityLanes?.actions.locked)
      .toBe(true);
    const locked = (await readNativeVideoProject(page))!;
    const lockedMarker = (await event.boundingBox())!;
    await drag(false);
    const currentHandle = (await handle.boundingBox())!;
    await page.mouse.move(currentHandle.x + 10, currentHandle.y + 10);
    await page.mouse.down();
    await page.mouse.move(currentHandle.x + 40, currentHandle.y + 10);
    await page.mouse.up();
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        )
    );
    const afterHandle = (await handle.boundingBox())!,
      afterMarker = (await event.boundingBox())!;
    expect(Math.abs(afterHandle.x - currentHandle.x)).toBeLessThanOrEqual(0.1);
    expect(Math.abs(afterHandle.y - currentHandle.y)).toBeLessThanOrEqual(0.1);
    expect(Math.abs(afterMarker.x - lockedMarker.x)).toBeLessThanOrEqual(0.1);
    expect((await readNativeVideoProject(page))!.actionFeedback).toEqual(locked.actionFeedback);
    await writeFile(
      info.outputPath('point-history-interaction.json'),
      JSON.stringify(
        {
          before: initial.actionEvents,
          after: (await readNativeVideoProject(page))!.actionEvents,
          style: await style(),
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

function captureClickRaster(source: HTMLCanvasElement) {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 360;
  const context = canvas.getContext('2d')!;
  context.drawImage(source, 0, 0, 640, 360);
  return { png: canvas.toDataURL('image/png').split(',')[1]! };
}

async function encodeClicks(
  page: Page,
  project: VideoProject,
  format: 'WEBM' | 'MP4',
  jobId: string,
  times = [0.2, 0.8, 1.75]
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
        ...(await page.locator('#gesture-proof-frame').evaluate(captureClickRaster)),
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

async function compareClickPixels(
  page: Page,
  original: string,
  current: string,
  effect: 'ripple' | 'press' | 'glow' | 'magnify' | 'unchanged',
  time: number,
  mode: 'single' | 'double-pulse' | 'overlap' | 'decorated' = 'single'
) {
  const source = (
    await readFile(new URL('../fixtures/review-vp8-opus.webm', import.meta.url))
  ).toString('base64');
  return page.evaluate(
    async ({ original, current, effect, time, source, mode }) => {
      const decode = async (png: string) => {
        const image = new Image();
        image.src = `data:image/png;base64,${png}`;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = 640;
        canvas.height = 360;
        const context = canvas.getContext('2d')!;
        context.drawImage(image, 0, 0);
        return context;
      };
      const base = await decode(original),
        actual = await decode(current);
      const sample = (context: CanvasRenderingContext2D, x: number, y: number) => {
        const bytes = context.getImageData(Math.round(x) - 1, Math.round(y) - 1, 3, 3).data;
        return [0, 1, 2].map((channel) => {
          let sum = 0;
          for (let index = channel; index < bytes.length; index += 4) sum += bytes[index]!;
          return sum / 9;
        });
      };
      const error = (left: number[], right: number[]) =>
        left.reduce((sum, value, i) => sum + Math.abs(value - right[i]!), 0) / 3;
      if (effect === 'unchanged') {
        const errors = [];
        for (let y = 55; y < 305; y += 10)
          for (let x = 90; x < 550; x += 10)
            errors.push(error(sample(base, x, y), sample(actual, x, y)));
        return {
          informative: 0,
          error: errors.reduce((sum, value) => sum + value, 0) / errors.length,
          samples: [],
        };
      }
      const before = time < 0.4;
      const strength = before ? (time - 0.2) / 0.2 : 1 - (time - 0.4) / 0.8;
      // Samples use analytic source coordinates and a separately decoded original video.
      if (effect === 'magnify') {
        const video = document.createElement('video');
        video.muted = true;
        const sourceUrl = URL.createObjectURL(
          new Blob([Uint8Array.from(atob(source), (character) => character.charCodeAt(0))], {
            type: 'video/webm',
          })
        );
        await new Promise<void>((resolve, reject) => {
          video.onloadeddata = () => resolve();
          video.onerror = () => reject(new Error('Original source decode failed'));
          video.src = sourceUrl;
        });
        await new Promise<void>((resolve) => {
          video.onseeked = () => resolve();
          video.currentTime = 0.525 + 2 * time;
        });
        const scale = 1 + strength;
        const oracle = document.createElement('canvas');
        oracle.width = 3;
        oracle.height = 3;
        const context = oracle.getContext('2d')!;
        const sourceSample = (sx: number, sy: number, zoom: number, zoomY = zoom) => {
          context.clearRect(0, 0, 3, 3);
          context.drawImage(
            video,
            sx - 1.5 / zoom,
            sy - 1.5 / zoomY,
            3 / zoom,
            3 / zoomY,
            0,
            0,
            3,
            3
          );
          const data = context.getImageData(0, 0, 3, 3).data;
          return [0, 1, 2].map((channel) => {
            let sum = 0;
            for (let i = channel; i < data.length; i += 4) sum += data[i]!;
            return sum / 9;
          });
        };
        const candidates = [];
        for (const dx of [-90, -60, -30, 30, 60, 90])
          for (const dy of [-60, -30, 0, 30, 60]) {
            const decorated = mode === 'decorated';
            const x = 320 + dx,
              y = (decorated ? 184.5 : 180) + dy;
            if (decorated && x >= 360 && x < 440 && y >= 100 && y < 200) continue;
            const fitX = decorated ? 6 : 3,
              fitY = decorated ? 2.9 : 3;
            // getImageData samples pixel centres after the requested coordinates are rounded.
            const pixelDx = Math.round(x) + 0.5 - 320;
            const pixelDy = Math.round(y) + 0.5 - (decorated ? 184.5 : 180);
            const sx = 80 + pixelDx / (fitX * scale),
              sy = 45 + pixelDy / (fitY * scale);
            const expected = sourceSample(sx, sy, fitX * scale, fitY * scale);
            const doubleMapped = sourceSample(
              (272 + (320 + pixelDx / scale - 272) / scale - 80) / 3,
              45 + pixelDy / (3 * scale * scale),
              3 * scale * scale
            );
            const unchanged = sample(base, x, y),
              received = sample(actual, x, y);
            candidates.push({
              x,
              y,
              expected,
              received,
              signal: error(expected, unchanged),
              doubleSignal: error(expected, doubleMapped),
              error: error(expected, received),
            });
          }
        video.removeAttribute('src');
        video.load();
        URL.revokeObjectURL(sourceUrl);
        const informative = candidates.filter(
          (item) => item.signal >= 25 && (mode !== 'overlap' || item.doubleSignal >= 25)
        );
        return {
          informative: informative.length,
          error:
            informative.reduce((sum, item) => sum + item.error, 0) /
            Math.max(1, informative.length),
          samples: informative,
        };
      }
      const progress = before
        ? (time - 0.2) / 0.2
        : (((time - 0.4) / 0.8) * (mode === 'double-pulse' ? 2 : 1)) % 1;
      const opacity = before ? progress : 1 - progress;
      const radius =
        40 *
        3 *
        (before
          ? 0.2 + 0.1 * progress
          : effect === 'ripple'
            ? 0.3 + 0.7 * progress
            : 0.3 + 0.2 * Math.sin(progress * Math.PI));
      const probes =
        effect === 'ripple'
          ? [
              [320, 180 - radius],
              [320 - radius, 180],
              [320, 180],
              [320 + radius * 0.2, 180],
            ]
          : effect === 'glow'
            ? [
                [325, 180],
                [320 + radius * 0.75, 180],
              ]
            : [
                [320, 180],
                [320 + radius * 0.3, 180],
              ];
      const samples = probes.map(([x, y]) => {
        const background = sample(base, x!, y!),
          received = sample(actual, x!, y!);
        const distance = Math.hypot(x! - 320, y! - 180);
        const alpha =
          effect === 'ripple'
            ? distance > radius - 5
              ? opacity
              : 0
            : effect === 'glow'
              ? opacity * Math.max(0, 1 - distance / radius)
              : opacity;
        const expected = background.map(
          (value, i) => value * (1 - alpha) + (i === 0 ? 255 : 0) * alpha
        );
        return {
          x,
          y,
          expected,
          received,
          error: error(expected, received),
          delta: error(background, received),
          alpha,
        };
      });
      return {
        informative: samples.filter((item) => item.alpha > 0 && item.delta > 10).length,
        error: samples.reduce((sum, item) => sum + item.error, 0) / samples.length,
        samples,
      };
    },
    { original, current, effect, time, source, mode }
  );
}

for (const format of ['WEBM', 'MP4'] as const) {
  test(`Native ordinary click pixels survive ${format} encode`, async ({ page }, info) => {
    test.setTimeout(240000);
    await page.setViewportSize({ width: 1920, height: 900 });
    const host = await startHostServer();
    try {
      await acquire(page, host.origin, 'en', 'dark', (project) => {
        // Keep 20 fps output samples inside the fixture's 100 ms source frames.
        for (const clip of project.clips) if (clip.type === 'VIDEO') clip.sourceStart += 0.025;
        for (const event of project.actionEvents)
          if (event.anchor.kind === 'recording-source') event.anchor.sourceTime += 0.025;
        for (const sample of project.cursorTrack?.samples ?? [])
          if (sample.sourceAnchor) sample.sourceAnchor.sourceTime += 0.025;
        project.actionFeedback![0]!.gestureStyles = [
          {
            ...REVIEW_CLICK_DEFAULT,
            id: 'click',
            effect: 'off',
            before: 0.2,
            after: 0.8,
            offset: 0.15,
            radius: 40,
            stroke: 6,
            color: '#ff0000ff',
            opacity: 1,
            pulses: 1,
            easing: 'linear',
            magnification: 2,
            lensShadow: 0,
          },
        ];
      });
      await page.locator('[data-ui="video-editor.timeline.history-event"]').first().click();
      const owner = page.locator('[data-ui="video-editor.inspector.history-event"]');
      const times = [0.3, 0.8, 1.75];
      const states: {
        effect: 'off' | 'ripple' | 'press' | 'glow' | 'magnify';
        project: VideoProject;
        frames: { time: number; png: string }[];
      }[] = [];
      for (const effect of ['off', 'ripple', 'press', 'glow', 'magnify'] as const) {
        await owner
          .locator('nav')
          .getByRole('button', {
            name: translate('videoEditor.sidebar.historyClickEffects', 'en'),
            exact: true,
          })
          .click();
        await chooseInspectorValue(
          page,
          owner,
          translate('gallery.videoReview.clickEffect', 'en'),
          translate(`gallery.videoReview.click_${effect}`, 'en')
        );
        if (effect === 'magnify') {
          await owner
            .locator('nav')
            .getByRole('button', {
              name: translate('gallery.videoReview.clickTiming', 'en'),
              exact: true,
            })
            .click();
          for (const [key, value] of [
            ['clickBefore', '200'],
            ['clickAfter', '800'],
          ] as const) {
            const field = owner.getByRole('textbox', {
              name: translate(`gallery.videoReview.${key}`, 'en'),
              exact: true,
            });
            await field.fill(value);
            await field.press('Enter');
          }
          await chooseInspectorValue(
            page,
            owner,
            translate('gallery.videoReview.clickEasing', 'en'),
            translate('gallery.videoReview.click_linear', 'en')
          );
          await owner
            .locator('nav')
            .getByRole('button', {
              name: translate('gallery.videoReview.clickAppearance', 'en'),
              exact: true,
            })
            .click();
          const radius = owner.getByRole('textbox', {
            name: translate('gallery.videoReview.clickRadius', 'en'),
            exact: true,
          });
          await radius.fill('40');
          await radius.press('Enter');
        }
        await expect
          .poll(
            async () =>
              (await readNativeVideoProject(page))?.actionFeedback?.[0]?.gestureStyles?.[0]
          )
          .toMatchObject({ effect, radius: 40, before: 0.2, after: 0.8, easing: 'linear' });
        const frames = [];
        for (const time of times) {
          await seek(page, time);
          frames.push({
            time,
            ...(await page.locator('[data-preview-stage-canvas]').evaluate(captureClickRaster)),
          });
        }
        states.push({ effect, project: (await readNativeVideoProject(page))!, frames });
      }
      for (const state of states)
        await writeFile(
          info.outputPath(`authored-${state.effect}.json`),
          JSON.stringify(state.project, null, 2)
        );
      const native = [];
      for (const state of states) {
        if (state.effect === 'off') continue;
        const result = await compareClickPixels(
          page,
          states[0]!.frames[1]!.png,
          state.frames[1]!.png,
          state.effect,
          0.8
        );
        const before = await compareClickPixels(
          page,
          states[0]!.frames[0]!.png,
          state.frames[0]!.png,
          state.effect,
          0.3
        );
        const independent = await compareClickPixels(
          page,
          states[0]!.frames[2]!.png,
          state.frames[2]!.png,
          'unchanged',
          1.75
        );
        native.push({ effect: state.effect, result, before, independent });
        expect(before.informative, JSON.stringify(before)).toBeGreaterThan(0);
        expect(before.error, JSON.stringify(before)).toBeLessThanOrEqual(12);
        expect(independent.error).toBeLessThanOrEqual(1);
        await writeFile(
          info.outputPath(`native-${state.effect}.png`),
          Buffer.from(state.frames[1]!.png, 'base64')
        );
        expect(result.informative, JSON.stringify(result)).toBeGreaterThan(0);
        expect(result.error, JSON.stringify(result)).toBeLessThanOrEqual(12);
      }
      await writeFile(info.outputPath('native-pixel-proof.json'), JSON.stringify(native, null, 2));
      await page.goto(`${host.origin}${OFFSCREEN_HARNESS_PATH}`);
      await page.locator('[data-ui="offscreen.harness.root"][data-state="ready"]').waitFor();
      const encoded = [];
      const baseline = await encodeClicks(
        page,
        states[0]!.project,
        format,
        `click-${format}-off`,
        times
      );
      expect(Math.abs(baseline.duration - 4)).toBeLessThanOrEqual(0.05);
      for (const state of states) {
        if (state.effect === 'off') continue;
        const result = await encodeClicks(
          page,
          state.project,
          format,
          `click-${format}-${state.effect}`,
          times
        );
        const pixels = await compareClickPixels(
          page,
          baseline.frames[1]!.png,
          result.frames[1]!.png,
          state.effect,
          0.8
        );
        const before = await compareClickPixels(
          page,
          baseline.frames[0]!.png,
          result.frames[0]!.png,
          state.effect,
          0.3
        );
        const independent = await compareClickPixels(
          page,
          baseline.frames[2]!.png,
          result.frames[2]!.png,
          'unchanged',
          1.75
        );
        encoded.push({ effect: state.effect, pixels, before, independent });
        expect(before.informative, JSON.stringify(before)).toBeGreaterThan(0);
        expect(before.error, JSON.stringify(before)).toBeLessThanOrEqual(32);
        expect(independent.error).toBeLessThanOrEqual(4);
        await writeFile(
          info.outputPath(`encoded-${state.effect}.png`),
          Buffer.from(result.frames[1]!.png, 'base64')
        );
        expect(pixels.informative, JSON.stringify(pixels)).toBeGreaterThan(0);
        expect(pixels.error, JSON.stringify(pixels)).toBeLessThanOrEqual(32);
      }
      await writeFile(
        info.outputPath('click-pixel-proof.json'),
        JSON.stringify({ native, encoded }, null, 2)
      );
    } finally {
      host.server.closeAllConnections();
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}

async function plainClickSource(page: Page, time: number) {
  const source = (
    await readFile(new URL('../fixtures/review-vp8-opus.webm', import.meta.url))
  ).toString('base64');
  return page.evaluate(
    async ({ source, time }) => {
      const video = document.createElement('video');
      video.muted = true;
      const url = URL.createObjectURL(
        new Blob([Uint8Array.from(atob(source), (character) => character.charCodeAt(0))], {
          type: 'video/webm',
        })
      );
      try {
        await new Promise<void>((resolve, reject) => {
          video.onloadeddata = () => resolve();
          video.onerror = () => reject(new Error('Original click source decode failed'));
          video.src = url;
        });
        await new Promise<void>((resolve) => {
          video.onseeked = () => resolve();
          video.currentTime = 0.525 + 2 * time;
        });
        const canvas = document.createElement('canvas');
        canvas.width = 640;
        canvas.height = 360;
        const context = canvas.getContext('2d')!;
        context.fillStyle = '#eef2f7';
        context.fillRect(0, 0, 640, 360);
        context.drawImage(video, 80, 45, 480, 270);
        return canvas.toDataURL('image/png').split(',')[1]!;
      } finally {
        video.removeAttribute('src');
        video.load();
        URL.revokeObjectURL(url);
      }
    },
    { source, time }
  );
}

for (const format of ['WEBM', 'MP4'] as const)
  for (const scenario of ['double-pulse', 'overlap'] as const) {
    test(`Native ${scenario} click pixels retain source sampling in ${format}`, async ({
      page,
    }, info) => {
      test.setTimeout(180000);
      await page.setViewportSize({ width: 1920, height: 900 });
      const host = await startHostServer();
      try {
        const project = await acquire(page, host.origin, 'en', 'dark', (project) => {
          for (const clip of project.clips) if (clip.type === 'VIDEO') clip.sourceStart += 0.025;
          for (const event of project.actionEvents)
            if (event.anchor.kind === 'recording-source') event.anchor.sourceTime += 0.025;
          for (const sample of project.cursorTrack?.samples ?? [])
            if (sample.sourceAnchor) sample.sourceAnchor.sourceTime += 0.025;
          const style = {
            ...REVIEW_CLICK_DEFAULT,
            id: 'click',
            effect: scenario === 'overlap' ? ('magnify' as const) : ('ripple' as const),
            color: '#ff0000ff',
            radius: 40,
            stroke: 6,
            opacity: 1,
            before: 0.2,
            after: 0.8,
            offset: 0.15,
            pulses: scenario === 'double-pulse' ? 2 : 1,
            easing: 'linear' as const,
            magnification: 2,
            lensShadow: 0,
          };
          project.actionFeedback![0]!.gestureStyles = [
            { ...style, x: scenario === 'overlap' ? -0.1 : 0 },
          ];
          if (scenario === 'overlap') {
            const event = project.actionEvents[0]!;
            if (event.anchor.kind !== 'recording-source') throw new Error('Missing source click');
            project.actionEvents.push({
              ...structuredClone(event),
              id: 'second-lens',
              anchor: { ...event.anchor, sourceEventId: 'click-b' },
            });
            project.actionFeedback![0]!.gestureStyles!.push({ ...style, id: 'click-b', x: 0 });
          }
        });
        const times = scenario === 'double-pulse' ? [0.5, 0.9] : [0.3, 0.8];
        const plain = [],
          native = [];
        for (const time of times) {
          plain.push(await plainClickSource(page, time));
          await seek(page, time);
          const frame = await page
            .locator('[data-preview-stage-canvas]')
            .evaluate(captureClickRaster);
          await writeFile(info.outputPath(`native-${time}.png`), Buffer.from(frame.png, 'base64'));
          const result = await compareClickPixels(
            page,
            plain.at(-1)!,
            frame.png,
            scenario === 'overlap' ? 'magnify' : 'ripple',
            time,
            scenario
          );
          expect(result.informative, JSON.stringify(result)).toBeGreaterThan(0);
          expect(result.error, JSON.stringify(result)).toBeLessThanOrEqual(12);
          native.push({ time, result });
        }
        await page.goto(`${host.origin}${OFFSCREEN_HARNESS_PATH}`);
        await page.locator('[data-ui="offscreen.harness.root"][data-state="ready"]').waitFor();
        const result = await encodeClicks(page, project, format, `${scenario}-${format}`, times);
        const encoded = [];
        for (const [index, frame] of result.frames.entries()) {
          await writeFile(
            info.outputPath(`encoded-${frame.time}.png`),
            Buffer.from(frame.png, 'base64')
          );
          const pixels = await compareClickPixels(
            page,
            plain[index]!,
            frame.png,
            scenario === 'overlap' ? 'magnify' : 'ripple',
            frame.time,
            scenario
          );
          expect(pixels.informative, JSON.stringify(pixels)).toBeGreaterThan(0);
          expect(pixels.error, JSON.stringify(pixels)).toBeLessThanOrEqual(32);
          encoded.push({ time: frame.time, pixels });
        }
        await writeFile(
          info.outputPath('source-sampling-proof.json'),
          JSON.stringify({ scenario, native, encoded }, null, 2)
        );
      } finally {
        host.server.closeAllConnections();
        await new Promise<void>((resolve) => host.server.close(() => resolve()));
      }
    });
  }

async function composeClickFixture(project: VideoProject) {
  const main = project.clips.find((clip) => clip.type === 'VIDEO')!;
  if (main.type !== 'VIDEO') throw new Error('Missing gesture video.');
  main.fitMode = 'STRETCH';
  main.sourceCrop = { x: 0.25, y: 0, width: 0.5, height: 1 };
  main.windowHeader = {
    ...DEFAULT_WINDOW_HEADER,
    kind: 'application',
    title: 'Click composition',
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
    id: 'click-trailing',
    startTime: 2.6,
    duration: 1.4,
    sourceStart: 8,
    sourceDuration: 2.8,
  };
  main.transitionOut = 'CROSSFADE';
  main.timelineLaneId = null;
  trailing.transitionIn = 'CROSSFADE';
  trailing.timelineLaneId = null;
  project.clips.push(trailing);
  project.transitions = [
    {
      id: 'click-crossfade',
      leadingClipId: main.id,
      trailingClipId: trailing.id,
      kind: 'CROSSFADE',
      duration: 0.4,
      easing: 'LINEAR',
    },
  ];
  const first = project.actionEvents[0]!;
  if (first.anchor.kind !== 'recording-source') throw new Error('Missing source click');
  project.actionEvents.push({
    ...structuredClone(first),
    id: 'late-click',
    anchor: { ...first.anchor, sourceEventId: 'late-click', sourceTime: 6.125 },
  });
  const style = {
    ...REVIEW_CLICK_DEFAULT,
    effect: 'off' as const,
    radius: 40,
    stroke: 2,
    color: '#ff0000ff',
    before: 0.2,
    after: 0.8,
    offset: 0.15,
    easing: 'linear' as const,
    magnification: 2,
    lensShadow: 0,
  };
  project.actionFeedback![0]!.gestureStyles = [
    { ...style, id: 'click' },
    { ...style, id: 'late-click', offset: 0, after: 0.4 },
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
          ? { kind: 'transition', transitionId: 'click-crossfade' }
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

async function compositionClickRegions(page: Page, png: string) {
  return page.evaluate(async (png) => {
    const image = new Image();
    image.src = `data:image/png;base64,${png}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 360;
    const context = canvas.getContext('2d')!;
    context.drawImage(image, 0, 0);
    const regions = {
      outside: [[70, 120]],
      header: [[320, 48]],
      occluded: [[380, 120]],
      visible: [
        [260, 215],
        [290, 245],
        [320, 230],
      ],
    };
    return Object.fromEntries(
      Object.entries(regions).map(([name, points]) => [
        name,
        points.flatMap(([x, y]) => {
          const bytes = context.getImageData(x! - 1, y! - 1, 3, 3).data;
          return [0, 1, 2].map((channel) => {
            let sum = 0;
            for (let i = channel; i < bytes.length; i += 4) sum += bytes[i]!;
            return sum / 9;
          });
        }),
      ])
    );
  }, png);
}

for (const format of ['WEBM', 'MP4'] as const) {
  test(`Native click composition retains crop header FX and crossfade in ${format}`, async ({
    page,
  }, info) => {
    test.setTimeout(240000);
    await page.setViewportSize({ width: 1920, height: 900 });
    const host = await startHostServer();
    try {
      const initial = await acquire(page, host.origin, 'en', 'dark', async (project) => {
        for (const clip of project.clips) if (clip.type === 'VIDEO') clip.sourceStart += 0.025;
        for (const event of project.actionEvents)
          if (event.anchor.kind === 'recording-source') event.anchor.sourceTime += 0.025;
        for (const sample of project.cursorTrack?.samples ?? [])
          if (sample.sourceAnchor) sample.sourceAnchor.sourceTime += 0.025;
        await composeClickFixture(project);
      });
      const main = initial.clips[0]!;
      const sourceEvent = initial.actionEvents[0]!;
      const times = [0.8, 2.8];
      const states = [];
      for (const enabled of [false, true]) {
        if (enabled)
          for (const [id, after] of [
            [sourceEvent.id, '800'],
            ['late-click', '400'],
          ] as const) {
            await page
              .locator(
                `[data-ui="video-editor.timeline.history-event"][data-action-id="${id}"][data-action-clip-id="${main.id}"]`
              )
              .click();
            const owner = page.locator('[data-ui="video-editor.inspector.history-event"]');
            const category = (key: Parameters<typeof translate>[0]) =>
              owner.locator('nav').getByRole('button', { name: translate(key, 'en'), exact: true });
            await category('videoEditor.sidebar.historyClickEffects').click();
            await chooseInspectorValue(
              page,
              owner,
              translate('gallery.videoReview.clickEffect', 'en'),
              translate('gallery.videoReview.click_magnify', 'en')
            );
            await category('gallery.videoReview.clickTiming').click();
            for (const [key, value] of [
              ['clickBefore', '200'],
              ['clickAfter', after],
            ] as const) {
              const field = owner.getByRole('textbox', {
                name: translate(`gallery.videoReview.${key}`, 'en'),
                exact: true,
              });
              await field.fill(value);
              await field.press('Enter');
            }
            await chooseInspectorValue(
              page,
              owner,
              translate('gallery.videoReview.clickEasing', 'en'),
              translate('gallery.videoReview.click_linear', 'en')
            );
            await category('gallery.videoReview.clickAppearance').click();
            const radius = owner.getByRole('textbox', {
              name: translate('gallery.videoReview.clickRadius', 'en'),
              exact: true,
            });
            await radius.scrollIntoViewIfNeeded();
            await radius.fill('40');
            await radius.press('Enter');
          }
        await expect
          .poll(async () =>
            (await readNativeVideoProject(page))?.actionFeedback?.[0]?.gestureStyles?.map(
              (style) => style.effect
            )
          )
          .toEqual([enabled ? 'magnify' : 'off', enabled ? 'magnify' : 'off']);
        const frames = [];
        for (const time of times) {
          await seek(page, time);
          const frame = await page
            .locator('[data-preview-stage-canvas]')
            .evaluate(captureClickRaster);
          frames.push({ time, ...frame, regions: await compositionClickRegions(page, frame.png) });
          await writeFile(
            info.outputPath(`native-${enabled}-${time}.png`),
            Buffer.from(frame.png, 'base64')
          );
        }
        states.push({ enabled, project: (await readNativeVideoProject(page))!, frames });
      }
      const delta = (left: number[], right: number[]) =>
        Math.max(...left.map((value, i) => Math.abs(value - right[i]!)));
      const verify = (off: (typeof states)[0]['frames'], on: typeof off, tolerance: number) => {
        for (let index = 0; index < times.length; index++)
          for (const region of ['outside', 'header', 'occluded'])
            expect(
              delta(on[index]!.regions[region]!, off[index]!.regions[region]!)
            ).toBeLessThanOrEqual(tolerance);
        expect(delta(on[0]!.regions['visible']!, off[0]!.regions['visible']!)).toBeGreaterThan(25);
        const fade = delta(on[1]!.regions['visible']!, off[1]!.regions['visible']!);
        expect(fade).toBeGreaterThan(25);
        expect(fade).toBeLessThanOrEqual(127.5 + tolerance);
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
      verify(states[0]!.frames, states[1]!.frames, 12);
      expect(states[0]!.frames[0]!.regions['header']!.every((value) => value > 180)).toBe(true);
      const oracle = await compareClickPixels(
        page,
        states[0]!.frames[0]!.png,
        states[1]!.frames[0]!.png,
        'magnify',
        0.8,
        'decorated'
      );
      expect(oracle.informative, JSON.stringify(oracle)).toBeGreaterThan(0);
      expect(oracle.error, JSON.stringify(oracle)).toBeLessThanOrEqual(12);
      expect(states[1]!.project.actionEvents).toEqual(initial.actionEvents);
      expect(states[1]!.project.clips).toEqual(initial.clips);
      expect(states[1]!.project.effectInstances).toEqual(initial.effectInstances);
      await page.goto(`${host.origin}${OFFSCREEN_HARNESS_PATH}`);
      await page.locator('[data-ui="offscreen.harness.root"][data-state="ready"]').waitFor();
      const results = [];
      for (const state of states) {
        const result = await encodeClicks(
          page,
          state.project,
          format,
          `composition-click-${format}-${state.enabled}`,
          times
        );
        const frames = [];
        for (const frame of result.frames) {
          frames.push({ ...frame, regions: await compositionClickRegions(page, frame.png) });
          await writeFile(
            info.outputPath(`encoded-${state.enabled}-${frame.time}.png`),
            Buffer.from(frame.png, 'base64')
          );
        }
        results.push({ ...result, frames });
      }
      verify(results[0]!.frames, results[1]!.frames, 32);
      const encodedOracle = await compareClickPixels(
        page,
        results[0]!.frames[0]!.png,
        results[1]!.frames[0]!.png,
        'magnify',
        0.8,
        'decorated'
      );
      expect(encodedOracle.informative, JSON.stringify(encodedOracle)).toBeGreaterThan(0);
      expect(encodedOracle.error, JSON.stringify(encodedOracle)).toBeLessThanOrEqual(32);
      for (let state = 0; state < 2; state++)
        for (let index = 0; index < times.length; index++)
          for (const region of ['outside', 'header', 'occluded', 'visible'])
            expect(
              delta(
                results[state]!.frames[index]!.regions[region]!,
                states[state]!.frames[index]!.regions[region]!
              )
            ).toBeLessThanOrEqual(32);
      await writeFile(
        info.outputPath('click-composition-proof.json'),
        JSON.stringify(
          {
            oracle,
            encodedOracle,
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

test('Native source click without a captured point refuses position editing', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1280, height: 560 });
  const host = await startHostServer();
  try {
    const initial = await acquire(page, host.origin, 'en', 'dark', (project) => {
      project.actionEvents[0]!.point = null;
      project.actionFeedback![0]!.gestureStyles = [
        { ...REVIEW_CLICK_DEFAULT, id: 'click', effect: 'press' },
      ];
    });
    await page.locator('[data-ui="video-editor.timeline.history-event"]').first().click();
    await seek(page, 0.5);
    await expect(page.locator('[data-preview-stage-point-handle]')).toHaveCount(0);
    const owner = page.locator('[data-ui="video-editor.inspector.history-event"]');
    await owner
      .locator('nav')
      .getByRole('button', {
        name: translate('gallery.videoReview.clickPosition', 'en'),
        exact: true,
      })
      .click();
    await expect(
      owner.getByRole('button', {
        name: translate('videoEditor.sidebar.selectPointOnStage', 'en'),
        exact: true,
      })
    ).toBeDisabled();
    await expect(
      owner.getByRole('button', {
        name: translate('videoEditor.sidebar.resetPointToCenter', 'en'),
        exact: true,
      })
    ).toBeDisabled();
    await expect(
      owner.getByRole('textbox', {
        name: translate('gallery.videoReview.clickX', 'en'),
        exact: true,
      })
    ).toBeDisabled();
    await expect(
      owner.getByRole('textbox', {
        name: translate('gallery.videoReview.clickY', 'en'),
        exact: true,
      })
    ).toBeDisabled();
    await page.screenshot({ path: info.outputPath('missing-point-position.png'), fullPage: false });
    await owner
      .locator('nav')
      .getByRole('button', {
        name: translate('videoEditor.sidebar.inspectorGroupInfo', 'en'),
        exact: true,
      })
      .click();
    await expect(
      owner.getByText(translate('videoEditor.sidebar.historyUnsupported', 'en'), { exact: true })
    ).toBeVisible();
    expect((await readNativeVideoProject(page))!.actionEvents).toEqual(initial.actionEvents);
  } finally {
    host.server.closeAllConnections();
    await new Promise<void>((resolve) => host.server.close(() => resolve()));
  }
});
