import type { subscribeToMediaHubEvents } from '../../../features/media-hub/events';
// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CommandPressScope } from '@sniptale/ui/control-language/press';
import type { createSyncProductClient } from '../../../platform/runtime-messaging/sync-product-client';
import type { SyncProductResult } from '../../../contracts/messaging/contracts/runtime-message/sync-connection.types';
import { translate } from '../../../platform/i18n';
import { createMediaItem } from '../actions/test-support/index';

const mocks = vi.hoisted(() => ({
  subscribe: vi.fn<typeof subscribeToMediaHubEvents>(),
  readNativeCacheRoot: vi.fn<ReturnType<typeof createSyncProductClient>['readNativeCacheRoot']>(),
  pinNative: vi.fn<ReturnType<typeof createSyncProductClient>['pinNative']>(),
  prepareNative: vi.fn<ReturnType<typeof createSyncProductClient>['prepareNative']>(),
  releaseNative: vi.fn<ReturnType<typeof createSyncProductClient>['releaseNative']>(),
  waitForOperation: vi.fn<ReturnType<typeof createSyncProductClient>['waitForOperation']>(),
  cancel: vi.fn<ReturnType<typeof createSyncProductClient>['cancel']>(),
}));
vi.mock('../../../features/media-hub/events', () => ({
  subscribeToMediaHubEvents: mocks.subscribe,
}));
vi.mock('../../../platform/runtime-messaging/sync-product-client', () => ({
  createSyncProductClient: () => mocks,
}));
import { NativeCacheActions } from './native-cache-actions';

