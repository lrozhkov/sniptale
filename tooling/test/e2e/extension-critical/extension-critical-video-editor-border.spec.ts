import type { VideoProject } from '../../../../apps/extension/src/features/video/project/types';
import { createQuickEditBorder } from '../../../../apps/extension/src/features/video/project/scene/focus-appearance';
import { hydrateVideoProject } from '../../../../apps/extension/src/features/video/project/hydration';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import {
  createVideoProjectFromRecording,
  createVideoProjectTrack,
} from '../../../../apps/extension/src/features/video/project/factories/creation';
import { createVideoProjectMotionRegion } from '../../../../apps/extension/src/features/video/project/motion';
import { bindMotionRegionToClip } from '../../../../apps/extension/src/features/video/project/motion/source-binding';
import { seedReviewVideo } from '../support/quick-editor-media-fixture';
import { readNativeVideoProject } from '../support/native-video-project';
import {
  chooseInspectorValue,
  checkInspectorPaintedFont,
  checkInspectorParameterRows,
} from '../support/inspector-utilities';
import {
  applyHarnessBootstrap,
  GALLERY_HARNESS_PATH,
  VIDEO_EDITOR_HARNESS_PATH,
  OFFSCREEN_HARNESS_PATH,
  emitTrustedOffscreenHarnessRuntimeMessage,
  getRuntimeMessagesByType,
  VideoMessageType,
} from '../extension-critical.helpers';
import { startHostServer } from '../support/host-server';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import {
  parseEffectV1Source,
  resolveEffectV1ControlDefault,
} from '@sniptale/runtime-contracts/effect-v1';
import { DEFAULT_WINDOW_HEADER } from '@sniptale/runtime-contracts/window-header';
import { isValidVideoProject } from '../../../../apps/extension/src/features/video/project/validation/root';
import { build } from 'esbuild';
import { expect, test, type Page } from '@playwright/test';

test('Native border preview and export preserve window scope, alpha and output coordinates', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1280, height: 560 });
  const host = await startHostServer();
  try {
    await page.goto(host.origin);
    await page.evaluate(() => document.body.replaceChildren());
    const [bundle, bytes] = await Promise.all([
      build({
        stdin: {
          contents:
            "export { nativeBorderRasterProof } from './tooling/test/e2e/support/video-editor-border-probe';",
          resolveDir: process.cwd(),
        },
        bundle: true,
        format: 'esm',
        platform: 'browser',
        write: false,
        loader: { '.woff2': 'dataurl' },
      }),
      readFile(new URL('../fixtures/review-vp8-opus.webm', import.meta.url)),
    ]);
    const result = await page.evaluate(
      async ({ source, bytes }) => {
        const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
        try {
          const { nativeBorderRasterProof } = await import(url);
          return await nativeBorderRasterProof(bytes);
        } finally {
          URL.revokeObjectURL(url);
        }
      },
      { source: bundle.outputFiles[0]!.text, bytes: [...bytes] }
    );
    await writeFile(info.outputPath('native-border-pixels.json'), JSON.stringify(result, null, 2));
    await page.screenshot({
      path: info.outputPath('native-border-preview-export.png'),
      fullPage: false,
    });
    expect(result).toHaveLength(12);
    for (const row of result) {
      expect.soft(row.maxDifference, JSON.stringify(row)).toBeLessThanOrEqual(1);
      expect.soft(row.baselineDifference, JSON.stringify(row)).toBeLessThanOrEqual(1);
      if (row.translatedInput) {
        expect.soft(row.translatedInput.maxDifference).toBeLessThanOrEqual(1);
        expect.soft(row.translatedInput.red).toEqual([255, 0, 0, 255]);
      }
      for (let channel = 0; channel < 4; channel++)
        expect
          .soft(Math.abs(row.red[channel]! - row.expectedRed[channel]!), JSON.stringify(row))
          .toBeLessThanOrEqual(2);
      expect.soft(row.green[1], JSON.stringify(row)).toBeGreaterThanOrEqual(250);
      expect.soft(row.green[0], JSON.stringify(row)).toBeLessThanOrEqual(2);
      expect.soft(row.independent, JSON.stringify(row)).toEqual(row.independentBaseline);
    }
  } finally {
    host.server.closeAllConnections();
    await new Promise<void>((resolve) => host.server.close(() => resolve()));
  }
});

