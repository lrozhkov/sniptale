import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import {
  authorizeWebSnapshotAssetFetch,
  authorizeWebSnapshotCaptureRequest,
  beginWebSnapshotAssetFetch,
  beginWebSnapshotSave,
  cancelWebSnapshotCaptureRequest,
  commitWebSnapshotSave,
  extendWebSnapshotAssetSession,
  registerWebSnapshotAssetSession,
  resetWebSnapshotAssetSessionsForTests,
  retainWebSnapshotSaveAfterCompensationFailure,
} from './session';
beforeEach(() => {
  resetWebSnapshotAssetSessionsForTests();
  vi.stubGlobal('crypto', {
    randomUUID: vi.fn(() => 'snapshot-session-1'),
  });
});

afterEach(() => {
  resetWebSnapshotAssetSessionsForTests();
  vi.unstubAllGlobals();
});

it('requires a background-authorized capture request before asset registration', () => {
  expect(() =>
    registerWebSnapshotAssetSession(42, 'req-1', ['https://cdn.example.com/image.png'])
  ).toThrow('Web snapshot capture request is not authorized');
});

it('retains an early cancellation tombstone so authorization cannot race it', () => {
  const cancellation = cancelWebSnapshotCaptureRequest(42, 'req-cancelled');
  expect(cancellation.committedAssetIds).toEqual([]);

  expect(() => authorizeWebSnapshotCaptureRequest(42, 'req-cancelled')).toThrow(
    'Web snapshot save was cancelled'
  );
  expect(() => registerWebSnapshotAssetSession(42, 'req-cancelled', [])).toThrow(
    'Web snapshot save was cancelled'
  );
});

it('binds registered asset URLs to the issuing tab session', () => {
  authorizeWebSnapshotCaptureRequest(42, 'req-1', { allowAnonymousCrossOriginAssets: true });
  const sessionId = registerWebSnapshotAssetSession(42, 'req-1', [
    'https://cdn.example.com/image.png',
  ]);

  expect(sessionId).toBe('snapshot-session-1');
  expect(() =>
    authorizeWebSnapshotAssetFetch({
      sessionId,
      tabId: 42,
      url: 'https://cdn.example.com/image.png',
    })
  ).not.toThrow();
});

it('extends an open authorized session for resources discovered inside stylesheets', () => {
  authorizeWebSnapshotCaptureRequest(42, 'req-1', { allowAnonymousCrossOriginAssets: true });
  const sessionId = registerWebSnapshotAssetSession(42, 'req-1', [
    'https://cdn.example.com/styles.css',
  ]);

  extendWebSnapshotAssetSession({
    assetUrls: ['https://fonts.example.com/demo.woff2'],
    sessionId,
    tabId: 42,
  });

  expect(() =>
    authorizeWebSnapshotAssetFetch({
      sessionId,
      tabId: 42,
      url: 'https://fonts.example.com/demo.woff2',
    })
  ).not.toThrow();
});

it('uses crypto random values when randomUUID is unavailable', () => {
  vi.stubGlobal('crypto', {
    getRandomValues: vi.fn((array: Uint8Array) => {
      array.set([
        0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e,
        0x0f,
      ]);
      return array;
    }),
  });

  authorizeWebSnapshotCaptureRequest(42, 'req-1', { allowAnonymousCrossOriginAssets: true });
  expect(registerWebSnapshotAssetSession(42, 'req-1', [])).toBe(
    '00010203-0405-4607-8809-0a0b0c0d0e0f'
  );
});

it('rejects unregistered URLs and wrong-tab sessions', () => {
  authorizeWebSnapshotCaptureRequest(42, 'req-1', { allowAnonymousCrossOriginAssets: true });
  const sessionId = registerWebSnapshotAssetSession(42, 'req-1', [
    'https://cdn.example.com/image.png',
  ]);

  expect(() =>
    authorizeWebSnapshotAssetFetch({
      sessionId,
      tabId: 42,
      url: 'https://cdn.example.com/other.png',
    })
  ).toThrow('Web snapshot asset was not registered for this session');
  expect(() =>
    authorizeWebSnapshotAssetFetch({
      sessionId,
      tabId: 43,
      url: 'https://cdn.example.com/image.png',
    })
  ).toThrow('Invalid web snapshot session');
});

