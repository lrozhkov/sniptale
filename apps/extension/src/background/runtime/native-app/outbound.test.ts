import { createNativeHello } from './service.test-support';
import { createNativeHelloMessage, supportsNativeRecordingHistory } from './outbound';
import { expect, it } from 'vitest';

import { createNativeControllerAcquireMessage } from './outbound';

it('includes controller identity and omits background document id by default', () => {
  expect(
    createNativeControllerAcquireMessage({
      identity: {
        browserFamily: 'chrome',
        connectionId: 'conn-1',
        extensionId: 'extension-id',
        profileKey: 'profile:stable',
      },
      reason: 'initial-connect',
    })
  ).toEqual(
    expect.objectContaining({
      browserFamily: 'chrome',
      connectionId: 'conn-1',
      extensionId: 'extension-id',
      profileKey: 'profile:stable',
      reason: 'initial-connect',
      type: 'extension.controller.acquire',
    })
  );
});

it('includes document id when a non-background controller identity provides one', () => {
  expect(
    createNativeControllerAcquireMessage({
      identity: {
        browserFamily: 'edge',
        connectionId: 'conn-1',
        documentId: 'doc-1',
        extensionId: 'extension-id',
        profileKey: 'profile:stable',
      },
      reason: 'user-requested-takeover',
    })
  ).toEqual(expect.objectContaining({ documentId: 'doc-1' }));
});

it('negotiates cursor and event formats independently', () => {
  const base = createNativeHello().capabilities;
  const limits = {
    maxBlockBytes: 65536,
    maxBlockRecords: 512,
    maxChunkRawBytes: 32768,
    maxManifestEntries: 32,
  };
  const cursorOnly = {
    ...base,
    attachments: { ...limits, cursorTrajectoryFormats: ['cursor-trajectory-v1' as const] },
  };
  const eventsOnly = {
    ...base,
    eventAttachments: { ...limits, recordingEventFormats: ['recording-events-v1' as const] },
  };
  expect(supportsNativeRecordingHistory(null, 'cursor')).toBe(false);
  expect(supportsNativeRecordingHistory(base, 'events')).toBe(false);
  expect(supportsNativeRecordingHistory(cursorOnly, 'cursor')).toBe(true);
  expect(supportsNativeRecordingHistory(cursorOnly, 'events')).toBe(false);
  expect(supportsNativeRecordingHistory(eventsOnly, 'events')).toBe(true);
  expect(supportsNativeRecordingHistory(eventsOnly, 'cursor')).toBe(false);
});

it('offers both durable history formats to Native peers', () => {
  expect(
    createNativeHelloMessage({ extensionId: 'test', extensionVersion: '1.0.0' }).capabilities
  ).toEqual([
    'desktop-settings-v1',
    'durable-media-ack-v1',
    'cursor-trajectory-v1',
    'recording-events-v1',
  ]);
});
