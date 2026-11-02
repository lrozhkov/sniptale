import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { attachRuntimeMessageFreshness } from '@sniptale/platform/security/runtime-message-freshness';
import { createRuntimeMessageFreshnessAuthorizer } from '@sniptale/platform/security/runtime-message-freshness-authorizer';
import {
  createSyncProductClient,
  publishSyncProductSettled,
  subscribeToWorkspaceSettled,
  subscribeToSyncQueueSettled,
  subscribeToSyncProductSettled,
} from './sync-product-client';

const send = vi.hoisted(() => vi.fn());
vi.mock('./chrome-transport', () => ({
  createRuntimeMessagingTransport: () => ({ sendRuntimeMessage: send }),
}));
const ids = Array.from({ length: 4 }, (_, index) => `11111111-1111-4111-8111-11111111111${index}`);
class Channel {
  static live = new Set<Channel>();
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  constructor(readonly name: string) {
    Channel.live.add(this);
  }
  postMessage(data: unknown) {
    for (const peer of Channel.live)
      if (peer !== this && peer.name === this.name)
        peer.onmessage?.({ data } as MessageEvent<unknown>);
  }
  close() {
    Channel.live.delete(this);
  }
}
let ready = false;
let authorizer: ReturnType<typeof createRuntimeMessageFreshnessAuthorizer>;
let nonce = 0;
let lastEnvelope: object;
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000);
  vi.stubGlobal('BroadcastChannel', Channel);
  ready = false;
  nonce = 0;
  authorizer = createRuntimeMessageFreshnessAuthorizer();
  send.mockReset().mockImplementation(async (request: { command: { requestId: string } }) => {
    // Targeted inspection still uses owner observation plus the operation RPC. Keep the real
    // replay cache policy in this proof instead of replacing it with an unbounded counter.
    for (let index = 0; index < 2; index += 1) {
      lastEnvelope = attachRuntimeMessageFreshness(
        { type: 'OFFSCREEN_SYNC_INSPECT' },
        {
          issuedAtEpochMs: Date.now(),
          nonce: `nonce-${++nonce}`,
        }
      );
      expect(
        authorizer.authorize({ message: lastEnvelope, scope: 'background', nowEpochMs: Date.now() })
          .authorized
      ).toBe(true);
    }
    return {
      success: true,
      result: {
        kind: 'operation',
        job: {
          requestId: request.command.requestId,
          kind: 'thumbnail-read',
          state: ready ? 'ready' : 'running',
          failureCode: null,
        },
        completion: null,
      },
    };
  });
});
afterEach(() => {
  expect(Channel.live.size).toBe(0);
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('finite product observation', () => {
  it('keeps four operations within the 120-second freshness budget and rejects replay', async () => {
    const client = createSyncProductClient();
    const controllers = ids.map(() => new AbortController());
    const waits = ids.map((id, index) =>
      client.waitForOperation(id, controllers[index]!.signal).catch(() => undefined)
    );
    await vi.advanceTimersByTimeAsync(120_000);
    expect(send).toHaveBeenCalledTimes(20);
    expect(nonce).toBe(40);
    expect(
      authorizer.authorize({ message: lastEnvelope, scope: 'background', nowEpochMs: Date.now() })
        .authorized
    ).toBe(false);
    controllers.forEach((controller) => controller.abort());
    await Promise.all(waits);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(send).toHaveBeenCalledTimes(20);
  });

  it('subscribes before inspecting and coalesces matching wakeups during an inspection', async () => {
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const original = send.getMockImplementation()!;
    send.mockImplementationOnce(async (request) => {
      publishSyncProductSettled(ids[0]!, 'product');
      publishSyncProductSettled(ids[0]!, 'product');
      await pending;
      return original(request);
    });
    const wait = createSyncProductClient().waitForOperation(ids[0]!);
    expect(Channel.live.size).toBe(1);
    finish();
    await vi.advanceTimersByTimeAsync(0);
    expect(send).toHaveBeenCalledTimes(2);
    ready = true;
    publishSyncProductSettled(ids[0]!, 'product');
    await expect(wait).resolves.toMatchObject({ kind: 'operation', job: { state: 'ready' } });
    expect(send).toHaveBeenCalledTimes(3);
  });

  it('ignores wrong IDs and forged result fields and recovers a missed terminal wakeup', async () => {
    const wait = createSyncProductClient().waitForOperation(ids[0]!);
    await vi.advanceTimersByTimeAsync(0);
    publishSyncProductSettled(ids[1]!, 'product');
    publishSyncProductSettled(ids[0]!, 'workspace');
    const channel = new Channel('sniptale-sync-product-settled');
    channel.postMessage({ requestId: ids[0], kind: 'product', state: 'ready' });
    channel.close();
    expect(send).toHaveBeenCalledTimes(1);
    ready = true;
    await vi.advanceTimersByTimeAsync(30_000);
    await expect(wait).resolves.toMatchObject({ kind: 'operation', job: { state: 'ready' } });
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('cleans an aborted observer without cancelling owner work or consuming a late result', async () => {
    const controller = new AbortController();
    const wait = createSyncProductClient().waitForOperation(ids[0]!, controller.signal);
    const rejection = expect(wait).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort();
    await rejection;
    publishSyncProductSettled(ids[0]!, 'product');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('uses a finite workspace subscription and tolerates unavailable notification delivery', () => {
    const callback = vi.fn();
    const unsubscribe = subscribeToWorkspaceSettled(callback);
    publishSyncProductSettled(ids[0]!, 'product');
    publishSyncProductSettled(ids[0]!, 'workspace');
    expect(callback).toHaveBeenCalledTimes(1);
    unsubscribe();
    vi.stubGlobal(
      'BroadcastChannel',
      class {
        constructor() {
          throw new Error('unavailable');
        }
      }
    );
    expect(() => publishSyncProductSettled(ids[0]!, 'workspace')).not.toThrow();
  });
});

it('marks thumbnail observation and cancellation as advisory without changing foreground requests', async () => {
  ready = true;
  await createSyncProductClient().waitForOperation(ids[0]!, undefined, true);
  expect(send).toHaveBeenLastCalledWith(
    expect.objectContaining({ command: { kind: 'inspect', requestId: ids[0], advisory: true } })
  );
  await createSyncProductClient().cancel(ids[0]!, true);
  expect(send).toHaveBeenLastCalledWith(
    expect.objectContaining({ command: { kind: 'cancel', requestId: ids[0], advisory: true } })
  );
  await createSyncProductClient().waitForOperation(ids[1]!);
  expect(send).toHaveBeenLastCalledWith(
    expect.objectContaining({ command: { kind: 'inspect', requestId: ids[1] } })
  );
});

it('admits bounded native queue identities while preserving product and workspace UUID rules', () => {
  const queue = vi.fn();
  const workspace = vi.fn();
  const unsubscribe = subscribeToSyncQueueSettled(queue);
  const unsubscribeWorkspace = subscribeToWorkspaceSettled(workspace);
  publishSyncProductSettled('native-queue-operation', 'queue');
  publishSyncProductSettled('', 'queue');
  publishSyncProductSettled('x'.repeat(257), 'queue');
  publishSyncProductSettled('native-queue-operation', 'workspace');
  publishSyncProductSettled('native-queue-operation', 'product');
  expect(queue).toHaveBeenCalledOnce();
  expect(workspace).not.toHaveBeenCalled();
  publishSyncProductSettled(ids[0]!, 'workspace');
  expect(workspace).toHaveBeenCalledOnce();
  unsubscribe();
  unsubscribeWorkspace();
  expect(Channel.live.size).toBe(0);
});

it('sends only logical cache commands through the existing transport', async () => {
  send.mockResolvedValue({ success: true, result: { kind: 'accepted', requestId: ids[0] } });
  const client = createSyncProductClient();
  const root = { rootKind: 'media' as const, rootId: 'asset' };
  await client.readCacheStatus();
  await client.setCacheBudget(0, 3);
  await client.trimCache();
  await client.readNativeCacheRoot(root);
  await client.pinNative(root, true);
  await client.releaseNative(root);
  expect(send.mock.calls.map(([request]) => request.command)).toEqual([
    { kind: 'cache-status' },
    { kind: 'cache-budget', budgetBytes: 0, revision: 3 },
    { kind: 'cache-trim' },
    { kind: 'cache-root-status', root },
    { kind: 'cache-pin', root, pinned: true },
    { kind: 'native-release', root },
  ]);
});

it('observes only product completion and releases its advisory subscription', () => {
  const changed = vi.fn();
  const dispose = subscribeToSyncProductSettled(changed);
  publishSyncProductSettled(ids[0]!, 'queue');
  publishSyncProductSettled(ids[0]!, 'workspace');
  publishSyncProductSettled(ids[0]!, 'product');
  expect(changed).toHaveBeenCalledOnce();
  expect(send).not.toHaveBeenCalled();
  dispose();
  publishSyncProductSettled(ids[0]!, 'product');
  expect(changed).toHaveBeenCalledOnce();
});

it('sends local-only identity and native preparation without provider authority', async () => {
  send.mockResolvedValue({ success: true, result: { kind: 'local-only', history: 'incomplete' } });
  const client = createSyncProductClient();
  const expected = { incarnation: ids[0]!, revision: 7 };
  const root = { rootKind: 'media' as const, rootId: 'native-id' };
  const selection = {
    rootKind: 'media' as const,
    rootId: 'remote-id',
    operationId: 'selected-op',
    sourceDigest: 'a'.repeat(64),
  };
  await expect(client.switchToLocalOnly(expected)).resolves.toEqual({
    kind: 'local-only',
    history: 'incomplete',
  });
  await client.prepareNative(root);
  await client.prepareNativeBackup(root);
  await client.prepareReplica(selection, true);
  await client.prepareReplica(selection);
  expect(send.mock.calls.map(([request]) => request.command)).toEqual([
    { kind: 'connection-local-only', expected },
    { kind: 'native-prepare', root },
    { kind: 'backup-prepare', root },
    { kind: 'replica-prepare', selection, preserveNative: true },
    { kind: 'replica-prepare', selection },
  ]);
});

it('sends finite checkpoint commands and parses their safe responses', async () => {
  const client = createSyncProductClient();
  send.mockResolvedValue({
    success: true,
    result: { kind: 'checkpoint-policy', intervalMs: 300000 },
  });
  expect(await client.readCheckpointPolicy()).toEqual({
    kind: 'checkpoint-policy',
    intervalMs: 300000,
  });
  expect(send.mock.calls.at(-1)?.[0]).toMatchObject({ command: { kind: 'checkpoint-policy' } });
  send.mockResolvedValue({
    success: true,
    result: { kind: 'checkpoint-policy', intervalMs: 60000 },
  });
  expect(await client.setCheckpointInterval(60000)).toEqual({
    kind: 'checkpoint-policy',
    intervalMs: 60000,
  });
  expect(send.mock.calls.at(-1)?.[0]).toMatchObject({
    command: { kind: 'checkpoint-interval', intervalMs: 60000 },
  });
  send.mockResolvedValue({
    success: true,
    result: { kind: 'checkpoint-flushed', updated: 1, alreadyDue: 0 },
  });
  expect(await client.flushCheckpoints()).toEqual({
    kind: 'checkpoint-flushed',
    updated: 1,
    alreadyDue: 0,
  });
  expect(send.mock.calls.at(-1)?.[0]).toMatchObject({ command: { kind: 'checkpoint-flush' } });
});

it('sends a due-only checkpoint wake and requires its exact fixed receipt', async () => {
  const client = createSyncProductClient();
  send.mockResolvedValueOnce({ success: true, result: { kind: 'checkpoint-woken' } });
  await expect(client.wakeCheckpoints()).resolves.toEqual({ kind: 'checkpoint-woken' });
  expect(send.mock.calls.at(-1)?.[0]).toEqual({
    type: 'SYNC_PRODUCT_COMMAND',
    requestId: expect.any(String),
    command: { kind: 'checkpoint-wake' },
  });
  for (const result of [
    { kind: 'checkpoint-flushed', updated: 1, alreadyDue: 0 },
    { kind: 'checkpoint-woken', synchronized: true },
    null,
  ]) {
    send.mockResolvedValueOnce({ success: true, result });
    await expect(client.wakeCheckpoints()).rejects.toThrow();
  }
  send.mockResolvedValueOnce({ success: false, error: 'secrets-locked' });
  await expect(client.wakeCheckpoints()).rejects.toThrow('Sync product command refused');
});

it('validates exact checkpoint exit client replies', async () => {
  const client = createSyncProductClient();
  const receipt = { rootKind: 'media' as const, rootId: 'image', revision: ids[0]! };
  for (const outcome of ['requested', 'already-due', 'stale', 'not-pending', 'unconfigured']) {
    send.mockResolvedValueOnce({ success: true, result: { kind: 'checkpoint-exit', outcome } });
    await expect(client.requestCheckpointExit(receipt)).resolves.toEqual({
      kind: 'checkpoint-exit',
      outcome,
    });
    expect(send.mock.calls.at(-1)?.[0]).toEqual({
      type: 'SYNC_PRODUCT_COMMAND',
      requestId: expect.any(String),
      command: { kind: 'checkpoint-exit', receipt },
    });
  }
  for (const result of [
    { kind: 'checkpoint-woken' },
    { kind: 'checkpoint-exit', outcome: 'published' },
    { kind: 'checkpoint-exit', outcome: 'requested', synchronized: true },
    null,
  ]) {
    send.mockResolvedValueOnce({ success: true, result });
    await expect(client.requestCheckpointExit(receipt)).rejects.toThrow();
  }
  send.mockResolvedValueOnce({ success: false, error: 'secrets-locked' });
  await expect(client.requestCheckpointExit(receipt)).rejects.toThrow(
    'Sync product command refused'
  );
});

it('unwraps strict popup status and preserves detailed status and flush receipts', async () => {
  const client = createSyncProductClient();
  const status = {
    configuration: 'unknown',
    connection: null,
    localPublication: 'unknown',
    activity: 'unknown',
    remote: { knowledge: 'unknown' },
    protection: 'unknown',
    issue: null,
    repair: null,
  };
  send.mockResolvedValueOnce({ success: true, result: { kind: 'runtime-status', status } });
  await expect(client.readRuntimeStatus()).resolves.toEqual(status);
  expect(send.mock.calls.at(-1)?.[0].command).toEqual({ kind: 'runtime-status' });
  for (const result of [
    { kind: 'status', status },
    { kind: 'runtime-status', status: { ...status, credentialId: ids[0] } },
  ]) {
    send.mockResolvedValueOnce({ success: true, result });
    await expect(client.readRuntimeStatus()).rejects.toThrow('Sync runtime status refused');
  }
  send.mockRejectedValueOnce(new Error('private-provider-error'));
  await expect(client.readRuntimeStatus()).rejects.toThrow('Sync runtime status refused');
  const detailed = {
    kind: 'status',
    status: { connection: null, workspace: null, workspaceJob: null, products: [] },
  };
  send.mockResolvedValueOnce({ success: true, result: detailed });
  await expect(client.readStatus()).resolves.toEqual(detailed);
});
it('coalesces local unlock starts and observes completion without a second flush', async () => {
  const client = createSyncProductClient();
  let complete!: (value: unknown) => void;
  send.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        complete = resolve;
      })
  );
  const first = client.startSyncUnlock();
  const second = client.startSyncUnlock();
  expect(send).toHaveBeenCalledOnce();
  expect(send.mock.calls[0]?.[0]).toEqual({
    type: 'AI_SECRET_UNLOCK',
    operation: 'start',
    purpose: 'sync',
  });
  complete({ success: true, requestId: ids[0], status: 'pending' });
  await expect(first).resolves.toMatchObject({ status: 'pending' });
  await expect(second).resolves.toMatchObject({ status: 'pending' });
  send.mockResolvedValueOnce({ success: true, requestId: ids[0], status: 'completed' });
  await expect(client.readOwnSyncUnlock(ids[0]!)).resolves.toMatchObject({ status: 'completed' });
  expect(send.mock.calls[1]?.[0]).toEqual({
    type: 'AI_SECRET_UNLOCK',
    operation: 'status',
    requestId: ids[0],
  });
  expect(send).toHaveBeenCalledTimes(2);
  for (const response of [
    { success: false, error: 'private-provider-error' },
    { success: true, status: 'completed', credentialId: ids[0] },
  ]) {
    send.mockResolvedValueOnce(response);
    await expect(client.startSyncUnlock()).rejects.toThrow('Sync unlock refused');
  }
  send.mockRejectedValueOnce(new Error('private-provider-error'));
  await expect(client.readOwnSyncUnlock(ids[0]!)).rejects.toThrow('Sync unlock refused');
});

it('sends explicit search and selected JOIN with required atomic enrollment policy', async () => {
  send.mockResolvedValue({ success: true, result: { kind: 'accepted', requestId: ids[0] } });
  const client = createSyncProductClient();
  const authentication = { kind: 'basic' as const, username: 'alice', password: 'private' };
  const source = { kind: 'join' as const, identity: { incarnation: ids[0]!, revision: 2 } };
  const expected = { spaceId: ids[0]!, bootstrapId: ids[1]!, fingerprint: 'a'.repeat(64) };
  const discovery = {
    rootUrl: 'https://dav.test/root/',
    accountId: 'alice',
    authentication,
    previous: source,
  };
  const selected = { source, prefix: 'Library name/', expected, authentication };
  const enrollment = {
    source,
    authentication,
    storagePolicy: { version: 1 as const, mode: 'on-demand' as const },
  };
  await client.discoverWorkspace(discovery);
  await client.joinWorkspace(selected);
  await client.retryWorkspace({ source, authentication, operation: 'discover' });
  await client.enrollWorkspace(enrollment);
  expect(send.mock.calls.map(([request]) => request.command)).toEqual([
    { kind: 'workspace-discover', ...discovery },
    { kind: 'workspace-join', ...selected },
    { kind: 'workspace-retry', source, authentication, operation: 'discover' },
    { kind: 'workspace-enroll', ...enrollment },
  ]);
});

it('prepares only the selected Scenario export using fresh product requests and existing receipts', async () => {
  const result = { kind: 'accepted', requestId: ids[0] };
  send.mockResolvedValue({ success: true, result });
  const client = createSyncProductClient();
  const target = { projectId: 'scenario-project', exportId: 'saved-html' };
  const caller = { ...target, remoteKey: 'untrusted-object', credentialId: ids[0] };
  await expect(client.prepareScenarioExport(caller)).resolves.toEqual(result);
  await expect(client.prepareScenarioExport(target)).resolves.toEqual(result);
  const requests = send.mock.calls.map(([request]) => request);
  for (const request of requests)
    expect(request).toEqual({
      type: 'SYNC_PRODUCT_COMMAND',
      requestId: expect.any(String),
      command: { kind: 'scenario-export-prepare', ...target },
    });
  expect(requests[0].requestId).not.toBe(requests[1].requestId);
  send.mockResolvedValueOnce({ success: false, error: 'secrets-locked' });
  await expect(client.prepareScenarioExport(target)).rejects.toThrow(
    'Sync product command refused'
  );
});

it(
  'projects and clones one finite Library backup command while normalizing actual ' +
    'selected export options',
  async () => {
    send.mockResolvedValue({ success: true, result: { kind: 'accepted', requestId: ids[0] } });
    const client = createSyncProductClient();
    const expected = { incarnation: ids[0]!, revision: 1, credentialId: 'private' };
    const options = {
      includeDrafts: true,
      includeSourceMetadata: false,
      includeTelemetry: true,
      includeWebSnapshots: false,
      scope: 'selected' as const,
      selected: {
        mediaAssetIds: ['image', 'image'],
        scenarioProjectIds: ['guide'],
        videoProjectIds: [] as string[],
        remoteKey: 'private',
      },
      budgetBytes: 1,
    };
    const caller = { expected, options, rootUrl: 'https://private/' };
    await client.prepareLibraryBackup(caller);
    const request = send.mock.calls[0]?.[0];
    expect(request.command).toEqual({
      kind: 'library-backup-prepare',
      expected: { incarnation: ids[0], revision: 1 },
      options: {
        includeDrafts: true,
        includeSourceMetadata: false,
        includeTelemetry: true,
        includeWebSnapshots: false,
        scope: 'selected',
        selected: { mediaAssetIds: ['image'], scenarioProjectIds: ['guide'], videoProjectIds: [] },
      },
    });
    expected.revision = 2;
    options.selected.mediaAssetIds.push('later');
    expect(request.command.expected.revision).toBe(1);
    expect(request.command.options.selected.mediaAssetIds).toEqual(['image']);
    await client.prepareLibraryBackup({ expected, options: { ...options, scope: 'all' } });
    expect(send.mock.calls[1]?.[0].command.options).toEqual({
      includeDrafts: true,
      includeSourceMetadata: false,
      includeTelemetry: true,
      includeWebSnapshots: false,
      scope: 'all',
    });
    expect(send.mock.calls[0]?.[0].requestId).not.toBe(send.mock.calls[1]?.[0].requestId);
    await expect(
      client.prepareLibraryBackup({
        expected,
        options: {
          ...options,
          selected: { mediaAssetIds: [], scenarioProjectIds: [], videoProjectIds: [] },
        },
      })
    ).rejects.toThrow();
    expect(send).toHaveBeenCalledTimes(2);
  }
);
