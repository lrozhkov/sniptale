import { createSyncConnectionCoordinator } from './coordinator';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type { SyncProductCommand } from '../../contracts/messaging/contracts/runtime-message/sync-connection.types';
import { parseSyncProductResponse } from '../../contracts/messaging/contracts/runtime/sync-product';
import {
  configureSyncProductRoute,
  isSyncProductSenderAllowed,
  routeSyncProductCommand,
} from './product-route';
const checkpoints = vi.hoisted(() => ({
  read: vi.fn(),
  interval: vi.fn(),
  flush: vi.fn(),
  exit: vi.fn(),
}));
vi.mock('../../composition/persistence/sync-capture/checkpoint-commands', () => ({
  readSyncCheckpointInterval: checkpoints.read,
  updateSyncCheckpointInterval: checkpoints.interval,
  requestSyncCheckpointFlush: checkpoints.flush,
  requestSyncCheckpointExit: checkpoints.exit,
}));
const cache = vi.hoisted(() => ({ status: vi.fn(), root: vi.fn(), budget: vi.fn(), pin: vi.fn() }));
vi.mock('../../workflows/sync-transfer/native-cache-policy', () => ({
  readNativeCacheStatus: cache.status,
}));
vi.mock('../../workflows/sync-transfer/native-cache', () => ({
  readNativeCacheRootStatus: cache.root,
  setNativeCacheBudget: cache.budget,
  setNativeCacheRootPinned: cache.pin,
}));
const nativeStatus = vi.hoisted(() => ({ connection: vi.fn(), workspace: vi.fn() }));
vi.mock('../../composition/persistence/remote-connection/store', () => ({
  loadSyncConnection: nativeStatus.connection,
}));
vi.mock('../../composition/persistence/remote-connection/workspace-selection', () => ({
  loadSyncWorkspaceSelection: nativeStatus.workspace,
}));
beforeEach(() => {
  nativeStatus.connection.mockResolvedValue(null);
  nativeStatus.workspace.mockResolvedValue(null);
});
vi.mock('@sniptale/platform/browser/runtime', async (original) => ({
  ...(await original<typeof import('@sniptale/platform/browser/runtime')>()),
  runtimeInfo: { getURL: (path: string) => `chrome-extension://test/${path}` },
}));
const settings = {
  url: 'chrome-extension://test/apps/extension/src/settings/index.html',
  frameId: 0,
};
const gallery = {
  url: 'chrome-extension://test/apps/extension/src/gallery/index.html',
  frameId: 0,
};
describe('sync product document authority', () => {
  it('admits only Settings connection verbs and Gallery transfer verbs', () => {
    const create = {
      kind: 'workspace-create' as const,
      parentUrl: 'https://dav.test/root/',
      accountId: 'alice',
      authentication: { kind: 'bearer' as const, accessToken: 'private' },
    };
    expect(isSyncProductSenderAllowed(create, settings)).toBe(true);
    expect(isSyncProductSenderAllowed(create, gallery)).toBe(false);
    expect(
      isSyncProductSenderAllowed({ kind: 'catalog-refresh', bypassCache: false }, gallery)
    ).toBe(true);
    expect(
      isSyncProductSenderAllowed({ kind: 'catalog-refresh', bypassCache: false }, settings)
    ).toBe(true);
    expect(
      isSyncProductSenderAllowed(
        {
          kind: 'replica-prepare',
          selection: {
            rootKind: 'media',
            rootId: 'id',
            operationId: 'op',
            sourceDigest: 'a'.repeat(64),
          },
        },
        settings
      )
    ).toBe(false);
    for (const sender of [
      { url: 'https://host.test' },
      { ...gallery, frameId: 1 },
      { ...settings, url: `${settings.url}?aiUnlock=1` },
    ])
      expect(isSyncProductSenderAllowed({ kind: 'status' }, sender)).toBe(false);
  });
  it('refuses unconfigured release ingress without dispatching a product command', () => {
    const response = vi.fn();
    expect(
      routeSyncProductCommand(
        {
          type: MessageType.SYNC_PRODUCT_COMMAND,
          requestId: '11111111-1111-4111-8111-111111111111',
          command: { kind: 'status' },
        },
        settings,
        response,
        null
      )
    ).toBe(true);
    expect(response).toHaveBeenCalledWith({
      success: false,
      error: 'Sync product command refused',
    });
  });
});

