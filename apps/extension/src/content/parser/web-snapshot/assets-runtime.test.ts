// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  installContentRuntimeMessagingMock,
  resetContentRuntimeMessagingMock,
} from '../../platform/runtime-services/services.test-support';

const sendRuntimeMessageMock = vi.hoisted(() => vi.fn());

vi.mock('../../../platform/runtime-messaging', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/runtime-messaging')>()),
  sendRuntimeMessage: sendRuntimeMessageMock,
}));

import { collectWebSnapshotAssets } from './assets';

function collectAssets(args: {
  allowAuthenticatedSameOriginAssets?: boolean;
  sourceUrl?: string | undefined;
}) {
  return collectWebSnapshotAssets(document, {
    allowAnonymousCrossOriginAssets: false,
    allowAuthenticatedSameOriginAssets: args.allowAuthenticatedSameOriginAssets ?? false,
    requestId: 'req-web',
    ...(args.sourceUrl === undefined ? {} : { sourceUrl: args.sourceUrl }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  installContentRuntimeMessagingMock(sendRuntimeMessageMock);
  sendRuntimeMessageMock.mockReset();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('png', { headers: { 'content-type': 'image/png' } }))
  );
});

afterEach(() => {
  document.body.innerHTML = '';
  resetContentRuntimeMessagingMock();
  vi.unstubAllGlobals();
});

it('uses document-scoped asset URLs and global timers without ambient window', async () => {
  const originalWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
  sendRuntimeMessageMock.mockResolvedValueOnce({
    success: true,
    snapshotSessionId: 'snapshot-session-no-window',
  });
  document.body.innerHTML = '<img src="/private.png">';
  Reflect.deleteProperty(globalThis, 'window');

  try {
    const result = await collectAssets({ allowAuthenticatedSameOriginAssets: true });

    expect(fetch).toHaveBeenCalledWith('http://localhost:3000/private.png', {
      credentials: 'include',
      redirect: 'manual',
      signal: expect.any(AbortSignal),
    });
    expect(result.assets).toHaveLength(1);
    expect(result.warnings).toEqual([]);
  } finally {
    if (originalWindowDescriptor) {
      Object.defineProperty(globalThis, 'window', originalWindowDescriptor);
    }
  }
});

it('formats skipped asset warnings against the explicit source page URL', async () => {
  sendRuntimeMessageMock.mockResolvedValueOnce({
    success: true,
    snapshotSessionId: 'snapshot-session-source-url',
  });
  document.body.innerHTML = '<img src="/private.png?token=secret#hash">';

  const result = await collectAssets({
    allowAuthenticatedSameOriginAssets: false,
    sourceUrl: 'https://source.example/page',
  });

  expect(fetch).not.toHaveBeenCalled();
  expect(result.warnings).toEqual([
    [
      'Asset skipped: https://source.example/private.png',
      '(authenticated same-origin asset fetch is disabled)',
    ].join(' '),
  ]);
});
