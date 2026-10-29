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