const native = { rootKind: 'media' as const, rootId: 'media-1' };
const status = { root: native, configured: true, pinned: false, ready: true, releaseAllowed: true };
let node: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.resetAllMocks();
  mocks.subscribe.mockReturnValue(() => undefined);
  mocks.readNativeCacheRoot.mockResolvedValue({ kind: 'cache-root', status });
  node = document.createElement('div');
  document.body.append(node);
  root = createRoot(node);
});
afterEach(() => {
  act(() => root.unmount());
  node.remove();
});
async function render(item = createMediaItem({ id: 'media-1' })) {
  await act(async () =>
    root.render(
      <CommandPressScope value={true}>
        <NativeCacheActions item={item} />
      </CommandPressScope>
    )
  );
}
function button(key: Parameters<typeof translate>[0]) {
  const result = [...node.querySelectorAll('button')].find(
    (candidate) => candidate.textContent === translate(key)
  );
  if (!result) throw new Error(`Missing command ${key}`);
  return result;
}
it('pins a ready native root locally and reloads the authoritative status', async () => {
  mocks.pinNative.mockResolvedValue({ kind: 'cache-root', status: { ...status, pinned: true } });
  await render();
  mocks.readNativeCacheRoot.mockResolvedValue({
    kind: 'cache-root',
    status: { ...status, pinned: true },
  });
  await act(async () => button('shared.syncCache.pin').click());
  expect(mocks.pinNative).toHaveBeenCalledWith(native, true);
  expect(mocks.prepareNative).not.toHaveBeenCalled();
  expect(mocks.waitForOperation).not.toHaveBeenCalled();
  expect(button('shared.syncCache.unpin').disabled).toBe(false);
});
it('shows pinned pending until hydration completes and does not duplicate a download', async () => {
  mocks.readNativeCacheRoot.mockResolvedValue({
    kind: 'cache-root',
    status: { ...status, pinned: true, ready: false },
  });
  mocks.prepareNative.mockResolvedValue({ kind: 'accepted', requestId: 'download' });
  type Operation = Extract<SyncProductResult, { kind: 'operation' }>;
  let finish: ((result: Operation) => void) | undefined;
  mocks.waitForOperation.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  await render();
  expect(node.textContent).toContain(translate('shared.syncCache.pinPending'));
  expect(button('shared.syncCache.release').disabled).toBe(false);
  await act(async () => {
    button('shared.syncCache.download').click();
    button('shared.syncCache.download').click();
  });
  expect(mocks.prepareNative).toHaveBeenCalledTimes(1);
  mocks.readNativeCacheRoot.mockResolvedValue({
    kind: 'cache-root',
    status: { ...status, pinned: true },
  });
  await act(async () =>
    finish?.({
      kind: 'operation',
      job: { requestId: 'download', kind: 'native-prepare', state: 'ready', failureCode: null },
      completion: { kind: 'native', root: native },
    })
  );
  expect(node.textContent).toContain(translate('shared.syncCache.local'));
});
it('rejects a terminal job without matching completion', async () => {
  mocks.releaseNative.mockResolvedValue({ kind: 'accepted', requestId: 'release' });
  mocks.waitForOperation.mockResolvedValue({ kind: 'operation', job: null, completion: null });
  await render();
  await act(async () => button('shared.syncCache.release').click());
  expect(node.querySelector('[role="alert"]')?.textContent).toBe(
    translate('shared.syncCache.prepareFailed')
  );
});
it('reloads availability when Library refreshes the same selected native item', async () => {
  await render();
  mocks.readNativeCacheRoot.mockResolvedValue({
    kind: 'cache-root',
    status: { ...status, ready: false },
  });
  await render(createMediaItem({ id: 'media-1', updatedAt: 2 }));
  expect(button('shared.syncCache.download').disabled).toBe(false);
  expect(mocks.readNativeCacheRoot).toHaveBeenCalledTimes(2);
});
it('continues observing after cancellation refusal', async () => {
  mocks.releaseNative.mockResolvedValue({ kind: 'accepted', requestId: 'release' });
  mocks.cancel.mockResolvedValue({ kind: 'cancelled', outcome: 'refused' });
  type Operation = Extract<SyncProductResult, { kind: 'operation' }>;
  let finish: ((result: Operation) => void) | undefined;
  mocks.waitForOperation.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  await render();
  await act(async () => button('shared.syncCache.release').click());
  await act(async () => button('shared.syncCache.cancel').click());
  expect(button('shared.syncCache.release').disabled).toBe(true);
  expect(node.textContent).toContain(translate('shared.syncCache.cancelRefused'));
  await act(async () =>
    finish?.({
      kind: 'operation',
      job: { requestId: 'release', kind: 'native-release', state: 'ready', failureCode: null },
      completion: {
        kind: 'native-release',
        root: native,
        result: {
          released: 1,
          releasedBytes: 100,
          absent: 0,
          unavailable: 0,
          busy: 0,
          protected: 0,
        },
      },
    })
  );
  expect(button('shared.syncCache.release').disabled).toBe(false);
});
it('stops observation without cancelling execution when the selected root changes', async () => {
  mocks.readNativeCacheRoot.mockResolvedValue({
    kind: 'cache-root',
    status: { ...status, ready: false },
  });
  mocks.prepareNative.mockResolvedValue({ kind: 'accepted', requestId: 'download' });
  type Operation = Extract<SyncProductResult, { kind: 'operation' }>;
  let finish: ((result: Operation) => void) | undefined;
  mocks.waitForOperation.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  await render();
  await act(async () => button('shared.syncCache.download').click());
  const signal = mocks.waitForOperation.mock.calls[0]?.[1];
  mocks.readNativeCacheRoot.mockResolvedValue({
    kind: 'cache-root',
    status: { ...status, root: { rootKind: 'media', rootId: 'other' } },
  });
  await render(createMediaItem({ id: 'other' }));
  expect(signal?.aborted).toBe(true);
  expect(mocks.cancel).not.toHaveBeenCalled();
  await act(async () => finish?.({ kind: 'operation', job: null, completion: null }));
  expect(node.querySelector('[role="alert"]')).toBeNull();
  expect(node.textContent).toContain(translate('shared.syncCache.local'));
});

it('reloads byte availability after external preparation without changing selected metadata', async () => {
  const item = createMediaItem({ id: 'media-1' });
  mocks.readNativeCacheRoot.mockResolvedValueOnce({
    kind: 'cache-root',
    status: { ...status, ready: false },
  });
  await render(item);
  expect(node.textContent).toContain(translate('shared.syncCache.remote'));
  const listener = mocks.subscribe.mock.calls.at(-1)?.[0];
  if (!listener) throw new Error('Native cache availability has no Library subscription.');
  mocks.readNativeCacheRoot.mockResolvedValue({ kind: 'cache-root', status });
  await act(async () =>
    listener({ type: 'library-changed', reason: 'sync', assetIds: [], timestamp: 1 })
  );
  expect(node.textContent).toContain(translate('shared.syncCache.local'));
  expect(node.textContent).not.toContain(translate('shared.syncCache.remote'));
});
