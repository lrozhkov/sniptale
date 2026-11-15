import { expect, it } from 'vitest';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { installActiveTraceObserver } from './runtime';
import { DEFAULT_TRACE_CONFIG, type TraceEvent } from './types';
import { beginSendTrace, recordMessageFailure, recordMessageResponse } from './messaging';
import { sanitizeVectorCatalogTracePayload } from './vector-catalog-payload';

it('never invokes accessors or admits non-string operation metadata into the fixed summary', () => {
  const payload = Object.defineProperties(
    {},
    {
      operation: {
        get() {
          throw new Error('Private operation getter');
        },
      },
      success: {
        get() {
          throw new Error('Private success getter');
        },
      },
      error: {
        get() {
          throw new Error('Private error getter');
        },
      },
    }
  );
  expect(
    sanitizeVectorCatalogTracePayload(MessageType.EDITOR_VECTOR_CATALOG_COMMAND, payload)
  ).toEqual({
    type: MessageType.EDITOR_VECTOR_CATALOG_COMMAND,
    error: 'vector-catalog-runtime-failure',
  });
  expect(
    sanitizeVectorCatalogTracePayload(MessageType.EDITOR_VECTOR_CATALOG_COMMAND, {
      operation: 1,
      success: 'private-success',
    })
  ).toEqual({ type: MessageType.EDITOR_VECTOR_CATALOG_COMMAND });
});

it('keeps only allowed diagnostic metadata for malformed request and response values', () => {
  expect(
    sanitizeVectorCatalogTracePayload(MessageType.EDITOR_VECTOR_CATALOG_COMMAND, {
      operation: 'search',
      query: 'private-query',
      source: 'private-url',
      data: '<svg>private-art</svg>',
    })
  ).toEqual({ type: MessageType.EDITOR_VECTOR_CATALOG_COMMAND, operation: 'search' });
  expect(
    sanitizeVectorCatalogTracePayload(MessageType.EDITOR_VECTOR_CATALOG_COMMAND, {
      operation: 'private-operation',
      error: 'private-error',
    })
  ).toEqual({
    type: MessageType.EDITOR_VECTOR_CATALOG_COMMAND,
    error: 'vector-catalog-runtime-failure',
  });
});

it('redacts both canonical transport trace directions and top-level failures before observers receive them', () => {
  const events: TraceEvent[] = [];
  const dispose = installActiveTraceObserver({
    config: { ...DEFAULT_TRACE_CONFIG, enabled: true },
    context: 'editor',
    generateCorrelationId: () => 'trace-id',
    safeStringify: (value) => JSON.stringify(value),
    sanitizeValue: (value) => value,
    sendEvent: (event) => events.push(event),
    sendTimestamps: new Map(),
  });
  try {
    const message = {
      type: MessageType.EDITOR_VECTOR_CATALOG_COMMAND,
      operation: 'search',
      query: 'private-query',
      source: { sourceId: 'https://private-server.test/path' },
    };
    const tracker = beginSendTrace(message, message, 'bg');
    recordMessageResponse(
      {
        success: true,
        operation: 'assets',
        data: { icons: { heart: { body: '<svg>private-artwork</svg>' } } },
      },
      tracker
    );
    const failure = beginSendTrace(message, message, 'bg');
    recordMessageFailure(new Error('private-query private-artwork'), failure);
    const serialized = JSON.stringify(events);
    expect(serialized).not.toContain('private-query');
    expect(serialized).not.toContain('private-artwork');
    expect(serialized).not.toContain('private-server');
    expect(events).toHaveLength(4);
    expect(events[1]).toMatchObject({ payload: { success: true, operation: 'assets' } });
    expect(events[3]).toMatchObject({ error: 'vector-catalog-runtime-failure' });
  } finally {
    dispose();
  }
});
