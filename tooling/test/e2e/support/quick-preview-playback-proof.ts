import { replaceNativeReviewWorkspace } from './native-review-workspace';
import { expect, type Page } from '@playwright/test';
import { execFile } from 'node:child_process';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { parseVideoWorkspace } from '../../../../apps/extension/src/composition/persistence/review-workspaces/parser';
import {
  replayReviewHistory,
  reviewAdvancedContentBaseline,
} from '../../../../apps/extension/src/features/video/review/document';
import { createQuickEditZoomRegion } from '../../../../apps/extension/src/features/video/review/advanced/zoom';
import { readWebcamWorkspace } from './quick-editor-webcam-proof';

/** Preserve real moving frames/audio, then hold a decoded frame through lossless encoding. */
export async function createExactHeldPreviewFixture(
  source: { path: string; width: number; height: number; fps: number },
  path: string
) {
  if (![30, 60].includes(source.fps)) throw new Error('Unsupported held proof cadence');
  const execute = promisify(execFile);
  const args = [
    '-hide_banner',
    '-loglevel',
    'error',
    '-nostdin',
    '-y',
    '-i',
    source.path,
    '-map',
    '0:v:0',
    '-map',
    '0:a:0',
    '-vf',
    'trim=duration=2,setpts=PTS-STARTPTS,tpad=stop_mode=clone:stop_duration=6',
    '-c:v',
    'libvpx-vp9',
    '-lossless',
    '1',
    '-deadline',
    'realtime',
    '-cpu-used',
    '8',
    '-threads',
    '1',
    '-pix_fmt',
    'yuv420p',
    '-r',
    String(source.fps),
    '-c:a',
    'copy',
    '-t',
    '8',
    path,
  ];
  await execute('/usr/bin/ffmpeg', args, { timeout: 180_000, maxBuffer: 1024 * 1024 });
  const metadata = await stat(path);
  if (!metadata.isFile() || metadata.size <= 0 || metadata.size > 64 * 1024 * 1024)
    throw new Error('Held proof fixture exceeds bounded size');
  // Independent decoder evidence rejects a changed recipe/codec that does not preserve the hold.
  const decoded = await execute(
    '/usr/bin/ffmpeg',
    ['-v', 'error', '-i', path, '-an', '-f', 'framemd5', '-'],
    { timeout: 60_000, maxBuffer: 1024 * 1024 }
  );
  const hashes = decoded.stdout
    .split('\n')
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => line.split(',').at(-1)!.trim());
  expect(hashes).toHaveLength(8 * source.fps);
  expect(new Set(hashes.slice(0, source.fps)).size).toBeGreaterThan(1);
  expect(new Set(hashes.slice(2 * source.fps)).size).toBe(1);
  await writeFile(`${path}.framemd5`, decoded.stdout);
  await writeFile(
    `${path}.recipe.json`,
    JSON.stringify(
      {
        source: source.path,
        args,
        width: source.width,
        height: source.height,
        fps: source.fps,
        duration: 8,
        heldStart: 2,
        movingFrameHashes: new Set(hashes.slice(0, source.fps)).size,
        heldFrameHashes: new Set(hashes.slice(2 * source.fps)).size,
        audio: 'Original Opus stream copied for eight seconds; no physical audio-output claim.',
      },
      null,
      2
    )
  );
  return {
    bytes: await readFile(path),
    width: source.width,
    height: source.height,
    fps: source.fps,
    duration: 8,
  };
}

/** Acquisition copies the library recording into a private project asset; replay the committed contract. */
export async function readAcquiredPreviewCamera(page: Page) {
  const stored = await readWebcamWorkspace(page);
  if (!stored) return null;
  return (
    replayReviewHistory(
      stored.history,
      stored.cursor,
      stored.source,
      reviewAdvancedContentBaseline(stored.advanced)
    ).advancedContent.webcam ?? null
  );
}

export function previewPlaybackControls(page: Page) {
  const review = page.locator('[data-ui="gallery.videoReview.dialog"]');
  const button = (key: Parameters<typeof translate>[0]) =>
    review.getByRole('button', { name: translate(key, 'en'), exact: true });
  const video = review.locator('[data-ui="gallery.videoReview.stage"] video').first();
  const host = review.locator('[data-ui="gallery.videoReview.manualPreview"]');
  const canvas = host.locator('canvas');
  const panel = review.locator('[data-ui="gallery.videoReview.previewInspector"]');
  return {
    review,
    button,
    video,
    host,
    canvas,
    panel,
    async open(camera = false) {
      await page
        .getByRole('button', { name: camera ? /: Screen$/ : 'beta-v1.webm', exact: !camera })
        .first()
        .click();
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      await expect
        .poll(() => video.evaluate((node: HTMLVideoElement) => node.readyState))
        .toBeGreaterThanOrEqual(2);
    },
    async choose(key: Parameters<typeof translate>[0], value: string) {
      if (!(await panel.isVisible()))
        await review.locator('[data-ui="gallery.videoReview.previewSettings"]').click();
      await panel.getByRole('button', { name: translate(key, 'en'), exact: true }).click();
      await page.getByRole('option', { name: value, exact: true }).click();
    },
    async seek(time: number) {
      // A real native seek exercises the mounted transport's seeking/seeked handlers.
      await video.evaluate((node: HTMLVideoElement, value) => {
        node.currentTime = value;
      }, time);
      await expect
        .poll(() =>
          video.evaluate((node: HTMLVideoElement) => !node.seeking && node.readyState >= 2)
        )
        .toBe(true);
      await expect
        .poll(() => video.evaluate((node: HTMLVideoElement) => node.currentTime))
        .toBeCloseTo(time, 2);
    },
    async pixel(x: number, y: number) {
      return canvas.evaluate(
        (node: HTMLCanvasElement, point) => [
          ...node
            .getContext('2d')!
            .getImageData(Math.floor(node.width * point.x), Math.floor(node.height * point.y), 1, 1)
            .data,
        ],
        { x, y }
      );
    },
  };
}

