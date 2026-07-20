import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  recordingChunk: vi.fn(),
  recordingStarted: vi.fn(),
  recordingStopped: vi.fn(),
  resume: vi.fn(),
  screenshotChunk: vi.fn(),
  screenshotCommit: vi.fn(),
  screenshotStart: vi.fn(),
}));

vi.mock('./recording', () => ({
  handleNativeRecordingChunk: mocks.recordingChunk,
  handleNativeRecordingStarted: mocks.recordingStarted,
  handleNativeRecordingStopped: mocks.recordingStopped,
}));
vi.mock('./resume', () => ({ createNativeTransferResumeRequests: mocks.resume }));
vi.mock('./screenshot', () => ({
  handleNativeScreenshotChunk: mocks.screenshotChunk,
  handleNativeScreenshotCommit: mocks.screenshotCommit,
  handleNativeScreenshotStart: mocks.screenshotStart,
}));

import { createNativeAppIngestionController } from './controller';
import {
  createRecordingChunk,
  createRecordingStarted,
  createRecordingStopped,
  createScreenshotChunk,
  createScreenshotCommit,
  createScreenshotStart,
} from './controller.lifecycle-gate.test-support';
import {
  getNativeIngestionAuthorityGeneration,
  reserveNativeIngestionErasureExclusion,
} from './lifecycle-gate';

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset().mockResolvedValue([]);
});

it('drains admitted ingestion and rotates authority at both exclusion boundaries', async () => {
  let finishStart!: (value: never[]) => void;
  mocks.screenshotStart.mockReturnValueOnce(
    new Promise<never[]>((resolve) => {
      finishStart = resolve;
    })
  );
  const controller = createNativeAppIngestionController();
  const active = controller.handleScreenshotStart(createScreenshotStart('active'));
  const generationBefore = getNativeIngestionAuthorityGeneration();
  const exclusion = reserveNativeIngestionErasureExclusion();
  let drained = false;
  void exclusion.waitForActiveMutations().then(() => {
    drained = true;
  });

  finishStart([]);
  await active;
  await exclusion.waitForActiveMutations();
  expect(drained).toBe(true);
  expect(getNativeIngestionAuthorityGeneration()).toBe(generationBefore + 1);
  exclusion.release();
  expect(getNativeIngestionAuthorityGeneration()).toBe(generationBefore + 2);
});

it('rejects every native writer until the exclusion is released', async () => {
  const controller = createNativeAppIngestionController();
  const exclusion = reserveNativeIngestionErasureExclusion();

  await expect(controller.handleScreenshotStart(createScreenshotStart('start'))).resolves.toEqual(
    []
  );
  await expect(controller.handleScreenshotChunk(createScreenshotChunk('chunk'))).resolves.toEqual(
    []
  );
  await expect(
    controller.handleScreenshotCommit(createScreenshotCommit('commit'))
  ).resolves.toEqual([]);
  await expect(
    controller.handleRecordingStarted(createRecordingStarted('started'))
  ).resolves.toEqual([]);
  await expect(controller.handleRecordingChunk(createRecordingChunk('chunk'))).resolves.toEqual([]);
  await expect(
    controller.handleRecordingStopped(createRecordingStopped('stopped'))
  ).resolves.toEqual([]);
  await expect(controller.resumePendingTransfers('lease')).resolves.toEqual([]);
  expect(mocks.screenshotStart).not.toHaveBeenCalled();
  expect(mocks.screenshotChunk).not.toHaveBeenCalled();
  expect(mocks.screenshotCommit).not.toHaveBeenCalled();
  expect(mocks.recordingStarted).not.toHaveBeenCalled();
  expect(mocks.recordingChunk).not.toHaveBeenCalled();
  expect(mocks.recordingStopped).not.toHaveBeenCalled();
  expect(mocks.resume).not.toHaveBeenCalled();

  exclusion.release();
  await controller.handleScreenshotChunk(createScreenshotChunk('after'));
  expect(mocks.screenshotChunk).toHaveBeenCalledOnce();
});
