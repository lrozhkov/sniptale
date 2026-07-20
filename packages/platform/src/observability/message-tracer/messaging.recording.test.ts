import { afterEach, expect, it, vi } from 'vitest';

import { beginSendTrace, recordMessageResponse } from './messaging';
import { installActiveTraceObserver } from './runtime';
import { DEFAULT_TRACE_CONFIG, type TraceEvent } from './types';

function installObserver() {
  const events: TraceEvent[] = [];
  const sendTimestamps = new Map<string, number>();
  const dispose = installActiveTraceObserver({
    config: { ...DEFAULT_TRACE_CONFIG, enabled: true },
    context: 'popup',
    generateCorrelationId: vi.fn(() => 'corr-1'),
    safeStringify: vi.fn((value: unknown) => JSON.stringify(value)),
    sanitizeValue: vi.fn((value: unknown) => ({ sanitized: value })),
    sendEvent: (event) => events.push(event),
    sendTimestamps,
  });

  return { dispose, events };
}

afterEach(() => {
  vi.restoreAllMocks();
});

it('omits staged recording chunk base64 before observer sanitization', () => {
  const harness = installObserver();

  const tracker = beginSendTrace(
    { type: 'STAGE_RECORDING_DOWNLOAD_CHUNK' },
    {
      base64: 'cHJpdmF0ZS1yZWNvcmRpbmctY2h1bms=',
      chunkIndex: 0,
      recordingSessionId: 'recording-session-1',
      stagedRecordingId: 'staged-recording-1',
      totalBytes: 23,
      totalChunks: 1,
      type: 'STAGE_RECORDING_DOWNLOAD_CHUNK',
    },
    'bg'
  );
  recordMessageResponse({ success: true }, tracker);

  expect(harness.events[0]).toEqual(
    expect.objectContaining({
      payload: {
        sanitized: expect.objectContaining({
          base64: '[recording chunk omitted]',
          base64DecodedBytes: 23,
          chunkIndex: 0,
          type: 'STAGE_RECORDING_DOWNLOAD_CHUNK',
        }),
      },
    })
  );
  expect(JSON.stringify(harness.events)).not.toContain('cHJpdmF0ZS1yZWNvcmRpbmctY2h1bms=');

  harness.dispose();
});
