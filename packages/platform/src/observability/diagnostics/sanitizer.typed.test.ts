import { expect, it } from 'vitest';
import type { DiagnosticEvent, DiagnosticMeta, NetworkRequestData } from './types';
import {
  sanitizeDiagnosticsEvents,
  sanitizeDiagnosticsMeta,
  sanitizeNetworkRequestData,
} from './sanitizer';

it('emits an allowlisted diagnostics metadata DTO', () => {
  const meta: DiagnosticMeta & { authorization: string; html: string } = {
    authorization: 'Bearer secret',
    html: '<input value="secret">',
    interrupted: true,
    recordingEndedAt: '2026-03-21T12:05:00.000Z',
    recordingStartedAt: '2026-03-21T12:00:00.000Z',
    url: 'https://example.test/page?token=secret#frag',
    userAgent: 'Browser Authorization: Bearer secret',
    viewportHeight: 720,
    viewportWidth: 1280,
  };

  expect(sanitizeDiagnosticsMeta(meta)).toEqual({
    interrupted: true,
    recordingEndedAt: '2026-03-21T12:05:00.000Z',
    recordingStartedAt: '2026-03-21T12:00:00.000Z',
    url: 'https://example.test/page',
    userAgent: 'Browser Authorization: ***',
    viewportHeight: 720,
    viewportWidth: 1280,
  });
});

it('emits an allowlisted network request DTO', () => {
  const request: NetworkRequestData & { headers: { cookie: string }; postData: string } = {
    error: 'Authorization: Bearer secret',
    headers: { cookie: 'session=secret' },
    method: 'POST',
    mimeType: 'application/json',
    postData: 'private user text',
    requestId: 'request-1',
    requestTime: 12,
    resourceType: 'XHR',
    responseTime: 18,
    status: 401,
    statusText: 'Failed token=secret',
    url: 'https://example.test/api?token=secret#frag',
  };

  expect(sanitizeNetworkRequestData(request)).toEqual({
    error: 'Authorization: ***',
    method: 'POST',
    mimeType: 'application/json',
    requestId: 'request-1',
    requestTime: 12,
    resourceType: 'XHR',
    responseTime: 18,
    status: 401,
    statusText: 'Failed token=***',
    url: 'https://example.test/api',
  });
});

it('emits allowlisted diagnostic events while sanitizing event data', () => {
  const event: DiagnosticEvent & { rawResponse: string } = {
    data: {
      error: 'Authorization: Bearer secret',
      headers: { cookie: 'session=secret' },
      method: 'GET',
      requestId: 'request-1',
      requestTime: 12,
      statusText: 'OK Authorization: Bearer secret',
      url: 'https://example.test/api?token=secret#frag',
    },
    id: 'event-1',
    kind: 'network',
    level: 'error',
    message: 'GET https://example.test/api?token=secret',
    rawResponse: 'token=secret',
    recordingId: 'recording-1',
    tsMs: 12,
  };

  expect(sanitizeDiagnosticsEvents([event])).toEqual([
    {
      data: {
        error: 'Authorization: ***',
        method: 'GET',
        requestId: 'request-1',
        requestTime: 12,
        statusText: 'OK Authorization: ***',
        url: 'https://example.test/api',
      },
      id: 'event-1',
      kind: 'network',
      level: 'error',
      message: 'GET https://example.test/api?token=***',
      recordingId: 'recording-1',
      tsMs: 12,
    },
  ]);
});
