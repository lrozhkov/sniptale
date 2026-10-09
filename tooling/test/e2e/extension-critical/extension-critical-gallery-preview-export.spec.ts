import { expect, test, type Page } from '@playwright/test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile } from 'node:fs/promises';
import { DEFAULT_WINDOW_HEADER } from '../../../../apps/extension/src/features/browser-frame/header';
import { parseVideoWorkspace } from '../../../../apps/extension/src/composition/persistence/review-workspaces/parser';
import { createQuickEditZoomRegion } from '../../../../apps/extension/src/features/video/review/advanced/zoom';
import { DEFAULT_QUICK_EDIT_DEPTH } from '../../../../apps/extension/src/features/video/review/advanced/spatial';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import {
  replayReviewHistory,
  reviewAdvancedContentBaseline,
} from '../../../../apps/extension/src/features/video/review/document';
import { resolveQuickEditExportPlan } from '../../../../apps/extension/src/features/video/review/advanced/effective';
import { startHostServer } from '../support/host-server';
import { seedReviewVideo, clickReviewExport } from '../support/quick-editor-media-fixture';
import { readWebcamWorkspace } from '../support/quick-editor-webcam-proof';
import { applyHarnessBootstrap, GALLERY_HARNESS_PATH } from '../extension-critical.helpers';

const execute = promisify(execFile);
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid media metadata');
  return Object.fromEntries(Object.entries(value));
}
async function metadata(path: string) {
  const { stdout } = await execute('/usr/bin/ffprobe', [
    '-v',
    'error',
    '-show_entries',
    'stream=codec_type,codec_name,width,height,r_frame_rate,sample_rate,channels:format=duration',
    '-of',
    'json',
    path,
  ]);
  const parsed = record(JSON.parse(stdout));
  if (!Array.isArray(parsed.streams)) throw new Error('Missing exported streams');
  const streams = parsed.streams.map(record);
  const value = record(parsed.format).duration;
  if (typeof value !== 'string' || !Number.isFinite(Number(value)))
    throw new Error('Invalid export duration');
  return { streams, duration: Number(value) };
}
async function pixels(path: string, time: number) {
  const { stdout } = await execute(
    '/usr/bin/ffmpeg',
    [
      '-v',
      'error',
      '-ss',
      String(time),
      '-i',
      path,
      '-map',
      '0:v:0',
      '-frames:v',
      '1',
      '-f',
      'rawvideo',
      '-pix_fmt',
      'rgb24',
      'pipe:1',
    ],
    { encoding: 'buffer', maxBuffer: 16 * 1024 * 1024 }
  );
  return stdout;
}
function exportPlan(workspace: NonNullable<Awaited<ReturnType<typeof readWebcamWorkspace>>>) {
  const document = replayReviewHistory(
    workspace.history,
    workspace.cursor,
    workspace.source,
    reviewAdvancedContentBaseline(workspace.advanced)
  );
  return resolveQuickEditExportPlan({
    document,
    advanced: { ...workspace.advanced, ...document.advancedContent },
  });
}