it('allows a snapshot save once for the issuing tab', () => {
  authorizeWebSnapshotCaptureRequest(42, 'req-1');
  const sessionId = registerWebSnapshotAssetSession(42, 'req-1', []);

  expect(() => beginWebSnapshotSave({ sessionId, tabId: 42 })).not.toThrow();
  expect(() => beginWebSnapshotSave({ sessionId, tabId: 42 })).toThrow(
    'Web snapshot session save is already in progress'
  );
  expect(() => commitWebSnapshotSave({ assetId: 'asset-1', sessionId, tabId: 42 })).not.toThrow();
  expect(() => beginWebSnapshotSave({ sessionId, tabId: 42 })).toThrow(
    'Web snapshot session was already saved'
  );
  expect(() => beginWebSnapshotSave({ sessionId, tabId: 43 })).toThrow(
    'Invalid web snapshot session'
  );
});

it('blocks a pending commit and identifies an already committed asset for compensation', () => {
  authorizeWebSnapshotCaptureRequest(42, 'req-saving');
  const savingSessionId = registerWebSnapshotAssetSession(42, 'req-saving', []);
  beginWebSnapshotSave({ sessionId: savingSessionId, tabId: 42 });
  const savingCancellation = cancelWebSnapshotCaptureRequest(42, 'req-saving');
  expect(savingCancellation.committedAssetIds).toEqual([]);
  expect(() =>
    commitWebSnapshotSave({
      assetId: 'asset-saving',
      sessionId: savingSessionId,
      tabId: 42,
    })
  ).toThrow('Web snapshot save was cancelled');

  vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'snapshot-session-2') });
  authorizeWebSnapshotCaptureRequest(42, 'req-saved');
  const savedSessionId = registerWebSnapshotAssetSession(42, 'req-saved', []);
  beginWebSnapshotSave({ sessionId: savedSessionId, tabId: 42 });
  commitWebSnapshotSave({ assetId: 'asset-saved', sessionId: savedSessionId, tabId: 42 });
  const savedCancellation = cancelWebSnapshotCaptureRequest(42, 'req-saved');
  expect(savedCancellation.committedAssetIds).toEqual(['asset-saved']);
});

it('aborts active asset fetches only for sessions matching the cancelled request', () => {
  const firstUrl = 'https://cdn.example.com/first.png';
  authorizeWebSnapshotCaptureRequest(42, 'req-first', {
    allowAnonymousCrossOriginAssets: true,
  });
  const firstSessionId = registerWebSnapshotAssetSession(42, 'req-first', [firstUrl]);
  const firstFetch = beginWebSnapshotAssetFetch({
    sessionId: firstSessionId,
    tabId: 42,
    url: firstUrl,
  });

  vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'snapshot-session-2') });
  const secondUrl = 'https://cdn.example.com/second.png';
  authorizeWebSnapshotCaptureRequest(42, 'req-second', {
    allowAnonymousCrossOriginAssets: true,
  });
  const secondSessionId = registerWebSnapshotAssetSession(42, 'req-second', [secondUrl]);
  const secondFetch = beginWebSnapshotAssetFetch({
    sessionId: secondSessionId,
    tabId: 42,
    url: secondUrl,
  });

  cancelWebSnapshotCaptureRequest(42, 'req-first');

  expect(firstFetch.signal.aborted).toBe(true);
  expect(firstFetch.signal.reason).toEqual(new Error('Web snapshot save was cancelled'));
  expect(secondFetch.signal.aborted).toBe(false);
  firstFetch.release();
  secondFetch.release();
});

it('retains a published asset as non-retryable authority after compensation fails', () => {
  authorizeWebSnapshotCaptureRequest(42, 'req-retained');
  const sessionId = registerWebSnapshotAssetSession(42, 'req-retained', []);
  beginWebSnapshotSave({ sessionId, tabId: 42 });

  retainWebSnapshotSaveAfterCompensationFailure({
    assetId: 'asset-retained',
    sessionId,
    tabId: 42,
  });

  expect(() => beginWebSnapshotSave({ sessionId, tabId: 42 })).toThrow(
    'Web snapshot session was already saved'
  );
  expect(cancelWebSnapshotCaptureRequest(42, 'req-retained').committedAssetIds).toEqual([
    'asset-retained',
  ]);
});

