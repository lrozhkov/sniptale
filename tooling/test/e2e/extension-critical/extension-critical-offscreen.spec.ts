import { expect, type Page } from '@playwright/test';
import type { ProjectExportInputReference } from '../../../../apps/extension/src/contracts/video/types/messages.export';
import type { VideoProject } from '../../../../apps/extension/src/features/video/project/types';
import { renderEffectV1Mp4Projects } from './extension-critical-offscreen-effects.helpers';
import {
  DB_NAME,
  DB_VERSION,
  FRAME_ANNOTATION_RASTER_JOBS_STORE,
} from '../../../../apps/extension/src/composition/persistence/infrastructure/indexed-db/core.stores';
import {
  createFrameAnnotationSnapshot,
  parseFrameAnnotationSnapshot,
} from '../../../../apps/extension/src/features/highlighter/frame-annotation';
import {
  createDefaultFrameCallout,
  createDefaultFrameStepBadge,
} from '../../../../apps/extension/src/features/highlighter/frame-annotation/defaults';
import { test } from '../support/extension-fixture';
import {
  applyHarnessBootstrap,
  countRuntimeMessagesByType,
  E2E_RUNTIME_SUCCESS_API_BEHAVIOR,
  emitTrustedOffscreenHarnessRuntimeMessage,
  getRuntimeMessagesByType,
  OFFSCREEN_HARNESS_PATH,
  VideoMessageType,
} from '../extension-critical.helpers';

type OffscreenHarnessBridge = {
  recordCanvasCadence: (
    frameRate: number,
    recordingDurationMs: number
  ) => Promise<{
    centerPixel: { alpha: number; blue: number; green: number; red: number };
    decodedDurationMs: number;
    drawCount: number;
    height: number;
    mimeType: string;
    size: number;
    width: number;
  }>;
  setMediaRecorderState: (state: 'inactive' | 'recording' | 'paused') => void;
  getMediaRecorderState: () => 'inactive' | 'recording' | 'paused';
  recordColdHighResolutionSequence: () => Promise<
    Array<{
      appendCount: number;
      firstAppendMs: number;
      height: number;
      mimeType: string;
      preStopAppendCount: number;
      recordingDurationMs: number;
      size: number;
      width: number;
    }>
  >;
  recordLiveVfrArtifact: () => Promise<{
    backwardTimestamps: number;
    duplicateTimestamps: number;
    durationSpanMs: number;
    keyFrames: number;
    packetCount: number;
    summedDurationsMs: number;
  }>;
  recordMostlyStaticLiveArtifact: () => Promise<{
    actualBitrate: number;
    averageInterframeBytes: number;
    backwardTimestamps: number;
    contentChangeRequests: number;
    duplicateTimestamps: number;
    durationSeconds: number;
    keyFrameByteShare: number;
    keyFrames: number;
    maximumGopInterval: number | null;
    minimumGopInterval: number | null;
    packetCount: number;
    withinByteBudget: boolean;
  }>;
  recordStaticCanvasArtifact: () => Promise<{
    centerPixel: { alpha: number; blue: number; green: number; red: number };
    decodedDurationMs: number;
    drawCount: number;
    height: number;
    mimeType: string;
    size: number;
    width: number;
  }>;
  stageProjectExportInput: (
    jobId: string,
    project: VideoProject
  ) => Promise<ProjectExportInputReference>;
};

async function recordLiveVfrArtifact(page: Page) {
  return page.evaluate(async () => {
    const bridge = (
      window as Window & {
        __sniptaleOffscreenHarness?: OffscreenHarnessBridge;
      }
    ).__sniptaleOffscreenHarness;
    if (!bridge) throw new Error('Offscreen harness bridge is unavailable');
    return bridge.recordLiveVfrArtifact();
  });
}

