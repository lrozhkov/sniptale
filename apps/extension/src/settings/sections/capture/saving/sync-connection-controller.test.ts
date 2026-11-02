// @vitest-environment jsdom
import { act } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import type { SyncProductStatus } from '../../../../contracts/messaging/contracts/runtime-message/sync-connection.types';
import { createSyncProductClient } from '../../../../platform/runtime-messaging/sync-product-client';
import {
  createSyncConnectionController,
  type SyncConnectionViewState,
} from './sync-connection-controller';

const disposals: (() => void)[] = [];
afterEach(() => {
  for (const dispose of disposals.splice(0)) dispose();
  vi.restoreAllMocks();
});
function ready(revision = 1, phase: 'ready' | 'checking' = 'ready'): SyncProductStatus {
  return {
    connection: null,
    products: [],
    workspaceJob: null,
    workspace: {
      source: {
        kind: 'join',
        identity: { incarnation: '11111111-1111-4111-8111-111111111111', revision },
      },
      phase,
      rootUrl: 'https://dav.example/workspace/',
      accountId: 'fixture',
    },
  };
}
function setup(
  readLocalPresence: () => Promise<boolean>,
  initial = ready(),
  ensureUnlocked?: () => Promise<void>
) {
  const client = createSyncProductClient();
  const status = vi
    .spyOn(client, 'readStatus')
    .mockResolvedValue({ kind: 'status', status: initial });
  vi.spyOn(client, 'readCheckpointPolicy').mockResolvedValue({
    kind: 'checkpoint-policy',
    intervalMs: 300000,
  });
  let settled = () => {};
  vi.spyOn(client, 'subscribeToWorkspaceSettled').mockImplementation((listener) => {
    settled = listener;
    return () => {};
  });
  const snapshots: SyncConnectionViewState[] = [];
  const changed = vi.fn((state: SyncConnectionViewState) => {
    snapshots.push(structuredClone(state));
  });
  const controller = createSyncConnectionController({
    client,
    ...(ensureUnlocked ? { ensureUnlocked } : {}),
    requestPermission: async () => false,
    onChange: changed,
    readLocalPresence,
  });
  disposals.push(() => controller.dispose());
  const latest = () => snapshots.at(-1);
  const refresh = async (next: SyncProductStatus) => {
    status.mockResolvedValue({ kind: 'status', status: next });
    await act(async () => settled());
  };
  return { client, controller, changed, snapshots, latest, refresh };
}
it('checks presence once per ready source and ignores the older source response', async () => {
  let finishOld!: (value: boolean) => void;
  const read = vi
    .fn<() => Promise<boolean>>()
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishOld = resolve;
        })
    )
    .mockResolvedValue(false);
  const f = setup(read);
  await act(async () => f.controller.activate());
  expect(read).toHaveBeenCalledOnce();
  expect(f.latest()?.localPresence).toBe('loading');
  await f.refresh(ready(2));
  expect(f.latest()?.localPresence).toBe('empty');
  await act(async () => finishOld(true));
  expect(f.latest()?.localPresence).toBe('empty');
  await f.refresh(structuredClone(ready(2)));
  expect(read).toHaveBeenCalledTimes(2);
});
it('keeps a failed presence query unavailable without retaining its private error', async () => {
  const read = vi
    .fn<() => Promise<boolean>>()
    .mockRejectedValue(new Error('private-native-canary'));
  const f = setup(read);
  await act(async () => f.controller.activate());
  expect(f.latest()?.localPresence).toBe('unavailable');
  expect(JSON.stringify(f.snapshots)).not.toContain('private-native-canary');
});
it('does not inspect checking or invalidated setup and rejects a response after ready is lost', async () => {
  let finish!: (value: boolean) => void;
  const read = vi.fn<() => Promise<boolean>>().mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  const f = setup(read, ready(1, 'checking'));
  await act(async () => f.controller.activate());
  expect(read).not.toHaveBeenCalled();
  await f.refresh(ready());
  expect(read).toHaveBeenCalledOnce();
  await f.refresh(ready(1, 'checking'));
  await act(async () => finish(true));
  expect(f.latest()?.localPresence).toBe('loading');
  f.controller.invalidateSetup();
  await f.refresh(ready());
  expect(read).toHaveBeenCalledOnce();
  expect(f.latest()?.localPresence).toBe('loading');
});
it('does not publish a retained presence result after disposal', async () => {
  let finish!: (value: boolean) => void;
  const read = vi.fn<() => Promise<boolean>>().mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  const f = setup(read);
  await act(async () => f.controller.activate());
  expect(read).toHaveBeenCalledOnce();
  f.controller.dispose();
  const before = f.changed.mock.calls.length;
  await act(async () => finish(true));
  expect(f.changed).toHaveBeenCalledTimes(before);
});
it('rereads a reactivated lifetime and ignores its predecessor with the same source identity', async () => {
  let finishOld!: (value: boolean) => void;
  const read = vi
    .fn<() => Promise<boolean>>()
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishOld = resolve;
        })
    )
    .mockResolvedValue(false);
  const f = setup(read);
  await act(async () => f.controller.activate());
  f.controller.dispose();
  await act(async () => f.controller.activate());
  expect(read).toHaveBeenCalledTimes(2);
  expect(f.latest()?.localPresence).toBe('empty');
  const before = f.changed.mock.calls.length;
  await act(async () => finishOld(true));
  expect(f.changed).toHaveBeenCalledTimes(before);
  expect(f.latest()?.localPresence).toBe('empty');
});
it('does not inspect connected state that retains a ready workspace', async () => {
  let finish!: (value: boolean) => void;
  const read = vi.fn<() => Promise<boolean>>().mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  const connected = ready();
  connected.connection = {
    expected: { incarnation: '10000000-0000-4000-8000-000000000001', revision: 1 },
    phase: 'active',
    rootUrl: 'https://dav.example/workspace/',
    accountId: 'fixture',
  };
  const f = setup(read, connected);
  await act(async () => f.controller.activate());
  expect(read).not.toHaveBeenCalled();
  await f.refresh(ready());
  expect(read).toHaveBeenCalledOnce();
  await f.refresh(connected);
  await act(async () => finish(true));
  expect(f.latest()?.localPresence).toBe('loading');
});
it('does not start a presence read after the ready observer closes its controller', async () => {
  const read = vi.fn<() => Promise<boolean>>().mockResolvedValue(true);
  const f = setup(read);
  f.changed.mockImplementationOnce(() => f.controller.dispose());
  await act(async () => f.controller.activate());
  expect(read).not.toHaveBeenCalled();
});

