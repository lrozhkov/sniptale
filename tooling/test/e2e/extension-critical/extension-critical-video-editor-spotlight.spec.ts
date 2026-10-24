import type { VideoProject } from '../../../../apps/extension/src/features/video/project/types';
import { createHash } from 'node:crypto';
import { parseEffectV1Source } from '@sniptale/runtime-contracts/effect-v1';
import { createQuickEditSpotlight } from '../../../../apps/extension/src/features/video/project/scene/focus-appearance';
import { isValidVideoProject } from '../../../../apps/extension/src/features/video/project/validation/root';
import { encodedNativeVideoSamples } from '../support/native-video-export-proof';
import {
  createVideoProjectFromRecording,
  createVideoProjectTrack,
} from '../../../../apps/extension/src/features/video/project/factories/creation';
import { createVideoProjectMotionRegion } from '../../../../apps/extension/src/features/video/project/motion';
import { bindMotionRegionToClip } from '../../../../apps/extension/src/features/video/project/motion/source-binding';
import { hydrateVideoProject } from '../../../../apps/extension/src/features/video/project/hydration';
import { translate } from '../../../../apps/extension/src/platform/i18n';
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
} from '../extension-critical.helpers';
import { startHostServer } from '../support/host-server';
import { build } from 'esbuild';
import { expect, test } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';

test('Native window spotlight preserves lower tracks, opacity and independent openings', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1920, height: 900 });
  const host = await startHostServer();
  try {
    await page.goto(host.origin);
    await page.evaluate(() => document.body.replaceChildren());
    const bundle = await build({
      entryPoints: ['tooling/test/e2e/support/video-editor-spotlight-probe.ts'],
      bundle: true,
      format: 'esm',
      platform: 'browser',
      write: false,
      loader: { '.svg': 'text', '.woff2': 'dataurl' },
      define: { 'process.env.NODE_ENV': '"production"' },
    });
    const results = await page.evaluate(async (source) => {
      const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
      try {
        const module: typeof import('../support/video-editor-spotlight-probe') = await import(url);
        return module.nativeWindowSpotlightProof();
      } finally {
        URL.revokeObjectURL(url);
      }
    }, bundle.outputFiles[0]!.text);
    await writeFile(
      info.outputPath('window-spotlight-pixels.json'),
      JSON.stringify(results, null, 2)
    );
    await page.screenshot({ path: info.outputPath('window-spotlight.png'), fullPage: false });
    for (const result of results) {
      const proof = JSON.stringify(result);
      expect(result.outsideDifference, proof).toBe(0);
      expect(result.opening, proof).toEqual(result.isolatedOpening);
      // One additional Canvas raster can round a color channel by one level at DPR two.
      for (const [index, value] of result.isolatedOpening.entries())
        expect(Math.abs(value - result.baselineOpening[index]!), proof).toBeLessThanOrEqual(1);
      if (result.mode === 'blur-uniform')
        expect(result.outsideOpening, proof).toEqual(result.baselineOutsideOpening);
      if (result.mode === 'blur-detail')
        expect(result.actualContrast, proof).toBeLessThan(result.baselineContrast * 0.4);
      if (result.mode === 'dim' || result.mode === 'union') {
        // Source alpha is one half. Its own luminance changes; lower-track luminance is retained.
        const strength = result.mode === 'union' ? 0.8 : 0.6;
        const expected = [32, 64, 96].map((lower) =>
          Math.round(240 * (1 - strength) * 0.5 + lower * 0.5)
        );
        for (const [index, value] of expected.entries())
          expect(Math.abs(result.outsideOpening[index]! - value), proof).toBeLessThanOrEqual(2);
      }
      if (result.mode === 'union')
        expect(result.secondOpening, proof).toEqual(result.baselineSecondOpening);
    }
  } finally {
    await new Promise<void>((resolve, reject) =>
      host.server.close((error) => (error ? reject(error) : resolve()))
    );
  }
});