for (const [index, size] of [
  { width: 1280, height: 560 },
  { width: 1920, height: 900 },
].entries()) {
  test(`Native border inspector ${size.width}`, async ({ page }, info) => {
    test.setTimeout(180000);
    await page.setViewportSize(size);
    const locale = index === 0 ? 'ru' : 'en';
    const theme = index === 0 ? 'light' : 'dark';
    await page.emulateMedia({ colorScheme: theme });
    const host = await startHostServer();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const label = (key: Parameters<typeof translate>[0]) => translate(key, locale);
    try {
      const bytes = await readFile(new URL('../fixtures/review-vp8-opus.webm', import.meta.url));
      const project = createVideoProjectFromRecording({
        recordingId: 'beta-v1-recording',
        filename: 'border.webm',
        width: 160,
        height: 90,
        duration: 12,
        mimeType: 'video/webm',
        size: bytes.length,
      });
      project.width = 640;
      project.height = 360;
      project.duration = 1.2;
      const video = project.clips.find((clip) => clip.type === 'VIDEO')!;
      video.duration = 1.2;
      video.sourceDuration = 1.2;
      const copyTrack = createVideoProjectTrack('Second video', 1, 'PRIMARY');
      project.tracks.push(copyTrack);
      const copy = {
        ...structuredClone(video),
        id: 'same-name-copy',
        trackId: copyTrack.id,
        transform: { x: 400, y: 230, width: 160, height: 90, rotation: 0, opacity: 1 },
      };
      project.clips.push(copy);
      const firstTarget = `${video.name} · ${project.tracks.find((track) => track.id === video.trackId)!.name} (1)`;
      const secondTarget = `${copy.name} · ${copyTrack.name} (2)`;
      project.motionRegions = [
        bindMotionRegionToClip(
          { ...createVideoProjectMotionRegion(project, 0), id: 'border-native', duration: 1.2 },
          video
        ),
      ];
      Object.assign(project, hydrateVideoProject(project));
      await applyHarnessBootstrap(page, {
        preserveMediaLibrary: true,
        videoProjects: [project],
        storage: { 'sniptale-locale-preference': locale, 'sniptale-theme-preference': theme },
      });
      await page.addInitScript(
        ({ language, theme }) => {
          localStorage.setItem('sniptale-locale-preference', language);
          localStorage.setItem('sniptale-theme-preference', theme);
          if (sessionStorage.getItem('native-border-seeded')) {
            const bootstrap: unknown = Reflect.get(window, '__sniptaleHarnessBootstrap');
            if (typeof bootstrap === 'object' && bootstrap !== null)
              Reflect.deleteProperty(bootstrap, 'videoProjects');
          }
        },
        { language: locale, theme }
      );
      await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}?theme=${theme}`);
      await page.locator('[data-ui="gallery.page.root"]').waitFor();
      await seedReviewVideo(page, 'review-vp8-opus.webm', { width: 160, height: 90, duration: 12 });
      await page.evaluate(() => sessionStorage.setItem('native-border-seeded', 'true'));
      await page.goto(
        `${host.origin}${VIDEO_EDITOR_HARNESS_PATH}?project=${project.id}&theme=${theme}`
      );
      await page.locator('[data-ui="video-editor.timeline.surface"]').waitFor();
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await page.locator('[data-timeline-effect-segment="border-native"] button').first().click();
      const inspector = page.locator('[data-ui="video-editor.floating.context-inspector"]');
      await chooseInspectorValue(
        page,
        inspector,
        label('gallery.videoReview.focusType'),
        label('gallery.videoReview.focusBorder')
      );
      const read = async () => (await readNativeVideoProject(page))!;
      await expect.poll(async () => (await read()).motionRegions![0]!.borderTarget).toBe('window');
      const targetLabel = label('videoEditor.sidebar.borderTarget');
      const targetGroup = inspector.getByRole('group', { name: targetLabel, exact: true });
      if (await targetGroup.count()) {
        await expect(
          targetGroup.getByRole('button', { name: firstTarget, exact: true })
        ).toBeVisible();
        await expect(
          targetGroup.getByRole('button', { name: secondTarget, exact: true })
        ).toBeVisible();
      } else {
        await inspector.getByRole('button', { name: targetLabel, exact: true }).click();
        await expect(page.getByRole('option', { name: firstTarget, exact: true })).toBeVisible();
        await expect(page.getByRole('option', { name: secondTarget, exact: true })).toBeVisible();
        await page.screenshot({
          path: info.outputPath('native-border-distinct-targets.png'),
          fullPage: false,
        });
        await page.keyboard.press('Escape');
      }
      for (const [target, clipId] of [
        [secondTarget, copy.id],
        [firstTarget, video.id],
      ] as const) {
        await chooseInspectorValue(page, inspector, targetLabel, target);
        await expect
          .poll(async () => (await read()).motionRegions![0]!.sourceBinding!.clipId)
          .toBe(clipId);
        await expect
          .poll(async () => (await read()).motionRegions![0]!.borderTarget)
          .toBe('window');
      }
      await expect(page.locator('[data-preview-stage-point-handle]')).toHaveCount(0);
      await expect(page.locator('[data-preview-stage-border-handle]')).toHaveCount(4);
      const lane = page
        .locator('[data-ui="video-editor.timeline.motion-lane-select"]')
        .locator('..');
      await lane
        .getByRole('button', { name: label('videoEditor.timeline.laneEditable'), exact: true })
        .click();
      await expect.poll(async () => (await read()).utilityLanes!.camera.locked).toBe(true);
      await expect(page.locator('[data-preview-stage-border-handle]')).toHaveCount(0);
      await lane
        .getByRole('button', { name: label('videoEditor.timeline.laneLocked'), exact: true })
        .click();
      await expect.poll(async () => (await read()).utilityLanes!.camera.locked).toBe(false);
      await expect(page.locator('[data-preview-stage-border-handle]')).toHaveCount(4);
      await chooseInspectorValue(
        page,
        inspector,
        label('videoEditor.sidebar.borderTarget'),
        label('videoEditor.sidebar.borderTargetViewport')
      );
      await expect
        .poll(async () => (await read()).motionRegions![0]!.borderTarget)
        .toBe('viewport');
      const beforeArea = (await read()).motionRegions![0]!.border!.area;
      const area = page.locator('[data-preview-stage-border-area]');
      let box = (await area.boundingBox())!;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 + 10, box.y + box.height / 2 + 5);
      expect((await read()).motionRegions![0]!.border!.area).toEqual(beforeArea);
      await page.keyboard.press('Escape');
      await page.mouse.up();
      expect((await read()).motionRegions![0]!.border!.area).toEqual(beforeArea);
      box = (await area.boundingBox())!;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 + 10, box.y + box.height / 2 + 5);
      await page.mouse.up();
      await expect
        .poll(async () => (await read()).motionRegions![0]!.border!.area.x)
        .toBeGreaterThan(beforeArea.x);
      const resize = page.locator('[data-preview-stage-border-handle="se"]');
      const initialWidth = (await read()).motionRegions![0]!.border!.area.width;
      const resizeBox = (await resize.boundingBox())!;
      await page.mouse.move(resizeBox.x + resizeBox.width / 2, resizeBox.y + resizeBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(
        resizeBox.x + resizeBox.width / 2 + 4,
        resizeBox.y + resizeBox.height / 2 + 4
      );
      await page.mouse.up();
      await expect
        .poll(async () => (await read()).motionRegions![0]!.border!.area.width)
        .toBeGreaterThan(initialWidth);
      await resize.focus();
      const beforeKey = (await read()).motionRegions![0]!.border!.area.width;
      await resize.press('ArrowLeft');
      await expect
        .poll(async () => (await read()).motionRegions![0]!.border!.area.width)
        .toBeLessThan(beforeKey);
      await chooseInspectorValue(
        page,
        inspector,
        label('videoEditor.sidebar.borderTarget'),
        firstTarget
      );
      await expect.poll(async () => (await read()).motionRegions![0]!.borderTarget).toBe('window');
      const color = inspector.locator('[data-ui="shared.ui.compact-inspector.color-field"]');
      await color.locator('[data-ui="shared.ui.color-selector.picker-trigger"]').click();
      const picker = page.locator('[data-ui="shared.ui.color-selector.picker"]');
      await expect(picker).toBeVisible();
      const pickerBox = (await picker.boundingBox())!;
      expect(pickerBox.x).toBeGreaterThanOrEqual(0);
      expect(pickerBox.x + pickerBox.width).toBeLessThanOrEqual(size.width + 1);
      await page.screenshot({
        path: info.outputPath('native-border-color-picker.png'),
        fullPage: false,
      });
      await page.keyboard.press('Escape');
      await expect(picker).toBeHidden();
      await color
        .getByRole('button', { name: label('gallery.videoReview.borderColor'), exact: true })
        .click();
      const colorInput = color.getByRole('textbox', {
        name: label('gallery.videoReview.borderColor'),
        exact: true,
      });
      await colorInput.fill('#12345680');
      await colorInput.press('Enter');
      await expect
        .poll(async () => (await read()).motionRegions![0]!.border!.color)
        .toBe('#12345680');
      const width = inspector.getByRole('textbox', {
        name: label('gallery.videoReview.borderWidth'),
        exact: true,
      });
      await width.fill('8');
      await width.press('Enter');
      await expect.poll(async () => (await read()).motionRegions![0]!.border!.width).toBe(8);
      await chooseInspectorValue(
        page,
        inspector,
        label('gallery.videoReview.borderStyle'),
        label('gallery.videoReview.borderStyle_dashed')
      );
      await expect.poll(async () => (await read()).motionRegions![0]!.border!.style).toBe('dashed');
      await checkInspectorPaintedFont(page, width, 'native-border-width');
      await page.screenshot({
        path: info.outputPath('native-border-appearance.png'),
        fullPage: false,
      });
      await inspector
        .getByRole('button', {
          name: label('videoEditor.sidebar.inspectorGroupAnimation'),
          exact: true,
        })
        .click();
      const animation = inspector.locator('[data-ui="video-editor.motion.border-animation"]');
      const enter = animation.getByRole('group', {
        name: label('gallery.videoReview.zoomTransitionIn'),
        exact: true,
      });
      await chooseInspectorValue(
        page,
        enter,
        label('gallery.videoReview.focusReveal'),
        label('gallery.videoReview.borderDrawing')
      );
      await expect.poll(async () => (await read()).motionRegions![0]!.border!.reveal).toBe('draw');
      const hold = animation.getByRole('group', {
        name: label('gallery.videoReview.borderHold'),
        exact: true,
      });
      await chooseInspectorValue(
        page,
        hold,
        label('gallery.videoReview.focusReveal'),
        label('gallery.videoReview.borderRotation')
      );
      await chooseInspectorValue(
        page,
        hold,
        label('gallery.videoReview.borderDirection'),
        label('gallery.videoReview.borderCounterclockwise')
      );
      await expect
        .poll(async () => (await read()).motionRegions![0]!.border!.motion)
        .toBe('counterclockwise');
      const speed = hold.getByRole('textbox', {
        name: label('gallery.videoReview.borderSpeed'),
        exact: true,
      });
      await speed.fill('2');
      await speed.press('Enter');
      await expect.poll(async () => (await read()).motionRegions![0]!.border!.period).toBe(1);
      const rail = inspector.locator('[data-ui="video-editor.inspector.categories"] > nav');
      const railBefore = await rail.boundingBox();
      await enter
        .getByRole('textbox', {
          name: label('gallery.videoReview.zoomTransitionDuration'),
          exact: true,
        })
        .scrollIntoViewIfNeeded();
      expect((await rail.boundingBox())!.y).toBe(railBefore!.y);
      await speed.scrollIntoViewIfNeeded();
      expect((await rail.boundingBox())!.y).toBe(railBefore!.y);
      await page.screenshot({
        path: info.outputPath('native-border-animation.png'),
        fullPage: false,
      });
      const closeMaterials = page.locator('[data-ui="video-editor.materials.close"]');
      if (await closeMaterials.isVisible()) await closeMaterials.click();
      const resizeInspector = page.locator(
        '[data-ui="video-editor.floating.context-inspector.resize"]'
      );
      for (const targetWidth of [520, 359, 360, 361]) {
        const currentWidth = (await inspector.boundingBox())!.width;
        const handle = (await resizeInspector.boundingBox())!;
        await page.mouse.move(handle.x + handle.width / 2, handle.y + 12);
        await page.mouse.down();
        await page.mouse.move(
          handle.x + handle.width / 2 + currentWidth - targetWidth,
          handle.y + 12
        );
        await page.mouse.up();
        await expect
          .poll(async () => Math.round((await inspector.boundingBox())!.width))
          .toBe(targetWidth);
        await enter
          .getByRole('textbox', {
            name: label('gallery.videoReview.zoomTransitionDuration'),
            exact: true,
          })
          .scrollIntoViewIfNeeded();
        const position = await rail.boundingBox();
        await speed.scrollIntoViewIfNeeded();
        expect((await rail.boundingBox())!.y).toBe(position!.y);
        expect(await inspector.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(
          true
        );
        await checkInspectorParameterRows(inspector);
        await page.screenshot({
          path: info.outputPath(`native-border-animation-${targetWidth}.png`),
          fullPage: false,
        });
      }
      await page.locator('[data-ui="video-editor.timeline.toolbar.undo"]').click();
      await expect.poll(async () => (await read()).motionRegions![0]!.border!.period).toBe(2);
      await page.locator('[data-ui="video-editor.timeline.toolbar.redo"]').click();
      await expect.poll(async () => (await read()).motionRegions![0]!.border!.period).toBe(1);
      await page.reload();
      await page.locator('[data-ui="video-editor.timeline.surface"]').waitFor();
      await expect.poll(async () => (await read()).motionRegions![0]!.border!.period).toBe(1);
      if (index === 0) {
        await page.setViewportSize({ width: 1100, height: 560 });
        const workspace = page.locator('[data-ui="video-editor.workspace.root"]');
        await expect
          .poll(() => workspace.evaluate((node) => node.scrollWidth))
          .toBeGreaterThan(1100);
        await workspace.evaluate((node) => {
          node.scrollLeft = node.scrollWidth;
        });
        await expect.poll(() => workspace.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0);
        await page.screenshot({
          path: info.outputPath('native-border-narrow-scroll.png'),
          fullPage: false,
        });
        await page.setViewportSize(size);
      }
      expect(errors).toEqual([]);
      if (index === 0) {
        const authored = structuredClone(await read());
        configureEncodedBorders(authored);
        for (const format of ['MP4', 'WEBM'] as const) {
          const proof = await encodedBorderSamples(page, host.origin, authored, format);
          await writeFile(
            info.outputPath(`native-border-${format}.json`),
            JSON.stringify(proof, null, 2)
          );
          expect(proof.width).toBe(640);
          expect(proof.height).toBe(360);
          expect(Math.abs(proof.duration - 1.2)).toBeLessThan(0.025001);
          for (const row of proof.samples) {
            expect(row.pixel[3]).toBe(255);
            expect(row.error, JSON.stringify(row)).toBeLessThan(14);
          }
        }
      }
    } finally {
      host.server.closeAllConnections();
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}

test('encoded border composition retains canvas scope through transitions, EffectV1 and perspective', async ({
  page,
}, info) => {
  test.setTimeout(180000);
  await page.setViewportSize({ width: 1280, height: 560 });
  const host = await startHostServer();
  try {
    const bytes = await readFile(new URL('../fixtures/review-vp8-opus.webm', import.meta.url));
    const project = createVideoProjectFromRecording({
      recordingId: 'beta-v1-recording',
      filename: 'border.webm',
      width: 160,
      height: 90,
      duration: 12,
      mimeType: 'video/webm',
      size: bytes.length,
    });
    project.width = 640;
    project.height = 360;
    project.duration = 1.2;
    const clip = project.clips.find((item) => item.type === 'VIDEO');
    if (!clip || clip.type !== 'VIDEO') throw new Error('Missing fixture video');
    clip.duration = clip.sourceDuration = 1.2;
    project.motionRegions = [
      bindMotionRegionToClip(
        {
          ...createVideoProjectMotionRegion(project, 0),
          duration: 1.2,
        },
        clip
      ),
    ];
    configureEncodedBorders(project);
    await configureEncodedComposition(project);
    Object.assign(project, hydrateVideoProject(project));
    expect(isValidVideoProject(project)).toBe(true);
    await applyHarnessBootstrap(page, { preserveMediaLibrary: true });
    await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}`);
    await page.locator('[data-ui="gallery.page.root"]').waitFor();
    await seedReviewVideo(page, 'review-vp8-opus.webm', { width: 160, height: 90, duration: 12 });
    for (const format of ['MP4', 'WEBM'] as const) {
      const proof = await encodedBorderSamples(page, host.origin, project, format, true);
      await writeFile(
        info.outputPath(`native-border-composition-${format}.json`),
        JSON.stringify(proof, null, 2)
      );
      expect(proof.width).toBe(640);
      expect(proof.height).toBe(360);
      expect(Math.abs(proof.duration - 1.2)).toBeLessThan(0.025001);
      expect(proof.samples).toHaveLength(4);
      for (const row of proof.samples) {
        expect(row.pixel[3]).toBe(255);
        expect(row.error, JSON.stringify(row)).toBeLessThan(14);
      }
    }
  } finally {
    host.server.closeAllConnections();
    await new Promise<void>((resolve) => host.server.close(() => resolve()));
  }
});

