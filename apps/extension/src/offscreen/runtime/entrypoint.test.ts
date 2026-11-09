import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  bootstrapOffscreenDocumentMock,
  getCurrentLocaleMock,
  registerOffscreenRuntimeMessageListenerMock,
  registerOffscreenVoiceInputMessageListenerMock,
  translateMock,
} = vi.hoisted(() => ({
  bootstrapOffscreenDocumentMock: vi.fn(),
  getCurrentLocaleMock: vi.fn(() => 'en'),
  registerOffscreenRuntimeMessageListenerMock: vi.fn(),
  registerOffscreenVoiceInputMessageListenerMock: vi.fn(),
  translateMock: vi.fn((key: string) => key),
}));

const mediaEvents = vi.hoisted(() => ({
  publishLibraryChanged: vi.fn(),
  dispose: vi.fn(),
  create: vi.fn(),
}));
vi.mock('../../features/media-hub/events', () => ({
  createMediaHubEventPublisher: mediaEvents.create,
}));

vi.mock('./bootstrap', () => ({
  bootstrapOffscreenDocument: bootstrapOffscreenDocumentMock,
  probeOffscreenRuntimeReadiness: vi.fn(),
}));

vi.mock('./index', () => ({
  registerOffscreenRuntimeMessageListener: registerOffscreenRuntimeMessageListenerMock,
}));

vi.mock('../voice-input/runtime', () => ({
  registerOffscreenVoiceInputMessageListener: registerOffscreenVoiceInputMessageListenerMock,
}));

vi.mock('../sync-connection/runtime', () => ({
  registerOffscreenSyncMessageListener: vi.fn(),
}));
vi.mock('../sync-connection/executor', async (importOriginal) => {
  const original = await importOriginal<typeof import('../sync-connection/executor')>();
  return {
    ...original,
    createSyncConnectionExecutor: vi.fn(original.createSyncConnectionExecutor),
  };
});
vi.mock('../sync-connection/execution', () => ({
  createSyncQueueExecution: vi.fn(),
  createSyncWorkspaceExecution: vi.fn(),
}));
vi.mock('../sync-connection/product-execution', () => ({ createSyncProductExecution: vi.fn() }));
vi.mock('../../platform/runtime-messaging', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../platform/runtime-messaging')>();
  return {
    ...original,
    createRuntimeMessagingTransport: vi.fn(original.createRuntimeMessagingTransport),
  };
});
import { createSyncConnectionExecutor } from '../sync-connection/executor';
import {
  createSyncQueueExecution,
  createSyncWorkspaceExecution,
} from '../sync-connection/execution';
import { createSyncProductExecution } from '../sync-connection/product-execution';
import { registerOffscreenSyncMessageListener } from '../sync-connection/runtime';
import { createRuntimeMessagingTransport } from '../../platform/runtime-messaging';

vi.mock('../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/i18n')>()),
  getCurrentLocale: getCurrentLocaleMock,
  translate: translateMock,
}));

vi.mock('../../composition/persistence/secret-protection/transition.store', () => ({
  readSecretProtectionControl: vi.fn(),
}));
import { readSecretProtectionControl } from '../../composition/persistence/secret-protection/transition.store';
import type { SyncCredentialLease } from '../../contracts/messaging/contracts/runtime-message/sync-connection.types';

let documentEvents: EventTarget;
beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  vi.unstubAllGlobals();
  documentEvents = new EventTarget();
  vi.stubGlobal('addEventListener', vi.fn(documentEvents.addEventListener.bind(documentEvents)));
  mediaEvents.create.mockReturnValue({
    publishLibraryChanged: mediaEvents.publishLibraryChanged,
    dispose: mediaEvents.dispose,
  });
  vi.stubGlobal('location', {
    href: 'chrome-extension://extension/apps/extension/src/offscreen/offscreen.html',
  });
});