async function recordMostlyStaticLiveArtifact(page: Page) {
  return page.evaluate(async () => {
    const bridge = (
      window as Window & {
        __sniptaleOffscreenHarness?: OffscreenHarnessBridge;
      }
    ).__sniptaleOffscreenHarness;
    if (!bridge) throw new Error('Offscreen harness bridge is unavailable');
    return bridge.recordMostlyStaticLiveArtifact();
  });
}

async function recordColdHighResolutionSequence(page: Page) {
  return page.evaluate(async () => {
    const bridge = (
      window as Window & {
        __sniptaleOffscreenHarness?: OffscreenHarnessBridge;
      }
    ).__sniptaleOffscreenHarness;
    if (!bridge) throw new Error('Offscreen harness bridge is unavailable');
    return bridge.recordColdHighResolutionSequence();
  });
}

async function recordStaticCanvasArtifact(page: Page) {
  return page.evaluate(async () => {
    const bridge = (
      window as Window & {
        __sniptaleOffscreenHarness?: OffscreenHarnessBridge;
      }
    ).__sniptaleOffscreenHarness;
    if (!bridge) throw new Error('Offscreen harness bridge is unavailable');
    return bridge.recordStaticCanvasArtifact();
  });
}

async function recordCanvasCadence(page: Page, frameRate: number, recordingDurationMs: number) {
  return page.evaluate(
    async ({ requestedFrameRate, durationMs }) => {
      const bridge = (
        window as Window & {
          __sniptaleOffscreenHarness?: OffscreenHarnessBridge;
        }
      ).__sniptaleOffscreenHarness;
      if (!bridge) throw new Error('Offscreen harness bridge is unavailable');
      return bridge.recordCanvasCadence(requestedFrameRate, durationMs);
    },
    { durationMs: recordingDurationMs, requestedFrameRate: frameRate }
  );
}

async function openOffscreenHarness(page: Page, hostOrigin: string) {
  await applyHarnessBootstrap(page, {
    apiBehavior: E2E_RUNTIME_SUCCESS_API_BEHAVIOR,
  });
  await page.goto(`${hostOrigin}${OFFSCREEN_HARNESS_PATH}`, {
    waitUntil: 'domcontentloaded',
  });
  await page.locator('[data-ui="offscreen.harness.root"][data-state="ready"]').waitFor();
}

async function setOffscreenMediaRecorderState(
  page: Page,
  state: 'inactive' | 'recording' | 'paused'
) {
  await page.evaluate((nextState) => {
    (
      window as Window & {
        __sniptaleOffscreenHarness?: OffscreenHarnessBridge;
      }
    ).__sniptaleOffscreenHarness?.setMediaRecorderState(nextState);
  }, state);
}

async function getOffscreenMediaRecorderState(page: Page) {
  return page.evaluate(() => {
    return (
      (
        window as Window & {
          __sniptaleOffscreenHarness?: OffscreenHarnessBridge;
        }
      ).__sniptaleOffscreenHarness?.getMediaRecorderState() ?? 'inactive'
    );
  });
}

