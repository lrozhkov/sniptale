import { ALL_FORMATS, BufferSource, Input } from 'mediabunny';
import type { ProjectExportInputReference } from '../../../../apps/extension/src/contracts/video/types/project-export-input';
import type {
  VideoProject,
  VideoProjectExportSettings,
} from '../../../../apps/extension/src/features/video/project/types';
import {
  resolveProjectOutputTransform,
  resolveVideoExportDimensions,
} from '../../../../apps/extension/src/features/video/project/export/output-dimensions';
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
  range?: { start: number; end: number },
  preparedInput?: ProjectExportInputReference,
  preparedSettings?: VideoProjectExportSettings
) {
  const settings: VideoProjectExportSettings = preparedSettings ?? {
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
  const jobId = preparedInput?.jobId ?? `native-video-${format}-${crypto.randomUUID()}`;
  const resources = preparedInput
    ? []
    : await Promise.all(
        (project.effectSnapshots ?? []).flatMap((snapshot) =>
          snapshot.assets.map(async (asset) => ({
            snapshotId: snapshot.id,
            assetId: asset.id,
            mimeType: asset.blob.type,
            bytes: [...new Uint8Array(await asset.blob.arrayBuffer())],
          }))
        )
      );
  const input =
    preparedInput ??
    (await page.evaluate(
      async ({ jobId, project, resources }) => {
        if (!window.__sniptaleOffscreenHarness) throw new Error('Missing export bridge');
        const hydrated = {
          ...project,
          effectSnapshots: project.effectSnapshots?.map((snapshot) => ({
            ...snapshot,
            assets: snapshot.assets.map((asset) => {
              const resource = resources.find(
                (item) => item.snapshotId === snapshot.id && item.assetId === asset.id
              );
              if (!resource) throw new Error('Missing exported fixture resource.');
              return {
                ...asset,
                blob: new Blob([Uint8Array.from(resource.bytes)], { type: resource.mimeType }),
              };
            }),
          })),
        };
        return window.__sniptaleOffscreenHarness.stageProjectExportInput(jobId, hydrated);
      },
      { jobId, project, resources }
    ));
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
  const transform = resolveProjectOutputTransform(project, settings);
  const output = await page.evaluate(
    async ({ exportId, points, fps, inspectAudio }) => {
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
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const context = canvas.getContext('2d')!;
        const samples = [];
        for (const time of [...new Set(points.map((point) => point.time))]) {
          let mediaTime = time;
          await new Promise<void>((resolve, reject) => {
            // A paused seek presents the output frame containing the requested time.
            const frameTime = Math.floor(time * fps) / fps;
            let lastPresented: number | undefined;
            let callback = 0;
            const timeout = window.setTimeout(() => {
              video.cancelVideoFrameCallback(callback);
              reject(
                new Error(
                  `Native export frame unavailable: requested=${time}, frame=${frameTime}, ` +
                    `presented=${lastPresented}, current=${video.currentTime}, seeking=` +
                    `${video.seeking}, ready=${video.readyState}`
                )
              );
            }, 15000);
            const presented: VideoFrameRequestCallback = (_now, metadata) => {
              lastPresented = metadata.mediaTime;
              if (Math.abs(metadata.mediaTime - frameTime) < 0.5 / fps + 0.000001) {
                window.clearTimeout(timeout);
                mediaTime = metadata.mediaTime;
                resolve();
              } else callback = video.requestVideoFrameCallback(presented);
            };
            callback = video.requestVideoFrameCallback(presented);
            video.currentTime = time;
          });
          context.drawImage(video, 0, 0);
          for (const { x, y, expected } of points.filter((point) => point.time === time)) {
            const pixel = Array.from(context.getImageData(x, y, 1, 1).data);
            samples.push({
              time,
              mediaTime,
              x,
              y,
              pixel,
              expected,
              error: expected.reduce((sum, value, i) => sum + Math.abs(pixel[i]! - value), 0) / 3,
            });
          }
        }
        let audioInspection: string | null = null;
        if (inspectAudio) {
          const bytes = new Uint8Array(await file.arrayBuffer());
          let binary = '';
          for (let i = 0; i < bytes.length; i += 32768)
            binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
          audioInspection = btoa(binary);
        }
        return {
          audioInspection,
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
    {
      exportId: completion.exportId,
      points: points.map((point) => ({
        ...point,
        x: Math.round(transform.offsetX + point.x * transform.scale),
        y: Math.round(transform.offsetY + point.y * transform.scale),
      })),
      fps: settings.fps,
      inspectAudio: settings.scope === 'selected-clip',
    }
  );
  const { audioInspection, ...result } = output;
  let audioTrackCount: number | undefined;
  if (audioInspection !== null) {
    const input = new Input({
      formats: ALL_FORMATS,
      source: new BufferSource(Buffer.from(audioInspection, 'base64')),
    });
    try {
      audioTrackCount = (await input.getAudioTracks()).length;
    } finally {
      input.dispose();
    }
  }
  return { ...result, audioTrackCount };
}

/** Measures RMS windows in the latest completed actual Native export; the default window is20ms. */
export async function readEncodedAudioWindows(
  page: Page,
  times: readonly number[],
  duration = 0.02
) {
  const messages = await getRuntimeMessagesByType(page, VideoMessageType.PROJECT_EXPORT_COMPLETED);
  const exportId = messages.at(-1)?.exportId;
  if (typeof exportId !== 'string') throw new Error('Missing encoded export');
  return page.evaluate(
    async ({ id, times, duration }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('sniptale-db');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const entry: unknown = await new Promise((resolve, reject) => {
        const request = db.transaction('project_exports').objectStore('project_exports').get(id);
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
        throw new Error('Missing encoded asset');
      const objects = await (
        await (await navigator.storage.getDirectory()).getDirectoryHandle('sniptale-assets')
      ).getDirectoryHandle('objects');
      const file = await (await objects.getFileHandle(entry.assetId)).getFile();
      const decoder = new AudioContext({ sampleRate: 48000 });
      try {
        const audio = await decoder.decodeAudioData(await file.arrayBuffer());
        const pcm = audio.getChannelData(0);
        return times.map((time) => {
          const first = Math.round(time * audio.sampleRate),
            last = Math.round((time + duration) * audio.sampleRate);
          if (first < 0 || last > pcm.length)
            throw new Error('Encoded audio window is outside the export.');
          let squares = 0;
          for (let frame = first; frame < last; frame++) squares += pcm[frame]! ** 2;
          return Math.sqrt(squares / (last - first));
        });
      } finally {
        await decoder.close();
      }
    },
    { id: exportId, times, duration }
  );
}
