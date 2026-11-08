import { readFile, writeFile } from 'node:fs/promises';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { createVideoProjectFromRecording } from '../../../../apps/extension/src/features/video/project/factories/creation';
import {
  resolveActiveVideoProjectCompositionJoinPlan,
  resolveVideoProjectCompositionJoinEndpoints,
  resolveVideoProjectCompositionJoinPlans,
} from '../../../../apps/extension/src/features/video/project/scene/joins';
import { isValidVideoProject } from '../../../../apps/extension/src/features/video/project/validation';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { enableGpuPreviewProof } from '../support/gpu-preview-proof';
import { startHostServer } from '../support/host-server';
import { readNativeVideoProject } from '../support/native-video-project';
import { seedReviewVideo } from '../support/quick-editor-media-fixture';
import {
  applyHarnessBootstrap,
  GALLERY_HARNESS_PATH,
  VIDEO_EDITOR_HARNESS_PATH,
} from '../extension-critical.helpers';

enableGpuPreviewProof();

async function pixels(front: Locator) {
  return front.evaluate((canvas: HTMLCanvasElement) => {
    const sample = document.createElement('canvas');
    sample.width = sample.height = 32;
    try {
      const context = sample.getContext('2d');
      if (!context) throw new Error('Native join pixel readback is unavailable');
      context.drawImage(canvas, 0, 0, 32, 32);
      return [...context.getImageData(0, 0, 32, 32).data];
    } finally {
      sample.width = sample.height = 0;
    }
  });
}

function pixelError(before: number[], after: number[]) {
  expect(after.length).toBe(before.length);
  return (
    before.reduce((sum, value, index) => sum + Math.abs(value - after[index]!), 0) / before.length
  );
}

async function savedProject(page: Page) {
  const project = await readNativeVideoProject(page);
  if (!project) throw new Error('Native join project was not persisted');
  return project;
}

async function seekFrame(playhead: Locator, frame: number, fps: number) {
  await playhead.focus();
  await playhead.press('Home');
  for (let index = 0; index < frame; index++) await playhead.press('ArrowRight');
  await expect
    .poll(async () => Number(await playhead.getAttribute('aria-valuenow')))
    .toBeCloseTo(frame / fps, 6);
}

async function selectPresentedFrame(page: Page, front: Locator) {
  await expect(async () => {
    const bounds = await front.boundingBox();
    if (!bounds) throw new Error('Current join frame bounds are unavailable');
    // Editing stays disabled until pixels and geometry match the paused project clock.
    await page.mouse.click(bounds.x + bounds.width * 0.4, bounds.y + bounds.height * 0.4);
    await expect(page.locator('[data-preview-selection-state="editable"]')).toBeVisible({
      timeout: 500,
    });
  }).toPass({ timeout: 10_000 });
}

async function changeRenderer(page: Page, renderer: 'gpu' | 'legacy') {
  await page.locator('[data-ui="video.preview.display-settings"]').click();
  const panel = page.locator('[data-ui="video.preview.display-settings.panel"]');
  await panel
    .getByRole('radio', {
      name: translate(
        renderer === 'gpu'
          ? 'editor.scene.previewRendererGpu'
          : 'editor.scene.previewRendererLegacy',
        'en'
      ),
      exact: true,
    })
    .check();
  await panel.press('Escape');
  await expect(panel).toHaveCount(0);
}

function createJoinFixture(filename: string, size: number) {
  const project = createVideoProjectFromRecording({
    recordingId: 'beta-v1-recording',
    filename,
    width: 1904,
    height: 984,
    duration: 2,
    size,
    mimeType: 'video/mp4',
    hasAudio: false,
  });
  const source = project.clips.find((clip) => clip.type === 'VIDEO');
  if (!source) throw new Error('Native join source fixture is unavailable');
  const placement = (
    id: string,
    startTime: number,
    duration: number,
    sourceStart: number,
    x: number,
    y: number,
    scale: number
  ) => ({
    ...structuredClone(source),
    id,
    startTime,
    duration,
    sourceStart,
    sourceDuration: duration,
    timelineLaneId: null,
    transform: {
      ...source.transform,
      x,
      y,
      width: project.width * scale,
      height: project.height * scale,
    },
  });
  const intro = placement('join-intro', 0, 0.5, 0, 0, 0, 0.7);
  const left = placement('join-left', 0.5, 0.5, 0, 0, 0, 1);
  const right = placement('join-right', 1, 0.5, 1, 200, 100, 0.65);
  const outro = placement('join-outro', 1.5, 1, 0, 600, 300, 0.6);
  project.version = 43;
  project.duration = 2.5;
  project.clips = [intro, left, right, outro];
  project.compositionJoins = [
    {
      id: 'intro-join',
      clipId: intro.id,
      edge: 'end',
      transition: { type: 'dissolve', before: 0.2, after: 0.3 },
    },
    {
      id: 'cut-join',
      clipId: right.id,
      edge: 'start',
      sampling: 'cut',
      transition: { type: 'dissolve', before: 0.2, after: 0.5 },
    },
    {
      id: 'outro-join',
      clipId: outro.id,
      edge: 'start',
      transition: { type: 'dissolve', before: 0.3, after: 0.2 },
    },
  ];
  expect(isValidVideoProject(project)).toBe(true);
  const plans = resolveVideoProjectCompositionJoinPlans(project);
  const outer = resolveActiveVideoProjectCompositionJoinPlan(plans, 1.4);
  if (!outer) throw new Error('Nested fixture has no outer join');
  expect(outer.boundary.id).toBe('outro-join');
  const endpoints = resolveVideoProjectCompositionJoinEndpoints(outer, project.fps);
  const cuts = plans.filter((plan) => plan.boundary.sampling === 'cut');
  expect(
    resolveActiveVideoProjectCompositionJoinPlan(cuts, endpoints.outgoingTime)?.boundary.id
  ).toBe('cut-join');
  expect(
    resolveActiveVideoProjectCompositionJoinPlan(cuts, endpoints.incomingTime)
  ).toBeUndefined();
  return { project, right, plans, endpoints };
}

