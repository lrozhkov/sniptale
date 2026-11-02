// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { SyncPopupRuntimeStatus } from '../../../contracts/messaging/contracts/runtime-message/sync-connection.types';
import type { AISecretUnlockResponse } from '../../../contracts/messaging/ai-secret-unlock';
import type { SyncProductResult } from '../../../contracts/messaging/contracts/runtime-message/sync-connection.types';
import { usePopupSyncStatus } from './use-sync-status';
import ProductPopupFooter from './index';

const io = vi.hoisted(() => ({
  readRuntimeStatus: vi.fn<() => Promise<SyncPopupRuntimeStatus>>(),
  flushCheckpoints: vi.fn<() => Promise<SyncProductResult>>(),
  startSyncUnlock: vi.fn<() => Promise<AISecretUnlockResponse>>(),
  readOwnSyncUnlock: vi.fn<(id: string) => Promise<AISecretUnlockResponse>>(),
  unsubscribe: vi.fn(),
  openSettingsPage: vi.fn<(options: unknown) => Promise<void>>(),
}));
vi.mock('../../../platform/navigation/extension-pages', () => ({
  openSettingsPage: io.openSettingsPage,
}));
vi.mock('../../../platform/runtime-messaging/sync-product-client', () => ({
  createSyncProductClient: () => io,
  subscribeToSyncQueueSettled: () => io.unsubscribe,
  subscribeToSyncProductSettled: () => io.unsubscribe,
}));
const waiting: SyncPopupRuntimeStatus = {
  configuration: 'configured',
  connection: 'active',
  localPublication: 'waiting',
  activity: 'idle',
  remote: { knowledge: 'unknown' },
  protection: 'unlocked',
  issue: null,
  repair: null,
};
let root: Root;
let container: HTMLDivElement;
let view: ReturnType<typeof usePopupSyncStatus>;
function Probe() {
  view = usePopupSyncStatus();
  return null;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.useFakeTimers();
  vi.resetAllMocks();
  io.openSettingsPage.mockResolvedValue(undefined);
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  });
  io.readRuntimeStatus.mockResolvedValue(waiting);
  io.flushCheckpoints.mockResolvedValue({ kind: 'checkpoint-flushed', updated: 1, alreadyDue: 0 });
  io.startSyncUnlock.mockResolvedValue({ success: true, status: 'completed' });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
async function mount(key = 'initial') {
  await act(async () => {
    root.render(<Probe key={key} />);
  });
}

it('only observes on mount and polling and releases subscriptions on close', async () => {
  await mount();
  expect(view.status).toEqual(waiting);
  expect(io.readRuntimeStatus).toHaveBeenCalledOnce();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2000);
  });
  expect(io.readRuntimeStatus).toHaveBeenCalledTimes(2);
  expect(io.flushCheckpoints).not.toHaveBeenCalled();
  expect(io.startSyncUnlock).not.toHaveBeenCalled();
  act(() => root.unmount());
  expect(io.unsubscribe).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(4000);
  expect(io.readRuntimeStatus).toHaveBeenCalledTimes(2);
  root = createRoot(container);
});
it('coalesces repeat explicit sync clicks until native acknowledgement', async () => {
  const ack = deferred<SyncProductResult>();
  io.flushCheckpoints.mockReturnValueOnce(ack.promise);
  await mount();
  act(() => {
    view.sync();
    view.sync();
  });
  expect(io.flushCheckpoints).toHaveBeenCalledOnce();
  expect(view.pending).toBe(true);
  await act(async () => {
    ack.resolve({ kind: 'checkpoint-flushed', updated: 1, alreadyDue: 0 });
  });
  expect(view.pending).toBe(false);
  expect(io.readRuntimeStatus).toHaveBeenCalledTimes(2);
});
it('does not flush again after immediate unlock completion', async () => {
  await mount();
  await act(async () => {
    view.unlock();
  });
  expect(io.startSyncUnlock).toHaveBeenCalledOnce();
  expect(io.flushCheckpoints).not.toHaveBeenCalled();
  expect(view.pending).toBe(false);
});
it('observes a pending unlock then refreshes without a second continuation', async () => {
  io.startSyncUnlock.mockResolvedValue({
    success: true,
    status: 'pending',
    requestId: 'owned-request',
  });
  io.readOwnSyncUnlock.mockResolvedValueOnce({
    success: true,
    status: 'submitted',
    requestId: 'owned-request',
  });
  io.readOwnSyncUnlock.mockResolvedValue({
    success: true,
    status: 'completed',
    requestId: 'owned-request',
  });
  await mount();
  await act(async () => {
    view.unlock();
  });
  expect(view.pending).toBe(true);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2000);
  });
  expect(view.pending).toBe(false);
  expect(io.startSyncUnlock).toHaveBeenCalledOnce();
  expect(io.readOwnSyncUnlock).toHaveBeenCalledWith('owned-request');
  expect(io.flushCheckpoints).not.toHaveBeenCalled();
});
it('reports refusal safely and permits an explicit retry', async () => {
  io.flushCheckpoints.mockRejectedValueOnce(new Error('synthetic raw credential detail'));
  await mount();
  await act(async () => {
    view.sync();
  });
  expect(view.failed).toBe(true);
  expect(view.pending).toBe(false);
  expect(JSON.stringify(view)).not.toContain('synthetic raw credential detail');
  await act(async () => {
    view.sync();
  });
  expect(view.failed).toBe(false);
  expect(io.flushCheckpoints).toHaveBeenCalledTimes(2);
});
it('keeps read failure unknown rather than retaining a stale success', async () => {
  await mount();
  io.readRuntimeStatus.mockRejectedValue(new Error('storage unavailable'));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2000);
  });
  expect(view.status?.configuration).toBe('unknown');
  expect(view.status?.localPublication).toBe('unknown');
});
it('ignores an old mount response after reopening', async () => {
  const old = deferred<SyncPopupRuntimeStatus>();
  io.readRuntimeStatus.mockReturnValueOnce(old.promise);
  await mount();
  io.readRuntimeStatus.mockResolvedValue({ ...waiting, localPublication: 'published' });
  await mount('replacement');
  await act(async () => {
    old.resolve(waiting);
  });
  expect(view.status?.localPublication).toBe('published');
});
it('does not refresh or issue another command after a pending action outlives the popup', async () => {
  const ack = deferred<SyncProductResult>();
  io.flushCheckpoints.mockReturnValueOnce(ack.promise);
  await mount();
  act(() => view.sync());
  act(() => root.unmount());
  await act(async () => {
    ack.resolve({ kind: 'checkpoint-flushed', updated: 1, alreadyDue: 0 });
  });
  expect(io.readRuntimeStatus).toHaveBeenCalledOnce();
  expect(io.flushCheckpoints).toHaveBeenCalledOnce();
  root = createRoot(container);
});