function configureEncodedBorders(authored: VideoProject) {
  const source = authored.clips.find((clip) => clip.type === 'VIDEO')!;
  if (source.type !== 'VIDEO') throw new Error('Missing video');
  source.transform = { x: 40, y: 40, width: 240, height: 180, rotation: 0, opacity: 1 };
  source.fitMode = 'STRETCH';
  source.windowCornerRadius = 0;
  delete source.windowHeader;
  const base = {
    ...authored.motionRegions![0]!,
    phaseTransitions: { enter: 'none' as const, exit: 'none' as const },
    zoomInDuration: 0,
    zoomOutDuration: 0,
  };
  authored.motionRegions = [
    {
      ...base,
      id: 'encoded-window',
      borderTarget: 'window',
      border: { ...createQuickEditBorder(), color: '#0000ffff', width: 8, roundness: 0 },
    },
    {
      ...base,
      id: 'encoded-viewport',
      borderTarget: 'viewport',
      border: { ...createQuickEditBorder(), color: '#00ff00ff', width: 8, roundness: 0 },
    },
  ];
  authored.version = 21;
}

async function configureEncodedComposition(project: VideoProject) {
  const main = project.clips.find((clip) => clip.type === 'VIDEO');
  if (!main || main.type !== 'VIDEO') throw new Error('Missing composition video');
  main.duration = main.sourceDuration = 0.7;
  main.windowHeader = { ...DEFAULT_WINDOW_HEADER, title: 'Border composition' };
  main.sourceCrop = { x: 0.25, y: 0, width: 0.5, height: 1 };
  const trailing = {
    ...structuredClone(main),
    id: 'border-trailing',
    sourceInstanceId: 'border-trailing-instance',
    startTime: 0.5,
    duration: 0.7,
    sourceDuration: 0.7,
    sourceStart: 2,
  };
  project.clips.push(trailing);
  project.transitions = [
    {
      id: 'border-crossfade',
      leadingClipId: main.id,
      trailingClipId: trailing.id,
      duration: 0.2,
      kind: 'CROSSFADE',
      easing: 'LINEAR',
    },
  ];
  const window = project.motionRegions![0]!;
  project.motionRegions![0] = bindMotionRegionToClip({ ...window, duration: 0.7 }, main);
  delete project.motionRegions![1]!.sourceBinding;
  project.motionRegions!.push({
    ...createVideoProjectMotionRegion(project, 0.8),
    duration: 0.4,
    scale: 1.25,
    zoomInDuration: 0,
    zoomOutDuration: 0,
    phaseTransitions: { enter: 'none', exit: 'none' },
    perspective: { enabled: true, rotateX: 10, rotateY: -18, rotateZ: 5, strength: 0.7 },
  });
  const track = createVideoProjectTrack('Upper video', 1, 'PRIMARY');
  project.tracks.push(track);
  const upper = {
    ...structuredClone(trailing),
    id: 'border-upper',
    sourceInstanceId: 'border-upper-instance',
    trackId: track.id,
    startTime: 0,
    duration: 1.2,
    sourceDuration: 1.2,
    transform: { x: 420, y: 220, width: 120, height: 90, rotation: 0, opacity: 1 },
  };
  project.clips.push(upper);
  const source = await readFile(
    new URL(
      '../../../../packages/runtime-contracts/src/effect-v1/fixtures/collection/' +
        'sniptale-video-warm.sniptale-effect.json',
      import.meta.url
    ),
    'utf8'
  );
  const document = parseEffectV1Source(source).document;
  if (!document) throw new Error('Invalid composition effect');
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
      kind: document.kind,
    },
  ];
  project.effectInstances = [
    {
      id: 'border-upper-fx',
      kind: document.kind,
      snapshotId,
      target: { kind: 'clip', clipId: upper.id },
      rangeMode: 'owner',
      enabled: true,
      startTime: 0,
      duration: 1.2,
      playbackRate: document.duration / 1.2,
      controls: Object.fromEntries(
        document.controls.map((control) => [
          control.id,
          resolveEffectV1ControlDefault(control, 'en'),
        ])
      ),
    },
  ];
}