it('forwards abandonment and consumer identity without duplicate observation', async () => {
  const source = {
    kind: 'allocation' as const,
    identity: { incarnation: '11111111-1111-4111-8111-111111111111', revision: 2 },
  };
  const command = { kind: 'workspace-abandon' as const, source };
  expect(isSyncProductSenderAllowed(command, settings)).toBe(true);
  for (const sender of [
    gallery,
    { url: 'https://host.test' },
    { ...settings, frameId: 1 },
    { ...settings, url: `${settings.url}?aiUnlock=1` },
  ])
    expect(isSyncProductSenderAllowed(command, sender)).toBe(false);
  const revokeWorkspace = vi.fn(async () => undefined);
  const coordinator = createSyncConnectionCoordinator({
    loadConnection: async () => null,
    loadWorkspace: async () => ({
      source,
      bindingKey: 'native-selection',
      rootUrl: 'https://dav.test/root/',
      accountId: 'alice',
      createdAt: 1,
      phase: 'allocating',
    }),
    revokeWorkspace,
    hasOriginPermission: async () => {
      throw new Error('Abandonment must not query a remote origin');
    },
    enrollConnection: async () => {
      throw new Error('Abandonment must not enroll');
    },
    revokeConnection: async () => {
      throw new Error('Abandonment must not revoke an enrolled connection');
    },
    ensureDocument: async () => {
      throw new Error('Abandonment must not create an executor');
    },
    inspectExecutor: async () => ({ kind: 'absent' }),
    startExecutor: async () => {
      throw new Error('Abandonment must not start outgoing work');
    },
    stopExecutor: async () => {
      throw new Error('No executor is present');
    },
    startWorkspaceExecutor: async () => {
      throw new Error('Abandonment must not start workspace IO');
    },
    createChallenge: () => '22222222-2222-4222-8222-222222222222',
  });
  let respond!: (value: unknown) => void;
  const response = new Promise<unknown>((resolve) => {
    respond = resolve;
  });
  expect(
    routeSyncProductCommand(
      {
        type: MessageType.SYNC_PRODUCT_COMMAND,
        requestId: '33333333-3333-4333-8333-333333333333',
        command,
      },
      settings,
      respond,
      coordinator
    )
  ).toBe(true);
  await expect(response).resolves.toEqual({
    success: true,
    result: { kind: 'cancelled', outcome: 'cancelled' },
  });
  expect(revokeWorkspace).toHaveBeenCalledExactlyOnceWith(source);
  const inspect = vi.spyOn(coordinator, 'inspect');
  const productCommand = vi.spyOn(coordinator, 'productCommand').mockResolvedValue({
    success: true,
    result: { kind: 'operation', job: null, completion: null },
  });
  for (const [sender, consumer] of [
    [settings, 'settings'],
    [gallery, 'gallery'],
  ] as const) {
    let complete!: (value: unknown) => void;
    const answer = new Promise<unknown>((resolve) => {
      complete = resolve;
    });
    const selectedRequestId = '44444444-4444-4444-8444-444444444444';
    routeSyncProductCommand(
      {
        type: MessageType.SYNC_PRODUCT_COMMAND,
        requestId: '55555555-5555-4555-8555-555555555555',
        command: { kind: 'inspect', requestId: selectedRequestId },
      },
      sender,
      complete,
      coordinator
    );
    await expect(answer).resolves.toMatchObject({ success: true });
    expect(productCommand).toHaveBeenLastCalledWith(
      selectedRequestId,
      { kind: 'inspect', requestId: selectedRequestId },
      consumer
    );
  }
  expect(inspect).not.toHaveBeenCalled();
});

const routeRequestId = '66666666-6666-4666-8666-666666666666';
const routeSource = {
  kind: 'allocation' as const,
  identity: { incarnation: routeRequestId, revision: 1 },
};
const routeAuthentication = { kind: 'bearer' as const, accessToken: 'private-token' };

function routeCoordinator() {
  const unavailable = async (): Promise<never> => {
    throw new Error('Unexpected native side effect');
  };
  const coordinator = createSyncConnectionCoordinator({
    loadConnection: async () => null,
    loadWorkspace: async () => null,
    revokeWorkspace: unavailable,
    hasOriginPermission: async () => false,
    enrollConnection: unavailable,
    revokeConnection: unavailable,
    ensureDocument: unavailable,
    inspectExecutor: async () => ({ kind: 'absent' }),
    startExecutor: unavailable,
    stopExecutor: unavailable,
    startWorkspaceExecutor: unavailable,
    createChallenge: () => routeRequestId,
  });
  return coordinator;
}

function productAnswer(
  coordinator: ReturnType<typeof createSyncConnectionCoordinator>,
  command: SyncProductCommand,
  sender: chrome.runtime.MessageSender = settings
) {
  return new Promise<unknown>((resolve) => {
    expect(
      routeSyncProductCommand(
        { type: MessageType.SYNC_PRODUCT_COMMAND, requestId: routeRequestId, command },
        sender,
        resolve,
        coordinator
      )
    ).toBe(true);
  });
}

it.each(['workspace-create', 'workspace-discover'] as const)(
  'starts %s with the planned native source and returns only acceptance',
  async (kind) => {
    const coordinator = routeCoordinator();
    const plan = vi.spyOn(coordinator, 'planWorkspace').mockResolvedValue(routeSource);
    const start = vi.spyOn(coordinator, 'startWorkspace').mockResolvedValue({
      executorId: routeRequestId,
      executorRevision: 1,
    });
    const endpoint = 'https://dav.test/root/';
    const command =
      kind === 'workspace-create'
        ? { kind, parentUrl: endpoint, accountId: 'alice', authentication: routeAuthentication }
        : {
            kind,
            rootUrl: endpoint,
            accountId: 'alice',
            authentication: routeAuthentication,
            previous: null,
          };
    await expect(productAnswer(coordinator, command)).resolves.toEqual({
      success: true,
      result: { kind: 'accepted', requestId: routeRequestId },
    });
    expect(plan).toHaveBeenCalledExactlyOnceWith(
      kind === 'workspace-create'
        ? { kind: 'allocation', parentUrl: endpoint, accountId: 'alice' }
        : { kind: 'join', rootUrl: endpoint, accountId: 'alice', previous: null }
    );
    expect(start).toHaveBeenCalledExactlyOnceWith({
      source: routeSource,
      authentication: routeAuthentication,
      requestId: routeRequestId,
      ...(kind === 'workspace-discover' ? { operation: 'discover' } : {}),
    });
    expect(plan).toHaveBeenCalledBefore(start);
  }
);

it('retries the exact selected source and enrolls without creating another workspace', async () => {
  const coordinator = routeCoordinator();
  const plan = vi.spyOn(coordinator, 'planWorkspace');
  const start = vi.spyOn(coordinator, 'startWorkspace').mockResolvedValue({
    executorId: routeRequestId,
    executorRevision: 1,
  });
  const enrollment = {
    version: 1 as const,
    kind: 'sync-connection' as const,
    key: 'connection' as const,
    binding: {
      provider: 'webdav' as const,
      rootUrl: 'https://dav.test/root/',
      accountId: 'alice',
      spaceId: 'space',
      profileCreatedAt: 1,
      connectionGeneration: 1,
    },
    identity: routeSource.identity,
    phase: 'active' as const,
    updateNonce: null,
    credentialId: 'private-credential-reference',
  };
  const enroll = vi.spyOn(coordinator, 'enrollWorkspace').mockResolvedValue(enrollment);
  await expect(
    productAnswer(coordinator, {
      kind: 'workspace-retry',
      source: routeSource,
      authentication: routeAuthentication,
    })
  ).resolves.toEqual({ success: true, result: { kind: 'accepted', requestId: routeRequestId } });
  expect(start).toHaveBeenCalledExactlyOnceWith({
    source: routeSource,
    authentication: routeAuthentication,
    requestId: routeRequestId,
  });
  await expect(
    productAnswer(coordinator, {
      kind: 'workspace-enroll',
      storagePolicy: { version: 1, mode: 'on-demand' },
      source: routeSource,
      authentication: routeAuthentication,
    })
  ).resolves.toEqual({ success: true, result: { kind: 'enrolled' } });
  expect(enroll).toHaveBeenCalledExactlyOnceWith({
    storagePolicy: { version: 1, mode: 'on-demand' },
    source: routeSource,
    authentication: routeAuthentication,
  });
  expect(plan).not.toHaveBeenCalled();
});

