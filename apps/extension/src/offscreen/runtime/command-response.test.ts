import { describe, expect, it } from 'vitest';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import type { HandledOffscreenRuntimeMessageType } from './message-types';
import { buildOffscreenCommandResponse } from './command-response';

const validCompletions = [
  [
    MessageType.OFFSCREEN_CREATE_PAGE_PACKAGE_DOWNLOAD_LEASE,
    { leaseId: 'lease-1', result: 'leased', url: 'blob:lease-1' },
    { leaseId: 'lease-1', result: 'leased', success: true, url: 'blob:lease-1' },
  ],
  [
    MessageType.OFFSCREEN_CONFIRM_PAGE_PACKAGE_DOWNLOAD_LEASE,
    { result: 'confirmed' },
    { result: 'confirmed', success: true },
  ],
  [
    MessageType.OFFSCREEN_RELEASE_PAGE_PACKAGE_DOWNLOAD_LEASE,
    { result: 'released' },
    { result: 'released', success: true },
  ],
  [
    VideoMessageType.OFFSCREEN_READINESS_PROBE,
    { challenge: 'challenge-1', offscreenStartupId: 'startup-1', state: 'ready' },
    {
      challenge: 'challenge-1',
      offscreenStartupId: 'startup-1',
      state: 'ready',
      success: true,
    },
  ],
  [
    VideoMessageType.OFFSCREEN_VIDEO_RECORDING_CAMERA_OFFER,
    { sdp: 'answer-sdp', type: 'answer' },
    { sdp: 'answer-sdp', success: true },
  ],
  [
    VideoMessageType.OFFSCREEN_VIDEO_RECORDING_MEDIA_DEVICES,
    { mediaDevices: [{ deviceId: 'camera-1', kind: 'videoinput', label: 'Camera' }] },
    {
      mediaDevices: [{ deviceId: 'camera-1', kind: 'videoinput', label: 'Camera' }],
      success: true,
    },
  ],
  [
    MessageType.OFFSCREEN_CAPTURE_DESKTOP_FRAME,
    { dataUrl: 'data:image/png;base64,AA==', height: 720, result: 'captured', width: 1280 },
    {
      dataUrl: 'data:image/png;base64,AA==',
      height: 720,
      result: 'captured',
      success: true,
      width: 1280,
    },
  ],
  [
    VideoMessageType.OFFSCREEN_STOP_RECORDING,
    { result: 'stopped' },
    { result: 'accepted', success: true },
  ],
  [
    VideoMessageType.OFFSCREEN_STOP_RECORDING,
    { error: 'encoder failed', result: 'terminal-failure' },
    { error: 'encoder failed', result: 'terminal-failure', success: true },
  ],
  [MessageType.OFFSCREEN_PREPARE_DESKTOP_FRAME, 'accepted', { result: 'accepted', success: true }],
  [MessageType.OFFSCREEN_CANCEL_DESKTOP_FRAME, 'accepted', { result: 'accepted', success: true }],
  [
    MessageType.OFFSCREEN_FRAME_ANNOTATION_RASTERIZE,
    'applied',
    { result: 'applied', success: true },
  ],
  [MessageType.OFFSCREEN_WRITE_IMAGE_CLIPBOARD, 'copied', { result: 'copied', success: true }],
  [VideoMessageType.GET_DESKTOP_MEDIA, undefined, { result: 'accepted', success: true }],
  [VideoMessageType.DISPOSE_DESKTOP_MEDIA, undefined, { result: 'accepted', success: true }],
  [VideoMessageType.OFFSCREEN_BEGIN_RECORDING, undefined, { result: 'accepted', success: true }],
  [VideoMessageType.OFFSCREEN_PAUSE_RECORDING, undefined, { result: 'accepted', success: true }],
  [VideoMessageType.OFFSCREEN_RESUME_RECORDING, undefined, { result: 'accepted', success: true }],
  [VideoMessageType.OFFSCREEN_UPDATE_SETTINGS, undefined, { result: 'accepted', success: true }],
  [
    VideoMessageType.OFFSCREEN_VIDEO_RECORDING_CAMERA_CLOSE,
    undefined,
    { result: 'accepted', success: true },
  ],
  [
    VideoMessageType.OFFSCREEN_VIDEO_RECORDING_CAMERA_SWITCH,
    undefined,
    { result: 'accepted', success: true },
  ],
  [
    VideoMessageType.OFFSCREEN_START_PROJECT_EXPORT,
    'accepted',
    { result: 'accepted', success: true },
  ],
  [
    VideoMessageType.OFFSCREEN_CANCEL_PROJECT_EXPORT,
    'accepted',
    { result: 'accepted', success: true },
  ],
] as const;

const invalidCompletions: readonly (readonly [HandledOffscreenRuntimeMessageType, unknown])[] = [
  ...validCompletions.map(([type]) => [type, { result: 'unexpected' }] as const),
  [MessageType.OFFSCREEN_CREATE_PAGE_PACKAGE_DOWNLOAD_LEASE, undefined],
  [VideoMessageType.OFFSCREEN_VIDEO_RECORDING_MEDIA_DEVICES, { mediaDevices: [{}] }],
  [MessageType.OFFSCREEN_CAPTURE_DESKTOP_FRAME, { result: 'captured' }],
];

describe('offscreen command response serialization', () => {
  it.each(validCompletions)('serializes the exact %s completion', (type, result, expected) => {
    expect(buildOffscreenCommandResponse(type, result)).toEqual(expected);
  });

  it.each(invalidCompletions)(
    'rejects an unknown %s completion instead of acknowledging it',
    (type, result) => {
      expect(() => buildOffscreenCommandResponse(type, result)).toThrow(
        `Invalid ${type} completion`
      );
    }
  );

  it.each([
    MessageType.OFFSCREEN_PRIVACY_ERASURE_PAGE_STORAGE,
    VideoMessageType.OFFSCREEN_START_RECORDING,
    VideoMessageType.OFFSCREEN_GET_PROJECT_EXPORT_CAPABILITIES,
  ] as const)('rejects serialization through the non-deferred %s response path', (type) => {
    expect(() => buildOffscreenCommandResponse(type, undefined)).toThrow(
      `Invalid ${type} completion`
    );
  });

  it('does not accept a valid completion shape for a different command', () => {
    expect(() =>
      buildOffscreenCommandResponse(MessageType.OFFSCREEN_RELEASE_PAGE_PACKAGE_DOWNLOAD_LEASE, {
        result: 'confirmed',
      })
    ).toThrow(`Invalid ${MessageType.OFFSCREEN_RELEASE_PAGE_PACKAGE_DOWNLOAD_LEASE} completion`);
  });

  it('rejects extra completion fields at the owner boundary', () => {
    expect(() =>
      buildOffscreenCommandResponse(VideoMessageType.OFFSCREEN_STOP_RECORDING, {
        result: 'stopped',
        unexpected: true,
      })
    ).toThrow(`Invalid ${VideoMessageType.OFFSCREEN_STOP_RECORDING} completion`);
  });
});