it('preserves an in-flight save across the original TTL and leases retained authority', async () => {
  vi.useFakeTimers();
  try {
    const assetUrl = 'https://cdn.example.com/retained.png';
    authorizeWebSnapshotCaptureRequest(42, 'req-retained-race', {
      allowAnonymousCrossOriginAssets: true,
    });
    const sessionId = registerWebSnapshotAssetSession(42, 'req-retained-race', [assetUrl]);
    beginWebSnapshotSave({ sessionId, tabId: 42 });

    await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 1);

    expect(() =>
      retainWebSnapshotSaveAfterCompensationFailure({
        assetId: 'asset-retained-race',
        sessionId,
        tabId: 42,
      })
    ).not.toThrow();
    expect(() => authorizeWebSnapshotAssetFetch({ sessionId, tabId: 42, url: assetUrl })).toThrow(
      'Web snapshot session is not open'
    );
    expect(cancelWebSnapshotCaptureRequest(42, 'req-retained-race').committedAssetIds).toEqual([
      'asset-retained-race',
    ]);

    await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 1);
    expect(() => authorizeWebSnapshotAssetFetch({ sessionId, tabId: 42, url: assetUrl })).toThrow(
      'Invalid web snapshot session'
    );
  } finally {
    vi.useRealTimers();
  }
});

it('starts a fresh bounded lease when an in-flight save is committed', async () => {
  vi.useFakeTimers();
  try {
    const assetUrl = 'https://cdn.example.com/committed.png';
    authorizeWebSnapshotCaptureRequest(42, 'req-committed-race', {
      allowAnonymousCrossOriginAssets: true,
    });
    const sessionId = registerWebSnapshotAssetSession(42, 'req-committed-race', [assetUrl]);
    beginWebSnapshotSave({ sessionId, tabId: 42 });
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 1);

    expect(() =>
      commitWebSnapshotSave({ assetId: 'asset-committed-race', sessionId, tabId: 42 })
    ).not.toThrow();
    expect(() => authorizeWebSnapshotAssetFetch({ sessionId, tabId: 42, url: assetUrl })).toThrow(
      'Web snapshot session is not open'
    );
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    expect(cancelWebSnapshotCaptureRequest(42, 'req-committed-race').committedAssetIds).toEqual([
      'asset-committed-race',
    ]);

    await vi.advanceTimersByTimeAsync(1);
    expect(() => authorizeWebSnapshotAssetFetch({ sessionId, tabId: 42, url: assetUrl })).toThrow(
      'Invalid web snapshot session'
    );
  } finally {
    vi.useRealTimers();
  }
});

it('expires an abandoned asset-fetch session', async () => {
  vi.useFakeTimers();
  try {
    const assetUrl = 'https://cdn.example.com/expiring.png';
    authorizeWebSnapshotCaptureRequest(42, 'req-expiring', {
      allowAnonymousCrossOriginAssets: true,
    });
    const sessionId = registerWebSnapshotAssetSession(42, 'req-expiring', [assetUrl]);

    await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 1);

    expect(() => authorizeWebSnapshotAssetFetch({ sessionId, tabId: 42, url: assetUrl })).toThrow(
      'Invalid web snapshot session'
    );
  } finally {
    vi.useRealTimers();
  }
});

it('rejects oversized asset registration lists', () => {
  authorizeWebSnapshotCaptureRequest(42, 'req-1', { allowAnonymousCrossOriginAssets: true });
  expect(() =>
    registerWebSnapshotAssetSession(
      42,
      'req-1',
      Array.from({ length: 501 }, (_, index) => `https://cdn.example.com/${index}.png`)
    )
  ).toThrow('Too many web snapshot assets');
});

it('rejects external asset registration when anonymous cross-origin capture is disabled', () => {
  authorizeWebSnapshotCaptureRequest(42, 'req-1', {
    allowAnonymousCrossOriginAssets: false,
  });

  expect(() =>
    registerWebSnapshotAssetSession(42, 'req-1', ['https://cdn.example.com/image.png'])
  ).toThrow('anonymous cross-origin asset fetch is disabled');
});
