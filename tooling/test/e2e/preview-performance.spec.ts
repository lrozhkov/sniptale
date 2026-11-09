import { resolveBrowserViewport } from './support/browser-viewport';
import { computeQuickEditSceneSize } from '../../../apps/extension/src/features/video/review/advanced/scene';
import {
  openFullPerformanceEditor,
  measureFullEditorPlayback,
  measurePerformanceDrag,
} from './support/preview-performance-editors';
import { replaceNativeReviewWorkspace } from './support/native-review-workspace';
import { chromium, expect, test as base, type Page, type ConsoleMessage } from '@playwright/test';
import { previewPerformanceSummary } from './support/preview-performance-report';
import { writeFile } from 'node:fs/promises';
import { translate } from '../../../apps/extension/src/platform/i18n';
import { DEFAULT_WINDOW_HEADER } from '@sniptale/runtime-contracts/window-header';

import { createQuickEditWatermark } from '../../../apps/extension/src/features/video/project/scene/watermark';
import { inspectVideoWorkspace } from '../../../apps/extension/src/composition/persistence/review-workspaces/parser';
import {
  replayReviewHistory,
  reviewAdvancedContentBaseline,
} from '../../../apps/extension/src/features/video/review/document';
import { startHostServer } from './support/host-server';
import { seedReviewVideo, seedReviewWebcamBundle } from './support/quick-editor-media-fixture';
import { readWebcamWorkspace } from './support/quick-editor-webcam-proof';
import { provisionQuickPreviewPerformanceFixture } from './support/quick-preview-performance-fixture';
import {
  startQuickPreviewPerformanceProbe,
  installQuickPreviewMediaDiagnostic,
  captureQuickPreviewPerformanceEnvironment,
} from './support/quick-preview-performance-probe';
import { applyHarnessBootstrap, GALLERY_HARNESS_PATH } from './extension-critical.helpers';