test('Native scene spotlight preview and export retain independent window projection', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1920, height: 900 });
  const host = await startHostServer();
  try {
    await page.goto(host.origin);
    await page.evaluate(() => document.body.replaceChildren());
    const [bundle, bytes] = await Promise.all([
      build({
        entryPoints: ['tooling/test/e2e/support/video-editor-spotlight-probe.ts'],
        bundle: true,
        format: 'esm',
        platform: 'browser',
        write: false,
        loader: { '.woff2': 'dataurl', '.svg': 'text' },
        define: { 'process.env.NODE_ENV': '"production"' },
      }),
      readFile(new URL('../fixtures/review-vp8-opus.webm', import.meta.url)),
    ]);
    const results = await page.evaluate(
      async ({ source, bytes }) => {
        const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
        try {
          const module: typeof import('../support/video-editor-spotlight-probe') = await import(
            url
          );
          return await module.nativeSceneSpotlightRasterProof(bytes);
        } finally {
          URL.revokeObjectURL(url);
        }
      },
      { source: bundle.outputFiles[0]!.text, bytes: [...bytes] }
    );
    await writeFile(
      info.outputPath('scene-spotlight-pixels.json'),
      JSON.stringify(results, null, 2)
    );
    await page.screenshot({ path: info.outputPath('scene-spotlight.png'), fullPage: false });
    expect(results).toHaveLength(18);
    for (const result of results) {
      const proof = JSON.stringify(result);
      expect.soft(result.runtimeDifference, proof).toBeLessThanOrEqual(2);
      expect.soft(result.insideDifference, proof).toBeLessThanOrEqual(2);
      expect.soft(result.outsideDifference, proof).toBeLessThanOrEqual(2);
      if (result.mode === 'scene-blur') {
        expect.soft(result.baselineEnergy, proof).toBeGreaterThan(1);
        expect.soft(result.actualEnergy, proof).toBeLessThan(result.baselineEnergy * 0.6);
      }
      expect.soft(result.inside, proof).toBeGreaterThan(10);
      expect.soft(result.outside, proof).toBeGreaterThan(10);
    }
  } finally {
    await new Promise<void>((resolve, reject) =>
      host.server.close((error) => (error ? reject(error) : resolve()))
    );
  }
});