function connectedStatus(revision = 1): SyncProductStatus {
  return {
    connection: {
      expected: { incarnation: '10000000-0000-4000-8000-000000000001', revision },
      phase: 'paused',
      rootUrl: 'https://dav.example/workspace/',
      accountId: 'fixture',
    },
    workspace: null,
    products: [],
    workspaceJob: null,
  };
}
it('holds duplicate credential submission through shared unlock and cancels continuation on disposal', async () => {
  let unlock!: () => void;
  const ensureUnlocked = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        unlock = resolve;
      })
  );
  const f = setup(async () => false, connectedStatus(), ensureUnlocked);
  const update = vi.spyOn(f.client, 'updateConnectionAuthentication');
  await act(async () => f.controller.activate());
  const saved = vi.fn();
  const authentication = { kind: 'basic' as const, username: 'fixture', password: 'secret' };
  const first = f.controller.updateAuthentication(authentication, saved);
  await f.controller.updateAuthentication(authentication, saved);
  expect(ensureUnlocked).toHaveBeenCalledOnce();
  expect(update).not.toHaveBeenCalled();
  f.controller.dispose();
  unlock();
  await first;
  expect(update).not.toHaveBeenCalled();
  expect(saved).not.toHaveBeenCalled();
});
it('reloads the reservation after refusal so explicit retry uses fresh identity', async () => {
  const f = setup(async () => false, connectedStatus());
  const update = vi
    .spyOn(f.client, 'updateConnectionAuthentication')
    .mockRejectedValueOnce(new Error('refused'))
    .mockResolvedValue({ kind: 'status', status: connectedStatus(4) });
  await act(async () => f.controller.activate());
  vi.mocked(f.client.readStatus).mockResolvedValue({ kind: 'status', status: connectedStatus(2) });
  const authentication = { kind: 'basic' as const, username: 'fixture', password: 'secret' };
  await f.controller.updateAuthentication(authentication, vi.fn());
  expect(f.latest()?.status?.connection?.expected.revision).toBe(2);
  expect(f.latest()?.message).toBe('failed');
  await f.controller.updateAuthentication(authentication, vi.fn());
  expect(update).toHaveBeenLastCalledWith({
    expected: connectedStatus(2).connection!.expected,
    authentication,
  });
  expect(f.latest()?.status?.connection?.phase).toBe('paused');
});