function loopbackCdpEndpoint(): string | null {
  const value = process.env['SNIPTALE_PREVIEW_PERFORMANCE_CDP'];
  if (value === undefined) return null;
  const endpoint = new URL(value);
  if (
    !['http:', 'https:', 'ws:', 'wss:'].includes(endpoint.protocol) ||
    !['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname) ||
    endpoint.username ||
    endpoint.password ||
    endpoint.hash
  ) {
    throw new Error('SNIPTALE_PREVIEW_PERFORMANCE_CDP must be a credential-free loopback CDP URL');
  }
  return endpoint.href;
}

const cdpEndpoint = loopbackCdpEndpoint();
const test =
  cdpEndpoint === null
    ? base
    : base.extend({
        browser: [
          async ({}, use) => {
            const browser = await chromium.connectOverCDP(cdpEndpoint);
            try {
              // Playwright's context/page fixtures still create an isolated context for every test.
              await use(browser);
            } finally {
              // A connected browser close disconnects this client; external process ownership stays with main.
              await browser.close();
            }
          },
          { scope: 'worker' },
        ],
      });

const fullscreenMeasurement = process.env['SNIPTALE_PREVIEW_PERFORMANCE_FULLSCREEN'] === '1';
const cameraDiagnostic = process.env['SNIPTALE_PREVIEW_PERFORMANCE_CAMERA_DIAGNOSTIC'] === '1';

import {
  recipes,
  performanceScenario,
  sceneRegions,
  performanceAnnotations,
  performanceBackground,
  performanceFeedback,
  seedPerformanceFeedback,
  type Recipe,
} from './support/preview-performance-scenarios';
type Fixture = Awaited<ReturnType<typeof provisionQuickPreviewPerformanceFixture>>;
const requested = (process.env['SNIPTALE_PREVIEW_PERFORMANCE_CASES'] ?? 'plain').split(',');
const selected = requested.includes('all')
  ? [...recipes]
  : recipes.filter((recipe) => requested.includes(recipe));
if (
  !selected.length ||
  requested.some((name) => name !== 'all' && !recipes.some((recipe) => recipe === name))
) {
  throw new Error(`SNIPTALE_PREVIEW_PERFORMANCE_CASES must contain: ${recipes.join(',')} or all`);
}
const detailed = process.env['SNIPTALE_PREVIEW_PERFORMANCE_DETAILED'] === '1';
const modeNames = ['native', 'manual720p30', 'manual1080p30'] as const;
const requestedModes = (process.env['SNIPTALE_PREVIEW_PERFORMANCE_MODES'] ?? 'native').split(',');
if (requestedModes.some((mode) => !modeNames.some((known) => known === mode)))
  throw new Error(
    'SNIPTALE_PREVIEW_PERFORMANCE_MODES must contain native, manual720p30 or manual1080p30'
  );
const selectedModes = modeNames.filter((mode) => requestedModes.includes(mode));
const sourceProfiles = [
  { name: '720p30', width: 1280, height: 720, fps: 30 },
  { name: '720p60', width: 1280, height: 720, fps: 60 },
  { name: '1080p30', width: 1920, height: 1080, fps: 30 },
  { name: '1080p60', width: 1920, height: 1080, fps: 60 },
  { name: '2160p30', width: 3840, height: 2160, fps: 30 },
  { name: '2160p60', width: 3840, height: 2160, fps: 60 },
];
const sourceProfile = sourceProfiles.find(
  (profile) => profile.name === (process.env['SNIPTALE_PREVIEW_PERFORMANCE_SOURCE'] ?? '1080p60')
);
if (!sourceProfile) throw new Error('Unsupported SNIPTALE_PREVIEW_PERFORMANCE_SOURCE');

const requestedEditors = (process.env['SNIPTALE_PREVIEW_PERFORMANCE_EDITORS'] ?? 'gallery').split(
  ','
);
const editors = ['gallery', 'native'] as const;
if (requestedEditors.some((name) => !editors.some((editor) => editor === name)))
  throw new Error('SNIPTALE_PREVIEW_PERFORMANCE_EDITORS must contain gallery or native');
const selectedEditors = editors.filter((editor) => requestedEditors.includes(editor));

const qualification = process.env['SNIPTALE_PREVIEW_PERFORMANCE_PROTOCOL'] === 'qualification';
if (
  process.env['SNIPTALE_PREVIEW_PERFORMANCE_PROTOCOL'] &&
  !['measurement', 'qualification'].includes(process.env['SNIPTALE_PREVIEW_PERFORMANCE_PROTOCOL'])
)
  throw new Error('SNIPTALE_PREVIEW_PERFORMANCE_PROTOCOL must be measurement or qualification');
const repetitions = qualification ? 1 : 3;
const warmupMs = qualification ? 2000 : 5000;
const sampleMs = qualification ? 3000 : 30000;
function percentiles(values: number[]) {
  const sorted = values.filter(Number.isFinite).toSorted((a, b) => a - b);
  const at = (fraction: number) =>
    sorted.length ? sorted[Math.ceil(sorted.length * fraction) - 1] : null;
  return { count: sorted.length, p50: at(0.5), p95: at(0.95) };
}

const previewViewport = resolveBrowserViewport();
const stageVideo = '[data-ui="gallery.videoReview.stage"] video';
const label = (key: Parameters<typeof translate>[0]) => translate(key, 'en');
const needsCamera = (recipe: Recipe) => recipe === 'webcam' || recipe === 'combined';

test.use({
  viewport: previewViewport,
  deviceScaleFactor: 1,
  trace: 'off',
  video: 'off',
});
test.describe.configure({ mode: 'default', retries: 0 });
let fixture: Fixture;
test.beforeAll(async ({}, info) => {
  test.setTimeout(20 * 60_000);
  if (info.config.workers !== 1)
    throw new Error('Run preview-performance.spec.ts with --workers=1.');
  fixture = await provisionQuickPreviewPerformanceFixture(sourceProfile);
  expect(fixture.width).toBe(sourceProfile.width);
  expect(fixture.height).toBe(sourceProfile.height);
  expect(fixture.fps).toBe(sourceProfile.fps);
  expect(fixture.duration).toBeGreaterThanOrEqual(39.9);
});

async function openEditor(page: Page) {
  const enter = page.locator('[data-ui="gallery.videoReview.enter"]');
  const choice = page.locator('[data-ui="gallery.videoReview.modeChoice.basic"]');
  await expect
    .poll(
      async () =>
        (await choice.isVisible()) ||
        (await enter.isVisible()) ||
        (await page.locator(stageVideo).count()) === 1
    )
    .toBe(true);
  if (await choice.isVisible()) await choice.click();
  if (await enter.isVisible()) await enter.click();
  await expect(page.locator(stageVideo)).toHaveCount(1);
  await expect
    .poll(() => page.locator(stageVideo).evaluate((video: HTMLVideoElement) => video.readyState))
    .toBeGreaterThanOrEqual(2);
}

/** Reuses the established linked-recording fixture, replacing both immutable test bodies before acquisition. */
async function seedCameraSource(page: Page, source: Fixture) {
  await seedReviewWebcamBundle(page);
  await seedReviewVideo(
    page,
    `${sourceProfile.name}.webm`,
    { width: source.width, height: source.height, duration: source.duration },
    false,
    false,
    { bytes: source.bytes, mimeType: 'video/webm' }
  );
  await page.evaluate(
    async ({ encoded, width, height, duration, size }) => {
      const bytes = Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0));
      const objects = await (
        await (await navigator.storage.getDirectory()).getDirectoryHandle('sniptale-assets')
      ).getDirectoryHandle('objects');
      const writer = await (await objects.getFileHandle('webcam-clock-asset')).createWritable();
      await writer.write(bytes);
      await writer.close();
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('sniptale-db');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      try {
        const tx = db.transaction(['recordings', 'media_library', 'asset_refs'], 'readwrite');
        const done = new Promise<void>((resolve, reject) => {
          tx.oncomplete = () => resolve();
          tx.onabort = () => reject(tx.error);
        });
        for (const store of ['recordings', 'media_library']) {
          const primary = tx
            .objectStore(store)
            .get(store === 'recordings' ? 'beta-v1-recording' : 'recording:beta-v1-recording');
          primary.onsuccess = () =>
            tx.objectStore(store).put({
              ...primary.result,
              recordingGroup: {
                groupId: 'webcam-proof',
                role: 'display',
                order: 0,
                sourceLabel: 'Screen',
              },
            });
          const camera = tx
            .objectStore(store)
            .get(store === 'recordings' ? 'webcam-clock' : 'recording:webcam-clock');
          camera.onsuccess = () =>
            tx
              .objectStore(store)
              .put({ ...camera.result, width, height, duration, size, mimeType: 'video/webm' });
        }
        const asset = tx.objectStore('asset_refs').get('webcam-clock-asset');
        asset.onsuccess = () =>
          tx.objectStore('asset_refs').put({ ...asset.result, size, mimeType: 'video/webm' });
        await done;
      } finally {
        db.close();
      }
    },
    {
      encoded: source.bytes.toString('base64'),
      width: source.width,
      height: source.height,
      duration: source.duration,
      size: source.bytes.length,
    }
  );
}

