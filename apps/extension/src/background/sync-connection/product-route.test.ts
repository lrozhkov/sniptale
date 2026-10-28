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

it.each(['workspace-create', 'workspace-join'] as const)(
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
        : { kind, rootUrl: endpoint, accountId: 'alice', authentication: routeAuthentication };
    await expect(productAnswer(coordinator, command)).resolves.toEqual({
      success: true,
      result: { kind: 'accepted', requestId: routeRequestId },
    });
    expect(plan).toHaveBeenCalledExactlyOnceWith(
      kind === 'workspace-create'
        ? { kind: 'allocation', parentUrl: endpoint, accountId: 'alice' }
        : { kind: 'join', rootUrl: endpoint, accountId: 'alice' }
    );
    expect(start).toHaveBeenCalledExactlyOnceWith({
      source: routeSource,
      authentication: routeAuthentication,
      requestId: routeRequestId,
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
      source: routeSource,
      authentication: routeAuthentication,
    })
  ).resolves.toEqual({ success: true, result: { kind: 'enrolled' } });
  expect(enroll).toHaveBeenCalledExactlyOnceWith({
    source: routeSource,
    authentication: routeAuthentication,
  });
  expect(plan).not.toHaveBeenCalled();
});

it('projects native status into the exact credential-free response contract', async () => {
  const coordinator = routeCoordinator();
  const inspect = vi.spyOn(coordinator, 'inspect').mockResolvedValue(null);
  const empty = { connection: null, workspace: null, workspaceJob: null };
  await expect(productAnswer(coordinator, { kind: 'status' })).resolves.toEqual({
    success: true,
    result: { kind: 'status', status: empty },
  });
  const connection = { phase: 'paused', rootUrl: 'https://dav.test/root/', accountId: 'alice' };
  const workspace = { ...connection, phase: 'ready', source: routeSource };
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
    result: { kind: 'status', status: { connection, workspace, workspaceJob } },
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
  expect(isSyncProductSenderAllowed(command, { ...gallery, documentLifecycle: 'prerender' })).toBe(
    false
  );
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