for (const viewport of PRIMARY_BROWSER_VIEWPORTS) {
  test(`Native active and nested joins retain GPU output and canvas editing ${viewport.name}`, async ({
    page,
  }, info) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ ...viewport.size });
    const host = await startHostServer();
    const errors: string[] = [];
    const materializerCopies: string[] = [];
    let probing = false;
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (probing && message.text() === 'sniptale-test:hidden-materializer-copy')
        materializerCopies.push(message.text());
    });
    await page.addInitScript(() => {
      const prototype = CanvasRenderingContext2D.prototype;
      prototype.drawImage = new Proxy(prototype.drawImage, {
        apply(target, context: CanvasRenderingContext2D, args: unknown[]) {
          // Only the production materializer stage counts; test readbacks have no parent.
          if (context.canvas.parentElement?.style.left === '-100000px')
            console.debug('sniptale-test:hidden-materializer-copy');
          return Reflect.apply(target, context, args);
        },
      });
    });
    try {
      const filename = 'review-avc-padded-color.mp4';
      const bytes = await readFile(new URL(`../fixtures/${filename}`, import.meta.url));
      const { project, right, plans, endpoints } = createJoinFixture(filename, bytes.length);
      await applyHarnessBootstrap(page, {
        preserveMediaLibrary: true,
        videoProjects: [project],
        storage: {
          'sniptale-locale-preference': 'en',
          'sniptale-theme-preference': 'light',
          sniptale_video_editor_preview_preferences: {
            renderer: 'gpu',
            frameRate: 'project',
            showFrameRate: false,
            mode: 'live',
            rasterPreset: '720p',
            zoom: 'fit',
          },
        },
      });
      await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}?theme=light`);
      await page.locator('[data-ui="gallery.page.root"]').waitFor();
      await seedReviewVideo(page, filename, { width: 1904, height: 984, duration: 2 });
      await page.goto(
        `${host.origin}${VIDEO_EDITOR_HARNESS_PATH}?project=${project.id}&theme=light`
      );
      await expect(page.locator('[data-ui="video-editor.timeline.surface"]')).toBeVisible();
      const playhead = page.locator('[data-ui="video-editor.timeline.playhead-handle"]');
      const gpu = page.locator('[data-preview-gpu-host] [data-preview-stage-canvas]');
      const legacy = page.locator('canvas[data-preview-stage-canvas]').filter({ visible: true });
      const comparisons = [];
      for (const scenario of [
        { name: 'intro', frame: 15, join: 'intro-join' },
        { name: 'cut', frame: 30, join: 'cut-join' },
        { name: 'nested-outro', frame: 42, join: 'outro-join' },
      ]) {
        expect(
          resolveActiveVideoProjectCompositionJoinPlan(plans, scenario.frame / project.fps)
            ?.boundary.id
        ).toBe(scenario.join);
        await changeRenderer(page, 'legacy');
        await seekFrame(playhead, scenario.frame, project.fps);
        await expect(gpu).toHaveCount(0);
        await expect(legacy).toHaveCount(1);
        await selectPresentedFrame(page, legacy);
        const reference = await pixels(legacy);
        materializerCopies.length = 0;
        probing = true;
        await changeRenderer(page, 'gpu');
        await seekFrame(playhead, scenario.frame, project.fps);
        await expect(gpu).toHaveCount(1);
        await expect(gpu).toBeVisible();
        await expect
          .poll(() =>
            gpu.evaluate((canvas: HTMLCanvasElement) => {
              try {
                return canvas.getContext('2d') === null;
              } catch (error) {
                if (error instanceof DOMException && error.name === 'InvalidStateError')
                  return true;
                throw error;
              }
            })
          )
          .toBe(true);
        await selectPresentedFrame(page, gpu);
        await writeFile(
          info.outputPath(`native-join-${scenario.name}-comparison.json`),
          JSON.stringify(
            {
              scenario,
              reference,
              gpu: await pixels(gpu),
              hiddenMaterializerDraws: materializerCopies.length,
            },
            null,
            2
          )
        );
        // Same decoded source and scaling; allow five channel LSB for GPU conversion.
        await expect
          .poll(async () => pixelError(reference, await pixels(gpu)))
          .toBeLessThanOrEqual(5);
        probing = false;
        expect(materializerCopies).toEqual([]);
        comparisons.push({
          ...scenario,
          time: scenario.frame / project.fps,
          reference,
          gpu: await pixels(gpu),
          hiddenMaterializerDraws: materializerCopies.length,
        });
        await page.screenshot({
          path: info.outputPath(`native-join-${scenario.name}-gpu.png`),
          fullPage: false,
        });
      }
      const baseline = await savedProject(page);
      const baselinePixels = await pixels(gpu);
      const bounds = await gpu.boundingBox();
      if (!bounds) throw new Error('Native join stage bounds are unavailable');
      // Fitted CSS aspect rounding permits one pixel.
      expect(
        Math.abs(bounds.height - (bounds.width * project.height) / project.width)
      ).toBeLessThanOrEqual(1);
      const colors = baselinePixels.filter((_, index) => index % 4 !== 3);
      expect(Math.max(...colors) - Math.min(...colors)).toBeGreaterThan(100);
      await page
        .getByRole('button', {
          name: translate('videoEditor.sidebar.sceneProperties', 'en'),
          exact: true,
        })
        .click();
      const stage = await gpu.boundingBox();
      if (!stage) throw new Error('Native join stage disappeared before selection');
      const start = {
        x:
          stage.x + (stage.width * (right.transform.x + right.transform.width / 2)) / project.width,
        y:
          stage.y +
          (stage.height * (right.transform.y + right.transform.height / 2)) / project.height,
      };
      await page.mouse.click(start.x, start.y);
      const selection = page.locator('[data-preview-selection-state="editable"]');
      await expect(selection).toBeVisible();
      await expect(page.locator('[data-preview-selection-handle]')).toHaveCount(4);
      const magnet = page.getByRole('button', { name: 'Magnet', exact: true });
      if ((await magnet.getAttribute('aria-pressed')) === 'true') await magnet.click();
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      await page.mouse.move(start.x + stage.width * 0.08, start.y + stage.height * 0.08, {
        steps: 5,
      });
      await page.mouse.up();
      const transform = async () =>
        (await savedProject(page)).clips.find((clip) => clip.id === right.id)!.transform;
      // Pointer rounding permits one project pixel in the persisted translation.
      await expect
        .poll(async () =>
          Math.abs((await transform()).x - right.transform.x - project.width * 0.08)
        )
        .toBeLessThanOrEqual(1);
      expect(
        Math.abs((await transform()).y - right.transform.y - project.height * 0.08)
      ).toBeLessThanOrEqual(1);
      await expect
        .poll(async () => pixelError(baselinePixels, await pixels(gpu)))
        .toBeGreaterThan(5);
      await page.screenshot({
        path: info.outputPath('native-join-gpu-edited.png'),
        fullPage: false,
      });
      await page.locator('[data-ui="video-editor.timeline.toolbar.undo"]').click();
      await expect.poll(async () => (await savedProject(page)).clips).toEqual(baseline.clips);
      await expect
        .poll(async () => pixelError(baselinePixels, await pixels(gpu)))
        .toBeLessThanOrEqual(1);
      await expect
        .poll(async () => Number(await playhead.getAttribute('aria-valuenow')))
        .toBeCloseTo(1.4, 6);
      await page.screenshot({
        path: info.outputPath('native-join-gpu-restored.png'),
        fullPage: false,
      });
      const proofPath = info.outputPath('native-join-gpu-proof.json');
      await writeFile(
        proofPath,
        JSON.stringify(
          {
            viewport: viewport.size,
            plans,
            endpoints,
            bounds,
            comparisons,
            restoredError: pixelError(baselinePixels, await pixels(gpu)),
          },
          null,
          2
        )
      );
      await info.attach('native-join-gpu-proof.json', {
        path: proofPath,
        contentType: 'application/json',
      });
      expect(errors).toEqual([]);
    } finally {
      probing = false;
      await page.mouse.up().catch(() => {});
      host.server.closeAllConnections();
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}