/** Validate and persist a normal authored history operation after normal source/camera acquisition. */
async function installRecipe(page: Page, recipe: Recipe) {
  const stored = await readWebcamWorkspace(page);
  if (!stored) throw new Error('Expected saved review before installing performance recipe');
  const document = replayReviewHistory(
    stored.history,
    stored.cursor,
    stored.source,
    reviewAdvancedContentBaseline(stored.advanced)
  );
  const before = document.advancedContent;
  if (needsCamera(recipe) && !before.webcam) throw new Error('Camera acquisition did not persist');
  if (recipe === 'advanced' || recipe === 'webcam')
    return {
      recipe,
      advancedContent: before,
      sceneSize: computeQuickEditSceneSize({ source: stored.source, ...before }),
      camera: needsCamera(recipe)
        ? `second ${sourceProfile.name} decoder; same fixture, zero offset`
        : null,
    };
  const background = performanceBackground(recipe);
  const annotations = await performanceAnnotations(recipe, sourceProfile);
  const feedback = performanceFeedback(recipe, sourceProfile);
  const watermark = createQuickEditWatermark('Preview benchmark');
  const after = {
    ...before,
    canvas: { width: sourceProfile.width, height: sourceProfile.height },
    ...(feedback
      ? { keyAnimations: feedback.keyAnimations, clickAnimations: feedback.clickAnimations }
      : {}),
    ...(annotations ? { annotationEffects: annotations.lane } : {}),
    ...(background ? { background } : {}),
    ...(performanceScenario(recipe).header
      ? {
          windowHeader: {
            ...DEFAULT_WINDOW_HEADER,
            kind: 'browser' as const,
            title: 'Preview benchmark',
            url: 'https://example.test',
          },
        }
      : {}),
    zoom: { enabled: true, regions: sceneRegions(recipe) },
    ...(recipe === 'combined'
      ? { watermark: { ...watermark, mode: 'text' as const, layout: 'tiled' as const } }
      : {}),
  };
  const history = [
    ...stored.history.slice(0, stored.cursor),
    {
      id: `performance-${recipe}`,
      at: Date.now(),
      target: 'advancedContent' as const,
      before,
      after,
    },
  ];
  const inspected = inspectVideoWorkspace({
    ...stored,
    revision: stored.revision + 1,
    ...(annotations
      ? { effectSnapshots: [...(stored.effectSnapshots ?? []), annotations.snapshot] }
      : {}),
    updatedAt: Date.now(),
    history,
    cursor: history.length,
  });
  const row = inspected.workspace;
  if (!row)
    throw new Error(
      `Invalid authored performance recipe: ${recipe}: ${JSON.stringify(inspected.failure)}`
    );
  await replaceNativeReviewWorkspace(page, row.aggregateId, row);
  return {
    recipe,
    advancedContent: after,
    sceneSize: computeQuickEditSceneSize({ source: stored.source, ...after }),
    camera: needsCamera(recipe)
      ? `second ${sourceProfile.name} decoder; same fixture, zero offset`
      : null,
  };
}