for (const [index, size] of [
  { width: 1280, height: 560 },
  { width: 1920, height: 900 },
].entries()) {
  test(`Native spotlight inspector ${size.width}`, async ({ page }, info) => {
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
        filename: 'spotlight.webm',
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
          { ...createVideoProjectMotionRegion(project, 0), id: 'spotlight-native', duration: 1.2 },
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
          if (sessionStorage.getItem('native-spotlight-seeded')) {
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
      await page.evaluate(() => sessionStorage.setItem('native-spotlight-seeded', 'true'));
      await page.goto(
        `${host.origin}${VIDEO_EDITOR_HARNESS_PATH}?project=${project.id}&theme=${theme}`
      );
      await page.locator('[data-ui="video-editor.timeline.surface"]').waitFor();
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await page
        .locator('[data-timeline-effect-segment="spotlight-native"] button')
        .first()
        .click();
      const inspector = page.locator('[data-ui="video-editor.floating.context-inspector"]');
      await chooseInspectorValue(
        page,
        inspector,
        label('gallery.videoReview.focusType'),
        label('gallery.videoReview.focusSpotlight')
      );
      const read = async () => (await readNativeVideoProject(page))!;
      await expect
        .poll(async () => (await read()).motionRegions![0]!.spotlightTarget)
        .toBe('window');
      await chooseInspectorValue(
        page,
        inspector,
        label('gallery.videoReview.focusType'),
        label('gallery.videoReview.focusLens')
      );
      await expect
        .poll(async () => (await read()).motionRegions![0]!.spotlight?.effect)
        .toBe('magnify');
      await expect
        .poll(async () => (await read()).motionRegions![0]!.spotlight?.lensShape)
        .toBe('circle');
      const diameter = inspector.getByRole('textbox', {
        name: label('gallery.videoReview.focusLensDiameter'),
        exact: true,
      });
      const initialDiameter = (await read()).motionRegions![0]!.spotlight!.area.width;
      await diameter.fill('40');
      await diameter.press('Enter');
      await expect
        .poll(async () => (await read()).motionRegions![0]!.spotlight!.area.width)
        .toBe(0.4);
      await page.locator('[data-ui="video-editor.timeline.toolbar.undo"]').click();
      await expect
        .poll(async () => (await read()).motionRegions![0]!.spotlight!.area.width)
        .toBe(initialDiameter);
      await page.locator('[data-ui="video-editor.timeline.toolbar.redo"]').click();
      await expect
        .poll(async () => (await read()).motionRegions![0]!.spotlight!.area.width)
        .toBe(0.4);
      await chooseInspectorValue(
        page,
        inspector,
        label('gallery.videoReview.clickLensShape'),
        label('gallery.videoReview.focusLensRounded')
      );
      await expect(
        inspector.getByRole('textbox', {
          name: label('gallery.videoReview.focusRoundness'),
          exact: true,
        })
      ).toBeVisible();
      await expect(diameter).toHaveCount(0);
      await chooseInspectorValue(
        page,
        inspector,
        label('gallery.videoReview.clickLensShape'),
        label('gallery.videoReview.clickLens_circle')
      );
      await expect(diameter).toHaveValue('40');
      await diameter.scrollIntoViewIfNeeded();
      await checkInspectorParameterRows(inspector);
      await page.screenshot({
        path: info.outputPath('native-circle-lens-size.png'),
        fullPage: false,
      });
      await chooseInspectorValue(
        page,
        inspector,
        label('gallery.videoReview.clickLensOptics'),
        label('gallery.videoReview.clickLensOptics_optical')
      );
      await expect
        .poll(async () => (await read()).motionRegions![0]!.spotlight?.lensOptics)
        .toBe('optical');
      await chooseInspectorValue(
        page,
        inspector,
        label('gallery.videoReview.focusLensPlacement'),
        label('videoEditor.sidebar.cursorFocusFollow')
      );
      await expect.poll(async () => (await read()).motionRegions![0]!.focusMode).toBe('CURSOR');
      await page.screenshot({ path: info.outputPath('native-optical-lens.png'), fullPage: false });
      await chooseInspectorValue(
        page,
        inspector,
        label('gallery.videoReview.focusLensPlacement'),
        label('videoEditor.sidebar.cursorFocusFixed')
      );
      await chooseInspectorValue(
        page,
        inspector,
        label('gallery.videoReview.focusType'),
        label('gallery.videoReview.focusSpotlight')
      );
      const targetLabel = label('videoEditor.sidebar.spotlightTarget');
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
          path: info.outputPath('native-spotlight-distinct-targets.png'),
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
          .poll(async () => (await read()).motionRegions![0]!.spotlightTarget)
          .toBe('window');
      }
      await expect(page.locator('[data-preview-stage-point-handle]')).toHaveCount(0);
      await expect(page.locator('[data-preview-stage-focus-handle]')).toHaveCount(4);
      const lane = page
        .locator('[data-ui="video-editor.timeline.motion-lane-select"]')
        .locator('..');
      await lane
        .getByRole('button', { name: label('videoEditor.timeline.laneEditable'), exact: true })
        .click();
      await expect.poll(async () => (await read()).utilityLanes!.camera.locked).toBe(true);
      await expect(page.locator('[data-preview-stage-focus-handle]')).toHaveCount(0);
      await lane
        .getByRole('button', { name: label('videoEditor.timeline.laneLocked'), exact: true })
        .click();
      await expect.poll(async () => (await read()).utilityLanes!.camera.locked).toBe(false);
      await expect(page.locator('[data-preview-stage-focus-handle]')).toHaveCount(4);
      await chooseInspectorValue(
        page,
        inspector,
        label('videoEditor.sidebar.spotlightTarget'),
        label('videoEditor.sidebar.borderTargetViewport')
      );
      await expect
        .poll(async () => (await read()).motionRegions![0]!.spotlightTarget)
        .toBe('viewport');
      const beforeArea = (await read()).motionRegions![0]!.spotlight!.area;
      const area = page.locator('[data-preview-stage-focus-area]');
      let box = (await area.boundingBox())!;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 + 10, box.y + box.height / 2 + 5);
      expect((await read()).motionRegions![0]!.spotlight!.area).toEqual(beforeArea);
      await page.keyboard.press('Escape');
      await page.mouse.up();
      expect((await read()).motionRegions![0]!.spotlight!.area).toEqual(beforeArea);
      box = (await area.boundingBox())!;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 + 10, box.y + box.height / 2 + 5);
      await page.mouse.up();
      await expect
        .poll(async () => (await read()).motionRegions![0]!.spotlight!.area.x)
        .toBeGreaterThan(beforeArea.x);
      const resize = page.locator('[data-preview-stage-focus-handle="se"]');
      const initialWidth = (await read()).motionRegions![0]!.spotlight!.area.width;
      const resizeBox = (await resize.boundingBox())!;
      await page.mouse.move(resizeBox.x + resizeBox.width / 2, resizeBox.y + resizeBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(
        resizeBox.x + resizeBox.width / 2 + 4,
        resizeBox.y + resizeBox.height / 2 + 4
      );
      await page.mouse.up();
      await expect
        .poll(async () => (await read()).motionRegions![0]!.spotlight!.area.width)
        .toBeGreaterThan(initialWidth);
      await resize.focus();
      const beforeKey = (await read()).motionRegions![0]!.spotlight!.area.width;
      await resize.press('ArrowLeft');
      await expect
        .poll(async () => (await read()).motionRegions![0]!.spotlight!.area.width)
        .toBeLessThan(beforeKey);
      await chooseInspectorValue(
        page,
        inspector,
        label('videoEditor.sidebar.spotlightTarget'),
        firstTarget
      );
      await expect
        .poll(async () => (await read()).motionRegions![0]!.spotlightTarget)
        .toBe('window');
      await chooseInspectorValue(
        page,
        inspector,
        label('videoEditor.sidebar.spotlightCoverage'),
        label('videoEditor.sidebar.spotlightCoverageScene')
      );
      await expect
        .poll(async () => (await read()).motionRegions![0]!.spotlightTarget)
        .toBe('scene');
      const editNumber = async (key: Parameters<typeof translate>[0], value: string) => {
        const field = inspector.getByRole('textbox', { name: label(key), exact: true });
        await field.fill(value);
        await field.press('Enter');
        return field;
      };
      const strength = await editNumber('gallery.videoReview.focusStrength', '70');
      await expect
        .poll(async () => (await read()).motionRegions![0]!.spotlight!.strength)
        .toBe(0.7);
      await checkInspectorPaintedFont(page, strength, 'native-spotlight-strength');
      await chooseInspectorValue(
        page,
        inspector,
        label('gallery.videoReview.focusOutside'),
        label('gallery.videoReview.focusBlur')
      );
      await editNumber('gallery.videoReview.focusBlurRadius', '18');
      await expect.poll(async () => (await read()).motionRegions![0]!.spotlight!.blur).toBe(18);
      await editNumber('gallery.videoReview.focusRoundness', '20');
      await expect
        .poll(async () => (await read()).motionRegions![0]!.spotlight!.roundness)
        .toBe(0.2);
      await inspector
        .locator('summary')
        .filter({ hasText: label('gallery.videoReview.preciseArea') })
        .click();
      for (const [key, field, value] of [
        ['gallery.videoReview.focusAreaX', 'x', '20'],
        ['gallery.videoReview.focusAreaY', 'y', '20'],
        ['gallery.videoReview.focusAreaWidth', 'width', '55'],
        ['gallery.videoReview.focusAreaHeight', 'height', '55'],
      ] as const) {
        await editNumber(key, value);
        await expect
          .poll(async () => (await read()).motionRegions![0]!.spotlight!.area[field])
          .toBe(Number(value) / 100);
      }
      await inspector
        .locator('summary')
        .filter({ hasText: label('gallery.videoReview.preciseArea') })
        .click();
      await checkInspectorParameterRows(inspector);
      await page.screenshot({
        path: info.outputPath('native-spotlight-appearance.png'),
        fullPage: false,
      });
      await inspector
        .getByRole('button', {
          name: label('videoEditor.sidebar.inspectorGroupAnimation'),
          exact: true,
        })
        .click();
      const animation = inspector.locator('[data-ui="video-editor.motion.spotlight-animation"]');
      const enter = animation.getByRole('group', {
        name: label('gallery.videoReview.zoomTransitionIn'),
        exact: true,
      });
      const exit = animation.getByRole('group', {
        name: label('gallery.videoReview.zoomTransitionOut'),
        exact: true,
      });
      await chooseInspectorValue(
        page,
        enter,
        label('gallery.videoReview.focusReveal'),
        label('gallery.videoReview.focusContract')
      );
      const duration = enter.getByRole('textbox', {
        name: label('gallery.videoReview.zoomTransitionDuration'),
        exact: true,
      });
      await duration.fill('0.3');
      await duration.press('Enter');
      await expect.poll(async () => (await read()).motionRegions![0]!.zoomInDuration).toBe(0.3);
      await chooseInspectorValue(
        page,
        enter,
        label('gallery.videoReview.focusReveal'),
        label('gallery.videoReview.borderAppear')
      );
      await expect(duration).toBeDisabled();
      await expect.poll(async () => (await read()).motionRegions![0]!.zoomInDuration).toBe(0.3);
      await chooseInspectorValue(
        page,
        enter,
        label('gallery.videoReview.focusReveal'),
        label('gallery.videoReview.focusFade')
      );
      await expect(duration).toBeEnabled();
      await expect.poll(async () => (await read()).motionRegions![0]!.zoomInDuration).toBe(0.3);
      await chooseInspectorValue(
        page,
        exit,
        label('gallery.videoReview.focusReveal'),
        label('gallery.videoReview.focusExpand')
      );
      await expect
        .poll(async () => (await read()).motionRegions![0]!.spotlight!.exitReveal)
        .toBe('contract');
      for (const [phase, owner] of [
        ['enter', enter],
        ['exit', exit],
      ] as const) {
        for (const [type, key] of [
          ['linear', 'gallery.videoReview.transitionLinear'],
          ['ease-out', 'videoEditor.sidebar.temporalEasingEaseOut'],
          ['instant', 'videoEditor.sidebar.temporalEasingInstant'],
          ['ease-in-out', 'gallery.videoReview.transitionSmooth'],
        ] as const) {
          await chooseInspectorValue(
            page,
            owner,
            label('gallery.videoReview.zoomTransitionType'),
            label(key)
          );
          await expect
            .poll(async () => (await read()).motionRegions![0]!.phaseTransitions![phase])
            .toBe(type);
        }
      }
      const rail = inspector.locator('[data-ui="video-editor.inspector.categories"] > nav');
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
        await duration.scrollIntoViewIfNeeded();
        const position = await rail.boundingBox();
        await exit
          .getByRole('textbox', {
            name: label('gallery.videoReview.zoomTransitionDuration'),
            exact: true,
          })
          .scrollIntoViewIfNeeded();
        expect((await rail.boundingBox())!.y).toBe(position!.y);
        expect(await inspector.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(
          true
        );
        await checkInspectorParameterRows(inspector);
        await page.screenshot({
          path: info.outputPath(`native-spotlight-animation-${targetWidth}.png`),
          fullPage: false,
        });
      }
      await page.locator('[data-ui="video-editor.timeline.toolbar.undo"]').click();
      await expect
        .poll(async () => (await read()).motionRegions![0]!.phaseTransitions!.exit)
        .toBe('instant');
      await page.locator('[data-ui="video-editor.timeline.toolbar.redo"]').click();
      await expect
        .poll(async () => (await read()).motionRegions![0]!.phaseTransitions!.exit)
        .toBe('ease-in-out');
      await page.reload();
      await page.locator('[data-ui="video-editor.timeline.surface"]').waitFor();
      await expect
        .poll(async () => (await read()).motionRegions![0]!.spotlightTarget)
        .toBe('scene');
      await expect.poll(async () => (await read()).motionRegions![0]!.spotlight!.blur).toBe(18);
      await expect
        .poll(async () => (await read()).motionRegions![0]!.spotlight!.lensShape)
        .toBe('circle');
      await expect.poll(async () => (await read()).motionRegions![0]!.zoomInDuration).toBe(0.3);
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
          path: info.outputPath('native-spotlight-narrow-scroll.png'),
          fullPage: false,
        });
        await page.setViewportSize(size);
      }
      expect(errors).toEqual([]);
    } finally {
      host.server.closeAllConnections();
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}