it('invalidates a status sample that began before an acknowledged command', async () => {
  const stale = deferred<SyncPopupRuntimeStatus>();
  io.readRuntimeStatus.mockResolvedValue({ ...waiting, localPublication: 'published' });
  io.readRuntimeStatus.mockReturnValueOnce(stale.promise);
  await mount();
  await act(async () => {
    view.sync();
  });
  expect(view.status).toBeNull();
  await act(async () => {
    stale.resolve(waiting);
  });
  expect(view.status?.localPublication).toBe('published');
  expect(io.flushCheckpoints).toHaveBeenCalledOnce();
});
it('ends observation on expiry without retrying unlock or flushing', async () => {
  io.startSyncUnlock.mockResolvedValue({
    success: true,
    status: 'pending',
    requestId: 'expired-request',
  });
  io.readOwnSyncUnlock.mockResolvedValue({
    success: true,
    status: 'expired',
    requestId: 'expired-request',
  });
  await mount();
  await act(async () => {
    view.unlock();
  });
  expect(view.pending).toBe(false);
  expect(view.failed).toBe(true);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(4000);
  });
  expect(io.startSyncUnlock).toHaveBeenCalledOnce();
  expect(io.readOwnSyncUnlock).toHaveBeenCalledOnce();
  expect(io.flushCheckpoints).not.toHaveBeenCalled();
});

it('releases an unreadable unlock observation for explicit recovery without automatic retry', async () => {
  io.startSyncUnlock.mockResolvedValue({
    success: true,
    status: 'pending',
    requestId: 'refused-observation',
  });
  io.readOwnSyncUnlock.mockRejectedValue(new Error('synthetic private refusal'));
  await mount();
  await act(async () => {
    view.unlock();
  });
  expect(view.pending).toBe(false);
  expect(view.failed).toBe(true);
  expect(JSON.stringify(view)).not.toContain('synthetic private refusal');
  await act(async () => {
    await vi.advanceTimersByTimeAsync(4000);
  });
  expect(io.readOwnSyncUnlock).toHaveBeenCalledOnce();
  expect(io.startSyncUnlock).toHaveBeenCalledOnce();
  expect(io.flushCheckpoints).not.toHaveBeenCalled();
});

it('omits the entire status slot when the product reports an unconfigured connection', async () => {
  io.readRuntimeStatus.mockResolvedValue({ ...waiting, configuration: 'unconfigured' });
  await act(async () => {
    root.render(
      <ProductPopupFooter onOpenGithub={() => undefined} onOpenSettings={() => undefined} />
    );
  });
  expect(container.querySelector('[data-ui="popup.footer.sync-status"]')).toBeNull();
  expect(container.querySelector('footer')?.children).toHaveLength(1);
  expect(container.querySelector('[data-ui="popup.footer.settings-button"]')).not.toBeNull();
  expect(io.flushCheckpoints).not.toHaveBeenCalled();
});
it('opens the typed connection repair page while keeping ordinary Settings independent', async () => {
  io.readRuntimeStatus.mockResolvedValue({
    ...waiting,
    connection: 'credentials-required',
    repair: 'connection',
  });
  const ordinarySettings = vi.fn();
  await act(async () => {
    root.render(
      <ProductPopupFooter onOpenGithub={() => undefined} onOpenSettings={ordinarySettings} />
    );
  });
  await act(async () => {
    container
      .querySelector<HTMLButtonElement>('[data-ui="popup.footer.sync-status"] button')
      ?.click();
  });
  expect(io.openSettingsPage).toHaveBeenCalledWith({
    route: { section: 'saving', view: 'connection' },
  });
  expect(ordinarySettings).not.toHaveBeenCalled();
  act(() =>
    container.querySelector<HTMLButtonElement>('[data-ui="popup.footer.settings-button"]')?.click()
  );
  expect(ordinarySettings).toHaveBeenCalledOnce();
  expect(io.flushCheckpoints).not.toHaveBeenCalled();
});