describe('offscreen entrypoint', () => {
  it('owns document metadata and delegates runtime startup', async () => {
    const statusText = { textContent: '' };
    vi.stubGlobal('document', {
      documentElement: { lang: 'ru' },
      getElementById: vi.fn(() => statusText),
      title: 'initial',
    });

    await import('../offscreen');

    expect(getCurrentLocaleMock).toHaveBeenCalledOnce();
    expect(translateMock).toHaveBeenCalledWith('background.runtime.offscreenDocumentTitle', 'en');
    expect(translateMock).toHaveBeenCalledWith('popup.labels.statusReady', 'en');
    expect((document as { documentElement: { lang: string } }).documentElement.lang).toBe('en');
    expect((document as { title: string }).title).toBe('background.runtime.offscreenDocumentTitle');
    expect(statusText.textContent).toBe('popup.labels.statusReady');
    expect(bootstrapOffscreenDocumentMock).toHaveBeenCalledOnce();
    expect(registerOffscreenRuntimeMessageListenerMock.mock.invocationCallOrder[0]).toBeLessThan(
      bootstrapOffscreenDocumentMock.mock.invocationCallOrder[0]!
    );
    expect(registerOffscreenVoiceInputMessageListenerMock.mock.invocationCallOrder[0]).toBeLessThan(
      bootstrapOffscreenDocumentMock.mock.invocationCallOrder[0]!
    );
    expect(registerOffscreenRuntimeMessageListenerMock).toHaveBeenCalledOnce();
    expect(registerOffscreenVoiceInputMessageListenerMock).toHaveBeenCalledOnce();
  });

  it('updates document metadata when the optional status node is missing', async () => {
    vi.stubGlobal('document', {
      documentElement: { lang: 'ru' },
      getElementById: vi.fn(() => null),
      title: 'initial',
    });

    await import('../offscreen');

    expect((document as { documentElement: { lang: string } }).documentElement.lang).toBe('en');
    expect((document as { title: string }).title).toBe('background.runtime.offscreenDocumentTitle');
  });

  it('still delegates runtime startup without document globals', async () => {
    await import('../offscreen');

    expect(getCurrentLocaleMock).not.toHaveBeenCalled();
    expect(bootstrapOffscreenDocumentMock).toHaveBeenCalledOnce();
    expect(registerOffscreenRuntimeMessageListenerMock.mock.invocationCallOrder[0]).toBeLessThan(
      bootstrapOffscreenDocumentMock.mock.invocationCallOrder[0]!
    );
    expect(registerOffscreenVoiceInputMessageListenerMock.mock.invocationCallOrder[0]).toBeLessThan(
      bootstrapOffscreenDocumentMock.mock.invocationCallOrder[0]!
    );
    expect(registerOffscreenRuntimeMessageListenerMock).toHaveBeenCalledOnce();
    expect(registerOffscreenVoiceInputMessageListenerMock).toHaveBeenCalledOnce();
  });
});

it('installs sync before READY and keeps credentials outside the permission query', async () => {
  const startup = '11111111-1111-4111-8111-111111111111';
  vi.stubGlobal('location', {
    href:
      'chrome-extension://extension/apps/extension/src/offscreen/offscreen.html?offscreenStartupId=' +
      startup,
  });
  const send = vi.fn(async (_message: unknown) => ({ success: true, allowed: true }));
  const transport = createRuntimeMessagingTransport({
    runtimeSendMessage: send,
    tabSendMessage: vi.fn(),
  });
  vi.mocked(createRuntimeMessagingTransport).mockReturnValue(transport);
  await import('../offscreen');
  expect(registerOffscreenSyncMessageListener).toHaveBeenCalledBefore(
    bootstrapOffscreenDocumentMock
  );
  const ports = vi.mocked(createSyncConnectionExecutor).mock.calls[0]?.[0];
  if (!ports) throw new Error('Sync executor was not composed.');
  const authorization = { incarnation: '22222222-2222-4222-8222-222222222222', revision: 2 };
  ports.createExecution({
    scope: { spaceId: 'space', connectionGeneration: 1, profileCreatedAt: 1 },
    authorization,
    operationId: 'operation',
    expectedRevision: 1,
    signal: new AbortController().signal,
    onProgress: () => {},
  });
  const query = vi.mocked(createSyncQueueExecution).mock.calls[0]?.[1];
  if (!query) throw new Error('Origin query was not injected.');
  expect(await query('https://dav.example')).toBe(true);
  expect(send).toHaveBeenCalledWith(
    expect.objectContaining({
      type: 'SYNC_CONNECTION_ORIGIN_PERMISSION',
      requestId: expect.any(String),
      authorization,
      origin: 'https://dav.example',
    })
  );
  send.mockResolvedValue({ success: true, allowed: false });
  expect(await query('https://dav.example')).toBe(false);
});
it('does not install a sync executor in the privacy-only document', async () => {
  const url = new URL('chrome-extension://extension/apps/extension/src/offscreen/offscreen.html');
  url.searchParams.set('offscreenStartupId', '11111111-1111-4111-8111-111111111111');
  url.searchParams.set('privacyErasure', '1');
  vi.stubGlobal('location', { href: url.href });
  await import('../offscreen');
  expect(createSyncConnectionExecutor).not.toHaveBeenCalled();
  expect(mediaEvents.create).not.toHaveBeenCalled();
  expect(registerOffscreenSyncMessageListener).not.toHaveBeenCalled();
  expect(bootstrapOffscreenDocumentMock).toHaveBeenCalledOnce();
});

