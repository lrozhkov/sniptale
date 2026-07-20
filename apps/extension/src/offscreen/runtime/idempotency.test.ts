import { expect, it } from 'vitest';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import {
  OFFSCREEN_COMMAND_CORRELATION_KEYS,
  getOffscreenCommandIdempotencyPolicy,
  markOffscreenSideEffectCommand,
} from './idempotency';
import type { HandledOffscreenRuntimeMessageType } from './routing';

const handledCommandTypes = [
  VideoMessageType.GET_DESKTOP_MEDIA,
  VideoMessageType.DISPOSE_DESKTOP_MEDIA,
  VideoMessageType.OFFSCREEN_START_RECORDING,
  VideoMessageType.OFFSCREEN_UPDATE_VIEWPORT_CROP,
  VideoMessageType.OFFSCREEN_SET_VIEWPORT_DRAW_STATE,
  VideoMessageType.OFFSCREEN_STOP_RECORDING,
  VideoMessageType.OFFSCREEN_PAUSE_RECORDING,
  VideoMessageType.OFFSCREEN_RESUME_RECORDING,
  VideoMessageType.OFFSCREEN_START_PROJECT_EXPORT,
  VideoMessageType.OFFSCREEN_CANCEL_PROJECT_EXPORT,
  VideoMessageType.OFFSCREEN_GET_PROJECT_EXPORT_CAPABILITIES,
] as const satisfies readonly HandledOffscreenRuntimeMessageType[];

it('declares idempotency policy for every offscreen side-effect route', () => {
  expect(OFFSCREEN_COMMAND_CORRELATION_KEYS).toEqual([
    'jobId',
    'recordingId',
    'desktopMediaRequestId',
    'runtime',
  ]);

  for (const type of handledCommandTypes) {
    const policy = getOffscreenCommandIdempotencyPolicy(type);
    expect(policy.reason.length).toBeGreaterThan(0);
  }
});

it('tracks job-correlated export commands and shares duplicate completion', async () => {
  const first = markOffscreenSideEffectCommand({
    capabilityGeneration: 'generation-1',
    message: {
      jobId: 'job-1',
      type: VideoMessageType.OFFSCREEN_START_PROJECT_EXPORT,
    },
  });
  expect(first).toEqual({ duplicate: false, completeWith: expect.any(Function) });

  const duplicate = markOffscreenSideEffectCommand({
    capabilityGeneration: 'generation-1',
    message: {
      jobId: 'job-1',
      type: VideoMessageType.OFFSCREEN_START_PROJECT_EXPORT,
    },
  });
  expect(duplicate).toEqual({ duplicate: true, completion: expect.any(Promise) });

  if (!('completeWith' in first) || !('completion' in duplicate)) {
    throw new Error('Expected tracked command and duplicate completion');
  }

  await expect(first.completeWith(Promise.resolve())).resolves.toBeUndefined();
  await expect(duplicate.completion).resolves.toBeUndefined();
});

it('does not mutate idempotency state for commands that are intentionally untracked', () => {
  const first = markOffscreenSideEffectCommand({
    capabilityGeneration: 'generation-1',
    message: {
      type: VideoMessageType.OFFSCREEN_GET_PROJECT_EXPORT_CAPABILITIES,
    },
  });
  const second = markOffscreenSideEffectCommand({
    capabilityGeneration: 'generation-1',
    message: {
      type: VideoMessageType.OFFSCREEN_GET_PROJECT_EXPORT_CAPABILITIES,
    },
  });

  expect(first).toEqual({ duplicate: false, tracked: false });
  expect(second).toEqual({ duplicate: false, tracked: false });
});
