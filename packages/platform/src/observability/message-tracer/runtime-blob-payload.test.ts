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

it('omits runtime blob envelope base64 before observer sanitization', () => {
  const harness = installObserver();

  const tracker = beginSendTrace({ type: 'OFFSCREEN_START_PROJECT_EXPORT' }, createPayload(), 'bg');
  recordMessageResponse({ success: true }, tracker);

  expect(harness.events[0]).toEqual(expectSanitizedRuntimeBlobTrace());
  expect(JSON.stringify(harness.events)).not.toContain('PHN2Zy8+');

  harness.dispose();
});

function createPayload() {
  return {
    project: {
      effectSnapshots: [
        {
          assets: {
            'neutral-mark.svg': createRuntimeBlobEnvelope(),
          },
        },
      ],
    },
    type: 'OFFSCREEN_START_PROJECT_EXPORT',
  };
}

function createRuntimeBlobEnvelope() {
  return {
    __sniptaleRuntimeBlob: true,
    base64: 'PHN2Zy8+',
    mimeType: 'image/svg+xml',
    size: 6,
  };
}

function expectSanitizedRuntimeBlobTrace() {
  return expect.objectContaining({
    payload: {
      sanitized: expect.objectContaining({
        project: expect.objectContaining({
          effectSnapshots: [
            expect.objectContaining({
              assets: expect.objectContaining({
                'neutral-mark.svg': expectSanitizedRuntimeBlobEnvelope(),
              }),
            }),
          ],
        }),
      }),
    },
  });
}

function expectSanitizedRuntimeBlobEnvelope() {
  return expect.objectContaining({
    __sniptaleRuntimeBlob: true,
    base64: '[runtime blob omitted]',
    mimeType: 'image/svg+xml',
    size: 6,
  });
}