test('preview quality never changes the encoded project output', async ({ page }, info) => {
  test.setTimeout(180_000);
  page.setDefaultTimeout(15_000);
  await page.setViewportSize({ width: 1920, height: 900 });
  const host = await startHostServer();
  const label = (key: Parameters<typeof translate>[0]) => translate(key, 'en');
  const review = page.locator('[data-ui="gallery.videoReview.dialog"]');
  const button = (key: Parameters<typeof translate>[0]) =>
    review.getByRole('button', { name: label(key), exact: true });
  const download = async (name: string) => {
    const downloading = page.waitForEvent('download');
    await clickReviewExport(button, 'gallery.videoReview.downloadVideo');
    const result = await downloading;
    const path = info.outputPath(name);
    await result.saveAs(path);
    expect(await result.failure()).toBeNull();
    return path;
  };
  try {
    await applyHarnessBootstrap(page, {
      preserveMediaLibrary: true,
      storage: { 'sniptale-locale-preference': 'en', 'sniptale-theme-preference': 'dark' },
    });
    await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}?theme=dark`);
    await page.locator('[data-ui="gallery.page.root"]').waitFor();
    await seedReviewVideo(page, 'review-vp8-opus.webm', { width: 160, height: 90, duration: 12 });
    await page.reload();
    await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).first().click();
    await page.locator('[data-ui="gallery.videoReview.enter"]').click();
    await button('gallery.videoReview.advancedEditing').click();
    await button('gallery.videoReview.scene').click();
    const watermark = review.locator('[data-ui="gallery.videoReview.watermarkInspector"]');
    await watermark
      .getByRole('button', { name: label('gallery.videoReview.watermarkText'), exact: true })
      .click();
    await expect(watermark).toHaveAttribute('aria-busy', 'false');
    await expect
      .poll(async () => {
        const saved = await readWebcamWorkspace(page);
        const plan = saved ? exportPlan(saved) : null;
        return plan && 'video' in plan ? plan.video : undefined;
      })
      .toBe('render');
    const currentPath = await download('current-preview.webm');
    const before = await readWebcamWorkspace(page);
    if (!before) throw new Error('Missing authored workspace');
    const beforePlan = exportPlan(before);
    expect('video' in beforePlan && beforePlan.video).toBe('render');
    await review.locator('[data-ui="gallery.videoReview.previewSettings"]').click();
    const panel = review.locator('[data-ui="gallery.videoReview.previewInspector"]');
    const choose = async (key: Parameters<typeof translate>[0], value: string) => {
      const field = panel.getByRole('button', { name: label(key), exact: true });
      await field.click();
      await page.getByRole('option', { name: value, exact: true }).click();
      await expect(field).toHaveText(value);
    };
    await choose('gallery.videoReview.previewResolution', '360p');
    await choose('gallery.videoReview.previewFrameRate', '≤ 15 FPS');
    await choose(
      'gallery.videoReview.previewPaused',
      label('gallery.videoReview.previewPausedDetailed')
    );
    await choose(
      'gallery.videoReview.previewShowFrameRate',
      label('gallery.videoReview.previewOn')
    );
    await expect(
      review.locator('[data-ui="gallery.videoReview.manualPreview"] canvas')
    ).toBeVisible();
    await expect(
      review.getByText(label('gallery.videoReview.previewFailed'), { exact: true })
    ).toHaveCount(0);
    const afterPreferences = await readWebcamWorkspace(page);
    expect(afterPreferences).toEqual(before);
    expect(JSON.stringify(afterPreferences)).not.toContain('rasterPreset');
    const manualPath = await download('manual-preview.webm');
    const after = await readWebcamWorkspace(page);
    expect(after).toEqual(before);
    if (!after) throw new Error('Missing workspace after export');
    expect(exportPlan(after)).toEqual(beforePlan);
    const first = await metadata(currentPath),
      second = await metadata(manualPath);
    expect(first.streams.some((stream) => stream.codec_type === 'audio')).toBe(true);
    expect(second.streams).toEqual(first.streams);
    expect(second.duration).toBeCloseTo(first.duration, 3);
    expect(first.duration).toBeGreaterThan(11.5);
    expect(first.duration).toBeLessThan(12.5);
    const comparisons = [];
    for (const time of [0.5, 5, 10.5]) {
      const left = await pixels(currentPath, time),
        right = await pixels(manualPath, time);
      expect(left.length).toBe(160 * 90 * 3);
      expect(right.length).toBe(left.length);
      let total = 0,
        peak = 0;
      for (let index = 0; index < left.length; index++) {
        const delta = Math.abs(left[index]! - right[index]!);
        total += delta;
        peak = Math.max(peak, delta);
      }
      const mean = total / left.length;
      // Same renderer/codec/settings should agree; allow at most one RGB code value on average.
      expect(mean).toBeLessThanOrEqual(1);
      expect(peak).toBeLessThanOrEqual(8);
      comparisons.push({ time, mean, peak });
    }
    await writeFile(
      info.outputPath('preview-export-isolation.json'),
      JSON.stringify(
        {
          first,
          second,
          comparisons,
          plan: beforePlan,
          workspace: before,
          evidence: 'Actual encoded frames and audio presence; no backup behavior asserted.',
        },
        null,
        2
      )
    );
  } finally {
    await new Promise<void>((resolve) => host.server.close(() => resolve()));
  }
});

async function seedCutZooms(page: Page) {
  const stored = await readWebcamWorkspace(page);
  if (!stored) throw new Error('Missing saved workspace');
  const before = replayReviewHistory(
    stored.history,
    stored.cursor,
    stored.source,
    reviewAdvancedContentBaseline(stored.advanced)
  ).advancedContent;
  const region = (id: string, start: number, end: number, scale: number, tilt: number) => ({
    ...createQuickEditZoomRegion({ id, at: start, duration: end - start }),
    sourceAnchor: { start, end },
    transform: { scale, centerX: 0.5, centerY: 0.5 },
    enter: { type: 'none' as const, duration: 0 },
    exit: { type: 'none' as const, duration: 0 },
    perspective: { enabled: true, rotateX: tilt, rotateY: tilt / 2, rotateZ: 0, strength: 0.5 },
    depthOfField: { ...DEFAULT_QUICK_EDIT_DEPTH, enabled: true, strength: 0.25 },
  });
  const after = {
    ...before,
    canvas: { width: 640, height: 360 },
    background: {
      enabled: true as const,
      type: 'solid' as const,
      color: '#334455ff',
      zoomBehavior: 'window' as const,
      layout: { padding: 40, cornerRadius: 12 },
    },
    windowHeader: { ...DEFAULT_WINDOW_HEADER, title: 'Dissolve transforms' },
    zoom: {
      enabled: true,
      regions: [
        { ...region('left', 0, 4, 1.2, 12), linkTo: 'right', linkEasing: 'linear' as const },
        region('right', 6, 10, 1.6, -18),
      ],
    },
  };
  const history = [
    ...stored.history.slice(0, stored.cursor),
    { id: 'two-zooms', at: 1, target: 'advancedContent' as const, before, after },
    {
      id: 'cut-zooms',
      at: 2,
      target: 'edit' as const,
      before: null,
      after: {
        id: 'cut',
        kind: 'cut' as const,
        start: 3,
        end: 7,
        requestedStart: 3,
        requestedEnd: 7,
        transition: { type: 'dissolve' as const, before: 0.5, after: 0.5 },
      },
      preserveFocusAnchors: true,
      preserveUnderCuts: true,
    },
  ];
  const row = parseVideoWorkspace({
    ...stored,
    revision: stored.revision + 1,
    updatedAt: Date.now(),
    history,
    cursor: history.length,
    advanced: {
      ...stored.advanced,
      ui: {
        ...stored.advanced.ui,
        mode: 'advanced',
        tracks: { ...stored.advanced.ui.tracks, zoom: true },
      },
    },
  });
  if (!row) throw new Error('Invalid cut/zoom workspace');
  await page.evaluate(async (row) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('sniptale-db');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const tx = db.transaction('video_workspaces', 'readwrite');
      const done = new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error);
      });
      tx.objectStore('video_workspaces').put(row);
      await done;
    } finally {
      db.close();
    }
  }, row);
}

for (const viewport of [
  { width: 1280, height: 560 },
  { width: 1920, height: 900 },
]) {
  test(`cut dissolves retain zoom links and transformed preview/export pixels at ${viewport.width}`, async ({
    page,
  }, info) => {
    test.setTimeout(180_000);
    await page.setViewportSize(viewport);
    const host = await startHostServer();
    const review = page.locator('[data-ui="gallery.videoReview.dialog"]');
    const button = (key: Parameters<typeof translate>[0]) =>
      review.getByRole('button', { name: translate(key, 'en'), exact: true });
    const open = async () => {
      await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).first().click();
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
    };
    try {
      await applyHarnessBootstrap(page, {
        preserveMediaLibrary: true,
        storage: { 'sniptale-locale-preference': 'en', 'sniptale-theme-preference': 'dark' },
      });
      await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}?theme=dark`);
      await page.locator('[data-ui="gallery.page.root"]').waitFor();
      await seedReviewVideo(page, 'review-vp8-opus.webm', { width: 160, height: 90, duration: 12 });
      await page.reload();
      await open();
      await button('gallery.videoReview.advancedEditing').click();
      await expect.poll(async () => !!(await readWebcamWorkspace(page))).toBe(true);
      await seedCutZooms(page);
      await page.reload();
      await open();
      const saved = await readWebcamWorkspace(page);
      if (!saved) throw new Error('Missing cut zoom workspace');
      const authored = replayReviewHistory(
        saved.history,
        saved.cursor,
        saved.source,
        reviewAdvancedContentBaseline(saved.advanced)
      );
      expect(authored.advancedContent.zoom.regions[0]?.linkTo).toBe('right');
      const preview = review.locator('[data-ui="gallery.videoReview.manualPreview"] canvas');
      await expect(preview).toBeVisible();
      const captures = [];
      for (const [sourceTime, resultTime] of [
        [2.8, 2.8],
        [7, 3],
        [7.2, 3.2],
      ]) {
        const previous = await preview.evaluate((node) => node.toDataURL());
        await review
          .locator('video')
          .first()
          .evaluate(async (video, time) => {
            if (video.currentTime === time) return;
            await new Promise<void>((resolve) => {
              video.addEventListener('seeked', () => resolve(), { once: true });
              video.currentTime = time!;
            });
          }, sourceTime!);
        // Publication is asynchronous to the transport seek; wait for a replacement canvas.
        await expect(
          review.getByText(translate('gallery.videoReview.previewFailed', 'en'), { exact: true })
        ).toHaveCount(0);
        await expect.poll(() => preview.evaluate((node) => node.width > 0)).toBe(true);
        await expect.poll(() => preview.evaluate((node) => node.toDataURL())).not.toBe(previous);
        captures.push(
          await preview.evaluate((node, time) => {
            const context = node.getContext('2d')!;
            const points = [];
            for (let y = 0.1; y < 0.95; y += 0.1)
              for (let x = 0.1; x < 0.95; x += 0.1)
                points.push({
                  x,
                  y,
                  rgb: [
                    ...context.getImageData(
                      Math.floor(x * node.width),
                      Math.floor(y * node.height),
                      1,
                      1
                    ).data,
                  ].slice(0, 3),
                });
            return { time: time!, width: node.width, height: node.height, points };
          }, resultTime!)
        );
      }
      await page.screenshot({ path: info.outputPath('cut-zoom-dissolve.png'), fullPage: false });
      const downloading = page.waitForEvent('download');
      await clickReviewExport(button, 'gallery.videoReview.downloadVideo');
      const download = await downloading;
      const path = info.outputPath('cut-zoom-dissolve.webm');
      await download.saveAs(path);
      expect(await download.failure()).toBeNull();
      const output = await metadata(path);
      const video = output.streams.find((stream) => stream.codec_type === 'video');
      if (!video || typeof video.width !== 'number' || typeof video.height !== 'number')
        throw new Error('Missing video geometry');
      expect(output.duration).toBeCloseTo(8, 1);
      const comparisons = [];
      for (const capture of captures) {
        const rgb = await pixels(path, capture.time);
        let total = 0;
        for (const point of capture.points) {
          const index =
            (Math.floor(point.y * video.height) * video.width + Math.floor(point.x * video.width)) *
            3;
          for (let channel = 0; channel < 3; channel++)
            total += Math.abs(rgb[index + channel]! - point.rgb[channel]!);
        }
        const mean = total / (capture.points.length * 3);
        expect(mean).toBeLessThan(12);
        comparisons.push({ time: capture.time, mean });
      }
      await writeFile(
        info.outputPath('cut-zoom-parity.json'),
        JSON.stringify({ captures, comparisons, output }, null, 2)
      );
    } finally {
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}