async function selectPreviewMode(page: Page, mode: (typeof modeNames)[number]) {
  const review = page.locator('[data-ui="gallery.videoReview.dialog"]');
  const gear = review.locator('[data-ui="gallery.videoReview.previewSettings"]');
  const panel = review.locator('[data-ui="gallery.videoReview.previewInspector"]');
  await gear.click();
  await panel
    .getByRole('button', { name: label('gallery.videoReview.previewReset'), exact: true })
    .click();
  if (mode !== 'native') {
    for (const [key, option] of [
      ['gallery.videoReview.previewResolution', mode === 'manual1080p30' ? '1080p' : '720p'],
      ['gallery.videoReview.previewFrameRate', '≤ 30 FPS'],
    ] as const) {
      await panel.getByRole('button', { name: label(key), exact: true }).click();
      await page.getByRole('option', { name: option, exact: true }).click();
      await expect(panel.getByRole('button', { name: label(key), exact: true })).toHaveText(option);
    }
    await expect(
      review.locator(
        '[data-ui="gallery.videoReview.manualPreview"] canvas[data-preview-front="true"]'
      )
    ).toBeVisible();
  } else
    await expect(
      review.locator(
        '[data-ui="gallery.videoReview.manualPreview"] canvas[data-preview-front="true"]'
      )
    ).toHaveCount(0);
  await gear.click();
}