it('projects native status into the exact credential-free response contract', async () => {
  const coordinator = routeCoordinator();
  const inspect = vi.spyOn(coordinator, 'inspect').mockResolvedValue(null);
  const empty = { connection: null, workspace: null, products: [], workspaceJob: null };
  await expect(productAnswer(coordinator, { kind: 'status' })).resolves.toEqual({
    success: true,
    result: { kind: 'status', status: empty },
  });
  const expected = { incarnation: routeRequestId, revision: 1 };
  const connection = {
    expected,
    phase: 'paused',
    rootUrl: 'https://dav.test/root/',
    accountId: 'alice',
  };
  const workspace = {
    rootUrl: connection.rootUrl,
    accountId: connection.accountId,
    phase: 'ready',
    source: routeSource,
  };
  const workspaceJob = {
    requestId: routeRequestId,
    sourceKind: 'allocation' as const,
    selectionIncarnation: routeRequestId,
    selectionRevision: 1,
    state: 'ready' as const,
    failureCode: null,
  };
  nativeStatus.connection.mockResolvedValue({
    phase: connection.phase,
    identity: expected,
    binding: connection,
    credentialId: 'private-reference',
  });
  nativeStatus.workspace.mockResolvedValue({ ...workspace, privateDetail: 'private' });
  inspect.mockResolvedValue({
    offscreenStartupId: routeRequestId,
    executorId: routeRequestId,
    executorRevision: 1,
    phase: 'idle',
    binding: null,
    jobs: [],
    workspace: workspaceJob,
  });
  const response = await productAnswer(coordinator, { kind: 'status' }, gallery);
  expect(response).toEqual({
    success: true,
    result: { kind: 'status', status: { connection, workspace, workspaceJob, products: [] } },
  });
  expect(parseSyncProductResponse(response)).toEqual(response);
});

it.each(['refused', 'rejected'] as const)(
  'returns a generic error when product work is %s',
  async (mode) => {
    const coordinator = routeCoordinator();
    const dispatch = vi.spyOn(coordinator, 'productCommand');
    if (mode === 'refused') dispatch.mockResolvedValue({ success: false, error: 'private detail' });
    else dispatch.mockRejectedValue(new Error('private provider body'));
    await expect(
      productAnswer(coordinator, { kind: 'catalog-refresh', bypassCache: true }, gallery)
    ).resolves.toEqual({ success: false, error: 'Sync product command refused' });
    expect(dispatch).toHaveBeenCalledExactlyOnceWith(
      routeRequestId,
      { kind: 'catalog-refresh', bypassCache: true },
      'gallery'
    );
  }
);

it('rejects malformed or unauthorized ingress before coordinator effects', () => {
  const coordinator = routeCoordinator();
  const plan = vi.spyOn(coordinator, 'planWorkspace');
  const response = vi.fn();
  expect(
    routeSyncProductCommand(
      { type: MessageType.SYNC_PRODUCT_COMMAND },
      settings,
      response,
      coordinator
    )
  ).toBe(false);
  expect(response).not.toHaveBeenCalled();
  const command = {
    kind: 'workspace-create',
    parentUrl: 'https://dav.test/root/',
    accountId: 'alice',
    authentication: routeAuthentication,
  };
  expect(
    routeSyncProductCommand(
      { type: MessageType.SYNC_PRODUCT_COMMAND, requestId: routeRequestId, command },
      gallery,
      response,
      coordinator
    )
  ).toBe(true);
  expect(response).toHaveBeenCalledExactlyOnceWith({
    success: false,
    error: 'Sync product command refused',
  });
  expect(plan).not.toHaveBeenCalled();
  expect(
    isSyncProductSenderAllowed({ kind: 'status' }, { ...settings, documentLifecycle: 'cached' })
  ).toBe(false);
});

it('restricts version decisions to the exact Gallery document', () => {
  const command: SyncProductCommand = {
    kind: 'conflict-resolve',
    resolutionId: '11111111-1111-4111-8111-111111111111',
    expectedHeads: ['first', 'second'],
    selection: {
      rootKind: 'media',
      rootId: 'root',
      operationId: 'first',
      sourceDigest: 'a'.repeat(64),
    },
  };
  expect(isSyncProductSenderAllowed(command, gallery)).toBe(true);
  expect(isSyncProductSenderAllowed(command, settings)).toBe(false);
  expect(isSyncProductSenderAllowed(command, { ...gallery, frameId: 1 })).toBe(false);
  expect(
    isSyncProductSenderAllowed(command, { ...gallery, documentLifecycle: 'prerender' as const })
  ).toBe(false);
});

it('wakes initial capture only after committed enrollment and contains a missed advisory notification', async () => {
  const coordinator = routeCoordinator();
  const enroll = vi.spyOn(coordinator, 'enrollWorkspace').mockResolvedValue({} as never);
  const wake = vi.fn(() => {
    throw new Error('Advisory transport unavailable');
  });
  configureSyncProductRoute(coordinator, wake);
  const command = {
    kind: 'workspace-enroll' as const,
    storagePolicy: { version: 1 as const, mode: 'on-demand' as const },
    source: routeSource,
    authentication: routeAuthentication,
  };
  await expect(productAnswer(coordinator, command)).resolves.toEqual({
    success: true,
    result: { kind: 'enrolled' },
  });
  expect(enroll).toHaveBeenCalledBefore(wake);
  expect(wake).toHaveBeenCalledOnce();
  enroll.mockRejectedValueOnce(new Error('Native enrollment refused'));
  await expect(productAnswer(coordinator, command)).resolves.toMatchObject({ success: false });
  expect(wake).toHaveBeenCalledOnce();
});

