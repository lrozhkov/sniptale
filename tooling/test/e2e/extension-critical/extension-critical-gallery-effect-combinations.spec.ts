import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { readNativeVideoProject } from '../support/native-video-project';
import { encodedNativeVideoSamples } from '../support/native-video-export-proof';
import { writeFile } from 'node:fs/promises';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { enableGpuPreviewProof } from '../support/gpu-preview-proof';
import { observePreviewPlayback } from '../support/quick-preview-playback-proof';
import { startHostServer } from '../support/host-server';
import { seedReviewVideo } from '../support/quick-editor-media-fixture';
import {
  readNativeReviewWorkspace,
  replaceNativeReviewWorkspace,
} from '../support/native-review-workspace';
import { persistedReviewContent } from '../support/voiceover-speech-fixture';
import {
  applyHarnessBootstrap,
  GALLERY_HARNESS_PATH,
  VIDEO_EDITOR_HARNESS_PATH,
} from '../extension-critical.helpers';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { DB_NAME } from '../../../../apps/extension/src/composition/persistence/infrastructure/indexed-db/core.stores';
import { parseVideoWorkspace } from '../../../../apps/extension/src/composition/persistence/review-workspaces/parser';
import {
  replayReviewHistory,
  reviewDocumentBaseline,
} from '../../../../apps/extension/src/features/video/review/document';
import type { QuickEditZoomRegion } from '../../../../apps/extension/src/features/video/review/advanced/types';
import { createQuickEditZoomRegion } from '../../../../apps/extension/src/features/video/review/advanced/zoom';
import {
  createQuickEditBorder,
  createQuickEditSpotlight,
} from '../../../../apps/extension/src/features/video/project/scene/focus-appearance';
import { REVIEW_CLICK_DEFAULT } from '../../../../apps/extension/src/features/video/review/advanced/click-animation';
import { REVIEW_KEY_DEFAULT } from '../../../../apps/extension/src/features/video/project/action-feedback/key-animation';
test.use({ actionTimeout: 15000 });
enableGpuPreviewProof();

