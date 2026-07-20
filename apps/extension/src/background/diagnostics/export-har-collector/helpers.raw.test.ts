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
  buildSessionHarHeaders,
  createPendingHarEntry,
  type ExportHarSession,
} from './helpers';
import { createCapabilityContext } from '@sniptale/platform/security/capability-context';

function createRawSession(): ExportHarSession {
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
    pageUrl: 'https://example.test/page?access_token=known-secret&q=public#frag',
    rawDiagnosticsEnabled: true,
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

function addRawPendingEntry(session: ExportHarSession): void {
  const pendingEntry = createPendingHarEntry(session, {
    requestId: 'request-raw',
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
      headers: {
        Accept: 'application/json',
        Authorization: 'known-secret',
        Cookie: 'session=known-secret',
        Link: '<https://example.test/preload?X-Amz-Signature=known-secret#frag>; rel=preload',
        Referer: 'https://example.test/file?X-Amz-Signature=known-secret&q=public#frag',
        'X-Amz-Credential': 'known-secret',
        'X-Auth': 'known-secret',
        'X-Bearer': 'known-secret',
        'X-Goog-Signature': 'known-secret',
        'X-Password': 'known-secret',
        'X-Signature': 'known-secret',
      },
    },
  });
  session.pendingEntries.set('request-raw', pendingEntry);
}

function expectRawHarRequestRedacted(session: ExportHarSession): void {
  const payload = buildHarPayload(session);
  const [entry] = payload.log.entries;

  expect(payload.log.pages[0]?.title).toBe('https://example.test/page?access_token=***&q=public');
  expect(entry?.request.url).toBe(
    [
      'https://example.test/api?access_token=***',
      'password=***',
      'passphrase=***',
      'session_id=***',
      'otp=***',
      'q=public',
    ].join('&')
  );
  expect(entry?.request.queryString).toEqual([
    { name: 'access_token', value: '[redacted]' },
    { name: 'password', value: '[redacted]' },
    { name: 'passphrase', value: '[redacted]' },
    { name: 'session_id', value: '[redacted]' },
    { name: 'otp', value: '[redacted]' },
    { name: 'q', value: 'public' },
  ]);
  expect(entry?.request.headers).toContainEqual({
    name: 'Authorization',
    value: '[redacted]',
  });
  expect(entry?.request.headers).toContainEqual({ name: 'Cookie', value: '[redacted]' });
  expect(entry?.request.headers).toContainEqual({
    name: 'Referer',
    value: 'https://example.test/file?X-Amz-Signature=***&q=public',
  });
  expect(entry?.request.headers).toContainEqual({
    name: 'Link',
    value: '<https://example.test/preload?X-Amz-Signature=***>; rel=preload',
  });
  expect(entry?.request.headers).toContainEqual({ name: 'X-Amz-Credential', value: '[redacted]' });
  expect(entry?.request.headers).toContainEqual({ name: 'X-Auth', value: '[redacted]' });
  expect(entry?.request.headers).toContainEqual({ name: 'X-Bearer', value: '[redacted]' });
  expect(entry?.request.headers).toContainEqual({ name: 'X-Goog-Signature', value: '[redacted]' });
  expect(entry?.request.headers).toContainEqual({ name: 'X-Password', value: '[redacted]' });
  expect(entry?.request.headers).toContainEqual({ name: 'X-Signature', value: '[redacted]' });
  expect(JSON.stringify(payload)).not.toContain('known-secret');
  expect(JSON.stringify(payload)).not.toContain('#frag');
}

function expectRawHeaderValuesRedacted(session: ExportHarSession): void {
  expect(
    buildSessionHarHeaders(session, { Server: 'fixture', 'Set-Cookie': 'sid=secret' })
  ).toEqual([
    { name: 'Server', value: 'fixture' },
    { name: 'Set-Cookie', value: '[redacted]' },
  ]);
  expect(
    buildSessionHarHeaders(session, {
      Link: [
        '<https://example.test/a?X-Amz-Signature=known-secret#frag>; rel=preload',
        '<https://example.test/b?X-Goog-Signature=known-secret#frag>; rel=next',
      ].join(', '),
      'Content-Location': 'https://example.test/content?token=known-secret&q=public#frag',
      Location: 'https://example.test/next?X-Amz-Signature=known-secret#frag',
      Refresh: '0; url=/next?X-Goog-Signature=known-secret#frag',
    })
  ).toEqual([
    {
      name: 'Link',
      value: [
        '<https://example.test/a?X-Amz-Signature=***>; rel=preload',
        '<https://example.test/b?X-Goog-Signature=***>; rel=next',
      ].join(', '),
    },
    {
      name: 'Content-Location',
      value: 'https://example.test/content?token=***&q=public',
    },
    { name: 'Location', value: 'https://example.test/next?X-Amz-Signature=***' },
    { name: 'Refresh', value: '0; url=/next?X-Goog-Signature=***' },
  ]);
}

it('redacts raw HAR reusable credentials while preserving safe query params', () => {
  const session = createRawSession();
  addRawPendingEntry(session);

  expectRawHarRequestRedacted(session);
  expectRawHeaderValuesRedacted(session);
});
