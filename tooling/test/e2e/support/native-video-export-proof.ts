import type {
  VideoProject,
  VideoProjectExportSettings,
} from '../../../../apps/extension/src/features/video/project/types';
import { resolveVideoExportDimensions } from '../../../../apps/extension/src/features/video/project/export/output-dimensions';
import { assertVideoProjectExportSettingsCompatibleWithProject } from '../../../../apps/extension/src/features/video/project/export/settings-validation';
import { expect, type Page } from '@playwright/test';
import {
  OFFSCREEN_HARNESS_PATH,
  emitTrustedOffscreenHarnessRuntimeMessage,
  getRuntimeMessagesByType,
  VideoMessageType,
} from '../extension-critical.helpers';

/** Stages a trusted export, decodes its file and samples caller-specified pixels. */
export async function encodedNativeVideoSamples(
  page: Page,
  origin: string,
  project: VideoProject,
  format: 'MP4' | 'WEBM',
  points: readonly { time: number; x: number; y: number; expected: readonly number[] }[],
  range?: { start: number; end: number }
) {
  const settings: VideoProjectExportSettings = {
    burnInSubtitles: false,
    downloadAfterExport: false,
    format,
    fps: 40,
    ...resolveVideoExportDimensions(project.width, project.height, 'SOURCE'),
    quality: 'MEDIUM',
    resolution: 'SOURCE',
    scope: range ? 'selected-range' : 'project',
    ...(range ? { rangeStartSeconds: range.start, rangeEndSeconds: range.end } : {}),
    subtitleSidecarFormats: [],
    ...(format === 'MP4' ? { mp4VideoCodec: 'VP9' } : { webmVideoCodec: 'VP9' }),
  };
  assertVideoProjectExportSettingsCompatibleWithProject(project, settings);
  await page.goto(`${origin}${OFFSCREEN_HARNESS_PATH}`);
  await page.locator('[data-ui="offscreen.harness.root"][data-state="ready"]').waitFor();
  const jobId = `native-video-${format}-${crypto.randomUUID()}`;
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
    settings,
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
    async ({ exportId, points }) => {
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
        for (const time of [...new Set(points.map((point) => point.time))]) {
          await new Promise<void>((resolve) => {
            const presented: VideoFrameRequestCallback = (_now, metadata) => {
              if (Math.abs(metadata.mediaTime - time) < 0.012501) resolve();
              else video.requestVideoFrameCallback(presented);
            };
            video.requestVideoFrameCallback(presented);
            video.currentTime = time;
          });
          context.drawImage(video, 0, 0);
          for (const { x, y, expected } of points.filter((point) => point.time === time)) {
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
    { exportId: completion.exportId, points }
  );
}
