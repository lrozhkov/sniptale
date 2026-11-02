// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { SyncPopupRuntimeStatus } from '../../../contracts/messaging/contracts/runtime-message/sync-connection.types';

const io = vi.hoisted(() => ({ read: vi.fn(), open: vi.fn(), sync: vi.fn(), unlock: vi.fn() }));
vi.mock('./use-sync-status', () => ({ usePopupSyncStatus: io.read }));
vi.mock('../../../platform/navigation/extension-pages', () => ({ openSettingsPage: io.open }));
vi.mock('../../../ui/popup-shell/footer', () => ({
  PopupFooter: ({ status }: { status?: ReactNode }) => status,
}));
vi.mock('../../../platform/i18n/popup', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../platform/i18n/popup')>();
  return { ...actual, useAppLocale: () => 'en' };
});
import ProductPopupFooter from './index';

let root: Root;
let container: HTMLDivElement;
const base: SyncPopupRuntimeStatus = {
  configuration: 'configured',
  connection: 'active',
  localPublication: 'waiting',
  activity: 'idle',
  remote: { knowledge: 'unknown' },
  protection: 'unlocked',
  issue: 'queue-problem',
  repair: null,
};
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.clearAllMocks();
  io.open.mockResolvedValue(undefined);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
function render(status: SyncPopupRuntimeStatus) {
  io.read.mockReturnValue({
    status,
    pending: false,
    failed: false,
    sync: io.sync,
    unlock: io.unlock,
  });
  act(() => root.render(<ProductPopupFooter onOpenGithub={vi.fn()} onOpenSettings={vi.fn()} />));
}
it.each([
  ['queue-problems', { section: 'saving', view: 'queue', queueFilter: 'problems' }],
  ['queue-action-required', { section: 'saving', view: 'queue', queueFilter: 'action-required' }],
  ['queue', { section: 'saving', view: 'queue' }],
  ['connection', { section: 'saving', view: 'connection' }],
  ['security', { section: 'access-data', view: 'secret-protection' }],
  ['storage', { section: 'saving', view: 'storage' }],
  [null, { section: 'saving', view: 'queue' }],
] as const)(
  'navigates finite repair target %s without starting a sync or unlock',
  async (repair, route) => {
    render({ ...base, repair });
    await act(async () => container.querySelector('button')?.click());
    expect(io.open).toHaveBeenCalledExactlyOnceWith({ route });
    expect(io.sync).not.toHaveBeenCalled();
    expect(io.unlock).not.toHaveBeenCalled();
  }
);
it('keeps a navigation failure recoverable and retries the same filtered destination', async () => {
  io.open.mockRejectedValueOnce(new Error('Tab unavailable'));
  render({ ...base, repair: 'queue-action-required' });
  await act(async () => container.querySelector('button')?.click());
  expect(container.querySelector('[role="status"]')?.textContent).toBe(
    'Could not complete the action. Try again.'
  );
  await act(async () => container.querySelector('button')?.click());
  expect(io.open).toHaveBeenCalledTimes(2);
  expect(io.open).toHaveBeenLastCalledWith({
    route: { section: 'saving', view: 'queue', queueFilter: 'action-required' },
  });
  expect(io.sync).not.toHaveBeenCalled();
});
it('opens ordinary queue details without a stale repair filter', async () => {
  render({ ...base, issue: null, activity: 'running', repair: 'queue-problems' });
  await act(async () => container.querySelector('button')?.click());
  expect(io.open).toHaveBeenCalledExactlyOnceWith({ route: { section: 'saving', view: 'queue' } });
  expect(io.sync).not.toHaveBeenCalled();
});