it('allows editor preparation and observation but refuses connection and remote commands', () => {
  for (const page of ['editor', 'video-editor', 'scenario-editor']) {
    const sender = {
      url: `chrome-extension://test/apps/extension/src/${page}/index.html`,
      frameId: 0,
    };
    expect(
      isSyncProductSenderAllowed(
        { kind: 'native-prepare', root: { rootKind: 'media', rootId: 'asset' } },
        sender
      )
    ).toBe(true);
    expect(isSyncProductSenderAllowed({ kind: 'inspect', requestId: 'job' }, sender)).toBe(true);
    expect(
      isSyncProductSenderAllowed({ kind: 'catalog-refresh', bypassCache: false }, sender)
    ).toBe(false);
    expect(isSyncProductSenderAllowed({ kind: 'status' }, sender)).toBe(false);
    expect(
      isSyncProductSenderAllowed(
        { kind: 'native-prepare', root: { rootKind: 'media', rootId: 'asset' } },
        { ...sender, frameId: 1 }
      )
    ).toBe(false);
  }
  expect(
    isSyncProductSenderAllowed(
      { kind: 'native-prepare', root: { rootKind: 'media', rootId: 'asset' } },
      settings
    )
  ).toBe(false);
});

it('restricts cache effects to their exact Settings or Gallery owner', () => {
  const root = { rootKind: 'media' as const, rootId: 'asset' };
  const editor = {
    url: 'chrome-extension://test/apps/extension/src/editor/index.html',
    frameId: 0,
  };
  const commands: SyncProductCommand[] = [
    { kind: 'cache-status' },
    { kind: 'cache-budget', budgetBytes: 0, revision: 0 },
    { kind: 'cache-trim' },
    { kind: 'cache-root-status', root },
    { kind: 'cache-pin', root, pinned: true },
    { kind: 'native-release', root },
  ];
  for (const command of commands) {
    expect(isSyncProductSenderAllowed(command, settings)).toBe(
      ['cache-status', 'cache-budget', 'cache-trim'].includes(command.kind)
    );
    expect(isSyncProductSenderAllowed(command, gallery)).toBe(
      ['cache-status', 'cache-root-status', 'cache-pin', 'native-release'].includes(command.kind)
    );
    for (const sender of [
      editor,
      { ...gallery, frameId: 1 },
      { ...settings, documentLifecycle: 'prerender' as const },
      { url: 'https://untrusted.test/' },
    ])
      expect(isSyncProductSenderAllowed(command, sender)).toBe(false);
  }
});
it('persists a pin before preparation and performs local-ready pin/unpin without starting remote work', async () => {
  const coordinator = routeCoordinator();
  const product = vi
    .spyOn(coordinator, 'productCommand')
    .mockResolvedValue({ success: true, result: { kind: 'accepted', requestId: routeRequestId } });
  const root = { rootKind: 'media' as const, rootId: 'asset' };
  const status = { root, configured: true, pinned: true, ready: true, releaseAllowed: true };
  cache.pin.mockResolvedValue(undefined);
  cache.root.mockResolvedValue(status);
  await expect(
    productAnswer(coordinator, { kind: 'cache-pin', root, pinned: true }, gallery)
  ).resolves.toEqual({ success: true, result: { kind: 'cache-root', status } });
  expect(cache.pin).toHaveBeenLastCalledWith(root, true);
  expect(cache.pin).toHaveBeenCalledBefore(cache.root);
  expect(product).not.toHaveBeenCalled();
  cache.root.mockResolvedValue({ ...status, ready: false });
  await expect(
    productAnswer(coordinator, { kind: 'cache-pin', root, pinned: true }, gallery)
  ).resolves.toEqual({ success: true, result: { kind: 'accepted', requestId: routeRequestId } });
  expect(product).toHaveBeenCalledExactlyOnceWith(
    routeRequestId,
    { kind: 'native-prepare', root },
    'gallery'
  );
  product.mockClear();
  cache.root.mockResolvedValue({ ...status, pinned: false, ready: false });
  await expect(
    productAnswer(coordinator, { kind: 'cache-pin', root, pinned: false }, gallery)
  ).resolves.toMatchObject({
    success: true,
    result: { kind: 'cache-root', status: { pinned: false } },
  });
  expect(product).not.toHaveBeenCalled();
});
it('keeps pin intent when missing-byte preparation is refused and does not report offline success', async () => {
  const coordinator = routeCoordinator();
  const root = { rootKind: 'media' as const, rootId: 'asset' };
  cache.pin.mockResolvedValue(undefined);
  cache.root.mockResolvedValue({
    root,
    configured: true,
    pinned: true,
    ready: false,
    releaseAllowed: true,
  });
  vi.spyOn(coordinator, 'productCommand').mockRejectedValue(new Error('Executor unavailable'));
  await expect(
    productAnswer(coordinator, { kind: 'cache-pin', root, pinned: true }, gallery)
  ).resolves.toEqual({ success: false, error: 'Sync product command refused' });
  expect(cache.pin).toHaveBeenLastCalledWith(root, true);
});

it('admits only exact owned product pages for backup byte preparation', () => {
  const command = {
    kind: 'backup-prepare' as const,
    root: { rootKind: 'video-project' as const, rootId: 'project' },
  };
  expect(isSyncProductSenderAllowed(command, settings)).toBe(true);
  expect(isSyncProductSenderAllowed(command, gallery)).toBe(true);
  for (const sender of [
    { ...settings, frameId: 1 },
    { ...gallery, documentLifecycle: 'prerender' as const },
    { url: 'https://untrusted.test/' },
  ])
    expect(isSyncProductSenderAllowed(command, sender)).toBe(false);
});

