// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CommandPressScope } from '@sniptale/ui/control-language/press';
import type { SyncProductResult } from '../../../../contracts/messaging/contracts/runtime-message/sync-connection.types';
import type { createSyncProductClient } from '../../../../platform/runtime-messaging/sync-product-client';
import { translate } from '../../../../platform/i18n';
import { formatBytes } from '../../../../platform/i18n/format-bytes';

const mocks = vi.hoisted(() => ({
  readCacheStatus: vi.fn<ReturnType<typeof createSyncProductClient>['readCacheStatus']>(),
  setCacheBudget: vi.fn<ReturnType<typeof createSyncProductClient>['setCacheBudget']>(),
  trimCache: vi.fn<ReturnType<typeof createSyncProductClient>['trimCache']>(),
  waitForOperation: vi.fn<ReturnType<typeof createSyncProductClient>['waitForOperation']>(),
  cancel: vi.fn<ReturnType<typeof createSyncProductClient>['cancel']>(),
}));
vi.mock('../../../../platform/runtime-messaging/sync-product-client', () => ({
  createSyncProductClient: () => mocks,
}));
import { SyncCacheSection } from './sync-cache';

const status = {
  budgetBytes: 1024 * 1024,
  budgetRevision: 3,
  residentBytes: 200,
  missingBytes: 100,
  pinnedBytes: 50,
  pinnedRoots: 1,
  overBudgetBytes: 0,
};
type Operation = Extract<SyncProductResult, { kind: 'operation' }>;
let node: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.resetAllMocks();
  mocks.readCacheStatus.mockResolvedValue({ kind: 'cache-status', status });
  mocks.trimCache.mockResolvedValue({ kind: 'accepted', requestId: 'trim-request' });
  node = document.createElement('div');
  document.body.append(node);
  root = createRoot(node);
});
afterEach(() => {
  act(() => root.unmount());
  node.remove();
});
async function render() {
  await act(async () =>
    root.render(
      <CommandPressScope value={true}>
        <SyncCacheSection />
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
it('saves a zero soft budget using the current native revision', async () => {
  mocks.setCacheBudget.mockResolvedValue({ kind: 'cache-budget', budgetBytes: 0, revision: 4 });
  await render();
  const input = node.querySelector('input');
  if (!input) throw new Error('Budget input missing');
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  await act(async () => {
    setter?.call(input, '0');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => button('shared.syncCache.saveBudget').click());
  expect(mocks.setCacheBudget).toHaveBeenCalledWith(0, 3);
});
it('keeps a refused cancellation busy and reports only the observed completion', async () => {
  let finish: ((result: Operation) => void) | undefined;
  mocks.waitForOperation.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  mocks.cancel.mockResolvedValue({ kind: 'cancelled', outcome: 'refused' });
  await render();
  await act(async () => {
    button('shared.syncCache.trim').click();
    button('shared.syncCache.trim').click();
  });
  expect(mocks.trimCache).toHaveBeenCalledTimes(1);
  await act(async () => button('shared.syncCache.cancel').click());
  expect(button('shared.syncCache.trim').disabled).toBe(true);
  expect(node.textContent).toContain(translate('shared.syncCache.cancelRefused'));
  await act(async () =>
    finish?.({
      kind: 'operation',
      job: { requestId: 'trim-request', kind: 'cache-trim', state: 'ready', failureCode: null },
      completion: {
        kind: 'cache-trim',
        result: { released: 1, releasedBytes: 80, unavailable: 0, busy: 0, protected: 0, status },
      },
    })
  );
  expect(button('shared.syncCache.trim').disabled).toBe(false);
  expect(node.textContent).toContain(
    translate('shared.syncCache.completed').replace('{bytes}', formatBytes(80))
  );
});
it('does not report a missing job as a completed trim and permits a status retry', async () => {
  mocks.waitForOperation.mockResolvedValue({ kind: 'operation', job: null, completion: null });
  await render();
  await act(async () => button('shared.syncCache.trim').click());
  expect(node.querySelector('[role="alert"]')?.textContent).toBe(
    translate('shared.syncCache.failed')
  );
  expect(node.textContent).not.toContain(
    translate('shared.syncCache.completed').replace('{bytes}', formatBytes(0))
  );
  await act(async () => button('shared.syncCache.retry').click());
  expect(mocks.readCacheStatus).toHaveBeenCalledTimes(2);
});