it.each(['catalog-refresh', 'thumbnail-read'] as const)(
  'binds %s and workspace permission callbacks to their native identity and fails closed',
  async (kind) => {
    const id = '11111111-1111-4111-8111-111111111111';
    vi.stubGlobal('location', {
      href: `chrome-extension://extension/apps/extension/src/offscreen/offscreen.html?offscreenStartupId=${id}`,
    });
    const send = vi.fn<(message: unknown) => Promise<unknown>>();
    const original = await vi.importActual<typeof import('../../platform/runtime-messaging')>(
      '../../platform/runtime-messaging'
    );
    vi.mocked(createRuntimeMessagingTransport).mockReturnValue(
      original.createRuntimeMessagingTransport({
        runtimeSendMessage: send,
        tabSendMessage: vi.fn(),
      })
    );
    await import('../offscreen');
    const ports = vi.mocked(createSyncConnectionExecutor).mock.calls[0]?.[0];
    if (!ports?.createProductExecution) throw new Error('Product executor was not composed.');
    const authorization = { incarnation: id, revision: 2 };
    const source = { kind: 'join' as const, identity: authorization };
    ports.createProductExecution({
      scope: { spaceId: 'space', connectionGeneration: 1, profileCreatedAt: 1 },
      authorization,
      work:
        kind === 'catalog-refresh'
          ? { kind, bypassCache: false }
          : {
              kind,
              selection: {
                rootKind: 'media',
                rootId: 'root',
                operationId: 'operation',
                sourceDigest: 'a'.repeat(64),
              },
            },
      signal: new AbortController().signal,
    });
    ports.createWorkspaceExecution({
      source,
      authentication: { kind: 'bearer', accessToken: 'private-token' },
    });
    const productQuery = vi.mocked(createSyncProductExecution).mock.calls[0]?.[1];
    const workspaceQuery = vi.mocked(createSyncWorkspaceExecution).mock.calls[0]?.[1];
    if (!productQuery || !workspaceQuery) throw new Error('Permission callback was not composed.');
    for (const [query, expected] of [
      [
        productQuery,
        {
          type: 'SYNC_CONNECTION_ORIGIN_PERMISSION',
          authorization,
          ...(kind === 'thumbnail-read' ? { advisory: true } : {}),
        },
      ],
      [
        workspaceQuery,
        { type: 'SYNC_WORKSPACE_ORIGIN_PERMISSION', sourceKind: 'join', selectionIncarnation: id },
      ],
    ] as const) {
      for (const [response, allowed] of [
        [{ success: true, allowed: true }, true],
        [{ success: true, allowed: false }, false],
        [{ success: false, error: 'Sync origin permission query refused' }, false],
      ] as const) {
        send.mockResolvedValue(response);
        expect(await query('https://dav.test')).toBe(allowed);
        expect(send).toHaveBeenLastCalledWith(
          expect.objectContaining({
            ...expected,
            requestId: expect.any(String),
            origin: 'https://dav.test',
          })
        );
        expect(JSON.stringify(send.mock.lastCall?.[0])).not.toContain('private-token');
      }
      send.mockResolvedValue({ success: false, error: 'provider details' });
      await expect(query('https://dav.test')).rejects.toThrow('Invalid sync runtime contract');
    }
  }
);

