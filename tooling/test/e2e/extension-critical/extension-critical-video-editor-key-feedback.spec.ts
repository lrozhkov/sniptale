import { createHash } from 'node:crypto';
import { DEFAULT_WINDOW_HEADER } from '@sniptale/runtime-contracts/window-header';
import {
  parseEffectV1Source,
  resolveEffectV1ControlDefault,
} from '@sniptale/runtime-contracts/effect-v1';
import type { ReviewKeyStyle } from '../../../../apps/extension/src/features/video/project/action-feedback/key-animation';
import { resolveVideoProjectActionPresentations } from '../../../../apps/extension/src/features/video/project/action-presentation';
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
import {
  patchReviewKeys,
  REVIEW_KEY_DEFAULT,
} from '../../../../apps/extension/src/features/video/project/action-feedback/key-animation';
import { assertExportReadyVideoProject } from '../../../../apps/extension/src/features/video/project/validation/root';
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
    filename: 'keys.webm',
    width: 160,
    height: 90,
    duration: 12,
    mimeType: 'video/webm',
    size: bytes.length,
    hasAudio: false,
    sourceNormalizedActionEvents: [
      {
        id: 'key',
        kind: 'KEY',
        time: 1,
        duration: 1,
        point: null,
        label: 'Ctrl+K',
        preset: 'NONE',
        data: { keyboardOnsetTime: 1, downTime: 1, upTime: 1.3 },
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
      startTime: 3,
      sourceStart: 0.5,
      sourceDuration: 1,
      duration: 1,
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
    keyStyles: [
      {
        ...REVIEW_KEY_DEFAULT,
        id: 'key',
        style: { ...REVIEW_KEY_DEFAULT.style, color: '#3366ffff' },
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
      if (sessionStorage.getItem('key-seeded')) {
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
  await page.evaluate(() => sessionStorage.setItem('key-seeded', '1'));
  return project;
}

for (const [index, viewport] of PRIMARY_BROWSER_VIEWPORTS.entries()) {
  const locale = index === 0 ? 'en' : 'ru';
  const theme = index === 0 ? 'dark' : 'light';
  test(`Native key inspector shares caption controls ${viewport.size.width} ${locale}`, async ({
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
    const display = async (enabled: boolean) => {
      await category('gallery.videoReview.keyDisplay').click();
      await chooseInspectorValue(
        page,
        owner,
        label('gallery.videoReview.keyDisplay'),
        label(enabled ? 'gallery.videoReview.keyCaption' : 'gallery.videoReview.click_off')
      );
    };
    try {
      const initial = await acquire(page, host.origin, locale, theme);
      await page.locator('[data-ui="video-editor.timeline.history-event"]').first().click();
      await expect(category('gallery.videoReview.keyDisplay').locator('svg')).toHaveClass(
        /lucide-keyboard/
      );
      await expect(category('gallery.videoReview.clickTiming')).toHaveCount(0);
      await display(true);
      await chooseInspectorValue(
        page,
        owner,
        label('gallery.videoReview.keyEntrance'),
        label('gallery.videoReview.key_slide')
      );
      await category('gallery.videoReview.clickAppearance').click();
      await chooseInspectorValue(
        page,
        owner,
        label('videoEditor.sidebar.keyFont'),
        label('videoEditor.sidebar.keyMono')
      );
      await number('gallery.videoReview.key_fontSize', '36');
      await number('gallery.videoReview.key_cornerRadius', '12');
      for (const [key, value] of [
        ['gallery.videoReview.keyColor', '#12345680'],
        ['gallery.videoReview.keyBackground', '#abcdef90'],
      ] as const) {
        await owner.getByRole('button', { name: label(key), exact: true }).click();
        await field(key).fill(value);
        await field(key).press('Enter');
      }
      await number('videoEditor.sidebar.actionOpacity', '70');
      await checkInspectorPaintedFont(page, field('gallery.videoReview.key_fontSize'), 'numeric');
      await checkInspectorParameterRows(owner);
      await category('gallery.videoReview.clickTiming').click();
      await number('gallery.videoReview.key_before', '200');
      await number('gallery.videoReview.key_after', '1800');
      await number('gallery.videoReview.key_offset', '100');
      await category('gallery.videoReview.clickPosition').click();
      await chooseInspectorValue(
        page,
        owner,
        label('gallery.videoReview.keyPosition'),
        label('gallery.videoReview.key_top-right')
      );
      await number('gallery.videoReview.key_margin', '42');
      await expect
        .poll(async () => (await readNativeVideoProject(page))?.actionFeedback?.[0]?.keyStyles?.[0])
        .toMatchObject({
          enabled: true,
          before: 0.2,
          after: 1.8,
          offset: 0.1,
          style: {
            fontFamily: 'monospace',
            fontSize: 36,
            cornerRadius: 12,
            color: '#12345680',
            background: '#abcdef90',
            opacity: 0.7,
            position: 'top-right',
            margin: 42,
            entrance: 'slide',
          },
        });
      await page.locator('[data-ui="video-editor.timeline.toolbar.undo"]').click();
      await expect
        .poll(
          async () =>
            (await readNativeVideoProject(page))?.actionFeedback?.[0]?.keyStyles?.[0]?.style.margin
        )
        .not.toBe(42);
      await page.locator('[data-ui="video-editor.timeline.toolbar.redo"]').click();
      await expect
        .poll(
          async () =>
            (await readNativeVideoProject(page))?.actionFeedback?.[0]?.keyStyles?.[0]?.style.margin
        )
        .toBe(42);
      const saved = (await readNativeVideoProject(page))!;
      await writeFile(info.outputPath('authored-project.json'), JSON.stringify(saved));
      const ticks = await page
        .locator('[data-ui="video-editor.timeline.ruler"] > div > span')
        .evaluateAll((nodes) =>
          nodes.slice(0, 2).map((node) => ({
            x: node.parentElement!.getBoundingClientRect().x,
            text: node.textContent!.trim(),
          }))
        );
      const tickTime = (text: string) => {
        const parts = text.split(':');
        return Math.round((Number(parts[0]) * 60 + Number(parts[1])) * saved.fps) / saved.fps;
      };
      const rate =
        (ticks[1]!.x - ticks[0]!.x) / (tickTime(ticks[1]!.text) - tickTime(ticks[0]!.text));
      const row = resolveVideoProjectActionPresentations(saved).find(
        (item) =>
          item.event.anchor.kind === 'recording-source' &&
          item.event.anchor.sourceInstanceId === saved.actionFeedback![0]!.sourceInstanceId
      )!;
      const marker = page.locator('[data-ui="video-editor.timeline.history-event"]').first();
      const rect = (await marker.boundingBox())!;
      await writeFile(
        info.outputPath('history-geometry.json'),
        JSON.stringify({ row, rect, ticks, rate })
      );
      await expect
        .poll(async () =>
          Math.abs(
            (await marker.boundingBox())!.x -
              (ticks[0]!.x + (row.start - tickTime(ticks[0]!.text)) * rate)
          )
        )
        .toBeLessThanOrEqual(1);
      await expect
        .poll(async () =>
          Math.abs((await marker.boundingBox())!.width - (row.end - row.start) * rate)
        )
        .toBeLessThanOrEqual(1);

      await display(false);
      await expect(category('gallery.videoReview.clickTiming')).toHaveCount(0);
      await display(true);
      await expect
        .poll(
          async () =>
            (await readNativeVideoProject(page))?.actionFeedback?.[0]?.keyStyles?.[0]?.style
        )
        .toEqual(saved.actionFeedback![0]!.keyStyles![0]!.style);
      const inspector = page.locator('[data-ui="video-editor.floating.context-inspector"]');
      const rail = inspector.locator('[data-ui="video-editor.inspector.categories"] > nav');
      const handle = page.locator('[data-ui="video-editor.floating.context-inspector.resize"]');
      if (index === 0) await page.locator('[data-ui="video-editor.materials.close"]').click();
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
        const railY = (await rail.boundingBox())!.y;
        for (const key of [
          'gallery.videoReview.keyDisplay',
          'gallery.videoReview.clickAppearance',
          'gallery.videoReview.clickTiming',
          'gallery.videoReview.clickPosition',
        ] as const) {
          await category(key).click();
          await checkInspectorParameterRows(owner);
          if (key === 'gallery.videoReview.keyDisplay')
            await expect(owner.getByRole('group', { name: label(key), exact: true })).toBeVisible();
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
            path: info.outputPath(`key-${key.split('.').at(-1)}-${width}.png`),
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
        .poll(async () => (await readNativeVideoProject(page))?.actionFeedback?.[0]?.keyStyles)
        .toEqual(saved.actionFeedback![0]!.keyStyles);
      await category('gallery.videoReview.keyDisplay').click();
      const reset = owner.getByRole('button', {
        name: label('gallery.videoReview.keyReset'),
        exact: true,
      });
      const svg = reset.locator('svg');
      const [buttonBox, iconBox] = await Promise.all([reset.boundingBox(), svg.boundingBox()]);
      expect(iconBox!.x).toBeGreaterThanOrEqual(buttonBox!.x);
      expect(iconBox!.x + iconBox!.width).toBeLessThanOrEqual(buttonBox!.x + buttonBox!.width);
      await reset.click();
      await expect
        .poll(async () => (await readNativeVideoProject(page))?.actionFeedback?.[0]?.keyStyles)
        .toEqual([]);
      await expect(reset).toBeDisabled();
      await page.setViewportSize({ width: 1200, height: 560 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true
      );
    } finally {
      host.server.closeAllConnections();
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}

for (const [index, viewport] of PRIMARY_BROWSER_VIEWPORTS.entries()) {
  const locale = index === 0 ? 'en' : 'ru';
  const theme = index === 0 ? 'dark' : 'light';
  test(`Native history lane edits captured captions ${viewport.size.width} ${locale}`, async ({
    page,
  }, info) => {
    test.setTimeout(180000);
    page.setDefaultTimeout(15000);
    await page.setViewportSize({ ...viewport.size });
    await page.emulateMedia({ colorScheme: theme });
    const host = await startHostServer();
    const label = (key: Parameters<typeof translate>[0]) => translate(key, locale);
    const owner = page.locator('[data-ui="video-editor.inspector.history-lane"]');
    const category = (key: Parameters<typeof translate>[0]) =>
      owner.locator('nav').getByRole('button', { name: label(key), exact: true });
    const number = async (key: Parameters<typeof translate>[0], value: string) => {
      const input = owner.getByRole('textbox', { name: label(key), exact: true });
      await input.scrollIntoViewIfNeeded();
      await input.fill(value);
      await input.press('Enter');
    };
    try {
      const initial = await acquire(page, host.origin, locale, theme, (project) => {
        project.actionFeedback![0]!.keyStyles = patchReviewKeys([], ['key'], {
          enabled: true,
          before: 0.2,
          after: 1.1,
          offset: 0.1,
          style: { fontSize: 32, color: '#ff0044ff' },
        });
        project.actionFeedback![1]!.keyStyles = patchReviewKeys([], ['key'], {
          enabled: false,
          before: 0.4,
          after: 0.6,
          offset: -0.1,
          style: { fontSize: 48, color: '#3344ffff' },
        });
      });
      await page.locator('[data-ui="video-editor.timeline.history-lane"]').click();
      await category('gallery.videoReview.keyDisplay').click();
      await expect(
        owner.getByRole('button', {
          name: label('videoEditor.sidebar.historyShowKeys'),
          exact: true,
        })
      ).toHaveCount(0);
      await chooseInspectorValue(
        page,
        owner,
        label('gallery.videoReview.keyDisplay'),
        label('gallery.videoReview.keyCaption')
      );
      await expect
        .poll(async () =>
          (await readNativeVideoProject(page))?.actionFeedback?.map(
            (group) => group.keyStyles?.[0]?.enabled
          )
        )
        .toEqual([true, true]);
      await category('gallery.videoReview.clickAppearance').click();
      const font = owner.getByRole('textbox', {
        name: label('gallery.videoReview.key_fontSize'),
        exact: true,
      });
      await expect(font).toHaveAttribute('placeholder', '—');
      await number('gallery.videoReview.key_fontSize', '36');
      await expect
        .poll(async () =>
          (await readNativeVideoProject(page))?.actionFeedback?.map(
            (group) => group.keyStyles?.[0]?.style.fontSize
          )
        )
        .toEqual([36, 36]);
      await checkInspectorParameterRows(owner);
      await category('gallery.videoReview.clickTiming').click();
      await number('gallery.videoReview.key_after', '800');
      await expect
        .poll(async () =>
          (await readNativeVideoProject(page))?.actionFeedback?.map(
            (group) => group.keyStyles?.[0]?.after
          )
        )
        .toEqual([0.8, 0.8]);
      await page.locator('[data-ui="video-editor.timeline.toolbar.undo"]').click();
      await expect
        .poll(async () =>
          (await readNativeVideoProject(page))?.actionFeedback?.map(
            (group) => group.keyStyles?.[0]?.after
          )
        )
        .toEqual([1.1, 0.6]);
      await page.locator('[data-ui="video-editor.timeline.toolbar.redo"]').click();
      await expect
        .poll(async () =>
          (await readNativeVideoProject(page))?.actionFeedback?.map(
            (group) => group.keyStyles?.[0]?.after
          )
        )
        .toEqual([0.8, 0.8]);
      await category('gallery.videoReview.clickPosition').click();
      await chooseInspectorValue(
        page,
        owner,
        label('gallery.videoReview.keyPosition'),
        label('gallery.videoReview.key_top-right')
      );
      await number('gallery.videoReview.key_margin', '32');
      await expect
        .poll(async () =>
          (await readNativeVideoProject(page))?.actionFeedback?.map(
            (group) => group.keyStyles?.[0]?.style.margin
          )
        )
        .toEqual([32, 32]);
      const saved = (await readNativeVideoProject(page))!;
      expect(saved.actionFeedback!.map((group) => group.keyStyles![0]!.style.color)).toEqual([
        '#ff0044ff',
        '#3344ffff',
      ]);
      expect(saved.actionFeedback!.map((group) => group.keyStyles![0]!.before)).toEqual([0.2, 0.4]);
      expect(saved.actionFeedback!.map((group) => group.keyStyles![0]!.offset)).toEqual([
        0.1, -0.1,
      ]);
      expect(saved.actionEvents).toEqual(initial.actionEvents);
      expect(saved.actionPresentation).toEqual(initial.actionPresentation);
      for (const key of [
        'gallery.videoReview.keyDisplay',
        'gallery.videoReview.clickAppearance',
        'gallery.videoReview.clickTiming',
        'gallery.videoReview.clickPosition',
      ] as const) {
        await category(key).click();
        await checkInspectorParameterRows(owner);
        await page.screenshot({
          path: info.outputPath(`bulk-${key.split('.').at(-1)}.png`),
          fullPage: false,
        });
      }
      const lock = page
        .locator('[data-ui="timeline.utility-lane-state"]')
        .filter({ has: page.locator('svg.lucide-unlock,svg.lucide-lock') })
        .first();
      await lock.click();
      await expect
        .poll(async () => (await readNativeVideoProject(page))?.utilityLanes?.actions.locked)
        .toBe(true);
      await category('gallery.videoReview.clickAppearance').click();
      await expect(font).toBeDisabled();
      await lock.click();
      await expect
        .poll(async () => (await readNativeVideoProject(page))?.utilityLanes?.actions.locked)
        .toBe(false);
      await category('gallery.videoReview.keyDisplay').click();
      await owner
        .getByRole('button', { name: label('gallery.videoReview.keyReset'), exact: true })
        .click();
      await expect
        .poll(async () =>
          (await readNativeVideoProject(page))?.actionFeedback?.map((group) => group.keyStyles)
        )
        .toEqual([[], []]);
      await expect(category('gallery.videoReview.clickTiming')).toHaveCount(0);
      await page.locator('[data-ui="video-editor.timeline.toolbar.undo"]').click();
      await expect
        .poll(async () => (await readNativeVideoProject(page))?.actionFeedback)
        .toEqual(saved.actionFeedback);
      await page.reload();
      await page.locator('[data-ui="video-editor.timeline.history-lane"]').click();
      await expect
        .poll(async () => (await readNativeVideoProject(page))?.actionFeedback)
        .toEqual(saved.actionFeedback);
      await writeFile(
        info.outputPath('bulk-authored-project.json'),
        JSON.stringify(await readNativeVideoProject(page))
      );
    } finally {
      host.server.closeAllConnections();
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
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

function captureKeyRaster(source: HTMLCanvasElement) {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 360;
  const context = canvas.getContext('2d')!;
  context.drawImage(source, 0, 0, 640, 360);
  return { png: canvas.toDataURL('image/png').split(',')[1]! };
}

async function encodeKeys(
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
    video.id = 'key-proof-decoder';
    video.muted = true;
    video.hidden = true;
    document.body.append(video);
    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => reject(new Error('Encoded caption decode failed.'));
      video.src = URL.createObjectURL(file);
    });
    const canvas = document.createElement('canvas');
    canvas.id = 'key-proof-frame';
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
        const video = document.querySelector<HTMLVideoElement>('#key-proof-decoder')!;
        await new Promise<void>((resolve, reject) => {
          video.onseeked = () => resolve();
          video.onerror = () => reject(new Error('Encoded frame seek failed.'));
          video.currentTime = time;
        });
        const canvas = document.querySelector<HTMLCanvasElement>('#key-proof-frame')!;
        canvas.getContext('2d')!.drawImage(video, 0, 0);
      }, time);
      frames.push({
        time,
        ...(await page.locator('#key-proof-frame').evaluate(captureKeyRaster)),
      });
    }
    return { ...dimensions, frames };
  } finally {
    await page.evaluate(() => {
      const video = document.querySelector<HTMLVideoElement>('#key-proof-decoder');
      if (video) {
        const url = video.src;
        video.removeAttribute('src');
        video.load();
        video.remove();
        URL.revokeObjectURL(url);
      }
      document.querySelector('#key-proof-frame')?.remove();
    });
  }
}

async function inspectCaptionPixels(
  page: Page,
  baseline: string,
  png: string,
  time: number,
  settings: ReviewKeyStyle,
  copy = false,
  cue: { start: number; end: number } | null = null
) {
  return page.evaluate(
    async ({ baseline, png, time, settings, copy, cue }) => {
      const decode = async (base64: string) => {
        const image = new Image();
        image.src = `data:image/png;base64,${base64}`;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = 640;
        canvas.height = 360;
        const context = canvas.getContext('2d')!;
        context.drawImage(image, 0, 0);
        return context.getImageData(0, 0, 640, 360).data;
      };
      const [before, current] = await Promise.all([decode(baseline), decode(png)]);
      let difference = 0;
      for (let index = 0; index < current.length; index += 4)
        for (let channel = 0; channel < 3; channel++)
          difference += Math.abs(current[index + channel]! - before[index + channel]!);
      const fullError = difference / (640 * 360 * 3);
      const start = cue?.start ?? (copy ? 3.5 : 0.2),
        end = cue?.end ?? (copy ? 4 : 1.2);
      if (time < start || time >= end)
        return { active: false, fullError, count: 0, ink: 0, backgroundError: 0, boundsError: 0 };
      const style = settings.style,
        scale = 1 / 3,
        fontSize = style.fontSize * scale;
      const measure = document.createElement('canvas').getContext('2d')!;
      measure.font = `500 ${fontSize}px ${style.fontFamily}`;
      const padding = fontSize * 0.55,
        margin = style.margin * scale;
      const width = measure.measureText('Ctrl+K').width + 2 * padding,
        height = fontSize * 1.8;
      const progress = (time - start) / (end - start);
      const fade =
        style.entrance === 'none' ? 1 : Math.min(1, progress / 0.15, (1 - progress) / 0.2);
      const travel =
        style.entrance === 'slide' ? (1 - Math.min(1, progress / 0.2)) ** 3 * fontSize * 0.35 : 0;
      const x = style.position.endsWith('left')
        ? margin
        : style.position.endsWith('right')
          ? 640 - margin - width
          : (640 - width) / 2;
      const top = style.position.startsWith('top');
      const y = top ? margin - travel : 360 - margin - height + travel;
      const hex = style.background.replace('#', '');
      const rgb = [0, 2, 4].map((offset) => parseInt(hex.slice(offset, offset + 2), 16));
      const alpha =
        (hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1) * style.opacity * fade;
      let minX = 640,
        minY = 360,
        maxX = -1,
        maxY = -1,
        count = 0;
      for (let py = 0; py < 360; py++)
        for (let px = 0; px < 640; px++) {
          if (py >= 60 && py < 300) continue;
          const index = (py * 640 + px) * 4;
          const r = current[index]!,
            g = current[index + 1]!,
            b = current[index + 2]!;
          const color = copy ? b > r + 30 && b > g + 30 : r > g + 30 && r > b + 30;
          if (color) {
            count++;
            minX = Math.min(minX, px);
            minY = Math.min(minY, py);
            maxX = Math.max(maxX, px);
            maxY = Math.max(maxY, py);
          }
        }
      let backgroundError = 0,
        backgroundSamples = 0,
        ink = 0;
      for (let py = Math.ceil(y + height * 0.3); py <= Math.floor(y + height * 0.7); py++)
        for (let px = Math.ceil(x + 4); px <= Math.floor(x + 8); px++) {
          const index = (py * 640 + px) * 4;
          for (let channel = 0; channel < 3; channel++) {
            const expected = before[index + channel]! * (1 - alpha) + rgb[channel]! * alpha;
            backgroundError += Math.abs(current[index + channel]! - expected);
            backgroundSamples++;
          }
        }
      for (let py = Math.ceil(y + height * 0.2); py <= Math.floor(y + height * 0.8); py++)
        for (let px = Math.ceil(x + padding); px <= Math.floor(x + width - padding); px++) {
          const index = (py * 640 + px) * 4;
          const expectedGreen = before[index + 1]! * (1 - alpha) + rgb[1]! * alpha;
          if (current[index + 1]! > expectedGreen + 8) ink++;
        }
      const boundsError = count
        ? Math.max(
            Math.abs(minX - x),
            Math.abs(minY - y),
            Math.abs(maxX + 1 - x - width),
            Math.abs(maxY + 1 - y - height)
          )
        : 999;
      return {
        active: true,
        fullError,
        count,
        ink,
        backgroundError: backgroundError / backgroundSamples,
        boundsError,
        actual: { minX, minY, maxX, maxY },
        expected: { x, y, width, height, fade, alpha },
      };
    },
    { baseline, png, time, settings, copy, cue }
  );
}

const KEY_PIXEL_CASES = [
  ...(
    ['bottom-left', 'bottom-center', 'bottom-right', 'top-left', 'top-center', 'top-right'] as const
  ).map((position) => ({
    id: position,
    position,
    entrance: 'none' as const,
    fontFamily: 'monospace' as const,
    fontSize: 60,
  })),
  {
    id: 'fade',
    position: 'top-center' as const,
    entrance: 'fade' as const,
    fontFamily: 'sans-serif' as const,
    fontSize: 72,
  },
  {
    id: 'slide-top',
    position: 'top-left' as const,
    entrance: 'slide' as const,
    fontFamily: 'serif' as const,
    fontSize: 84,
  },
  {
    id: 'slide-bottom',
    position: 'bottom-right' as const,
    entrance: 'slide' as const,
    fontFamily: 'monospace' as const,
    fontSize: 60,
  },
];

for (const format of ['WEBM', 'MP4'] as const) {
  test(`Native key caption pixels survive ${format} with viewport placement and authored phases`, async ({
    page,
  }, info) => {
    test.setTimeout(480000);
    page.setDefaultTimeout(15000);
    await page.setViewportSize({ width: 1920, height: 900 });
    const host = await startHostServer(),
      times = [0.15, 0.25, 0.6, 1.1, 1.25, 3.6];
    try {
      await acquire(page, host.origin, 'en', 'dark', (project) => {
        project.fps = 20;
        project.cursorTrack = null;
        for (const clip of project.clips)
          if (clip.type === 'VIDEO') {
            clip.sourceStart += 0.025;
            clip.transform = { ...clip.transform, y: 60, height: 240 };
          }
        for (const event of project.actionEvents)
          if (event.anchor.kind === 'recording-source') {
            event.anchor.sourceTime += 0.025;
            for (const key of ['keyboardOnsetTime', 'downTime', 'upTime'] as const) {
              const value = event.data[key];
              if (typeof value === 'number') event.data[key] = value + 0.025;
            }
          }
        project.actionFeedback![0]!.keyStyles = patchReviewKeys([], ['key'], {
          enabled: false,
          before: 0.2,
          after: 0.8,
          offset: 0.15,
          style: {
            position: 'bottom-left',
            fontFamily: 'monospace',
            fontSize: 60,
            margin: 24,
            color: '#ffffffff',
            background: '#ff2200cc',
            opacity: 0.75,
            entrance: 'none',
          },
        });
        project.actionFeedback![1]!.keyStyles = patchReviewKeys([], ['key'], {
          enabled: true,
          before: 0,
          after: 1.2,
          offset: 0,
          style: {
            position: 'bottom-left',
            fontFamily: 'monospace',
            fontSize: 60,
            margin: 24,
            color: '#ffffffff',
            background: '#2244ffff',
            opacity: 1,
            entrance: 'none',
          },
        });
      });
      await page.locator('[data-ui="video-editor.timeline.history-event"]').first().click();
      const owner = page.locator('[data-ui="video-editor.inspector.history-event"]');
      const category = (key: Parameters<typeof translate>[0]) =>
        owner.locator('nav').getByRole('button', { name: translate(key, 'en'), exact: true });
      const capture = async () => {
        const frames = [];
        for (const time of times) {
          await seek(page, time);
          frames.push({
            time,
            ...(await page.locator('[data-preview-stage-canvas]').evaluate(captureKeyRaster)),
          });
        }
        return frames;
      };
      const baseline = { project: (await readNativeVideoProject(page))!, frames: await capture() };
      const states = [];
      for (const item of KEY_PIXEL_CASES) {
        await category('gallery.videoReview.keyDisplay').click();
        await chooseInspectorValue(
          page,
          owner,
          translate('gallery.videoReview.keyDisplay', 'en'),
          translate('gallery.videoReview.keyCaption', 'en')
        );
        await chooseInspectorValue(
          page,
          owner,
          translate('gallery.videoReview.keyEntrance', 'en'),
          translate(`gallery.videoReview.key_${item.entrance}`, 'en')
        );
        await category('gallery.videoReview.clickAppearance').click();
        await chooseInspectorValue(
          page,
          owner,
          translate('videoEditor.sidebar.keyFont', 'en'),
          translate(
            item.fontFamily === 'monospace'
              ? 'videoEditor.sidebar.keyMono'
              : item.fontFamily === 'serif'
                ? 'videoEditor.sidebar.keySerif'
                : 'videoEditor.sidebar.keySans',
            'en'
          )
        );
        const font = owner.getByRole('textbox', {
          name: translate('gallery.videoReview.key_fontSize', 'en'),
          exact: true,
        });
        await font.fill(String(item.fontSize));
        await font.press('Enter');
        await category('gallery.videoReview.clickPosition').click();
        await chooseInspectorValue(
          page,
          owner,
          translate('gallery.videoReview.keyPosition', 'en'),
          translate(`gallery.videoReview.key_${item.position}`, 'en')
        );
        await expect
          .poll(
            async () => (await readNativeVideoProject(page))?.actionFeedback?.[0]?.keyStyles?.[0]
          )
          .toMatchObject({
            enabled: true,
            before: 0.2,
            after: 0.8,
            offset: 0.15,
            style: {
              position: item.position,
              fontFamily: item.fontFamily,
              fontSize: item.fontSize,
              entrance: item.entrance,
            },
          });
        const state = {
          id: item.id,
          project: (await readNativeVideoProject(page))!,
          frames: await capture(),
        };
        const measurements = [];
        for (let index = 0; index < times.length; index++) {
          const time = times[index]!,
            copy = time === 3.6;
          const settings = state.project.actionFeedback![copy ? 1 : 0]!.keyStyles![0]!;
          const result = await inspectCaptionPixels(
            page,
            baseline.frames[index]!.png,
            state.frames[index]!.png,
            time,
            settings,
            copy
          );
          measurements.push(result);
          if (result.active) {
            expect(result.count, JSON.stringify(result)).toBeGreaterThan(100);
            expect(result.ink, JSON.stringify(result)).toBeGreaterThan(8);
            expect(result.boundsError, JSON.stringify(result)).toBeLessThanOrEqual(2);
            expect(result.backgroundError, JSON.stringify(result)).toBeLessThanOrEqual(12);
          } else expect(result.fullError, JSON.stringify(result)).toBeLessThanOrEqual(1);
          await writeFile(
            info.outputPath(`native-${item.id}-${time}.png`),
            Buffer.from(state.frames[index]!.png, 'base64')
          );
        }
        await writeFile(info.outputPath(`native-${item.id}.json`), JSON.stringify(measurements));
        await writeFile(info.outputPath(`authored-${item.id}.json`), JSON.stringify(state.project));
        states.push(state);
      }
      await page.goto(`${host.origin}${OFFSCREEN_HARNESS_PATH}`);
      await page.locator('[data-ui="offscreen.harness.root"][data-state="ready"]').waitFor();
      const off = await encodeKeys(page, baseline.project, format, `keys-${format}-off`, times);
      expect(off.width).toBe(640);
      expect(off.height).toBe(360);
      expect(Math.abs(off.duration - 4)).toBeLessThanOrEqual(0.05);
      for (const state of states) {
        const output = await encodeKeys(
          page,
          state.project,
          format,
          `keys-${format}-${state.id}`,
          times
        );
        const measurements = [];
        for (let index = 0; index < times.length; index++) {
          const time = times[index]!,
            copy = time === 3.6;
          const settings = state.project.actionFeedback![copy ? 1 : 0]!.keyStyles![0]!;
          const result = await inspectCaptionPixels(
            page,
            off.frames[index]!.png,
            output.frames[index]!.png,
            time,
            settings,
            copy
          );
          measurements.push(result);
          if (result.active) {
            expect(result.count, JSON.stringify(result)).toBeGreaterThan(100);
            expect(result.ink, JSON.stringify(result)).toBeGreaterThan(8);
            expect(result.boundsError, JSON.stringify(result)).toBeLessThanOrEqual(3);
            expect(result.backgroundError, JSON.stringify(result)).toBeLessThanOrEqual(20);
          } else expect(result.fullError, JSON.stringify(result)).toBeLessThanOrEqual(4);
          await writeFile(
            info.outputPath(`encoded-${state.id}-${time}.png`),
            Buffer.from(output.frames[index]!.png, 'base64')
          );
        }
        await writeFile(info.outputPath(`encoded-${state.id}.json`), JSON.stringify(measurements));
      }
    } finally {
      host.server.closeAllConnections();
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}

async function composeKeyFixture(project: VideoProject) {
  const main = project.clips.find((clip) => clip.type === 'VIDEO')!;
  if (main.type !== 'VIDEO') throw new Error('Missing gesture video.');
  main.fitMode = 'STRETCH';
  main.sourceCrop = { x: 0.25, y: 0, width: 0.5, height: 1 };
  main.windowHeader = {
    ...DEFAULT_WINDOW_HEADER,
    kind: 'application',
    title: 'Key composition',
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
    id: 'key-trailing',
    startTime: 2.6,
    duration: 1.4,
    sourceStart: 8.025,
    sourceDuration: 2.8,
  };
  main.transitionOut = 'CROSSFADE';
  main.timelineLaneId = null;
  trailing.transitionIn = 'CROSSFADE';
  trailing.timelineLaneId = null;
  project.clips.push(trailing);
  project.transitions = [
    {
      id: 'key-crossfade',
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
    id: 'late-key',
    anchor: { ...first.anchor, sourceEventId: 'late-key', sourceTime: 6.125 },
  });
  const late = project.actionEvents.at(-1)!;
  late.data = { ...late.data, keyboardOnsetTime: 6.125, downTime: 6.125, upTime: 6.425 };
  late.capturedDuration = 0.3;
  project.actionEvents = project.actionEvents.filter(
    (event) => event.anchor.kind !== 'recording-source' || event.anchor.sourceInstanceId !== 'copy'
  );
  const style = {
    ...REVIEW_KEY_DEFAULT,
    enabled: false,
    before: 0.2,
    after: 0.8,
    offset: 0.15,
    style: {
      ...REVIEW_KEY_DEFAULT.style,
      position: 'top-right' as const,
      fontFamily: 'monospace' as const,
      fontSize: 60,
      margin: 24,
      color: '#ffffffff',
      background: '#ff2200cc',
      opacity: 0.75,
      entrance: 'none' as const,
    },
  };
  project.actionFeedback![0]!.keyStyles = [
    { ...style, id: 'key' },
    { ...style, id: 'late-key', offset: 0, after: 0.4 },
  ];
  project.actionFeedback![1]!.keyStyles = [];
  project.effectSnapshots = [];
  project.effectInstances = [];
  for (const effect of [
    { filename: 'sniptale-video-warm', kind: 'targetEffect' },
    { filename: 'sniptale-transition-dissolve', kind: 'transition' },
  ] as const) {
    const source = await readFile(
      new URL(
        `../../../../packages/runtime-contracts/src/effect-v1/fixtures/collection/` +
          `${effect.filename}.sniptale-effect.json`,
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
          ? { kind: 'transition', transitionId: 'key-crossfade' }
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

async function inspectKeyComposition(page: Page, png: string, time: number) {
  const source = (
    await readFile(new URL('../fixtures/review-vp8-opus.webm', import.meta.url))
  ).toString('base64');
  return page.evaluate(
    async ({ png, source, time }) => {
      const image = new Image();
      image.src = `data:image/png;base64,${png}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 360;
      const context = canvas.getContext('2d')!;
      context.drawImage(image, 0, 0);
      const actual = context.getImageData(0, 0, 640, 360).data;
      const video = document.createElement('video');
      video.muted = true;
      const url = URL.createObjectURL(
        new Blob([Uint8Array.from(atob(source), (char) => char.charCodeAt(0))], {
          type: 'video/webm',
        })
      );
      try {
        await new Promise<void>((resolve, reject) => {
          video.onloadeddata = () => resolve();
          video.onerror = () => reject(new Error('Source decode failed.'));
          video.src = url;
        });
        const decode = async (clock: number) => {
          await new Promise<void>((resolve, reject) => {
            video.onseeked = () => resolve();
            video.onerror = () => reject(new Error('Source seek failed.'));
            video.currentTime = clock;
          });
          const sample = document.createElement('canvas');
          sample.width = 160;
          sample.height = 90;
          const draw = sample.getContext('2d')!;
          draw.drawImage(video, 0, 0);
          return draw.getImageData(0, 0, 160, 90).data;
        };
        const leading = await decode(0.525 + time * 2);
        const trailing = time > 2.6 ? await decode(8.025 + (time - 2.6) * 2) : leading;
        const upper = await decode(0.525 + time);
        const sample = (bytes: Uint8ClampedArray, x: number, y: number) => {
          const left = Math.max(0, Math.min(159, Math.floor(x))),
            top = Math.max(0, Math.min(89, Math.floor(y)));
          const right = Math.min(159, left + 1),
            bottom = Math.min(89, top + 1);
          const fx = x - Math.floor(x),
            fy = y - Math.floor(y);
          return [0, 1, 2].map(
            (channel) =>
              bytes[(top * 160 + left) * 4 + channel]! * (1 - fx) * (1 - fy) +
              bytes[(top * 160 + right) * 4 + channel]! * fx * (1 - fy) +
              bytes[(bottom * 160 + left) * 4 + channel]! * (1 - fx) * fy +
              bytes[(bottom * 160 + right) * 4 + channel]! * fx * fy
          );
        };
        let cropError = 0,
          informative = 0,
          warmDifference = 0,
          warmCount = 0;
        const weight = time > 2.6 ? 0.5 : 0;
        for (let y = 100; y <= 280; y += 30)
          for (let x = 120; x <= 520; x += 25) {
            if (x >= 350 && x <= 450 && y < 210) continue;
            const sx = 40 + ((x + 0.5 - 80) / 480) * 80 - 0.5;
            const sy = ((y + 0.5 - 60) / 240) * 93.2 - 3.2 - 0.5;
            const from = sample(leading, sx, sy),
              to = sample(trailing, sx, sy);
            const expected = from.map(
              (value, channel) => value * (1 - weight) + to[channel]! * weight
            );
            const wrong = weight ? from : sample(leading, ((x + 0.5 - 80) / 480) * 160 - 0.5, sy);
            if (
              expected.reduce((sum, value, channel) => sum + Math.abs(value - wrong[channel]!), 0) /
                3 <
              25
            )
              continue;
            informative++;
            for (let channel = 0; channel < 3; channel++)
              cropError += Math.abs(actual[(y * 640 + x) * 4 + channel]! - expected[channel]!);
          }
        for (let y = 115; y <= 185; y += 10)
          for (let x = 370; x <= 430; x += 10) {
            const expected = sample(
              upper,
              ((x + 0.5 - 360) / 80) * 160 - 0.5,
              ((y + 0.5 - 100) / 100) * 90 - 0.5
            );
            for (let channel = 0; channel < 3; channel++) {
              warmDifference += Math.abs(actual[(y * 640 + x) * 4 + channel]! - expected[channel]!);
              warmCount++;
            }
          }
        const header = [...actual.slice((64 * 640 + 320) * 4, (64 * 640 + 320) * 4 + 3)];
        return {
          informative,
          cropError: cropError / (informative * 3),
          warmDifference: warmDifference / warmCount,
          header,
        };
      } finally {
        video.removeAttribute('src');
        video.load();
        URL.revokeObjectURL(url);
      }
    },
    { png, source, time }
  );
}

for (const format of ['WEBM', 'MP4'] as const) {
  test(`Native key captions retain crop header FX and crossfade in ${format}`, async ({
    page,
  }, info) => {
    test.setTimeout(240000);
    page.setDefaultTimeout(15000);
    await page.setViewportSize({ width: 1920, height: 900 });
    const host = await startHostServer(),
      times = [0.6, 2.8];
    try {
      const initial = await acquire(page, host.origin, 'en', 'dark', async (project) => {
        project.fps = 20;
        project.cursorTrack = null;
        for (const clip of project.clips)
          if (clip.type === 'VIDEO') {
            clip.sourceStart += 0.025;
            clip.transform = { ...clip.transform, y: 60, height: 240 };
          }
        for (const event of project.actionEvents)
          if (event.anchor.kind === 'recording-source') {
            event.anchor.sourceTime += 0.025;
            for (const key of ['keyboardOnsetTime', 'downTime', 'upTime'] as const) {
              const value = event.data[key];
              if (typeof value === 'number') event.data[key] = value + 0.025;
            }
          }
        await composeKeyFixture(project);
      });
      const main = initial.clips[0]!,
        original = initial.actionEvents[0]!;
      const states = [];
      for (const enabled of [false, true]) {
        if (enabled)
          for (const id of [original.id, 'late-key']) {
            await page
              .locator(
                `[data-ui="video-editor.timeline.history-event"][data-action-id="${id}` +
                  `"][data-action-clip-id="${main.id}"]`
              )
              .click();
            const owner = page.locator('[data-ui="video-editor.inspector.history-event"]');
            await owner
              .locator('nav')
              .getByRole('button', {
                name: translate('gallery.videoReview.keyDisplay', 'en'),
                exact: true,
              })
              .click();
            await chooseInspectorValue(
              page,
              owner,
              translate('gallery.videoReview.keyDisplay', 'en'),
              translate('gallery.videoReview.keyCaption', 'en')
            );
          }
        await expect
          .poll(async () =>
            (await readNativeVideoProject(page))?.actionFeedback?.[0]?.keyStyles?.map(
              (style) => style.enabled
            )
          )
          .toEqual([enabled, enabled]);
        const frames = [];
        for (const time of times) {
          await seek(page, time);
          frames.push({
            time,
            ...(await page.locator('[data-preview-stage-canvas]').evaluate(captureKeyRaster)),
          });
        }
        states.push({ project: (await readNativeVideoProject(page))!, frames });
      }
      expect(states[1]!.project.actionEvents).toEqual(initial.actionEvents);
      expect(states[1]!.project.clips).toEqual(initial.clips);
      expect(states[1]!.project.effectInstances).toEqual(initial.effectInstances);
      const validate = async (
        off: (typeof states)[0]['frames'],
        on: typeof off,
        encoded: boolean
      ) => {
        const proof = [];
        for (let index = 0; index < times.length; index++) {
          const time = times[index]!,
            settings = states[1]!.project.actionFeedback![0]!.keyStyles!.find(
              (style) => style.id === (index ? 'late-key' : 'key')
            )!;
          const window = index ? { start: 2.6, end: 3 } : { start: 0.2, end: 1.2 };
          const caption = await inspectCaptionPixels(
            page,
            off[index]!.png,
            on[index]!.png,
            time,
            settings,
            false,
            window
          );
          expect(caption.count, JSON.stringify(caption)).toBeGreaterThan(100);
          expect(caption.ink, JSON.stringify(caption)).toBeGreaterThan(8);
          expect(caption.boundsError, JSON.stringify(caption)).toBeLessThanOrEqual(encoded ? 3 : 2);
          expect(caption.backgroundError, JSON.stringify(caption)).toBeLessThanOrEqual(
            encoded ? 20 : 12
          );
          const composition = await inspectKeyComposition(page, on[index]!.png, time);
          expect(composition.informative, JSON.stringify(composition)).toBeGreaterThan(0);
          expect(composition.cropError, JSON.stringify(composition)).toBeLessThanOrEqual(
            encoded ? 32 : 12
          );
          expect(composition.warmDifference, JSON.stringify(composition)).toBeGreaterThan(5);
          expect(
            composition.header.every((value) => value > 180),
            JSON.stringify(composition)
          ).toBe(true);
          proof.push({ time, caption, composition });
          await writeFile(
            info.outputPath(`${encoded ? 'encoded' : 'native'}-composition-${time}.png`),
            Buffer.from(on[index]!.png, 'base64')
          );
        }
        return proof;
      };
      const native = await validate(states[0]!.frames, states[1]!.frames, false);
      await page.goto(`${host.origin}${OFFSCREEN_HARNESS_PATH}`);
      await page.locator('[data-ui="offscreen.harness.root"][data-state="ready"]').waitFor();
      const off = await encodeKeys(
        page,
        states[0]!.project,
        format,
        `key-compose-${format}-off`,
        times
      );
      const on = await encodeKeys(
        page,
        states[1]!.project,
        format,
        `key-compose-${format}-on`,
        times
      );
      const encoded = await validate(off.frames, on.frames, true);
      await writeFile(
        info.outputPath('key-composition-proof.json'),
        JSON.stringify({ native, encoded })
      );
    } finally {
      host.server.closeAllConnections();
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}

test('Native key history drags preserve clipped phases and support cancellation and lock', async ({
  page,
}, info) => {
  test.setTimeout(180000);
  await page.setViewportSize({ width: 1920, height: 900 });
  const host = await startHostServer();
  try {
    const initial = await acquire(page, host.origin, 'en', 'dark', (project) => {
      project.actionFeedback![0]!.keyStyles = patchReviewKeys([], ['key'], {
        enabled: true,
        before: 0.4,
        after: 0.8,
        offset: 0.1,
      });
    });
    const main = initial.clips[0]!;
    const event = page.locator(
      `[data-ui="video-editor.timeline.history-event"][data-action-clip-id="${main.id}"]`
    );
    await event.click();
    await expect(page.locator('[data-preview-stage-point-handle]')).toHaveCount(0);
    const style = async () =>
      (await readNativeVideoProject(page))!.actionFeedback![0]!.keyStyles![0]!;
    const ticks = await page
      .locator('[data-ui="video-editor.timeline.ruler"] > div > span')
      .evaluateAll((nodes) =>
        nodes.slice(0, 2).map((node) => ({
          x: node.parentElement!.getBoundingClientRect().x,
          text: node.textContent!.trim(),
        }))
      );
    const seconds = (text: string) => {
      const parts = text.split(':');
      return Number(parts[0]) * 60 + Number(parts[1]);
    };
    const rate = (ticks[1]!.x - ticks[0]!.x) / (seconds(ticks[1]!.text) - seconds(ticks[0]!.text));
    const drag = async (delta: number, cancel = false) => {
      const box = (await event.boundingBox())!;
      await page.mouse.move(box.x + 8, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + 8 + rate * delta, box.y + box.height / 2);
      if (cancel) await page.keyboard.press('Escape');
      await page.mouse.up();
    };
    await drag(0);
    expect((await style()).offset).toBe(0.1);
    await drag(0.2, true);
    expect((await style()).offset).toBe(0.1);
    await drag(0.2);
    await expect.poll(async () => (await style()).offset).toBeCloseTo(0.3, 2);
    await page.locator('[data-ui="video-editor.timeline.toolbar.undo"]').click();
    await expect.poll(async () => (await style()).offset).toBe(0.1);
    await page.locator('[data-ui="video-editor.timeline.toolbar.redo"]').click();
    await expect.poll(async () => (await style()).offset).toBeCloseTo(0.3, 2);
    await page
      .locator('[data-ui="timeline.utility-lane-state"]')
      .filter({ has: page.locator('svg.lucide-unlock') })
      .first()
      .click();
    await expect
      .poll(async () => (await readNativeVideoProject(page))!.utilityLanes?.actions.locked)
      .toBe(true);
    const locked = (await readNativeVideoProject(page))!;
    await drag(0.2);
    expect((await readNativeVideoProject(page))!.actionFeedback).toEqual(locked.actionFeedback);
    expect((await readNativeVideoProject(page))!.actionEvents).toEqual(initial.actionEvents);
    await page.screenshot({ path: info.outputPath('key-history-locked.png'), fullPage: false });
  } finally {
    host.server.closeAllConnections();
    await new Promise<void>((resolve) => host.server.close(() => resolve()));
  }
});

test('Native duplicate preserves key captions and edits the new source instance independently', async ({
  page,
}, info) => {
  test.setTimeout(180000);
  page.setDefaultTimeout(15000);
  await page.setViewportSize({ width: 1920, height: 900 });
  const host = await startHostServer();
  try {
    const initial = await acquire(page, host.origin, 'en', 'dark', (project) => {
      project.actionEvents = project.actionEvents.filter(
        (event) =>
          event.anchor.kind !== 'recording-source' || event.anchor.sourceInstanceId !== 'copy'
      );
      project.actionFeedback![0]!.keyStyles = patchReviewKeys([], ['key'], {
        enabled: true,
        before: 0.2,
        after: 0.8,
        offset: 0.1,
        style: { fontFamily: 'serif', fontSize: 60, color: '#ff2200ff', position: 'top-right' },
      });
    });
    await page
      .locator(`[data-project-timeline-clip="${initial.clips[0]!.id}"]`)
      .click({ position: { x: 24, y: 12 } });
    await page
      .getByRole('button', { name: translate('videoEditor.timeline.duplicate', 'en'), exact: true })
      .click();
    await expect.poll(async () => (await readNativeVideoProject(page))?.clips.length).toBe(3);
    const duplicated = (await readNativeVideoProject(page))!;
    const clip = duplicated.clips.find(
      (item) => !initial.clips.some((original) => original.id === item.id)
    )!;
    expect(clip.sourceInstanceId).not.toBe(initial.clips[0]!.sourceInstanceId);
    const group = duplicated.actionFeedback!.find(
      (item) => item.sourceInstanceId === clip.sourceInstanceId
    )!;
    expect(group.keyStyles).toEqual(initial.actionFeedback![0]!.keyStyles);
    await page
      .locator(`[data-ui="video-editor.timeline.history-event"][data-action-clip-id="${clip.id}"]`)
      .click();
    const owner = page.locator('[data-ui="video-editor.inspector.history-event"]');
    await owner
      .locator('nav')
      .getByRole('button', {
        name: translate('gallery.videoReview.clickAppearance', 'en'),
        exact: true,
      })
      .click();
    const font = owner.getByRole('textbox', {
      name: translate('gallery.videoReview.key_fontSize', 'en'),
      exact: true,
    });
    await font.fill('84');
    await font.press('Enter');
    const copiedStyle = async () =>
      (await readNativeVideoProject(page))!.actionFeedback!.find(
        (item) => item.sourceInstanceId === clip.sourceInstanceId
      )!.keyStyles![0]!;
    await expect.poll(async () => (await copiedStyle()).style.fontSize).toBe(84);
    const edited = (await readNativeVideoProject(page))!;
    expect(
      edited.actionFeedback!.filter((item) => item.sourceInstanceId !== clip.sourceInstanceId)
    ).toEqual(initial.actionFeedback);
    expect(edited.actionEvents).toEqual(duplicated.actionEvents);
    await page.locator('[data-ui="video-editor.timeline.toolbar.undo"]').click();
    await expect.poll(async () => (await copiedStyle()).style.fontSize).toBe(60);
    await page.locator('[data-ui="video-editor.timeline.toolbar.redo"]').click();
    await expect.poll(async () => (await copiedStyle()).style.fontSize).toBe(84);
    await page.screenshot({ path: info.outputPath('key-duplicate.png'), fullPage: false });
  } finally {
    host.server.closeAllConnections();
    await new Promise<void>((resolve) => host.server.close(() => resolve()));
  }
});

for (const format of ['WEBM', 'MP4'] as const) {
  test(`Native newest key cue replaces earlier cue without revival in ${format}`, async ({
    page,
  }, info) => {
    test.setTimeout(180000);
    await page.setViewportSize({ width: 1920, height: 900 });
    const host = await startHostServer();
    const times = [0.3, 0.6, 0.9];
    try {
      const initial = await acquire(page, host.origin, 'en', 'dark', (project) => {
        project.fps = 20;
        project.cursorTrack = null;
        for (const clip of project.clips)
          if (clip.type === 'VIDEO') {
            clip.sourceStart += 0.025;
            clip.transform = { ...clip.transform, y: 60, height: 240 };
          }
        project.actionEvents = project.actionEvents.filter(
          (event) =>
            event.anchor.kind !== 'recording-source' || event.anchor.sourceInstanceId !== 'copy'
        );
        const first = project.actionEvents[0]!;
        if (first.anchor.kind !== 'recording-source') throw new Error('Missing source anchor.');
        first.anchor.sourceTime = 1.025;
        first.data = { ...first.data, keyboardOnsetTime: 1.025, downTime: 1.025, upTime: 1.125 };
        project.actionEvents.push({
          ...structuredClone(first),
          id: 'new-key-event',
          anchor: { ...first.anchor, sourceEventId: 'new-key', sourceTime: 1.425 },
          data: { ...first.data, keyboardOnsetTime: 1.425, downTime: 1.425, upTime: 1.525 },
        });
        const old = patchReviewKeys([], ['key'], {
          enabled: false,
          before: 0,
          after: 1.5,
          offset: 0,
          style: {
            position: 'top-right',
            fontFamily: 'monospace',
            fontSize: 60,
            margin: 24,
            color: '#ffffffff',
            background: '#ff2200cc',
            opacity: 0.75,
            entrance: 'none',
          },
        })[0]!;
        project.actionFeedback![0]!.keyStyles = [
          old,
          {
            ...structuredClone(old),
            id: 'new-key',
            after: 0.3,
            style: { ...old.style, background: '#2244ffff' },
          },
        ];
      });
      const capture = async () => {
        const frames = [];
        for (const time of times) {
          await seek(page, time);
          frames.push({
            time,
            ...(await page.locator('[data-preview-stage-canvas]').evaluate(captureKeyRaster)),
          });
        }
        return frames;
      };
      const baseline = { project: (await readNativeVideoProject(page))!, frames: await capture() };
      await page.locator('[data-ui="video-editor.timeline.history-lane"]').click();
      const owner = page.locator('[data-ui="video-editor.inspector.history-lane"]');
      await owner
        .locator('nav')
        .getByRole('button', {
          name: translate('gallery.videoReview.keyDisplay', 'en'),
          exact: true,
        })
        .click();
      await chooseInspectorValue(
        page,
        owner,
        translate('gallery.videoReview.keyDisplay', 'en'),
        translate('gallery.videoReview.keyCaption', 'en')
      );
      await expect
        .poll(async () =>
          (await readNativeVideoProject(page))?.actionFeedback?.[0]?.keyStyles?.map(
            (item) => item.enabled
          )
        )
        .toEqual([true, true]);
      const enabled = { project: (await readNativeVideoProject(page))!, frames: await capture() };
      expect(enabled.project.actionEvents).toEqual(initial.actionEvents);
      const check = async (
        off: typeof baseline.frames,
        on: typeof enabled.frames,
        encoded: boolean
      ) => {
        const measurements = [];
        for (let index = 0; index < times.length; index++) {
          const time = times[index]!,
            newer = index === 1;
          const settings = enabled.project.actionFeedback![0]!.keyStyles!.find(
            (item) => item.id === (newer ? 'new-key' : 'key')
          )!;
          const result = await inspectCaptionPixels(
            page,
            off[index]!.png,
            on[index]!.png,
            time,
            settings,
            newer,
            { start: index === 2 ? 2 : newer ? 0.45 : 0.25, end: newer ? 0.75 : 1.75 }
          );
          if (index < 2) {
            expect(result.active).toBe(true);
            expect(result.count, JSON.stringify(result)).toBeGreaterThan(100);
            expect(result.ink, JSON.stringify(result)).toBeGreaterThan(8);
            expect(result.boundsError, JSON.stringify(result)).toBeLessThanOrEqual(encoded ? 3 : 2);
            expect(result.backgroundError, JSON.stringify(result)).toBeLessThanOrEqual(
              encoded ? 20 : 12
            );
          } else
            expect(result.fullError, JSON.stringify(result)).toBeLessThanOrEqual(encoded ? 4 : 1);
          measurements.push(result);
          await writeFile(
            info.outputPath(`${encoded ? 'encoded' : 'native'}-replacement-${time}.png`),
            Buffer.from(on[index]!.png, 'base64')
          );
        }
        await writeFile(
          info.outputPath(`${encoded ? 'encoded' : 'native'}-replacement.json`),
          JSON.stringify(measurements)
        );
      };
      await check(baseline.frames, enabled.frames, false);
      await page.goto(`${host.origin}${OFFSCREEN_HARNESS_PATH}`);
      await page.locator('[data-ui="offscreen.harness.root"][data-state="ready"]').waitFor();
      const off = await encodeKeys(
        page,
        baseline.project,
        format,
        `key-replacement-${format}-off`,
        times
      );
      const on = await encodeKeys(
        page,
        enabled.project,
        format,
        `key-replacement-${format}-on`,
        times
      );
      await check(off.frames, on.frames, true);
    } finally {
      host.server.closeAllConnections();
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}