for (const coverage of ['viewport', 'scene', 'composed', 'phases', 'linked'] as const) {
  test(`encoded Native spotlight retains ${coverage} coverage and independent window masks`, async ({
    page,
  }, info) => {
    test.setTimeout(180000);
    await page.setViewportSize({ width: 1280, height: 560 });
    const host = await startHostServer();
    try {
      const bytes = await readFile(new URL('../fixtures/review-vp8-opus.webm', import.meta.url));
      const project = createVideoProjectFromRecording({
        recordingId: 'beta-v1-recording',
        filename: 'spotlight.webm',
        width: 160,
        height: 90,
        duration: 12,
        mimeType: 'video/webm',
        size: bytes.length,
      });
      project.width = 640;
      project.height = 360;
      project.duration = 1.2;
      project.version = 22;
      project.backgroundColor = '#ffffff';
      project.sceneBackground = { kind: 'solid', color: '#ffffff' };
      const video = project.clips.find((clip) => clip.type === 'VIDEO');
      if (!video || video.type !== 'VIDEO') throw new Error('Missing fixture video');
      video.duration = video.sourceDuration = 1.2;
      video.transform = { x: 100, y: 100, width: 160, height: 90, rotation: 0, opacity: 1 };
      video.fitMode = 'STRETCH';
      video.windowCornerRadius = 0;
      delete video.windowHeader;
      const track = createVideoProjectTrack('Independent window', 1, 'PRIMARY');
      project.tracks.push(track);
      const copy = {
        ...structuredClone(video),
        id: 'encoded-second-window',
        trackId: track.id,
        transform: { ...video.transform, x: 440, y: 40 },
      };
      project.clips.push(copy);
      const windowMask = (clip: typeof video, id: string) =>
        bindMotionRegionToClip(
          {
            ...createVideoProjectMotionRegion(project, 0),
            id,
            duration: 1.2,
            phaseTransitions: { enter: 'none', exit: 'none' },
            spotlight: { ...createQuickEditSpotlight(), strength: 1, roundness: 0 },
            spotlightTarget: 'window',
          },
          clip
        );
      const scene = windowMask(video, 'encoded-scene');
      scene.spotlightTarget = coverage === 'scene' ? 'scene' : 'viewport';
      scene.spotlight = {
        ...createQuickEditSpotlight(),
        strength: coverage === 'scene' ? 0.25 : 0.5,
        roundness: 0,
      };
      project.motionRegions = [
        windowMask(video, 'encoded-first'),
        windowMask(copy, 'encoded-second'),
        scene,
      ];
      if (coverage === 'phases') {
        scene.spotlight.strength = 1;
        scene.phaseTransitions = { enter: 'linear', exit: 'linear' };
        scene.zoomInDuration = 0.6;
        scene.zoomOutDuration = 0.3;
      }
      if (coverage === 'linked') {
        delete scene.sourceBinding;
        scene.duration = 0.3;
        scene.spotlight.strength = 1;
        scene.spotlight.area = { x: 0.1, y: 0.4, width: 0.2, height: 0.3 };
        project.motionRegions.push({
          ...structuredClone(scene),
          id: 'encoded-linked-destination',
          startTime: 0.9,
          duration: 0.3,
          spotlight: { ...scene.spotlight, area: { x: 0.6, y: 0.4, width: 0.2, height: 0.3 } },
          incomingConnection: { fromRegionId: scene.id, easing: 'LINEAR' },
        });
      }
      if (coverage === 'composed') await configureSpotlightComposition(project);
      Object.assign(project, hydrateVideoProject(project));
      expect(isValidVideoProject(project)).toBe(true);
      await applyHarnessBootstrap(page, { preserveMediaLibrary: true });
      await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}`);
      await page.locator('[data-ui="gallery.page.root"]').waitFor();
      await seedReviewVideo(page, 'review-vp8-opus.webm', { width: 160, height: 90, duration: 12 });
      const outside = coverage === 'scene' ? 191 : 128;
      const points = [0.3, 0.6, 0.9].flatMap((time) => [
        { time, x: 20, y: 20, expected: [outside, outside, outside] },
        {
          time,
          x: 400,
          y: 150,
          expected: coverage === 'scene' ? [191, 191, 191] : [255, 255, 255],
        },
        ...(coverage !== 'composed' || time === 0.3
          ? [{ time, x: 110, y: 110, expected: [0, 0, 0] }]
          : []),
        ...(coverage !== 'composed' || time < 0.8
          ? [{ time, x: 450, y: 50, expected: coverage === 'composed' ? [23, 23, 23] : [0, 0, 0] }]
          : []),
      ]);
      const clockPoints =
        coverage === 'phases'
          ? [0.3, 0.6, 1.05].flatMap((time) => [
              { time, x: 20, y: 20, expected: time === 0.6 ? [0, 0, 0] : [128, 128, 128] },
              { time, x: 400, y: 150, expected: [255, 255, 255] },
            ])
          : coverage === 'linked'
            ? [
                { time: 0.125, x: 128, y: 216, expected: [255, 255, 255] },
                { time: 0.125, x: 448, y: 216, expected: [0, 0, 0] },
                { time: 0.6, x: 288, y: 216, expected: [255, 255, 255] },
                { time: 0.6, x: 64, y: 216, expected: [0, 0, 0] },
                { time: 1.05, x: 448, y: 216, expected: [255, 255, 255] },
                { time: 1.05, x: 128, y: 216, expected: [0, 0, 0] },
              ]
            : points;
      for (const format of ['MP4', 'WEBM'] as const) {
        const proof = await encodedNativeVideoSamples(
          page,
          host.origin,
          project,
          format,
          clockPoints
        );
        await writeFile(
          info.outputPath(`native-spotlight-${coverage}-${format}.json`),
          JSON.stringify(proof, null, 2)
        );
        expect(proof.width).toBe(640);
        expect(proof.height).toBe(360);
        expect(Math.abs(proof.duration - 1.2)).toBeLessThan(0.025001);
        expect(proof.samples).toHaveLength(clockPoints.length);
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
}

async function configureSpotlightComposition(project: VideoProject) {
  const main = project.clips.find((clip) => clip.type === 'VIDEO');
  if (!main || main.type !== 'VIDEO') throw new Error('Missing composition source');
  main.duration = main.sourceDuration = 0.7;
  const trailing = {
    ...structuredClone(main),
    id: 'spotlight-trailing',
    sourceInstanceId: 'spotlight-trailing-instance',
    startTime: 0.5,
    duration: 0.7,
    sourceDuration: 0.7,
    sourceStart: 2,
  };
  project.clips.push(trailing);
  project.transitions = [
    {
      id: 'spotlight-crossfade',
      leadingClipId: main.id,
      trailingClipId: trailing.id,
      duration: 0.2,
      kind: 'CROSSFADE',
      easing: 'LINEAR',
    },
  ];
  const first = project.motionRegions![0]!;
  project.motionRegions![0] = bindMotionRegionToClip({ ...first, duration: 0.7 }, main);
  project.motionRegions!.push(
    bindMotionRegionToClip(
      { ...first, id: 'spotlight-trailing-mask', startTime: 0.5, duration: 0.7 },
      trailing
    )
  );
  delete project.motionRegions![2]!.sourceBinding;
  project.motionRegions!.push({
    ...createVideoProjectMotionRegion(project, 0.8),
    duration: 0.4,
    scale: 1.25,
    zoomInDuration: 0,
    zoomOutDuration: 0,
    phaseTransitions: { enter: 'none', exit: 'none' },
    perspective: { enabled: true, rotateX: 10, rotateY: -18, rotateZ: 5, strength: 0.7 },
  });
  const source = await readFile(
    new URL(
      '../../../../packages/runtime-contracts/src/effect-v1/fixtures/collection/sniptale-video-warm.sniptale-effect.json',
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
      id: 'spotlight-window-effect',
      kind: document.kind,
      snapshotId,
      target: { kind: 'clip', clipId: 'encoded-second-window' },
      rangeMode: 'owner',
      enabled: true,
      startTime: 0,
      duration: 1.2,
      playbackRate: document.duration / 1.2,
      controls: { strength: 100, edge: 0, tint: '#ffffff', saturation: 100 },
    },
  ];
}