const combinations = [
  {
    name: 'manual-circle-lens',
    borders: 0,
    zoom: false,
    partial: false,
    magnify: false,
    lens: true,
  },
  { name: 'keys-ripple', borders: 0, zoom: false, partial: false, magnify: false },
  { name: 'three-full-borders', borders: 3, zoom: false, partial: false, magnify: false },
  { name: 'three-moving-borders', borders: 3, zoom: false, partial: true, magnify: false },
  { name: 'zoom-borders-keys-click', borders: 3, zoom: true, partial: true, magnify: false },
  { name: 'zoom-borders-keys-lens', borders: 3, zoom: true, partial: true, magnify: true },
] as const;
for (const viewport of PRIMARY_BROWSER_VIEWPORTS) {
  test(`combined feedback plays and seeks (${viewport.name})`, async ({ page }, info) => {
    test.setTimeout(180000);
    await page.setViewportSize(viewport.size);
    const host = await startHostServer();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const dialog = page.locator('dialog');
    const button = (key: Parameters<typeof translate>[0]) =>
      dialog.getByRole('button', { name: translate(key, 'en'), exact: true });
    const close = async () => {
      await dialog
        .locator('header')
        .getByRole('button', { name: translate('common.actions.close', 'en'), exact: true })
        .click();
      await expect(dialog).toHaveCount(0);
    };
    const metrics: { name: string; publications: number; fps: number }[] = [];
    try {
      await applyHarnessBootstrap(page, {
        preserveMediaLibrary: true,
        storage: {
          'sniptale-locale-preference': 'en',
          sniptale_quick_preview_preferences: {
            rasterPreset: '1080p',
            frameRate: '30',
            pausedQuality: 'same',
            showFrameRate: true,
          },
        },
      });
      await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}`);
      await page.locator('[data-ui="gallery.page.root"]').waitFor();
      await seedReviewVideo(
        page,
        'review-vp8-opus.webm',
        { width: 1920, height: 1080, duration: 12 },
        false,
        true
      );
      await page.evaluate(async (name) => {
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open(name);
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        const tx = db.transaction('recording_telemetry', 'readwrite');
        const store = tx.objectStore('recording_telemetry');
        const request = store.get('beta-v1-recording');
        request.onsuccess = () =>
          store.put({
            ...request.result,
            actionEvents: [
              ...request.result.actionEvents,
              {
                id: 'key-1',
                kind: 'KEY',
                time: 1,
                duration: 0,
                point: null,
                label: 'Ctrl+Shift+S',
                data: {},
                preset: 'NONE',
              },
            ],
          });
        await new Promise<void>((resolve, reject) => {
          tx.oncomplete = () => resolve();
          tx.onabort = () => reject(tx.error);
        });
        db.close();
      }, DB_NAME);
      await page.reload();
      await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).first().click();
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      await button('gallery.videoReview.advancedEditing').click();
      await expect
        .poll(() => readNativeReviewWorkspace(page, 'recording:beta-v1-recording'))
        .not.toBeNull();
      await close();
      const workspace = (await readNativeReviewWorkspace(page, 'recording:beta-v1-recording'))!;
      const document = replayReviewHistory(
        workspace.history,
        workspace.cursor,
        workspace.source,
        reviewDocumentBaseline(workspace)
      );
      for (const combination of combinations) {
        const manualLens = 'lens' in combination;
        const regions: QuickEditZoomRegion[] = Array.from(
          { length: combination.borders },
          (_, index) => ({
            ...createQuickEditZoomRegion({
              id: `border-${index}`,
              at: 0,
              duration: 10,
              endMax: 12,
            }),
            enter: { type: 'none' as const, duration: 0 },
            exit: { type: 'none' as const, duration: 0 },
            border: {
              ...createQuickEditBorder(),
              area: { x: 0.1 + index * 0.12, y: 0.1 + index * 0.12, width: 0.45, height: 0.45 },
              style: 'dashed' as const,
              loop: combination.partial,
              segmentPercent: 35,
            },
          })
        );
        if (manualLens)
          regions.push({
            ...createQuickEditZoomRegion({ id: 'manual-lens', at: 0, duration: 10, endMax: 12 }),
            enter: { type: 'none' as const, duration: 0 },
            exit: { type: 'none' as const, duration: 0 },
            spotlight: {
              ...createQuickEditSpotlight(),
              effect: 'magnify' as const,
              lensShape: 'circle' as const,
            },
          });
        const zoom = createQuickEditZoomRegion({ id: 'zoom', at: 0, duration: 10, endMax: 12 });
        const content = {
          ...document.advancedContent,
          canvas: { width: 1920, height: 1080 },
          zoom: { enabled: true, regions: combination.zoom ? [...regions, zoom] : regions },
          keyAnimations: [{ ...REVIEW_KEY_DEFAULT, id: 'key-1', enabled: !manualLens, after: 5 }],
          clickAnimations: [
            {
              ...REVIEW_CLICK_DEFAULT,
              id: 'click-1',
              effect: manualLens
                ? ('off' as const)
                : combination.magnify
                  ? ('magnify' as const)
                  : ('ripple' as const),
              after: 5,
            },
          ],
        };
        const admitted = parseVideoWorkspace({
          ...workspace,
          formatVersion: 4,
          revision: workspace.revision + 1,
          history: [],
          cursor: 0,
          advanced: {
            ...workspace.advanced,
            ...content,
            ui: { ...workspace.advanced.ui, mode: 'advanced', modeSelectionPending: false },
          },
          baseline: { ...document, advancedContent: content },
        });
        expect(admitted).not.toBeNull();
        await replaceNativeReviewWorkspace(page, workspace.aggregateId, admitted);
        await page.goto(
          `${host.origin}${GALLERY_HARNESS_PATH}?mediaId=${encodeURIComponent(workspace.aggregateId)}&mode=edit`
        );
        await expect(button('gallery.videoReview.play')).toBeVisible();
        await expect
          .poll(async () => (await persistedReviewContent(page))?.zoom.regions.length)
          .toBe(regions.length + Number(combination.zoom));
        const video = dialog.locator('video').first();
        await video.evaluate((node) => {
          node.currentTime = 2;
        });
        await expect.poll(() => video.evaluate((node) => node.seeking)).toBe(false);
        await dialog.locator('[data-ui="gallery.videoReview.manualPreview"]').waitFor();
        if (manualLens) {
          await dialog
            .locator('[data-ui="gallery.videoReview.zoomLane"] [role="button"]')
            .filter({ hasText: translate('gallery.videoReview.focusLens', 'en') })
            .first()
            .click();
          await video.evaluate((node) => {
            node.currentTime = 2;
          });
          await expect.poll(() => video.evaluate((node) => node.seeking)).toBe(false);
          const frame = dialog.locator('[data-ui="gallery.videoReview.stage"] [data-focus-frame]');
          await expect(frame).toBeVisible();
          const handle = (await frame.boundingBox())!;
          const front = dialog.locator(
            '[data-ui="gallery.videoReview.manualPreview"] canvas[data-preview-front="true"]'
          );
          const bounds = (await front.boundingBox())!;
          await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
          await page.mouse.down();
          await page.mouse.move(bounds.x + bounds.width + 20, handle.y + handle.height / 2, {
            steps: 8,
          });
          await expect
            .poll(async () => {
              const box = (await frame.boundingBox())!;
              return Math.abs(box.x + box.width - bounds.x - bounds.width);
            })
            .toBeLessThan(1);
          await page.screenshot({
            path: info.outputPath('manual-lens-stage-draft.png'),
            fullPage: false,
          });
          await page.mouse.up();
          await expect
            .poll(async () => {
              const box = (await frame.boundingBox())!;
              return Math.abs(box.x + box.width - bounds.x - bounds.width);
            })
            .toBeLessThan(1);
          await page.screenshot({
            path: info.outputPath('manual-lens-stage-committed.png'),
            fullPage: false,
          });
        }
        const playbackStart = await video.evaluate((node) => node.currentTime);
        const playback = await observePreviewPlayback(page, 2000, () =>
          button('gallery.videoReview.play').click()
        );
        await expect
          .poll(() => video.evaluate((node) => node.currentTime))
          .toBeGreaterThanOrEqual(playbackStart + 2);
        await button('gallery.videoReview.pause').click();
        const times = playback.samples.map((sample) => sample.wall);
        expect(times.length).toBeGreaterThan(3);
        metrics.push({
          name: combination.name,
          publications: times.length,
          fps: ((times.length - 1) * 1000) / (times.at(-1)! - times[0]!),
        });
        await video.evaluate((node) => {
          node.currentTime = 3;
        });
        await expect.poll(() => video.evaluate((node) => node.seeking)).toBe(false);
        await page.screenshot({
          path: info.outputPath(`${combination.name}.png`),
          fullPage: false,
        });
        await close();
      }
      if (viewport.name === '1920x900') await checkFullEditorTransfer(page, host.origin, info);
      await writeFile(
        info.outputPath('combination-playback.json'),
        JSON.stringify(metrics, null, 2)
      );
      expect(errors).toEqual([]);
    } finally {
      await page.close();
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}

async function checkFullEditorTransfer(page: Page, origin: string, info: TestInfo) {
  const aggregateId = 'recording:beta-v1-recording';
  const saved = (await readNativeReviewWorkspace(page, aggregateId))!;
  const document = replayReviewHistory(
    saved.history,
    saved.cursor,
    saved.source,
    reviewDocumentBaseline(saved)
  );
  const perspective = { enabled: true, rotateX: 12, rotateY: -18, rotateZ: 5, strength: 0.7 };
  const edgeLens = {
    ...createQuickEditSpotlight(),
    effect: 'magnify' as const,
    lensShape: 'circle' as const,
    lensOptics: 'optical' as const,
    reveal: 'contract' as const,
    exitReveal: 'contract' as const,
    area: { x: 0.75, y: 0.25, width: 0.25, height: 0.5 },
  };
  const content = {
    ...document.advancedContent,
    zoom: {
      ...document.advancedContent.zoom,
      regions: [
        ...document.advancedContent.zoom.regions.map((region) =>
          region.border ? region : { ...region, perspective }
        ),
        {
          ...createQuickEditZoomRegion({ id: 'edge-lens', at: 0, duration: 12, endMax: 12 }),
          spotlight: edgeLens,
        },
      ],
    },
  };
  const admitted = parseVideoWorkspace({
    ...saved,
    revision: saved.revision + 1,
    history: [],
    cursor: 0,
    baseline: { ...document, advancedContent: content },
    advanced: { ...saved.advanced, ...content },
  });
  expect(admitted).not.toBeNull();
  await replaceNativeReviewWorkspace(page, aggregateId, admitted);
  await page.goto(
    `${origin}${GALLERY_HARNESS_PATH}?mediaId=${encodeURIComponent(aggregateId)}&mode=edit`
  );
  const dialog = page.locator('dialog');
  const galleryVideo = dialog.locator('video').first();
  await galleryVideo.evaluate((node) => {
    node.currentTime = 3;
  });
  await expect.poll(() => galleryVideo.evaluate((node) => node.seeking)).toBe(false);
  await dialog
    .locator('[data-ui="gallery.videoReview.manualPreview"] canvas[data-preview-front="true"]')
    .waitFor();
  await page.screenshot({
    path: info.outputPath('gallery-rotated-combination.png'),
    fullPage: false,
  });
  await dialog.locator('[data-ui="gallery.videoReview.openExport"]').click();
  const before = (await page.evaluate(() => window.__sniptaleHarness?.getCreatedTabs() ?? []))
    .length;
  await dialog.locator('[data-ui="gallery.videoReview.openVideoEditor"]').click();
  await expect
    .poll(
      async () =>
        (await page.evaluate(() => window.__sniptaleHarness?.getCreatedTabs() ?? [])).length
    )
    .toBe(before + 1);
  const created = (await page.evaluate(() => window.__sniptaleHarness?.getCreatedTabs() ?? [])).at(
    -1
  );
  if (!created?.url) throw new Error('Missing full-editor transfer route');
  const query = new URL(created.url).searchParams;
  await page.goto(`${origin}${VIDEO_EDITOR_HARNESS_PATH}?${query}`);
  await page.locator('[data-ui="video-editor.timeline.surface"]').waitFor();
  await expect
    .poll(
      async () =>
        (await readNativeVideoProject(page))?.motionRegions?.filter((region) => region.border)
          .length
    )
    .toBe(3);
  const project = (await readNativeVideoProject(page))!;
  expect(project.motionRegions?.find((region) => region.spotlight)?.spotlight).toEqual(edgeLens);
  expect(project.width).toBe(1920);
  expect(project.height).toBe(1080);
  expect(
    project.motionRegions?.filter((region) => region.border).map((region) => region.border)
  ).toEqual(content.zoom.regions.filter((region) => region.border).map((region) => region.border));
  expect(project.motionRegions?.find((region) => region.perspective?.enabled)?.perspective).toEqual(
    perspective
  );
  expect(project.actionFeedback?.[0]?.keyStyles).toEqual(content.keyAnimations);
  expect(project.actionFeedback?.[0]?.gestureStyles).toEqual(content.clickAnimations);
  await page.reload();
  await page.locator('[data-ui="video-editor.timeline.surface"]').waitFor();
  expect((await readNativeVideoProject(page))?.motionRegions).toEqual(project.motionRegions);
  expect((await readNativeVideoProject(page))?.actionFeedback).toEqual(project.actionFeedback);
  const playhead = page.locator('[data-ui="video-editor.timeline.playhead-handle"]');
  await playhead.press('Home');
  const thirdSecond = page
    .locator('[data-ui="video-editor.timeline.ruler"]')
    .getByText('0:03', { exact: true })
    .locator('..');
  await thirdSecond.click({ position: { x: 1, y: 15 } });
  await expect
    .poll(async () => Number(await playhead.getAttribute('aria-valuenow')))
    .toBeGreaterThan(2.9);
  expect(Number(await playhead.getAttribute('aria-valuenow'))).toBeLessThan(3.1);
  const beforePlay = Number(await playhead.getAttribute('aria-valuenow'));
  const toolbar = page.locator('[data-ui="video-editor.timeline.toolbar"]');
  await toolbar
    .getByRole('button', { name: translate('videoEditor.timeline.play', 'en'), exact: true })
    .click();
  await expect
    .poll(async () => Number(await playhead.getAttribute('aria-valuenow')))
    .toBeGreaterThan(beforePlay + 0.1);
  await toolbar
    .getByRole('button', { name: translate('videoEditor.timeline.pause', 'en'), exact: true })
    .click();
  await expect(page.locator('[data-preview-stage-canvas]')).toBeVisible();
  await page.screenshot({
    path: info.outputPath('transferred-rotated-combination.png'),
    fullPage: false,
  });
  const output = await encodedNativeVideoSamples(
    page,
    origin,
    project,
    'WEBM',
    // Exact color parity is covered by the composition proof; this checks native file decode.
    [{ time: 0.025, x: 0, y: 0, expected: [] }],
    { start: 2, end: 2.1 }
  );
  expect(output.width).toBe(project.width);
  expect(output.height).toBe(project.height);
  expect(Math.abs(output.duration - 0.1)).toBeLessThan(0.03);
  expect(output.size).toBeGreaterThan(1000);
  expect(output.samples).toHaveLength(1);
  expect(output.samples[0]!.pixel[3]).toBe(255);
  await writeFile(
    info.outputPath('transferred-combination-export.json'),
    JSON.stringify(output, null, 2)
  );
}