for (const editor of selectedEditors)
  for (const recipe of selected)
    for (const mode of selectedModes)
      test(`${editor === 'gallery' ? 'quick preview' : 'full editor'} ${mode}: ${recipe}`, async ({
        page,
      }, info) => {
        test.skip(
          editor === 'gallery' &&
            mode === 'native' &&
            performanceScenario(recipe).operation === 'drag',
          'Canvas drag measurements require a manual composition preview'
        );
        test.setTimeout(5 * 60_000);
        page.setDefaultTimeout(15_000);
        const host = await startHostServer();
        let mediaDiagnostic:
          | Awaited<ReturnType<typeof installQuickPreviewMediaDiagnostic>>
          | undefined;
        let consoleErrorCount = 0;
        const pageErrorNames: string[] = [];
        let pageErrorOverflow = false;
        const onConsole = (message: ConsoleMessage) => {
          if (message.type() === 'error') consoleErrorCount++;
        };
        const onPageError = (error: Error) => {
          if (pageErrorNames.length >= 100) {
            pageErrorOverflow = true;
            return;
          }
          const allowed = [
            'Error',
            'TypeError',
            'RangeError',
            'ReferenceError',
            'SyntaxError',
            'AbortError',
            'NotSupportedError',
            'InvalidStateError',
            'SecurityError',
          ];
          pageErrorNames.push(allowed.includes(error.name) ? error.name : 'OtherError');
        };
        page.on('console', onConsole);
        page.on('pageerror', onPageError);
        const dialog = page.locator('[data-ui="gallery.videoReview.dialog"]');
        const control = (key: Parameters<typeof translate>[0]) =>
          dialog.getByRole('button', { name: label(key), exact: true });
        try {
          await applyHarnessBootstrap(page, {
            preserveMediaLibrary: true,
            storage: {
              'sniptale-locale-preference': 'en',
              'sniptale-theme-preference': 'dark',
              sniptale_video_editor_preview_preferences: {
                rasterPreset: mode === 'manual720p30' ? '720p' : '1080p',
                frameRate: '30',
                showFrameRate: false,
                mode: 'live',
                zoom: 'fit',
              },
            },
          });
          await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}?theme=dark`);
          await page.locator('[data-ui="gallery.page.root"]').waitFor();
          if (needsCamera(recipe)) await seedCameraSource(page, fixture);
          else
            await seedReviewVideo(
              page,
              `${sourceProfile.name}.webm`,
              { width: fixture.width, height: fixture.height, duration: fixture.duration },
              false,
              false,
              { bytes: fixture.bytes, mimeType: 'video/webm' }
            );
          await seedPerformanceFeedback(page, recipe, sourceProfile);
          await page.removeLocatorHandler(
            page.locator('[data-ui="gallery.videoReview.modeChoice"]')
          );
          await page.goto(
            `${host.origin}${GALLERY_HARNESS_PATH}` +
              `?mediaId=${encodeURIComponent('recording:beta-v1-recording')}&mode=edit&theme=dark`
          );
          if (cameraDiagnostic && recipe === 'plain')
            mediaDiagnostic = await installQuickPreviewMediaDiagnostic(page);
          await openEditor(page);
          if (recipe !== 'plain') await control('gallery.videoReview.advancedEditing').click();
          if (needsCamera(recipe)) {
            await control('gallery.videoReview.webcam').click();
            await expect(
              dialog.locator('[data-ui="gallery.videoReview.webcamOverlay"] canvas')
            ).toBeVisible();
            await expect
              .poll(async () => {
                const row = await readWebcamWorkspace(page);
                return (
                  !!row &&
                  !!replayReviewHistory(
                    row.history,
                    row.cursor,
                    row.source,
                    reviewAdvancedContentBaseline(row.advanced)
                  ).advancedContent.webcam
                );
              })
              .toBe(true);
          }
          let recipeEvidence: unknown = { recipe, mode: 'basic' };
          let sceneSize = { width: fixture.width, height: fixture.height };
          if (recipe !== 'plain') {
            await expect
              .poll(async () => (await readWebcamWorkspace(page))?.advanced.ui.mode)
              .toBe('advanced');
            const installed = await installRecipe(page, recipe);
            recipeEvidence = installed;
            sceneSize = installed.sceneSize;
            await page.goto(
              `${host.origin}${GALLERY_HARNESS_PATH}` +
                `?mediaId=${encodeURIComponent('recording:beta-v1-recording')}&mode=edit&theme=dark`
            );
            if (cameraDiagnostic) mediaDiagnostic = await installQuickPreviewMediaDiagnostic(page);
            await expect(page.locator(stageVideo)).toHaveCount(1);
            await expect
              .poll(() =>
                page.locator(stageVideo).evaluate((node: HTMLVideoElement) => node.readyState)
              )
              .toBeGreaterThanOrEqual(2);
          }
          if (mediaDiagnostic) {
            await mediaDiagnostic.start();
            try {
              await selectPreviewMode(page, mode);
            } finally {
              const startup = await mediaDiagnostic.end();
              await writeFile(
                info.outputPath('camera-startup-diagnostic.json'),
                JSON.stringify(startup, null, 2)
              );
            }
          } else await selectPreviewMode(page, mode);
          const video = page.locator(stageVideo);
          expect(
            await video.evaluate((node: HTMLVideoElement) => [node.videoWidth, node.videoHeight])
          ).toEqual([fixture.width, fixture.height]);
          if (editor === 'native') {
            const project = await openFullPerformanceEditor(page, host.origin);
            expect([project.width, project.height]).toEqual([sceneSize.width, sceneSize.height]);
            if (performanceScenario(recipe).operation === 'drag') {
              await measurePerformanceDrag(page, info, {
                editor,
                recipe,
                sourceProfile,
                composition: sceneSize,
                fixtureManifest: fixture.manifest,
                purpose: qualification ? 'qualification' : 'measurement',
                runtimeErrors: () => ({
                  consoleErrorCount,
                  pageErrorNames: [...pageErrorNames],
                  pageErrorOverflow,
                }),
                target: performanceScenario(recipe).annotations
                  ? 'annotation'
                  : recipe === 'border-drag'
                    ? 'border'
                    : 'lens',
              });
              return;
            }
            await measureFullEditorPlayback(page, info, {
              recipe,
              repetitions,
              warmupMs,
              sampleMs,
              sourceProfile,
              mode,
              runtimeErrors: () => ({
                consoleErrorCount,
                pageErrorNames: [...pageErrorNames],
                pageErrorOverflow,
              }),
              composition: sceneSize,
              fixtureManifest: fixture.manifest,
            });
            return;
          }
          if (performanceScenario(recipe).operation === 'drag') {
            await measurePerformanceDrag(page, info, {
              editor,
              recipe,
              sourceProfile,
              composition: sceneSize,
              fixtureManifest: fixture.manifest,
              purpose: qualification ? 'qualification' : 'measurement',
              runtimeErrors: () => ({
                consoleErrorCount,
                pageErrorNames: [...pageErrorNames],
                pageErrorOverflow,
              }),
              target: performanceScenario(recipe).annotations
                ? 'annotation'
                : recipe === 'border-drag'
                  ? 'border'
                  : 'lens',
            });
            return;
          }
          if (fullscreenMeasurement) {
            const source = await video.elementHandle();
            if (!source) throw new Error('Fullscreen source video unavailable');
            try {
              await page.locator('[data-ui="gallery.videoReview.fullscreen"]').click();
              await expect
                .poll(() =>
                  source.evaluate(
                    (node) => !!document.fullscreenElement?.contains(node) && node.isConnected
                  )
                )
                .toBe(true);
              await expect(video).toHaveCount(1);
              if (mode !== 'native')
                await expect(
                  page.locator(
                    '[data-ui="gallery.videoReview.manualPreview"] canvas[data-preview-front="true"]'
                  )
                ).toBeVisible();
            } finally {
              await source.dispose();
            }
          }
          const presentationViewport = await page.evaluate(() => {
            const stage = document.querySelector('[data-ui="gallery.videoReview.stage"]');
            const canvas = stage?.querySelector<HTMLCanvasElement>(
              '[data-ui="gallery.videoReview.manualPreview"] canvas[data-preview-front="true"]'
            );
            const bounds = stage?.getBoundingClientRect();
            const output = canvas?.getBoundingClientRect();
            return {
              cssViewport: { width: window.innerWidth, height: window.innerHeight },
              dpr: window.devicePixelRatio,
              fullscreen: !!document.fullscreenElement,
              fullscreenOwnsStage: !!stage && !!document.fullscreenElement?.contains(stage),
              stage: bounds ? { width: bounds.width, height: bounds.height } : null,
              output: output ? { width: output.width, height: output.height } : null,
              backing: canvas ? { width: canvas.width, height: canvas.height } : null,
            };
          });
          if (fullscreenMeasurement)
            await page.screenshot({
              path: info.outputPath('fullscreen-ready.png'),
              fullPage: false,
            });
          const environment = await captureQuickPreviewPerformanceEnvironment(page);
          await writeFile(
            info.outputPath('environment.json'),
            JSON.stringify(
              {
                environment,
                browserConnection: cdpEndpoint ? 'external-loopback-cdp' : 'playwright-managed',
                fixture: fixture.manifest,
                recipe: recipeEvidence,
                selectedRecipes: selected,
                mode,
                sourceProfile,
                preferences:
                  mode === 'native'
                    ? { raster: 'current', frameRate: 'current' }
                    : { raster: mode === 'manual1080p30' ? '1080p' : '720p', frameRate: 30 },
                repetitions,
                warmupMs,
                sampleMs,
                detailed,
                cameraDiagnostic,
                fullscreenMeasurement,
                presentationViewport,
                viewport: { ...previewViewport, dpr: 1 },
                limitations: [
                  'Native video FPS is not composed-overlay FPS.',
                  'Manual cadence observes canvas DOM publication, not GPU scanout; observer may ' +
                    'coalesce synchronous swaps.',
                  'Same-file camera is workload evidence, not independent A/V synchronization proof.',
                ],
              },
              null,
              2
            )
          );
          for (let repeat = 0; repeat < repetitions; repeat++) {
            await video.evaluate((node: HTMLVideoElement) => {
              node.pause();
              node.currentTime = 0;
            });
            await expect
              .poll(() =>
                video.evaluate((node: HTMLVideoElement) => !node.seeking && node.currentTime < 0.05)
              )
              .toBe(true);
            if (fullscreenMeasurement)
              await page
                .locator('[data-ui="gallery.videoReview.fullscreenTransport"]')
                .getByRole('button', { name: label('gallery.videoReview.play'), exact: true })
                .click();
            else await control('gallery.videoReview.play').click();
            await page.waitForTimeout(warmupMs);
            const started = await video.evaluate((node: HTMLVideoElement) => node.currentTime);
            consoleErrorCount = 0;
            pageErrorNames.length = 0;
            pageErrorOverflow = false;
            await mediaDiagnostic?.start();
            const probe = await startQuickPreviewPerformanceProbe(page, {
              sampleId: `${mode}-${recipe}-${repeat + 1}`,
              detailed,
              labels: {
                loading: label('gallery.videoReview.previewLoading'),
                failed: label('gallery.videoReview.previewFailed'),
                retry: label('gallery.videoReview.retry'),
              },
            });
            await page.waitForTimeout(sampleMs);
            const metrics = await probe.end();
            // Use the measurement boundary: report serialization can outlast the source tail.
            const ended = { time: metrics.mediaEnd, ended: metrics.ended, paused: metrics.paused };
            await video.evaluate((node: HTMLVideoElement) => node.pause());
            const rasterValid =
              mode === 'native'
                ? metrics.composedPublication.samples.length === 0
                : metrics.previewStatus.start.canvasVisible &&
                  metrics.previewStatus.end.canvasVisible &&
                  metrics.composedPublication.samples.every(
                    (sample) =>
                      sample.width > 0 && sample.height === (mode === 'manual1080p30' ? 1080 : 720)
                  );
            await info.attach('preview-performance-sample', {
              contentType: 'application/json',
              body: Buffer.from(
                JSON.stringify({
                  editor: 'gallery',
                  recipe,
                  mode,
                  repeat: repeat + 1,
                  sourceProfile,
                  composition: sceneSize,
                  protocol: {
                    repetitions,
                    warmupMs,
                    sampleMs,
                    purpose: qualification ? 'qualification' : 'measurement',
                  },
                  environment,
                  presentationViewport,
                  ...previewPerformanceSummary(metrics, mode !== 'native'),
                  valid:
                    previewPerformanceSummary(metrics, mode !== 'native').valid &&
                    pageErrorNames.length === 0 &&
                    !pageErrorOverflow &&
                    metrics.visibility === 'visible' &&
                    !metrics.paused &&
                    !metrics.ended &&
                    metrics.mediaEnd > started &&
                    metrics.durationMs >= sampleMs - 50 &&
                    rasterValid &&
                    metrics.frames.every(
                      (frame, index, frames) =>
                        index === 0 || frame.mediaTime >= frames[index - 1]!.mediaTime
                    ),
                  errors: {
                    consoleErrorCount,
                    pageErrorNames: [...pageErrorNames],
                    pageErrorOverflow,
                  },
                })
              ),
            });
            const mediaDiagnosticResult = await mediaDiagnostic?.end();
            await writeFile(
              info.outputPath(`sample-${repeat + 1}.json`),
              JSON.stringify(
                {
                  started,
                  ended,
                  metrics,
                  errors: { consoleErrorCount, pageErrorNames, pageErrorOverflow },
                  ...(mediaDiagnosticResult ? { mediaDiagnostic: mediaDiagnosticResult } : {}),
                  nativeCallbackIntervalMs: percentiles(
                    metrics.frames
                      .slice(1)
                      .map((frame, index) => frame.now - metrics.frames[index]!.now)
                  ),
                  rafJankIntervalMs: percentiles(metrics.rafIntervals),
                  composedPublicationIntervalMs: percentiles(
                    metrics.composedPublication.samples
                      .slice(1)
                      .map(
                        (sample, index) =>
                          sample.now - metrics.composedPublication.samples[index]!.now
                      )
                  ),
                },
                null,
                2
              )
            );
            expect(
              pageErrorNames,
              'Uncaught application errors invalidate performance measurements'
            ).toEqual([]);
            expect(
              metrics.measurementIdentity.valid,
              'Measurement stage/video/publication host identity changed'
            ).toBe(true);
            if (mode !== 'native') {
              expect(
                metrics.previewStatus.start.phase,
                'Preview failed before the measurement window'
              ).not.toBe('failed');
              expect(
                metrics.previewStatus.end.phase,
                'Preview failed during the measurement window'
              ).not.toBe('failed');
              expect(metrics.previewStatus.start.canvasVisible).toBe(true);
              expect(metrics.previewStatus.end.canvasVisible).toBe(true);
              expect(
                metrics.composedPublication.samples.every(
                  (sample) =>
                    sample.width > 0 &&
                    sample.height > 0 &&
                    sample.height === (mode === 'manual1080p30' ? 1080 : 720)
                )
              ).toBe(true);
            } else expect(metrics.composedPublication.samples).toHaveLength(0);
            expect(metrics.expired).toBe(false);
            expect(metrics.overflow).toBe(false);
            expect(metrics.durationMs).toBeGreaterThanOrEqual(sampleMs - 50);
            expect(
              metrics.frames.every(
                (frame, index, frames) =>
                  index === 0 || frame.mediaTime >= frames[index - 1]!.mediaTime
              )
            ).toBe(true);
            expect(ended.ended).toBe(false);
            expect(ended.paused).toBe(false);
            expect(ended.time).toBeGreaterThan(started);
            await page.screenshot({
              path: info.outputPath(`sample-${repeat + 1}.png`),
              fullPage: false,
            });
          }
        } catch (error) {
          await page
            .screenshot({ path: info.outputPath('scenario-failed.png'), fullPage: false })
            .catch(() => undefined);
          await writeFile(
            info.outputPath('scenario-errors.json'),
            JSON.stringify({ consoleErrorCount, pageErrorNames, pageErrorOverflow }, null, 2)
          ).catch(() => undefined);
          throw error;
        } finally {
          page.off('console', onConsole);
          page.off('pageerror', onPageError);
          try {
            await mediaDiagnostic?.dispose();
          } finally {
            await page.close();
          }
          await new Promise<void>((resolve) => host.server.close(() => resolve()));
        }
      });

test('publication probe counts completed front changes and excludes unpublished draws', async ({
  page,
}) => {
  await page.setContent(
    '<div data-ui="gallery.videoReview.stage"><video></video>' +
      '<div data-ui="gallery.videoReview.manualPreview"></div></div>'
  );
  await page.evaluate(() => {
    const video = document.querySelector('video')!;
    // This checks instrumentation events. It does not simulate decoded media performance.
    Object.defineProperties(video, {
      readyState: { value: 2 },
      paused: { value: false },
      getVideoPlaybackQuality: {
        value: () => ({ totalVideoFrames: 0, droppedVideoFrames: 0, corruptedVideoFrames: 0 }),
      },
      requestVideoFrameCallback: { value: () => 1 },
      cancelVideoFrameCallback: { value: () => undefined },
    });
  });
  const probe = await startQuickPreviewPerformanceProbe(page, {
    sampleId: 'publication-contract',
    labels: { loading: 'loading', failed: 'failed', retry: 'retry' },
  });
  await page.evaluate(async () => {
    const host = document.querySelector('[data-ui="gallery.videoReview.manualPreview"]')!;
    const canvas = document.createElement('canvas');
    canvas.width = 2;
    canvas.height = 2;
    canvas.dataset['previewFront'] = 'true';
    host.append(canvas);
    await Promise.resolve();
    const source = document.createElement('canvas');
    source.width = 2;
    source.height = 2;
    const context = canvas.getContext('2d')!;
    context.drawImage(source, 0, 0);
    const empty = document.createElement('canvas');
    empty.width = 0;
    try {
      context.drawImage(empty, 0, 0);
    } catch {
      /* A refused draw is not a publication. */
    }
    context.drawImage(source, 0, 0);
    const back = document.createElement('canvas');
    back.width = back.height = 2;
    host.append(back);
    back.getContext('2d')!.drawImage(source, 0, 0);
    canvas.dataset['previewFront'] = 'false';
    back.dataset['previewFront'] = 'true';
    await Promise.resolve();
    context.drawImage(source, 0, 0);
    back.dataset['previewFront'] = 'false';
    canvas.dataset['previewFront'] = 'true';
    await Promise.resolve();
  });
  const metrics = await probe.end();
  expect(metrics.measurementIdentity.valid).toBe(true);
  expect(metrics.composedPublication.samples).toHaveLength(3);
  expect(
    metrics.composedPublication.samples.every((sample) => sample.width === 2 && sample.height === 2)
  ).toBe(true);
});