function createFrameRasterSnapshotFixture() {
  const callout = createDefaultFrameCallout();
  callout.content.bodyHtml = 'Тест';
  callout.style.surface.textColor = '#ef4444';
  callout.style.surface.fillPaint = { kind: 'solid', color: '#0f172acc' };
  callout.style.customCss = '[card]\nbackdrop-filter: blur(16px) saturate(1.2) brightness(1.04);';
  callout.style.surface.shadow = 12;
  callout.style.surface.shadowColor = '#00000066';
  callout.style.surface.borderColor = '#f97316';
  callout.style.surface.borderWidth = 1;
  callout.style.surface.paddingX = 12;
  callout.style.surface.paddingY = 8;
  callout.style.surface.radius = 48;
  callout.style.title.enabled = false;
  callout.style.badge.enabled = false;
  callout.style.typography.fontFamily = 'cursive';
  callout.style.typography.fontSize = 36;
  callout.style.typography.fontWeight = 'normal';
  callout.style.typography.letterSpacing = 0;
  callout.style.typography.lineHeight = 1.4;
  callout.style.typography.maxWidth = 165;
  const stepBadge = { ...createDefaultFrameStepBadge(), auto: false, value: '1' };
  const createdSnapshot = createFrameAnnotationSnapshot(
    {
      id: 'frame-raster-e2e',
      x: 80,
      y: 110,
      width: 120,
      height: 50,
      effectMode: 'border',
      callout,
      stepBadge,
      borderSettings: {
        color: '#ff0000',
        customCss: '',
        fillColor: '#ffffff',
        fillOpacity: 0,
        inheritCustomCss: false,
        opacity: 100,
        padding: { bottom: 0, left: 0, right: 0, top: 0 },
        radius: 0,
        shadow: 0,
        strokeOpacity: 100,
        style: 'solid',
        width: 3,
      },
    },
    0
  );
  const snapshot = parseFrameAnnotationSnapshot(createdSnapshot);
  if (!snapshot) throw new Error('Frame raster E2E fixture is invalid');
  return snapshot;
}

function assertFrameRasterResult(result: {
  calloutCloudBottom: number;
  calloutCloudTop: number;
  calloutDark: number;
  calloutDarkBottom: number;
  calloutDarkLeft: number;
  calloutDarkRight: number;
  calloutDarkTop: number;
  calloutInteriorRed: number;
  calloutOutlineLeft: number;
  calloutOutlineRight: number;
  calloutRed: number;
  calloutRedBottom: number;
  calloutRedLeft: number;
  calloutRedRight: number;
  calloutRedTop: number;
  elapsedMs: number;
  opaque: number;
  red: number;
  size: number;
  whiteBadgeOutline: number;
  glassInteriorAdjacentDelta: number;
  sourceAdjacentDelta: number;
}) {
  expect(result.elapsedMs).toBeLessThan(15_000);
  expect(result.size).toBeGreaterThan(500);
  expect(result.opaque).toBe(187_200);
  expect(result.red).toBeGreaterThan(400);
  expect(result.calloutDark).toBeGreaterThan(2_000);
  expect(result.calloutDarkRight - result.calloutDarkLeft + 1).toBeLessThanOrEqual(209);
  expect(result.calloutDarkRight - result.calloutDarkLeft + 1).toBeGreaterThanOrEqual(200);
  expect(result.calloutOutlineRight - result.calloutOutlineLeft + 1).toBeLessThanOrEqual(211);
  expect(result.calloutOutlineRight - result.calloutOutlineLeft + 1).toBeGreaterThanOrEqual(100);
  expect(result.calloutCloudBottom - result.calloutCloudTop + 1).toBeLessThanOrEqual(138);
  expect(result.calloutCloudBottom - result.calloutCloudTop + 1).toBeGreaterThanOrEqual(132);
  expect(result.calloutRed).toBeGreaterThan(200);
  expect(result.calloutInteriorRed).toBeGreaterThan(100);
  expect(result.whiteBadgeOutline).toBeGreaterThan(80);
  expect(result.sourceAdjacentDelta).toBeGreaterThan(35);
  expect(result.glassInteriorAdjacentDelta).toBeLessThan(18);
}

test('offscreen document dispatches OFFSCREEN_READY on boot', async ({ page, hostOrigin }) => {
  await openOffscreenHarness(page, hostOrigin);

  await expect
    .poll(() => {
      return countRuntimeMessagesByType(page, VideoMessageType.OFFSCREEN_READY);
    })
    .toBe(1);

  const [readyMessage] = await getRuntimeMessagesByType(page, VideoMessageType.OFFSCREEN_READY);
  expect(readyMessage).toMatchObject({
    type: VideoMessageType.OFFSCREEN_READY,
  });
});