async function encodedBorderSamples(
  page: Page,
  origin: string,
  project: VideoProject,
  format: 'MP4' | 'WEBM',
  composition = false
) {
  await page.goto(`${origin}${OFFSCREEN_HARNESS_PATH}`);
  await page.locator('[data-ui="offscreen.harness.root"][data-state="ready"]').waitFor();
  const jobId = `native-border-${format}`;
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
      width: 640,
      height: 360,
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
        const failed = await getRuntimeMessagesByType(page, VideoMessageType.PROJECT_EXPORT_FAILED);
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
  return page.evaluate(
    async ({ exportId, composition }) => {
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
      const url = URL.createObjectURL(file),
        video = document.createElement('video');
      document.body.append(video);
      video.muted = true;
      video.src = url;
      try {
        await new Promise<void>((resolve, reject) => {
          video.onloadeddata = () => resolve();
          video.onerror = () => reject(new Error('Decode failed'));
        });
        const canvas = document.createElement('canvas');
        canvas.width = 640;
        canvas.height = 360;
        const context = canvas.getContext('2d')!;
        const samples = [];
        for (const time of [0.3, 0.6, 0.9]) {
          await new Promise<void>((resolve) => {
            const presented: VideoFrameRequestCallback = (_now, metadata) => {
              if (Math.abs(metadata.mediaTime - time) < 0.012501) resolve();
              else video.requestVideoFrameCallback(presented);
            };
            video.requestVideoFrameCallback(presented);
            video.currentTime = time;
          });
          context.drawImage(video, 0, 0);
          for (const [x, y, expected] of [
            [130, 89, [0, 0, 255]],
            [320, 94, [0, 255, 0]],
          ] as const) {
            if (composition && x === 130 && time !== 0.3) continue;
            const pixel = Array.from(context.getImageData(x, y, 1, 1).data);
            samples.push({
              time,
              x,
              y,
              pixel,
              expected,
              error: expected.reduce((sum, value, i) => sum + Math.abs(pixel[i]! - value), 0) / 3,
            });
          }
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
        video.remove();
        URL.revokeObjectURL(url);
      }
    },
    { exportId: completion.exportId, composition }
  );
}