it('admits local-only retirement only from the ordinary top-level Settings document', () => {
  const command: SyncProductCommand = {
    kind: 'connection-local-only',
    expected: { incarnation: '10000000-0000-4000-8000-000000000001', revision: 1 },
  };
  expect(isSyncProductSenderAllowed(command, settings)).toBe(true);
  for (const sender of [
    gallery,
    { ...settings, frameId: 1 },
    { ...settings, documentLifecycle: 'prerender' as const },
  ])
    expect(isSyncProductSenderAllowed(command, sender)).toBe(false);
});

it('allows Settings to prepare an absent catalog root only with native-preservation admission', () => {
  const selection = {
    rootKind: 'video-project' as const,
    rootId: 'project',
    operationId: 'op',
    sourceDigest: 'a'.repeat(64),
  };
  expect(
    isSyncProductSenderAllowed(
      { kind: 'replica-prepare', selection, preserveNative: true },
      settings
    )
  ).toBe(true);
  expect(isSyncProductSenderAllowed({ kind: 'replica-prepare', selection }, settings)).toBe(false);
});

it('preserves a shared locked command refusal through the product boundary', async () => {
  const { SecretProtectionLockedError } =
    await import('../../composition/persistence/secret-protection/model');
  const coordinator = routeCoordinator();
  vi.spyOn(coordinator, 'productCommand').mockRejectedValueOnce(new SecretProtectionLockedError());
  const response = await productAnswer(coordinator, {
    kind: 'catalog-refresh',
    bypassCache: false,
  });
  expect(response).toEqual({ success: false, error: 'secrets-locked' });
  expect(parseSyncProductResponse(response)).toEqual(response);
});

describe('checkpoint product admission', () => {
  it('restricts local policy and flush commands to ordinary Settings', () => {
    for (const command of [
      { kind: 'checkpoint-policy' },
      { kind: 'checkpoint-flush' },
      { kind: 'checkpoint-interval', intervalMs: 300000 },
    ] satisfies SyncProductCommand[]) {
      expect(isSyncProductSenderAllowed(command, settings)).toBe(true);
      for (const sender of [
        gallery,
        { url: 'https://host.test' },
        { ...settings, frameId: 1 },
        { ...settings, url: `${settings.url}?aiUnlock=1` },
      ])
        expect(isSyncProductSenderAllowed(command, sender)).toBe(false);
    }
  });
  it('uses current native scope and identity, then wakes only after the durable command', async () => {
    const coordinator = routeCoordinator();
    const binding = { spaceId: 'space', profileCreatedAt: 1, connectionGeneration: 1 };
    const identity = { incarnation: routeRequestId, revision: 1 };
    nativeStatus.connection.mockResolvedValue({ binding, identity });
    checkpoints.read.mockResolvedValue(300000);
    checkpoints.interval.mockResolvedValue({ intervalMs: 60000, updated: 2 });
    checkpoints.flush.mockResolvedValue({ updated: 2, alreadyDue: 1 });
    const wake = vi.fn(() => {
      throw new Error('Missed advisory wakeup');
    });
    configureSyncProductRoute(coordinator, wake);
    await expect(productAnswer(coordinator, { kind: 'checkpoint-policy' })).resolves.toEqual({
      success: true,
      result: { kind: 'checkpoint-policy', intervalMs: 300000 },
    });
    expect(checkpoints.read).toHaveBeenLastCalledWith(binding);
    expect(wake).not.toHaveBeenCalled();
    await expect(
      productAnswer(coordinator, { kind: 'checkpoint-interval', intervalMs: 60000 })
    ).resolves.toEqual({ success: true, result: { kind: 'checkpoint-policy', intervalMs: 60000 } });
    expect(checkpoints.interval).toHaveBeenLastCalledWith(binding, 60000);
    await expect(productAnswer(coordinator, { kind: 'checkpoint-flush' })).resolves.toEqual({
      success: true,
      result: { kind: 'checkpoint-flushed', updated: 2, alreadyDue: 1 },
    });
    expect(checkpoints.flush).toHaveBeenLastCalledWith(binding, identity);
    expect(wake).toHaveBeenCalledTimes(2);
    checkpoints.flush.mockRejectedValueOnce(new Error('Native admission refused'));
    await expect(productAnswer(coordinator, { kind: 'checkpoint-flush' })).resolves.toEqual({
      success: false,
      error: 'Sync product command refused',
    });
    expect(wake).toHaveBeenCalledTimes(2);
    nativeStatus.connection.mockResolvedValue(null);
    await expect(productAnswer(coordinator, { kind: 'checkpoint-flush' })).resolves.toEqual({
      success: false,
      error: 'Sync product command refused',
    });
  });
});

describe('due-only checkpoint wake admission', () => {
  const command = { kind: 'checkpoint-wake' } as const;
  it('admits only active top-level product documents', () => {
    for (const sender of [
      settings,
      gallery,
      ...['editor', 'scenario-editor', 'video-editor'].map((page) => ({
        url: `chrome-extension://test/apps/extension/src/${page}/index.html`,
        frameId: 0,
      })),
    ]) {
      expect(isSyncProductSenderAllowed(command, sender)).toBe(true);
      expect(isSyncProductSenderAllowed(command, { ...sender, frameId: 1 })).toBe(false);
      expect(isSyncProductSenderAllowed(command, { ...sender, documentLifecycle: 'cached' })).toBe(
        false
      );
      expect(isSyncProductSenderAllowed(command, { url: sender.url })).toBe(false);
    }
    for (const sender of [
      { url: 'https://host.test', frameId: 0 },
      { ...settings, url: `${settings.url}?aiUnlock=1` },
      { ...gallery, url: gallery.url.replace('//test/', '//other/') },
      { frameId: 0 },
    ])
      expect(isSyncProductSenderAllowed(command, sender)).toBe(false);
  });
  it('only requests the configured retry wake without native policy or product execution', async () => {
    const coordinator = routeCoordinator();
    const product = vi.spyOn(coordinator, 'productCommand');
    const wake = vi.fn();
    configureSyncProductRoute(coordinator, wake);
    nativeStatus.connection.mockClear();
    checkpoints.read.mockClear();
    checkpoints.interval.mockClear();
    checkpoints.flush.mockClear();
    await expect(productAnswer(coordinator, command, gallery)).resolves.toEqual({
      success: true,
      result: { kind: 'checkpoint-woken' },
    });
    expect(wake).toHaveBeenCalledOnce();
    expect(nativeStatus.connection).not.toHaveBeenCalled();
    expect(checkpoints.read).not.toHaveBeenCalled();
    expect(checkpoints.interval).not.toHaveBeenCalled();
    expect(checkpoints.flush).not.toHaveBeenCalled();
    expect(product).not.toHaveBeenCalled();
  });
  it('does not wake a replacement coordinator and preserves alarm recovery after missed callbacks', async () => {
    const previous = routeCoordinator();
    const current = routeCoordinator();
    const wake = vi.fn(() => {
      throw new Error('Missed wake');
    });
    configureSyncProductRoute(current, wake);
    await expect(productAnswer(previous, command)).resolves.toEqual({
      success: true,
      result: { kind: 'checkpoint-woken' },
    });
    expect(wake).not.toHaveBeenCalled();
    await expect(productAnswer(current, command)).resolves.toEqual({
      success: true,
      result: { kind: 'checkpoint-woken' },
    });
    expect(wake).toHaveBeenCalledOnce();
    configureSyncProductRoute(current);
    await expect(productAnswer(current, command)).resolves.toEqual({
      success: true,
      result: { kind: 'checkpoint-woken' },
    });
  });
});

