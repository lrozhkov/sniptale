import { expect, it } from 'vitest';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import {
  OFFSCREEN_COMMAND_CORRELATION_KEYS,
  executeOffscreenResponseCommand,
  getOffscreenCommandIdempotencyPolicy,
  markOffscreenSideEffectCommand,
} from './idempotency';
import type { HandledOffscreenRuntimeMessageType } from './routing';

const handledCommandTypes = [
  MessageType.OFFSCREEN_PREPARE_DESKTOP_FRAME,
  MessageType.OFFSCREEN_CAPTURE_DESKTOP_FRAME,
  MessageType.OFFSCREEN_CANCEL_DESKTOP_FRAME,
  VideoMessageType.GET_DESKTOP_MEDIA,
  VideoMessageType.DISPOSE_DESKTOP_MEDIA,
  VideoMessageType.OFFSCREEN_START_RECORDING,
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
    'requestId',
    'sessionId',
    'runtime',
  ]);

  for (const type of handledCommandTypes) {
    const policy = getOffscreenCommandIdempotencyPolicy(type);
    expect(policy.reason.length).toBeGreaterThan(0);
  }

  for (const type of [
    MessageType.OFFSCREEN_VOICE_INPUT_STATUS,
    MessageType.OFFSCREEN_VOICE_INPUT_START,
    MessageType.OFFSCREEN_VOICE_INPUT_STOP,
  ] as const) {
    expect(getOffscreenCommandIdempotencyPolicy(type)).toEqual({
      idempotent: true,
      reason: expect.any(String),
    });
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

it('replays the exact response produced by a signed voice command', async () => {
  const execute = () => ({ success: true as const, snapshot: { phase: 'idle' as const } });
  const message = {
    requestId: 'voice-status-response-replay',
    type: MessageType.OFFSCREEN_VOICE_INPUT_STATUS,
  };
  const first = executeOffscreenResponseCommand({
    capabilityGeneration: 'voice-generation-response-replay',
    execute,
    message,
  });
  const duplicate = executeOffscreenResponseCommand({
    capabilityGeneration: 'voice-generation-response-replay',
    execute,
    message,
  });

  expect(first).toEqual({
    duplicate: false,
    response: { success: true, snapshot: { phase: 'idle' } },
  });
  expect(duplicate).toEqual({ duplicate: true, completion: expect.any(Promise) });
  if (!duplicate.duplicate) throw new Error('Expected duplicate voice command');
  await expect(duplicate.completion).resolves.toEqual({
    success: true,
    snapshot: { phase: 'idle' },
  });
});
