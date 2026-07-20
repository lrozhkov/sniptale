import { beforeEach, expect, it, vi } from 'vitest';

const runtimeInfoGetManifestMock = vi.hoisted(() => vi.fn());

vi.mock('@sniptale/platform/browser/runtime', async (importOriginal) => {
  const original = await importOriginal<typeof import('@sniptale/platform/browser/runtime')>();

  return {
    ...original,
    runtimeInfo: {
      ...original.runtimeInfo,
      getManifest: runtimeInfoGetManifestMock,
    },
  };
});

import {
  buildHarPayload,
  createPendingHarEntry,
  finalizeHarEntry,
  isDebuggerConflictError,
  resolveHarBrowserMetadata,
  sanitizeHeaders,
  type ExportHarSession,
} from './helpers';
import { createCapabilityContext } from '@sniptale/platform/security/capability-context';

function createSession(): ExportHarSession {
  const expiresAtEpochMs = Date.now() + 60000;
  return {
    capabilityContext: createCapabilityContext({
      expiresAtEpochMs,
      origin: 'https://example.test',
      scopes: ['export:har'],
      tabId: 7,
      token: 'har-token',
    }),
    capabilityToken: 'har-token',
    expiresAtEpochMs,
    sessionId: 'session-1',
    tabId: 7,
    pageId: 'page-1',
    pageUrl: 'https://example.test/page',
    rawDiagnosticsEnabled: false,
    browserName: 'Chrome',
    browserVersion: '123.0.0.0',
    startedAtIso: '2026-03-21T12:00:00.000Z',
    pendingEntries: new Map(),
    completedEntries: [],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  runtimeInfoGetManifestMock.mockReturnValue({ version: '0.4.0' });
});

it('sanitizes sensitive HAR headers while preserving safe values', () => {
  expect(
    sanitizeHeaders({
      Authorization: 'secret',
      Accept: 'application/json',
      Cookie: 'session=1',
      'Set-Cookie': 'session=1',
    })
  ).toEqual([
    { name: 'Authorization', value: '[redacted]' },
    { name: 'Accept', value: 'application/json' },
    { name: 'Cookie', value: '[redacted]' },
    { name: 'Set-Cookie', value: '[redacted]' },
  ]);
  expect(sanitizeHeaders(undefined)).toEqual([]);
});

it('creates, finalizes, and exports HAR entries with manifest metadata', () => {
  const session = createSession();
  const pendingEntry = createPendingHarEntry(session, {
    requestId: 'request-1',
    request: {
      method: 'GET',
      url: 'https://example.test/api/items?q=1',
      headers: { Accept: 'application/json' },
    },
    type: 'Fetch',
  });
  session.pendingEntries.set('request-1', pendingEntry);

  finalizeHarEntry(session, 'request-1', 'network failed', 321);

  const payload = buildHarPayload(session);
  const [entry] = payload.log.entries;
  expect(entry).toMatchObject({
    _requestId: 'request-1',
    _error: 'network failed',
    _resourceType: 'Fetch',
    response: {
      content: {
        size: 321,
      },
    },
  });
  expect(payload.log.creator).toEqual({
    name: 'Sniptale',
    version: '0.4.0',
  });
});

it('sanitizes HAR page titles, request URLs, and sensitive query params', () => {
  const session = {
    ...createSession(),
    pageUrl: 'https://example.test/page?access_token=known-secret#frag',
  };
  const pendingEntry = createPendingHarEntry(session, {
    requestId: 'request-secret',
    request: {
      method: 'GET',
      url: [
        'https://example.test/api?access_token=known-secret',
        'password=known-secret',
        'passphrase=known-secret',
        'session_id=known-secret',
        'otp=known-secret',
        'q=public#frag',
      ].join('&'),
      headers: { Authorization: 'known-secret' },
    },
  });
  session.pendingEntries.set('request-secret', pendingEntry);

  const payload = buildHarPayload(session);
  const serialized = JSON.stringify(payload);
  const [entry] = payload.log.entries;

  expect(payload.log.pages[0]?.title).toBe('https://example.test/page');
  expect(entry?.request.url).toBe('https://example.test/api');
  expect(entry?.request.queryString).toEqual([
    { name: 'access_token', value: '[redacted]' },
    { name: 'password', value: '[redacted]' },
    { name: 'passphrase', value: '[redacted]' },
    { name: 'session_id', value: '[redacted]' },
    { name: 'otp', value: '[redacted]' },
    { name: 'q', value: '[redacted]' },
  ]);
  expect(serialized).not.toContain('known-secret');
  expect(serialized).not.toContain('public');
  expect(serialized).not.toContain('#frag');
});

it('sanitizes URL-valued HAR headers in sanitized mode', () => {
  expect(
    sanitizeHeaders({
      'Content-Location': 'https://example.test/content?download=private#frag',
      Link: [
        '<https://example.test/a?token=known-secret#frag>; rel=preload',
        '<https://example.test/b?q=private#frag>; rel=next',
      ].join(', '),
      Location: 'https://example.test/next?state=private#frag',
      Referer: 'https://example.test/source?q=private#frag',
      Refresh: '0; url=/next?q=private#frag',
    })
  ).toEqual([
    { name: 'Content-Location', value: 'https://example.test/content' },
    {
      name: 'Link',
      value: ['<https://example.test/a>; rel=preload', '<https://example.test/b>; rel=next'].join(
        ', '
      ),
    },
    { name: 'Location', value: 'https://example.test/next' },
    { name: 'Referer', value: 'https://example.test/source' },
    { name: 'Refresh', value: '0; url=/next' },
  ]);
});

it('keeps request entries without resource type, invalid query strings, or matching pending ids', () => {
  const session = createSession();
  const pendingEntry = createPendingHarEntry(session, {
    requestId: 'request-invalid-url',
    request: {
      method: 'POST',
      url: 'not a valid url',
    },
  });
  session.pendingEntries.set('request-invalid-url', pendingEntry);

  finalizeHarEntry(session, 'missing-request');
  finalizeHarEntry(session, 'request-invalid-url');

  const [entry] = session.completedEntries;
  expect(entry).toMatchObject({
    _requestId: 'request-invalid-url',
    request: {
      queryString: [],
    },
  });
  expect(entry).not.toHaveProperty('_resourceType');
  expect(entry).not.toHaveProperty('_error');
});

it('resolves HAR browser metadata and conflict detection fallbacks', () => {
  expect(resolveHarBrowserMetadata({ product: 'Chrome/123.0.0.0' })).toEqual({
    name: 'Chrome',
    version: '123.0.0.0',
  });
  expect(resolveHarBrowserMetadata({ product: 'Chromium' })).toEqual({
    name: 'Chromium',
    version: '',
  });
  expect(resolveHarBrowserMetadata({ userAgent: 'Sniptale UA' })).toEqual({
    name: 'Sniptale UA',
    version: '',
  });
  expect(resolveHarBrowserMetadata(null)).toEqual({
    name: 'Chromium',
    version: '',
  });
  expect(isDebuggerConflictError(new Error('Another client is already attached'))).toBe(true);
  expect(isDebuggerConflictError(new Error('different failure'))).toBe(false);
});