it('refuses an unconfigured checkpoint wake without claiming publication or starting work', () => {
  const response = vi.fn();
  expect(
    routeSyncProductCommand(
      {
        type: MessageType.SYNC_PRODUCT_COMMAND,
        requestId: routeRequestId,
        command: { kind: 'checkpoint-wake' },
      },
      settings,
      response,
      null
    )
  ).toBe(true);
  expect(response).toHaveBeenCalledWith({ success: false, error: 'Sync product command refused' });
});

describe('exact checkpoint exit admission', () => {
  const receipt = { rootKind: 'media' as const, rootId: 'image', revision: routeRequestId };
  const image = { url: 'chrome-extension://test/apps/extension/src/editor/index.html', frameId: 0 };
  it('binds exit root families to active top-level document owners', () => {
    const owners = [
      { sender: image, kinds: ['media'] },
      {
        sender: {
          url: 'chrome-extension://test/apps/extension/src/video-editor/index.html',
          frameId: 0,
        },
        kinds: ['video-project'],
      },
      {
        sender: {
          url: 'chrome-extension://test/apps/extension/src/scenario-editor/index.html',
          frameId: 0,
        },
        kinds: ['scenario-project'],
      },
      { sender: gallery, kinds: ['media', 'video-review'] },
    ];
    for (const { sender, kinds } of owners) {
      for (const rootKind of [
        'media',
        'video-project',
        'scenario-project',
        'video-review',
      ] as const) {
        const command: SyncProductCommand = {
          kind: 'checkpoint-exit',
          receipt: { ...receipt, rootKind },
        };
        expect(isSyncProductSenderAllowed(command, sender)).toBe(kinds.includes(rootKind));
        expect(isSyncProductSenderAllowed(command, { ...sender, frameId: 1 })).toBe(false);
        expect(isSyncProductSenderAllowed(command, { url: sender.url })).toBe(false);
        expect(
          isSyncProductSenderAllowed(command, { ...sender, documentLifecycle: 'cached' })
        ).toBe(false);
      }
    }
    for (const sender of [
      settings,
      { ...settings, url: `${settings.url}?aiUnlock=1` },
      { url: 'https://host.test', frameId: 0 },
      { ...image, url: image.url.replace('//test/', '//other/') },
    ])
      expect(isSyncProductSenderAllowed({ kind: 'checkpoint-exit', receipt }, sender)).toBe(false);
  });
  it('derives current exit authority and wakes only after durable intent', async () => {
    const coordinator = routeCoordinator();
    const binding = { spaceId: 'current-space', profileCreatedAt: 4, connectionGeneration: 7 };
    const identity = { incarnation: routeRequestId, revision: 9 };
    nativeStatus.connection.mockResolvedValue({ binding, identity });
    let finish!: (value: { outcome: 'requested' }) => void;
    const durable = new Promise<{ outcome: 'requested' }>((resolve) => {
      finish = resolve;
    });
    checkpoints.exit.mockReturnValueOnce(durable);
    const wake = vi.fn(() => {
      throw new Error('Missed advisory wake');
    });
    configureSyncProductRoute(coordinator, wake);
    const result = productAnswer(coordinator, { kind: 'checkpoint-exit', receipt }, image);
    await Promise.resolve();
    expect(checkpoints.exit).toHaveBeenLastCalledWith(binding, identity, receipt);
    expect(wake).not.toHaveBeenCalled();
    finish({ outcome: 'requested' });
    await expect(result).resolves.toEqual({
      success: true,
      result: { kind: 'checkpoint-exit', outcome: 'requested' },
    });
    expect(wake).toHaveBeenCalledOnce();
  });
  it('preserves paused exit intent without product or network execution', async () => {
    const coordinator = routeCoordinator();
    const binding = { spaceId: 'space', profileCreatedAt: 1, connectionGeneration: 1 };
    const identity = { incarnation: routeRequestId, revision: 1 };
    nativeStatus.connection.mockResolvedValue({ binding, identity, phase: 'paused' });
    checkpoints.exit.mockResolvedValueOnce({ outcome: 'already-due' });
    const product = vi.spyOn(coordinator, 'productCommand');
    const wake = vi.fn();
    configureSyncProductRoute(coordinator, wake);
    await expect(
      productAnswer(coordinator, { kind: 'checkpoint-exit', receipt }, image)
    ).resolves.toEqual({
      success: true,
      result: { kind: 'checkpoint-exit', outcome: 'already-due' },
    });
    expect(checkpoints.exit).toHaveBeenLastCalledWith(binding, identity, receipt);
    expect(product).not.toHaveBeenCalled();
    expect(wake).toHaveBeenCalledOnce();
  });
  it('does not wake for stale missing or unconfigured exit intent', async () => {
    const coordinator = routeCoordinator();
    const wake = vi.fn();
    configureSyncProductRoute(coordinator, wake);
    const binding = { spaceId: 'space', profileCreatedAt: 1, connectionGeneration: 1 };
    const identity = { incarnation: routeRequestId, revision: 1 };
    nativeStatus.connection.mockResolvedValue({ binding, identity });
    checkpoints.flush.mockClear();
    checkpoints.exit.mockClear();
    for (const outcome of ['stale', 'not-pending'] as const) {
      checkpoints.exit.mockResolvedValueOnce({ outcome });
      await expect(
        productAnswer(coordinator, { kind: 'checkpoint-exit', receipt }, image)
      ).resolves.toEqual({ success: true, result: { kind: 'checkpoint-exit', outcome } });
    }
    nativeStatus.connection.mockResolvedValue(null);
    await expect(
      productAnswer(coordinator, { kind: 'checkpoint-exit', receipt }, image)
    ).resolves.toEqual({
      success: true,
      result: { kind: 'checkpoint-exit', outcome: 'unconfigured' },
    });
    expect(checkpoints.exit).toHaveBeenCalledTimes(2);
    expect(checkpoints.flush).not.toHaveBeenCalled();
    expect(wake).not.toHaveBeenCalled();
  });
  it('does not wake a replacement coordinator or a failed native intent', async () => {
    const old = routeCoordinator();
    const current = routeCoordinator();
    const wake = vi.fn();
    configureSyncProductRoute(current, wake);
    nativeStatus.connection.mockResolvedValue({
      binding: { spaceId: 'space', profileCreatedAt: 1, connectionGeneration: 1 },
      identity: { incarnation: routeRequestId, revision: 1 },
    });
    checkpoints.exit.mockResolvedValueOnce({ outcome: 'requested' });
    await expect(
      productAnswer(old, { kind: 'checkpoint-exit', receipt }, image)
    ).resolves.toMatchObject({ success: true });
    checkpoints.exit.mockRejectedValueOnce(new Error('Native intent refused'));
    await expect(
      productAnswer(current, { kind: 'checkpoint-exit', receipt }, image)
    ).resolves.toEqual({ success: false, error: 'Sync product command refused' });
    expect(wake).not.toHaveBeenCalled();
  });
});