/** A long camera transition changes composition while the proof source is held from 2s. */
export async function installHeldPreviewMotion(page: Page) {
  const stored = await readWebcamWorkspace(page);
  if (!stored) throw new Error('Expected persisted source acquisition');
  const before = replayReviewHistory(
    stored.history,
    stored.cursor,
    stored.source,
    reviewAdvancedContentBaseline(stored.advanced)
  ).advancedContent;
  const region = {
    ...createQuickEditZoomRegion({ id: 'held-preview-motion', at: 2, duration: 6 }),
    transform: { scale: 2, centerX: 0.5, centerY: 0.5 },
    enter: { type: 'linear' as const, duration: 5 },
    exit: { type: 'none' as const, duration: 0 },
  };
  const history = [
    ...stored.history.slice(0, stored.cursor),
    {
      id: 'held-preview-motion',
      at: Date.now(),
      target: 'advancedContent' as const,
      before,
      after: { ...before, zoom: { enabled: true, regions: [region] } },
    },
  ];
  const row = parseVideoWorkspace({
    ...stored,
    revision: stored.revision + 1,
    history,
    cursor: history.length,
    updatedAt: Date.now(),
    advanced: {
      ...stored.advanced,
      ui: {
        ...stored.advanced.ui,
        mode: 'advanced',
        advancedTracksInitialized: true,
        tracks: { ...stored.advanced.ui.tracks, zoom: true },
      },
    },
  });
  if (!row) throw new Error('Invalid held-source authored motion');
  await replaceNativeReviewWorkspace(page, row.aggregateId, row);
}

/** Observes committed canvases, not RAF/native callback counts. Small readbacks are correctness instrumentation. */
export async function observePreviewPlayback(
  page: Page,
  durationMs: number,
  startPlayback?: () => Promise<void>
) {
  const probe = await page.evaluateHandle((durationMs) => {
    const host = document.querySelector('[data-ui="gallery.videoReview.manualPreview"]')!;
    const video = document.querySelector<HTMLVideoElement>(
      '[data-ui="gallery.videoReview.stage"] video'
    )!;
    const scratch = Object.assign(document.createElement('canvas'), { width: 32, height: 18 });
    const context = scratch.getContext('2d')!;
    const hash = (source: CanvasImageSource) => {
      context.clearRect(0, 0, 32, 18);
      context.drawImage(source, 0, 0, 32, 18);
      let result = 2166136261;
      for (const byte of context.getImageData(0, 0, 32, 18).data)
        result = Math.imul(result ^ byte, 16777619);
      return result >>> 0;
    };
    const samples: Array<{
      wall: number;
      sourceTime: number;
      rate: number;
      sourceHash: number;
      composedHash: number;
    }> = [];
    const transport: Array<{ wall: number; time: number; rate: number; seeking: boolean }> = [];
    const start = performance.now();
    const observer = new MutationObserver(() => {
      const canvas = host.querySelector('canvas');
      if (canvas && samples.length < 1000 && video.readyState >= 2)
        samples.push({
          wall: performance.now() - start,
          sourceTime: video.currentTime,
          rate: video.playbackRate,
          sourceHash: hash(video),
          composedHash: hash(canvas),
        });
    });
    observer.observe(host, { childList: true });
    const sampleTransport = () => {
      if (transport.length < 2000)
        transport.push({
          wall: performance.now() - start,
          time: video.currentTime,
          rate: video.playbackRate,
          seeking: video.seeking,
        });
    };
    sampleTransport();
    const events = ['seeking', 'seeked', 'ratechange'];
    for (const event of events) video.addEventListener(event, sampleTransport);
    const timer = window.setInterval(sampleTransport, 20);
    return {
      async finish() {
        await new Promise<void>((resolve) => setTimeout(resolve, durationMs));
        return {
          elapsed: performance.now() - start,
          samples,
          transport,
          note: 'Publication wall time and contemporaneous native clock, not represented source timestamp or physical audio latency.',
        };
      },
      dispose() {
        observer.disconnect();
        clearInterval(timer);
        for (const event of events) video.removeEventListener(event, sampleTransport);
        scratch.width = scratch.height = 0;
      },
    };
  }, durationMs);
  try {
    // evaluateHandle acknowledges observer installation and captures the pre-play clock.
    await startPlayback?.();
    return await probe.evaluate((value) => value.finish());
  } finally {
    await probe.evaluate((value) => value.dispose());
    await probe.dispose();
  }
}

/** Simulates the actual visibility event contract, without claiming OS background throttling proof. */
export async function setPreviewProofVisibility(page: Page, hidden: boolean) {
  await page.evaluate((hidden) => {
    if (hidden)
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    else Reflect.deleteProperty(document, 'visibilityState');
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);
}