test('offscreen runtime pause and resume controls emit lifecycle messages', async ({
  page,
  hostOrigin,
}) => {
  await openOffscreenHarness(page, hostOrigin);
  await setOffscreenMediaRecorderState(page, 'recording');

  await emitTrustedOffscreenHarnessRuntimeMessage(page, {
    type: VideoMessageType.OFFSCREEN_PAUSE_RECORDING,
    generation: 1,
    recordingId: 'recording-e2e-harness',
    streamInstanceId: 'stream-instance-e2e-harness',
  });

  await expect
    .poll(() => {
      return countRuntimeMessagesByType(page, VideoMessageType.OFFSCREEN_RECORDING_PAUSED);
    })
    .toBe(1);
  await expect.poll(() => getOffscreenMediaRecorderState(page)).toBe('paused');

  await emitTrustedOffscreenHarnessRuntimeMessage(page, {
    type: VideoMessageType.OFFSCREEN_RESUME_RECORDING,
    generation: 1,
    recordingId: 'recording-e2e-harness',
    streamInstanceId: 'stream-instance-e2e-harness',
  });

  await expect
    .poll(() => {
      return countRuntimeMessagesByType(page, VideoMessageType.OFFSCREEN_RECORDING_RESUMED);
    })
    .toBe(1);
  await expect.poll(() => getOffscreenMediaRecorderState(page)).toBe('recording');
});

test('offscreen fixed-cadence canvas produces a full static recording artifact', async ({
  page,
  hostOrigin,
}) => {
  await openOffscreenHarness(page, hostOrigin);

  const artifact = await recordStaticCanvasArtifact(page);

  expect(artifact).toMatchObject({ height: 480, width: 854 });
  expect(artifact.mimeType).toMatch(/^video\/(?:mp4|webm)/u);
  expect(artifact.drawCount).toBeGreaterThanOrEqual(30);
  expect(artifact.size).toBeGreaterThan(1_000);
  expect(artifact.decodedDurationMs).toBeGreaterThanOrEqual(1_000);
  expect(artifact.decodedDurationMs).toBeLessThan(2_500);
  expect(artifact.centerPixel.alpha).toBe(255);
  expect(artifact.centerPixel.blue).toBeGreaterThan(100);
  expect(artifact.centerPixel.blue).toBeGreaterThan(artifact.centerPixel.red + 40);
  expect(artifact.centerPixel.blue).toBeGreaterThan(artifact.centerPixel.green + 40);
});

test('offscreen canvas artifacts follow selected 24 and 60 FPS cadences', async ({
  page,
  hostOrigin,
}) => {
  await openOffscreenHarness(page, hostOrigin);

  const at24 = await recordCanvasCadence(page, 24, 1_000);
  const at60 = await recordCanvasCadence(page, 60, 1_000);

  expect(at24.drawCount).toBeGreaterThanOrEqual(20);
  expect(at24.drawCount).toBeLessThanOrEqual(30);
  expect(at60.drawCount).toBeGreaterThanOrEqual(50);
  expect(at60.drawCount).toBeLessThanOrEqual(70);
  expect(at60.drawCount).toBeGreaterThan(at24.drawCount * 1.8);
  expect(at24.decodedDurationMs).toBeGreaterThanOrEqual(800);
  expect(at60.decodedDurationMs).toBeGreaterThanOrEqual(800);
});

test('source-timed live artifact has strict packet timestamps and truthful durations', async ({
  page,
  hostOrigin,
}) => {
  test.setTimeout(30_000);
  await openOffscreenHarness(page, hostOrigin);

  const artifact = await recordLiveVfrArtifact(page);

  expect(artifact.packetCount).toBeGreaterThanOrEqual(3);
  // Ordinary source jitter changes sample duration; it must not invalidate reference frames.
  expect(artifact.keyFrames).toBe(1);
  expect(artifact.duplicateTimestamps).toBe(0);
  expect(artifact.backwardTimestamps).toBe(0);
  expect(artifact.durationSpanMs).toBeGreaterThanOrEqual(120);
  expect(Math.abs(artifact.summedDurationsMs - artifact.durationSpanMs)).toBeLessThan(2);
});