it('refuses exit ingress from Settings and wrong editor families before native reads', async () => {
  const coordinator = routeCoordinator();
  const command: SyncProductCommand = {
    kind: 'checkpoint-exit',
    receipt: { rootKind: 'video-review', rootId: 'review', revision: routeRequestId },
  };
  nativeStatus.connection.mockClear();
  checkpoints.exit.mockClear();
  for (const sender of [
    settings,
    { ...gallery, frameId: 1 },
    { url: 'chrome-extension://test/apps/extension/src/editor/index.html', frameId: 0 },
    { url: 'https://host.test', frameId: 0 },
  ])
    await expect(productAnswer(coordinator, command, sender)).resolves.toEqual({
      success: false,
      error: 'Sync product command refused',
    });
  expect(nativeStatus.connection).not.toHaveBeenCalled();
  expect(checkpoints.exit).not.toHaveBeenCalled();
});
it('admits only runtime status and manual flush from an exact popup document', () => {
  vi.stubGlobal('chrome', { runtime: { id: 'test' } });
  try {
    const popup = {
      id: 'test',
      documentId: 'popup-document',
      frameId: 0,
      documentLifecycle: 'active' as const,
      url: 'chrome-extension://test/apps/extension/src/popup/index.html',
    };
    expect(isSyncProductSenderAllowed({ kind: 'runtime-status' }, popup)).toBe(true);
    expect(isSyncProductSenderAllowed({ kind: 'checkpoint-flush' }, popup)).toBe(true);
    for (const command of [
      { kind: 'status' },
      { kind: 'checkpoint-wake' },
      { kind: 'checkpoint-policy' },
      { kind: 'cache-status' },
      { kind: 'catalog-refresh', bypassCache: false },
    ] as const)
      expect(isSyncProductSenderAllowed(command, popup)).toBe(false);
  } finally {
    vi.unstubAllGlobals();
  }
});

it('refuses popup lookalikes and privileged verbs before invoking the observer', async () => {
  vi.stubGlobal('chrome', { runtime: { id: 'test' } });
  try {
    const coordinator = routeCoordinator();
    const read = vi.fn();
    configureSyncProductRoute(coordinator, undefined, read);
    const popup = {
      id: 'test',
      documentId: 'popup-document',
      frameId: 0,
      url: 'chrome-extension://test/apps/extension/src/popup/index.html',
    };
    for (const candidate of [
      { ...popup, id: 'other' },
      { ...popup, tab: { id: 1 } as chrome.tabs.Tab },
      { ...popup, frameId: 1 },
      { ...popup, documentLifecycle: 'cached' as const },
      { ...popup, url: popup.url + '?fake=1' },
      { ...popup, url: popup.url + '#fake' },
      settings,
    ])
      expect(isSyncProductSenderAllowed({ kind: 'runtime-status' }, candidate)).toBe(false);
    expect(read).not.toHaveBeenCalled();
  } finally {
    vi.unstubAllGlobals();
  }
});
it('returns only the configured readonly projection and refuses stale observer completion', async () => {
  vi.stubGlobal('chrome', { runtime: { id: 'test' } });
  try {
    const coordinator = routeCoordinator();
    const popup = {
      id: 'test',
      documentId: 'popup-document',
      frameId: 0,
      url: 'chrome-extension://test/apps/extension/src/popup/index.html',
    };
    const status = {
      configuration: 'unconfigured' as const,
      connection: null,
      localPublication: 'unknown' as const,
      activity: 'unknown' as const,
      remote: { knowledge: 'unknown' as const },
      protection: 'unknown' as const,
      issue: null,
      repair: null,
    };
    const read = vi.fn(async () => status);
    configureSyncProductRoute(coordinator, undefined, read);
    const product = vi.spyOn(coordinator, 'productCommand');
    nativeStatus.connection.mockClear();
    checkpoints.flush.mockClear();
    expect(await productAnswer(coordinator, { kind: 'runtime-status' }, popup)).toEqual({
      success: true,
      result: { kind: 'runtime-status', status },
    });
    expect(product).not.toHaveBeenCalled();
    expect(nativeStatus.connection).not.toHaveBeenCalled();
    expect(checkpoints.flush).not.toHaveBeenCalled();
    let complete: ((value: typeof status) => void) | undefined;
    read.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        })
    );
    const pending = productAnswer(coordinator, { kind: 'runtime-status' }, popup);
    configureSyncProductRoute(routeCoordinator());
    if (!complete) throw new Error('Observer not entered');
    complete(status);
    expect(await pending).toEqual({ success: false, error: 'Sync product command refused' });
  } finally {
    vi.unstubAllGlobals();
  }
});

