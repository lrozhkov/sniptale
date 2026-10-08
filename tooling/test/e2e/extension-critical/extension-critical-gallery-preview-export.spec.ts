import { expect, test } from '@playwright/test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile } from 'node:fs/promises';
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