it('owns one media publisher through offscreen disposal', async () => {
  const startup = '11111111-1111-4111-8111-111111111111';
  vi.stubGlobal('location', {
    href: `chrome-extension://extension/offscreen.html?offscreenStartupId=${startup}`,
  });
  await import('../offscreen');
  const ports = vi.mocked(createSyncConnectionExecutor).mock.calls[0]?.[0];
  if (!ports?.createProductExecution) throw new Error('Missing product execution factory');
  const input = {
    scope: { spaceId: 'space', connectionGeneration: 1, profileCreatedAt: 1 },
    authorization: { incarnation: startup, revision: 1 },
    work: { kind: 'catalog-refresh' as const, bypassCache: false },
    signal: new AbortController().signal,
  };
  ports.createProductExecution(input);
  ports.createProductExecution(input);
  for (const call of vi.mocked(createSyncProductExecution).mock.calls) {
    const notify = call[2];
    if (!notify) throw new Error('Missing library advisory');
    notify();
  }
  expect(mediaEvents.create).toHaveBeenCalledOnce();
  expect(mediaEvents.publishLibraryChanged.mock.calls).toEqual([
    ['sync', []],
    ['sync', []],
  ]);
  expect(mediaEvents.dispose).not.toHaveBeenCalled();
  expect(globalThis.addEventListener).toHaveBeenCalledExactlyOnceWith(
    'pagehide',
    expect.any(Function),
    { once: true }
  );
  documentEvents.dispatchEvent(new Event('pagehide'));
  documentEvents.dispatchEvent(new Event('pagehide'));
  expect(mediaEvents.dispose).toHaveBeenCalledOnce();
});

const credentialLease: SyncCredentialLease = {
  leaseId: '11111111-1111-4111-8111-111111111111',
  workerEpoch: '22222222-2222-4222-8222-222222222222',
  protectionEpoch: 3,
  offscreenStartupId: '33333333-3333-4333-8333-333333333333',
  executorId: '44444444-4444-4444-8444-444444444444',
  credentialId: '55555555-5555-4555-8555-555555555555',
  authorization: { incarnation: '66666666-6666-4666-8666-666666666666', revision: 2 },
};
const replacementId = '77777777-7777-4777-8777-777777777777';

async function credentialEntryFixture(kind: 'queue' | 'product', lease?: SyncCredentialLease) {
  vi.stubGlobal('location', {
    href: `chrome-extension://extension/offscreen.html?offscreenStartupId=${credentialLease.offscreenStartupId}`,
  });
  const send = vi.fn<(message: unknown) => Promise<unknown>>();
  const original = await vi.importActual<typeof import('../../platform/runtime-messaging')>(
    '../../platform/runtime-messaging'
  );
  vi.mocked(createRuntimeMessagingTransport).mockReturnValue(
    original.createRuntimeMessagingTransport({ runtimeSendMessage: send, tabSendMessage: vi.fn() })
  );
  await import('../offscreen');
  const ports = vi.mocked(createSyncConnectionExecutor).mock.calls[0]?.[0];
  if (!ports?.createProductExecution) throw new Error('Missing sync execution ports');
  const common = {
    scope: { spaceId: 'space', connectionGeneration: 1, profileCreatedAt: 1 },
    authorization: credentialLease.authorization,
    ...(lease ? { credentialLease: lease } : {}),
    signal: new AbortController().signal,
  };
  if (kind === 'queue') {
    ports.createExecution({
      ...common,
      operationId: 'operation',
      expectedRevision: 1,
      onProgress: () => {},
    });
  } else {
    ports.createProductExecution({
      ...common,
      work: { kind: 'catalog-refresh', bypassCache: false },
    });
  }
  const access =
    kind === 'queue'
      ? vi.mocked(createSyncQueueExecution).mock.calls[0]?.[2]
      : vi.mocked(createSyncProductExecution).mock.calls[0]?.[6];
  const permission =
    kind === 'queue'
      ? vi.mocked(createSyncQueueExecution).mock.calls[0]?.[1]
      : vi.mocked(createSyncProductExecution).mock.calls[0]?.[1];
  if (!access || !permission) throw new Error('Missing credential admission callbacks');
  return { send, access, permission };
}

