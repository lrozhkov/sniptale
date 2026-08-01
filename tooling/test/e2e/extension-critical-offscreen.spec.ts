import { expect, type Page } from '@playwright/test';
import type { ProjectExportInputReference } from '../../../apps/extension/src/contracts/video/types/messages.export';
import type { VideoProject } from '../../../apps/extension/src/features/video/project/types';
import { renderEffectV1Mp4Projects } from './extension-critical-offscreen-effects.helpers';
import { test } from './support/extension-fixture';
import {
  applyHarnessBootstrap,
  countRuntimeMessagesByType,
  E2E_RUNTIME_SUCCESS_API_BEHAVIOR,
  emitTrustedOffscreenHarnessRuntimeMessage,
  getRuntimeMessagesByType,
  OFFSCREEN_HARNESS_PATH,
  VideoMessageType,
} from './extension-critical.helpers';

type OffscreenHarnessBridge = {
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