it('admits the observed native action popup without optional document or frame fields', () => {
  vi.stubGlobal('chrome', { runtime: { id: 'test' } });
  try {
    const popup = {
      id: 'test',
      url: 'chrome-extension://test/apps/extension/src/popup/index.html',
    };
    expect(isSyncProductSenderAllowed({ kind: 'runtime-status' }, popup)).toBe(true);
    expect(isSyncProductSenderAllowed({ kind: 'checkpoint-flush' }, popup)).toBe(true);
  } finally {
    vi.unstubAllGlobals();
  }
});

it('routes selected JOIN with the exact discovery identity before starting preparation', async () => {
  const coordinator = routeCoordinator();
  const source = { kind: 'join' as const, identity: routeSource.identity };
  const expected = {
    spaceId: routeRequestId,
    bootstrapId: routeRequestId,
    fingerprint: 'a'.repeat(64),
  };
  const select = vi.spyOn(coordinator, 'selectWorkspace').mockResolvedValue(source);
  const start = vi
    .spyOn(coordinator, 'startWorkspace')
    .mockResolvedValue({ executorId: routeRequestId, executorRevision: 1 });
  await expect(
    productAnswer(coordinator, {
      kind: 'workspace-join',
      source,
      prefix: 'Workspace/',
      expected,
      authentication: routeAuthentication,
    })
  ).resolves.toEqual({ success: true, result: { kind: 'accepted', requestId: routeRequestId } });
  expect(select).toHaveBeenCalledExactlyOnceWith({ source, prefix: 'Workspace/', expected });
  expect(select).toHaveBeenCalledBefore(start);
  expect(start).toHaveBeenCalledExactlyOnceWith({
    source,
    authentication: routeAuthentication,
    requestId: routeRequestId,
  });
  expect(
    isSyncProductSenderAllowed(
      {
        kind: 'workspace-discover',
        rootUrl: 'https://dav.test/',
        accountId: 'alice',
        authentication: routeAuthentication,
        previous: null,
      },
      gallery
    )
  ).toBe(false);
});

it('starts saved Scenario HTML only from Gallery while preserving Settings job control', () => {
  const command: SyncProductCommand = {
    kind: 'scenario-export-prepare',
    projectId: 'scenario',
    exportId: 'saved-html',
  };
  expect(isSyncProductSenderAllowed(command, gallery)).toBe(true);
  for (const sender of [
    settings,
    { url: 'chrome-extension://test/apps/extension/src/scenario-editor/index.html', frameId: 0 },
    { url: 'chrome-extension://test/apps/extension/src/editor/index.html', frameId: 0 },
    { id: 'test', url: 'chrome-extension://test/apps/extension/src/popup/index.html' },
  ])
    expect(isSyncProductSenderAllowed(command, sender)).toBe(false);
  expect(isSyncProductSenderAllowed({ kind: 'inspect', requestId: routeRequestId }, settings)).toBe(
    true
  );
  expect(isSyncProductSenderAllowed({ kind: 'cancel', requestId: routeRequestId }, settings)).toBe(
    true
  );
});

it('starts the whole Library batch only from Gallery and permits Settings observation only', () => {
  const command: SyncProductCommand = {
    kind: 'library-backup-prepare',
    expected: { incarnation: routeRequestId, revision: 1 },
    options: {
      includeDrafts: false,
      includeSourceMetadata: true,
      includeTelemetry: true,
      includeWebSnapshots: true,
      scope: 'all',
    },
  };
  expect(isSyncProductSenderAllowed(command, gallery)).toBe(true);
  for (const candidate of [
    settings,
    { url: 'chrome-extension://test/apps/extension/src/editor/index.html', frameId: 0 },
    { url: 'chrome-extension://test/apps/extension/src/scenario-editor/index.html', frameId: 0 },
    { url: 'chrome-extension://test/apps/extension/src/video-editor/index.html', frameId: 0 },
    { id: 'test', url: 'chrome-extension://test/apps/extension/src/popup/index.html' },
  ])
    expect(isSyncProductSenderAllowed(command, candidate)).toBe(false);
  expect(isSyncProductSenderAllowed({ kind: 'inspect', requestId: routeRequestId }, settings)).toBe(
    true
  );
  expect(isSyncProductSenderAllowed({ kind: 'cancel', requestId: routeRequestId }, settings)).toBe(
    true
  );
});

it('limits connection credential replacement to canonical top-level Settings', () => {
  const command = {
    kind: 'connection-authentication' as const,
    expected: { incarnation: routeRequestId, revision: 1 },
    authentication: routeAuthentication,
  };
  expect(isSyncProductSenderAllowed(command, settings)).toBe(true);
  expect(isSyncProductSenderAllowed(command, gallery)).toBe(false);
  expect(isSyncProductSenderAllowed(command, { ...settings, frameId: 1 })).toBe(false);
});

it('limits native connection resume to canonical Settings', () => {
  const command = {
    kind: 'connection-resume' as const,
    expected: { incarnation: routeRequestId, revision: 1 },
  };
  expect(isSyncProductSenderAllowed(command, settings)).toBe(true);
  expect(isSyncProductSenderAllowed(command, gallery)).toBe(false);
  expect(isSyncProductSenderAllowed(command, { ...settings, frameId: 1 })).toBe(false);
});