it.each(['queue', 'product'] as const)(
  'resolves %s credentials only through the exact delivered lease and current protection epoch',
  async (kind) => {
    const f = await credentialEntryFixture(kind, credentialLease);
    const authentication = { kind: 'bearer', accessToken: 'private-token' };
    f.send.mockResolvedValue({ success: true, authentication, credentialLease });
    expect(await f.access.resolveAuthentication()).toEqual(authentication);
    expect(f.send).toHaveBeenLastCalledWith(
      expect.objectContaining({
        type: 'SYNC_CONNECTION_CREDENTIAL',
        requestId: expect.any(String),
        credentialLease,
      })
    );
    expect(JSON.stringify(f.send.mock.lastCall?.[0])).not.toContain('private-token');
    const control = {
      version: 1 as const,
      epoch: credentialLease.protectionEpoch,
      phase: 'stable' as const,
      participants: { ai: false, webdav: null },
    };
    for (const [value, accepted] of [
      [control, true],
      [{ ...control, epoch: control.epoch + 1 }, false],
      [{ ...control, phase: 'transitioning' as const }, false],
    ] as const) {
      vi.mocked(readSecretProtectionControl).mockResolvedValue(value);
      expect(await f.access.checkProtection()).toBe(accepted);
    }
    vi.mocked(readSecretProtectionControl).mockRejectedValue(new Error('Native read unavailable'));
    await expect(f.access.checkProtection()).rejects.toThrow('Native read unavailable');
    f.send.mockResolvedValue({ success: true, allowed: false, reason: 'secrets-locked' });
    await expect(f.permission('https://dav.test')).rejects.toMatchObject({
      code: 'secrets-locked',
    });
    expect(f.send).toHaveBeenLastCalledWith(
      expect.objectContaining({ credentialLease, authorization: credentialLease.authorization })
    );
  }
);

it.each(['queue', 'product'] as const)(
  'refuses %s credential access without a lease before messaging or native reads',
  async (kind) => {
    const f = await credentialEntryFixture(kind);
    await expect(f.access.resolveAuthentication()).rejects.toThrow('Sync credential query refused');
    expect(await f.access.checkProtection()).toBe(false);
    expect(f.send).not.toHaveBeenCalled();
    expect(readSecretProtectionControl).not.toHaveBeenCalled();
  }
);

it('refuses every replaced lease identity field even when delivery passes the real parser', async () => {
  const f = await credentialEntryFixture('queue', credentialLease);
  const replacements: SyncCredentialLease[] = [
    { ...credentialLease, leaseId: replacementId },
    { ...credentialLease, workerEpoch: replacementId },
    { ...credentialLease, protectionEpoch: credentialLease.protectionEpoch + 1 },
    { ...credentialLease, offscreenStartupId: replacementId },
    { ...credentialLease, executorId: replacementId },
    { ...credentialLease, credentialId: replacementId },
    {
      ...credentialLease,
      authorization: { ...credentialLease.authorization, incarnation: replacementId },
    },
    { ...credentialLease, authorization: { ...credentialLease.authorization, revision: 3 } },
  ];
  for (const delivered of replacements) {
    f.send.mockResolvedValue({
      success: true,
      authentication: { kind: 'bearer', accessToken: 'private-token' },
      credentialLease: delivered,
    });
    await expect(f.access.resolveAuthentication()).rejects.toThrow('Sync credential query refused');
  }
});

it('preserves locked, refused, malformed and transport failures at credential delivery', async () => {
  const f = await credentialEntryFixture('product', credentialLease);
  f.send.mockResolvedValue({ success: false, error: 'secrets-locked' });
  await expect(f.access.resolveAuthentication()).rejects.toMatchObject({ code: 'secrets-locked' });
  f.send.mockResolvedValue({ success: false, error: 'Sync credential query refused' });
  await expect(f.access.resolveAuthentication()).rejects.toThrow('Sync credential query refused');
  for (const response of [
    null,
    { success: true, authentication: { kind: 'bearer', accessToken: 'private-token' } },
    { success: true, authentication: { kind: 'bearer', accessToken: '' }, credentialLease },
    {
      success: true,
      authentication: { kind: 'bearer', accessToken: 'private-token' },
      credentialLease: { ...credentialLease, leaseId: 'malformed' },
    },
    { success: false, error: 'raw-provider-detail' },
  ]) {
    f.send.mockResolvedValue(response);
    await expect(f.access.resolveAuthentication()).rejects.toThrow('Invalid sync runtime contract');
  }
  f.send.mockRejectedValue(new Error('Runtime disconnected'));
  await expect(f.access.resolveAuthentication()).rejects.toThrow('Runtime disconnected');
});