test('mostly static screen content keeps a long GOP and the configured byte budget', async ({
  page,
  hostOrigin,
}) => {
  test.setTimeout(45_000);
  await openOffscreenHarness(page, hostOrigin);

  const artifact = await recordMostlyStaticLiveArtifact(page);

  expect(artifact.durationSeconds).toBeGreaterThanOrEqual(14.5);
  expect(artifact.contentChangeRequests).toBe(31);
  expect(artifact.packetCount).toBeGreaterThanOrEqual(25);
  expect(artifact.keyFrames).toBeGreaterThanOrEqual(3);
  expect(artifact.keyFrames).toBeLessThanOrEqual(5);
  expect(artifact.minimumGopInterval).toBeGreaterThanOrEqual(3.5);
  expect(artifact.maximumGopInterval).toBeLessThanOrEqual(4.5);
  expect(artifact.backwardTimestamps).toBe(0);
  expect(artifact.duplicateTimestamps).toBe(0);
  expect(artifact.averageInterframeBytes).toBeGreaterThan(0);
  expect(artifact.actualBitrate).toBeGreaterThan(0);
  expect(artifact.keyFrameByteShare).toBeGreaterThan(0);
  expect(artifact.withinByteBudget).toBe(true);
});

test('cold and subsequent high-resolution recordings flush media before STOP', async ({
  page,
  hostOrigin,
}) => {
  test.setTimeout(45_000);
  await openOffscreenHarness(page, hostOrigin);

  const recordings = await recordColdHighResolutionSequence(page);

  expect(recordings).toHaveLength(2);
  recordings.forEach((recording) => {
    expect(recording).toMatchObject({ height: 1440, width: 2560 });
    expect(recording.mimeType).toMatch(/^video\/(?:mp4|webm)/u);
    expect(recording.size).toBeGreaterThan(10_000);
    expect(recording.appendCount).toBeGreaterThan(1);
    expect(recording.preStopAppendCount).toBeGreaterThan(0);
    expect(recording.firstAppendMs).toBeLessThan(recording.recordingDurationMs);
  });
});

test('offscreen MP4 export renders applied target and standalone EffectV1 projects', async ({
  page,
  hostOrigin,
}) => {
  await openOffscreenHarness(page, hostOrigin);
  await renderEffectV1Mp4Projects(page);
});

