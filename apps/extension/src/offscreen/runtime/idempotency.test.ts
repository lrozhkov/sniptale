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
  MessageType.OFFSCREEN_CREATE_PAGE_PACKAGE_DOWNLOAD_LEASE,
  MessageType.OFFSCREEN_CONFIRM_PAGE_PACKAGE_DOWNLOAD_LEASE,
  MessageType.OFFSCREEN_RELEASE_PAGE_PACKAGE_DOWNLOAD_LEASE,
  VideoMessageType.GET_DESKTOP_MEDIA,
  VideoMessageType.DISPOSE_DESKTOP_MEDIA,
  VideoMessageType.OFFSCREEN_START_RECORDING,
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
    'downloadOperationId',
    'recordingId',
    'desktopMediaRequestId',
    'requestId',
    'sessionId',
    'peerId',
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

it('namespaces project export replay by command, job, and authority generation', () => {
  const start = markOffscreenSideEffectCommand({
    capabilityGeneration: 'generation-export-scope',
    message: { jobId: 'job-export-scope', type: VideoMessageType.OFFSCREEN_START_PROJECT_EXPORT },
  });
  const cancel = markOffscreenSideEffectCommand({
    capabilityGeneration: 'generation-export-scope',
    message: { jobId: 'job-export-scope', type: VideoMessageType.OFFSCREEN_CANCEL_PROJECT_EXPORT },
  });
  const nextGeneration = markOffscreenSideEffectCommand({
    capabilityGeneration: 'generation-export-scope-next',
    message: { jobId: 'job-export-scope', type: VideoMessageType.OFFSCREEN_START_PROJECT_EXPORT },
  });

  expect(start).toEqual({ duplicate: false, completeWith: expect.any(Function) });
  expect(cancel).toEqual({ duplicate: false, completeWith: expect.any(Function) });
  expect(nextGeneration).toEqual({ duplicate: false, completeWith: expect.any(Function) });
  expect(() =>
    markOffscreenSideEffectCommand({
      capabilityGeneration: 'generation-export-missing-job',
      message: { type: VideoMessageType.OFFSCREEN_START_PROJECT_EXPORT },
    })
  ).toThrow('Missing OFFSCREEN_START_PROJECT_EXPORT job identity');
});

it('shares one camera negotiation per peer without replaying it across peers', async () => {
  const firstPeer = markOffscreenSideEffectCommand({
    capabilityGeneration: 'camera-generation',
    message: {
      peerId: 'camera-peer-1',
      type: VideoMessageType.OFFSCREEN_VIDEO_RECORDING_CAMERA_OFFER,
    },
  });
  const duplicateFirstPeer = markOffscreenSideEffectCommand({
    capabilityGeneration: 'camera-generation',
    message: {
      peerId: 'camera-peer-1',
      type: VideoMessageType.OFFSCREEN_VIDEO_RECORDING_CAMERA_OFFER,
    },
  });
  const secondPeer = markOffscreenSideEffectCommand({
    capabilityGeneration: 'camera-generation',
    message: {
      peerId: 'camera-peer-2',
      type: VideoMessageType.OFFSCREEN_VIDEO_RECORDING_CAMERA_OFFER,
    },
  });

  expect(firstPeer).toEqual({ duplicate: false, completeWith: expect.any(Function) });
  expect(duplicateFirstPeer).toEqual({ duplicate: true, completion: expect.any(Promise) });
  expect(secondPeer).toEqual({ duplicate: false, completeWith: expect.any(Function) });

  if (
    !('completeWith' in firstPeer) ||
    !('completion' in duplicateFirstPeer) ||
    !('completeWith' in secondPeer)
  ) {
    throw new Error('Expected peer-scoped camera negotiation tracking');
  }

  await expect(firstPeer.completeWith(Promise.resolve('peer-1-answer'))).resolves.toBe(
    'peer-1-answer'
  );
  await expect(duplicateFirstPeer.completion).resolves.toBe('peer-1-answer');
  await expect(secondPeer.completeWith(Promise.resolve('peer-2-answer'))).resolves.toBe(
    'peer-2-answer'
  );
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