test('real MV3 offscreen rasterizes frame annotations without suspended-paint deadlock', async ({
  extensionId,
  page,
}) => {
  test.setTimeout(30_000);
  await page.goto(`chrome-extension://${extensionId}/apps/extension/src/editor/index.html`, {
    waitUntil: 'domcontentloaded',
  });
  await page.locator('[data-ui="editor.page.root"]').waitFor();
  const snapshot = createFrameRasterSnapshotFixture();

  const result = await page.evaluate(
    async ({ databaseName, databaseVersion, jobStore, snapshot: frameSnapshot }) => {
      const send = (message: object) =>
        chrome.runtime.sendMessage({
          ...message,
          __sniptaleRuntimeFreshness: {
            issuedAtEpochMs: Date.now(),
            nonce: crypto.randomUUID(),
          },
        });
      const leaseId = crypto.randomUUID();
      const prepare = await send({
        type: 'FRAME_ANNOTATION_RASTERIZE',
        operation: 'prepare',
        leaseId,
      });
      if (!prepare?.success) throw new Error('Frame raster prepare failed');

      const canvas = document.createElement('canvas');
      canvas.width = 260;
      canvas.height = 180;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('2D canvas is unavailable');
      context.fillStyle = '#f3f4f6';
      context.fillRect(0, 0, canvas.width, canvas.height);
      for (let x = 20; x < 180; x += 2) {
        context.fillStyle = x % 4 === 0 ? '#0066ff' : '#ffdd00';
        context.fillRect(x, 0, 2, 105);
      }
      const baseImage = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Base PNG encode failed'));
        }, 'image/png');
      });
      const snapshots = [frameSnapshot];
      const metadata = new TextEncoder().encode(
        JSON.stringify({
          width: 260,
          height: 180,
          requestedWidth: 520,
          requestedHeight: 360,
          snapshots,
        })
      );
      const imageBytes = new Uint8Array(await baseImage.arrayBuffer());
      const digestInput = new Uint8Array(metadata.length + imageBytes.length);
      digestInput.set(metadata);
      digestInput.set(imageBytes, metadata.length);
      const inputSha256 = Array.from(
        new Uint8Array(await crypto.subtle.digest('SHA-256', digestInput)),
        (byte) => byte.toString(16).padStart(2, '0')
      ).join('');
      const reference = { inputSha256, jobId: leaseId, revision: 1 };
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(databaseName, databaseVersion);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
      });
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(jobStore, 'readwrite');
        transaction.objectStore(jobStore).put({
          ...reference,
          createdAt: Date.now(),
          input: {
            baseImage,
            height: 180,
            requestedHeight: 360,
            requestedWidth: 520,
            snapshots,
            width: 260,
          },
        });
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });

      try {
        const startedAt = performance.now();
        const response = await Promise.race([
          send({
            type: 'FRAME_ANNOTATION_RASTERIZE',
            operation: 'rasterize',
            reference,
          }),
          new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error('Real frame raster timed out')), 15_000);
          }),
        ]);
        if (!response?.success) {
          throw new Error(`Frame raster request failed: ${JSON.stringify(response)}`);
        }
        const record = await new Promise<Record<string, unknown> | undefined>((resolve, reject) => {
          const transaction = database.transaction(jobStore, 'readonly');
          const request = transaction.objectStore(jobStore).get(leaseId);
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve(request.result);
        });
        const output = record?.output;
        if (!(output instanceof Blob)) throw new Error('Frame raster output is missing');
        const bitmap = await createImageBitmap(output);
        const outputCanvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const outputContext = outputCanvas.getContext('2d');
        if (!outputContext) throw new Error('Output 2D canvas is unavailable');
        outputContext.drawImage(bitmap, 0, 0);
        const pixels = outputContext.getImageData(0, 0, bitmap.width, bitmap.height).data;
        let opaque = 0;
        let red = 0;
        let whiteBadgeOutline = 0;
        let calloutDark = 0;
        let calloutInteriorRed = 0;
        let calloutRed = 0;
        let calloutDarkLeft = bitmap.width;
        let calloutDarkRight = -1;
        let calloutDarkTop = bitmap.height;
        let calloutDarkBottom = -1;
        let calloutRedLeft = bitmap.width;
        let calloutRedRight = -1;
        let calloutRedTop = bitmap.height;
        let calloutRedBottom = -1;
        let calloutOutlineLeft = bitmap.width;
        let calloutOutlineRight = -1;
        const calloutDarkRowCounts = new Uint16Array(bitmap.height);
        for (let index = 0; index < pixels.length; index += 4) {
          const pixelIndex = index / 4;
          const x = pixelIndex % bitmap.width;
          const y = Math.floor(pixelIndex / bitmap.width);
          if (pixels[index + 3] > 0) opaque += 1;
          if (pixels[index] > 200 && pixels[index + 1] < 80 && pixels[index + 2] < 80) red += 1;
          const badgeDistance = Math.hypot(x - 160, y - 220);
          if (
            badgeDistance >= 24 &&
            badgeDistance <= 32 &&
            pixels[index] > 250 &&
            pixels[index + 1] > 250 &&
            pixels[index + 2] > 250
          ) {
            whiteBadgeOutline += 1;
          }
          if (y < 190 && pixels[index] < 75 && pixels[index + 1] < 85 && pixels[index + 2] < 95) {
            calloutDark += 1;
            calloutDarkLeft = Math.min(calloutDarkLeft, x);
            calloutDarkRight = Math.max(calloutDarkRight, x);
            calloutDarkTop = Math.min(calloutDarkTop, y);
            calloutDarkBottom = Math.max(calloutDarkBottom, y);
            calloutDarkRowCounts[y] = (calloutDarkRowCounts[y] ?? 0) + 1;
          }
          if (y < 190 && pixels[index] > 180 && pixels[index + 1] < 80 && pixels[index + 2] < 80) {
            calloutRed += 1;
            if (x >= 195 && x <= 365 && y >= 70 && y <= 145) calloutInteriorRed += 1;
            calloutRedLeft = Math.min(calloutRedLeft, x);
            calloutRedRight = Math.max(calloutRedRight, x);
            calloutRedTop = Math.min(calloutRedTop, y);
            calloutRedBottom = Math.max(calloutRedBottom, y);
          }
          if (
            y < 190 &&
            pixels[index] > 220 &&
            pixels[index + 1] >= 85 &&
            pixels[index + 1] <= 150 &&
            pixels[index + 2] < 80
          ) {
            calloutOutlineLeft = Math.min(calloutOutlineLeft, x);
            calloutOutlineRight = Math.max(calloutOutlineRight, x);
          }
        }
        const preview = document.createElement('img');
        preview.dataset['ui'] = 'frame-raster-e2e-output';
        preview.src = URL.createObjectURL(output);
        preview.style.cssText = 'display:block;width:520px;height:360px;image-rendering:auto';
        document.body.replaceChildren(preview);
        await preview.decode();
        const calloutCloudTop = calloutDarkRowCounts.findIndex((count) => count >= 50);
        const calloutCloudBottom = calloutDarkRowCounts.findLastIndex((count) => count >= 50);
        const adjacentDeltaAtRow = (row: number) => {
          let total = 0;
          let count = 0;
          const start = Math.max(1, calloutOutlineLeft + 8);
          const end = Math.min(bitmap.width - 1, calloutOutlineRight - 8);
          for (let x = start; x <= end; x += 1) {
            const offset = (row * bitmap.width + x) * 4;
            const previous = offset - 4;
            total +=
              Math.abs(pixels[offset]! - pixels[previous]!) +
              Math.abs(pixels[offset + 1]! - pixels[previous + 1]!) +
              Math.abs(pixels[offset + 2]! - pixels[previous + 2]!);
            count += 3;
          }
          return count > 0 ? total / count : Number.POSITIVE_INFINITY;
        };
        const glassInteriorAdjacentDelta = adjacentDeltaAtRow(calloutCloudTop + 8);
        const sourceAdjacentDelta = adjacentDeltaAtRow(195);
        return {
          calloutDark,
          calloutInteriorRed,
          calloutDarkLeft,
          calloutDarkRight,
          calloutDarkTop,
          calloutDarkBottom,
          calloutCloudTop,
          calloutCloudBottom,
          calloutRed,
          calloutRedLeft,
          calloutRedRight,
          calloutRedTop,
          calloutRedBottom,
          calloutOutlineLeft,
          calloutOutlineRight,
          elapsedMs: performance.now() - startedAt,
          opaque,
          red,
          size: output.size,
          whiteBadgeOutline,
          glassInteriorAdjacentDelta,
          sourceAdjacentDelta,
        };
      } finally {
        await send({ type: 'FRAME_ANNOTATION_RASTERIZE', operation: 'cancel', leaseId });
        database.close();
      }
    },
    {
      databaseName: DB_NAME,
      databaseVersion: DB_VERSION,
      jobStore: FRAME_ANNOTATION_RASTER_JOBS_STORE,
      snapshot,
    }
  );

  assertFrameRasterResult(result);
});
