// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CommandPressScope } from '@sniptale/ui/control-language/press';
const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  command: vi.fn(),
  readStatus: vi.fn(),
  cancel: vi.fn(),
  subscribe: vi.fn(),
  unsubscribe: vi.fn(),
}));
vi.mock('../../../../platform/runtime-messaging/sync-product-client', () => ({
  createSyncProductClient: () => mocks,
  subscribeToSyncProductSettled: (listener: () => void) => {
    mocks.subscribe(listener);
    return mocks.unsubscribe;
  },
}));
vi.mock('../../../../workflows/sync-transfer/queue-management', () => ({
  createSyncQueueManagement: () => mocks,
}));
import { SyncQueueSection } from './sync-queue';
import type { SettingsQueueFilter } from '../../../../platform/navigation/extension-pages/settings-route/codec';
import { translate } from '../../../../platform/i18n';
const scope = { spaceId: 'space', connectionGeneration: 1, profileCreatedAt: 1 };
const ready = {
  kind: 'ready',
  scope,
  connection: { paused: false, revision: 3 },
  nextCursor: null,
  operations: [
    {
      operationId: 'op',
      revision: 5,
      status: 'queued',
      stage: 'queued',
      failureCode: null,
      outcome: 'unknown',
    },
  ],
  sources: [
    {
      label: '<img src=x onerror=bad()> Пример.png',
      rootKind: 'media',
      changeKind: 'media',
      createdAt: 1,
    },
  ],
};
let cleanup: (() => void) | undefined;
beforeEach(() => {
  vi.resetAllMocks();
  mocks.read.mockResolvedValue(ready);
  mocks.readStatus.mockResolvedValue({ kind: 'status', status: { products: [] } });
  mocks.cancel.mockResolvedValue({ kind: 'cancelled', outcome: 'cancelled' });
  mocks.command.mockResolvedValue({ kind: 'applied', history: 'delivered' });
});
afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});
async function render(filter?: SettingsQueueFilter) {
  const node = document.createElement('div');
  document.body.append(node);
  const root = createRoot(node);
  await act(async () =>
    root.render(
      <CommandPressScope value={true}>
        <SyncQueueSection {...(filter === undefined ? {} : { filter })} />
      </CommandPressScope>
    )
  );
  cleanup = () => {
    act(() => root.unmount());
    node.remove();
  };
  const button = (key: Parameters<typeof translate>[0]) => {
    const result = [...node.querySelectorAll('button')].find(
      (item) => item.textContent === translate(key)
    );
    if (!result) throw new Error(`Button missing: ${key}`);
    return result;
  };
  const rerenderFilter = async (filter: SettingsQueueFilter) => {
    await act(async () =>
      root.render(
        <CommandPressScope value={true}>
          <SyncQueueSection {...(filter === undefined ? {} : { filter })} />
        </CommandPressScope>
      )
    );
  };
  return { node, button, rerenderFilter };
}
it('renders source names as text and explains cancellation and unknown outcomes', async () => {
  const f = await render();
  expect(f.node.textContent).toContain(ready.sources[0]!.label);
  expect(f.node.querySelector('img')).toBeNull();
  expect(f.node.textContent).toContain(translate('settings.syncQueue.unknown'));
  expect(f.node.querySelector('a')?.getAttribute('href')).toBe('?section=events-logs');
  expect(f.node.textContent).toContain(translate('settings.syncQueue.cancelHint'));
});
it('sends exact native command revisions and refreshes after an applied command', async () => {
  const f = await render();
  await act(async () => f.button('settings.syncQueue.action.cancel').click());
  expect(mocks.command).toHaveBeenCalledWith({
    kind: 'operation',
    scope,
    operationId: 'op',
    revision: 5,
    command: 'cancel',
  });
  expect(mocks.read).toHaveBeenCalledTimes(2);
  expect(f.node.textContent).toContain(translate('settings.syncQueue.applied'));
});
it('disables all commands while work is pending and reports a refused selection', async () => {
  let release!: (value: unknown) => void;
  mocks.command.mockReturnValueOnce(
    new Promise((resolve) => {
      release = resolve;
    })
  );
  const f = await render();
  act(() => f.button('settings.syncQueue.action.cancel').click());
  expect([...f.node.querySelectorAll('button')].every((button) => button.disabled)).toBe(true);
  await act(async () => release({ kind: 'refused' }));
  expect(f.node.querySelector('[role=alert]')?.textContent).toContain(
    translate('settings.syncQueue.refused')
  );
});
it('preserves committed status when history is pending', async () => {
  mocks.command.mockResolvedValueOnce({ kind: 'applied', history: 'pending' });
  const f = await render();
  await act(async () => f.button('settings.syncQueue.action.pause').click());
  expect(f.node.textContent).toContain(translate('settings.syncQueue.historyPending'));
});
it('distinguishes unconfigured storage from read failure and permits explicit refresh', async () => {
  mocks.read.mockResolvedValueOnce({ kind: 'unconfigured' });
  const f = await render();
  expect(f.node.textContent).toContain(translate('settings.syncQueue.unconfigured'));
  mocks.read.mockRejectedValueOnce(new Error('private database detail'));
  await act(async () => f.button('settings.syncQueue.refresh').click());
  expect(f.node.textContent).toContain(translate('settings.syncQueue.unavailable'));
  expect(f.node.textContent).not.toContain('private database detail');
  await act(async () => f.button('settings.syncQueue.refresh').click());
  expect(f.node.textContent).toContain(ready.sources[0]!.label);
});
it('preserves the selected page on refresh and explicitly returns to the start', async () => {
  const cursor = { scope, afterOperationId: 'op' };
  mocks.read.mockResolvedValue({ ...ready, nextCursor: cursor });
  const f = await render();
  await act(async () => f.button('settings.syncQueue.next').click());
  expect(mocks.read).toHaveBeenLastCalledWith(cursor, 'all');
  await act(async () => f.button('settings.syncQueue.refresh').click());
  expect(mocks.read).toHaveBeenLastCalledWith(cursor, 'all');
  await act(async () => f.button('settings.syncQueue.firstPage').click());
  expect(mocks.read).toHaveBeenLastCalledWith(null, 'all');
});

it.each([
  ['paused', 'resume'],
  ['failed', 'retry'],
  ['interrupted', 'retry'],
  ['published', null],
  ['cancelled', null],
] as const)('offers only valid controls for %s work', async (status, action) => {
  mocks.read.mockResolvedValue({
    ...ready,
    operations: [
      { ...ready.operations[0], status, failureCode: status === 'failed' ? 'temporary' : null },
    ],
  });
  const f = await render();
  const row = f.node.querySelector('li')!;
  if (action) {
    expect(row.textContent).toContain(translate(`settings.syncQueue.action.${action}`));
    expect(row.querySelectorAll('button')).toHaveLength(2);
  } else expect(row.querySelectorAll('button')).toHaveLength(0);
  if (status === 'failed')
    expect(row.textContent).toContain(translate('settings.syncQueue.failure.temporary'));
});
it('keeps stale data visible but refuses commands after a failed refresh', async () => {
  const f = await render();
  mocks.read.mockRejectedValueOnce(new Error('read failed'));
  await act(async () => f.button('settings.syncQueue.refresh').click());
  expect(f.node.textContent).toContain(ready.sources[0]!.label);
  expect(f.button('settings.syncQueue.action.cancel').disabled).toBe(true);
  expect(f.button('settings.syncQueue.refresh').disabled).toBe(false);
});
it('does not read another page after an admitted command finishes following unmount', async () => {
  let release!: (value: unknown) => void;
  mocks.command.mockReturnValueOnce(
    new Promise((resolve) => {
      release = resolve;
    })
  );
  const f = await render();
  act(() => f.button('settings.syncQueue.action.cancel').click());
  cleanup?.();
  cleanup = undefined;
  await act(async () => release({ kind: 'applied', history: 'delivered' }));
  expect(mocks.read).toHaveBeenCalledOnce();
});

it('identifies saved video review work as a project in the readable queue', async () => {
  mocks.read.mockResolvedValue({
    ...ready,
    sources: [{ ...ready.sources[0], rootKind: 'video-review', changeKind: 'video-review' }],
  });
  const f = await render();
  const row = f.node.querySelector('li');
  expect(row?.textContent).toContain(translate('settings.syncQueue.project'));
  expect(row?.textContent).not.toContain(translate('settings.syncQueue.media'));
});

it.each(['replica-prepare', 'scenario-export-prepare', 'library-backup-prepare'] as const)(
  'shows and cancels runtime %s work after its original surface closes, then reloads the owner',
  async (kind) => {
    const requestId = '11111111-1111-4111-8111-111111111111';
    mocks.readStatus.mockResolvedValue({
      kind: 'status',
      status: {
        products: [{ requestId, kind, state: 'running', failureCode: null }],
      },
    });
    const f = await render();
    const row = f.node.querySelector('[data-ui="settings.sync-runtime-jobs"] li');
    expect(row?.textContent).toContain(translate(`settings.syncQueue.jobKind.${kind}`));
    let release!: (value: unknown) => void;
    mocks.cancel.mockReturnValueOnce(
      new Promise((resolve) => {
        release = resolve;
      })
    );
    act(() => row?.querySelector('button')?.click());
    expect(mocks.cancel).toHaveBeenCalledExactlyOnceWith(requestId);
    expect(row?.querySelector('button')?.disabled).toBe(true);
    mocks.readStatus.mockResolvedValue({
      kind: 'status',
      status: {
        products: [{ requestId, kind, state: 'interrupted', failureCode: 'interrupted' }],
      },
    });
    await act(async () => release({ kind: 'cancelled', outcome: 'cancelled' }));
    expect(f.node.querySelector('[data-ui="settings.sync-runtime-jobs"] li button')).toBeNull();
    expect(f.node.textContent).toContain(translate('settings.syncQueue.jobState.interrupted'));
  }
);
it('keeps outgoing management available when runtime status fails and disposes its subscription', async () => {
  mocks.readStatus.mockRejectedValueOnce(new Error('private runtime detail'));
  const f = await render();
  expect(f.node.textContent).toContain(ready.sources[0]!.label);
  expect(f.node.textContent).toContain(translate('settings.syncQueue.runtimeUnavailable'));
  expect(f.node.textContent).not.toContain('private runtime detail');
  cleanup?.();
  cleanup = undefined;
  expect(mocks.unsubscribe).toHaveBeenCalledOnce();
});
it('reports a refused runtime cancellation and retains the running row', async () => {
  const requestId = '11111111-1111-4111-8111-111111111111';
  mocks.readStatus.mockResolvedValue({
    kind: 'status',
    status: {
      products: [{ requestId, kind: 'backup-prepare', state: 'running', failureCode: null }],
    },
  });
  mocks.cancel.mockResolvedValueOnce({ kind: 'cancelled', outcome: 'refused' });
  const f = await render();
  await act(async () =>
    f.node
      .querySelector<HTMLButtonElement>('[data-ui="settings.sync-runtime-jobs"] button')
      ?.click()
  );
  expect(f.node.textContent).toContain(translate('settings.syncQueue.refused'));
  expect(f.node.querySelector('[data-ui="settings.sync-runtime-jobs"] button')).not.toBeNull();
});

it('queries a global selected filter before pagination and labels its count as operations', async () => {
  mocks.read.mockResolvedValue({ ...ready, problemCount: 301 });
  const f = await render('problems');
  expect(mocks.read).toHaveBeenCalledWith(null, 'problems');
  const filters = f.node.querySelector('[data-ui="sync-queue.filters"]');
  expect(filters?.textContent).toContain('301');
  expect(filters?.textContent).toContain(translate('settings.syncQueue.operationsUnit'));
});
it('does not treat an empty bounded matching page as the end of the filter', async () => {
  mocks.read.mockResolvedValue({
    ...ready,
    operations: [],
    sources: [],
    problemCount: 129,
    nextCursor: { afterOperationId: 'scanned' },
  });
  const f = await render('action-required');
  expect(f.node.textContent).not.toContain(translate('settings.syncQueue.empty'));
  expect(f.node.querySelector('[data-ui="sync-queue.continue-search"]')).not.toBeNull();
});
it('discards a late result after route filter changes and resets its incompatible cursor', async () => {
  let finish!: (value: unknown) => void;
  mocks.read.mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    })
  );
  const f = await render('all');
  mocks.read.mockResolvedValueOnce({
    ...ready,
    sources: [{ ...ready.sources[0], label: 'Current problem' }],
  });
  await f.rerenderFilter('problems');
  expect(mocks.read).toHaveBeenLastCalledWith(null, 'problems');
  expect(f.node.textContent).toContain('Current problem');
  await act(async () =>
    finish({ ...ready, sources: [{ ...ready.sources[0], label: 'Stale all result' }] })
  );
  expect(f.node.textContent).not.toContain('Stale all result');
  expect(f.node.textContent).toContain('Current problem');
});

it('keeps checkpoint waiting visible when no immutable operation exists', async () => {
  mocks.read.mockResolvedValue({
    ...ready,
    operations: [],
    sources: [],
    problemCount: 0,
    pending: { count: 7, minimumDueAt: null },
  });
  const f = await render();
  expect(f.node.querySelector('[data-ui="sync-queue.pending"]')?.textContent).toContain('7');
  expect(f.node.textContent).not.toContain(translate('settings.syncQueue.empty'));
  expect(f.node.querySelector('[data-ui="sync-queue.pending"] a')?.getAttribute('href')).toBe(
    '?section=saving&view=connection'
  );
});
it('offers one shared repair link and cancellation for replaced connection operations', async () => {
  mocks.read.mockResolvedValue({
    ...ready,
    operations: [
      {
        ...ready.operations[0],
        operationId: 'old-a',
        status: 'failed',
        failureCode: 'authentication',
      },
      {
        ...ready.operations[0],
        operationId: 'old-b',
        status: 'failed',
        failureCode: 'authentication',
      },
    ],
    sources: [ready.sources[0], ready.sources[0]].map((source) => ({
      ...source,
      retryAllowed: false,
      retryBlocked: 'connection-replaced',
    })),
  });
  const f = await render('action-required');
  expect(f.node.querySelectorAll('[data-ui="sync-queue.shared-repairs"] a')).toHaveLength(1);
  const rows = [...f.node.querySelectorAll('li[data-operation-id]')];
  expect(rows).toHaveLength(2);
  for (const row of rows) {
    expect(row.querySelectorAll('button')).toHaveLength(1);
    expect(row.querySelector('button')?.textContent).toBe(
      translate('settings.syncQueue.action.cancel')
    );
    expect(row.textContent).toContain(translate('settings.syncQueue.connectionReplaced'));
  }
});
it('retains the selected filter after refusal and focuses that filter after the last problem disappears', async () => {
  mocks.read.mockResolvedValueOnce({
    ...ready,
    operations: [{ ...ready.operations[0], status: 'failed' }],
    problemCount: 1,
  });
  const f = await render('problems');
  mocks.command.mockResolvedValueOnce({ kind: 'refused' });
  mocks.read.mockResolvedValueOnce({
    ...ready,
    operations: [{ ...ready.operations[0], status: 'failed', revision: 9 }],
    problemCount: 1,
  });
  await act(async () => f.button('settings.syncQueue.action.retry').click());
  expect(mocks.read).toHaveBeenLastCalledWith(null, 'problems');
  expect(f.node.textContent).toContain(translate('settings.syncQueue.refused'));
  mocks.read.mockResolvedValueOnce({ ...ready, operations: [], sources: [], problemCount: 0 });
  await act(async () => f.button('settings.syncQueue.action.cancel').click());
  expect(f.node.querySelector('[data-ui="sync-queue.filters"] [aria-pressed="true"]')).toBe(
    document.activeElement
  );
  expect(f.node.textContent).toContain(translate('settings.syncQueue.noMatches'));
  expect(mocks.command).toHaveBeenLastCalledWith({
    kind: 'operation',
    scope,
    operationId: 'op',
    revision: 9,
    command: 'cancel',
  });
});
it('keeps completed history in a closed shared disclosure and exposes the full name in details', async () => {
  mocks.read.mockResolvedValue({
    ...ready,
    operations: [{ ...ready.operations[0], status: 'published' }],
  });
  const f = await render();
  const group = f.node.querySelector<HTMLDetailsElement>('[data-ui="sync-queue.completed"]');
  expect(group?.open).toBe(false);
  expect(group?.querySelector('[data-ui="sync-queue.operation-details"] p')?.textContent).toBe(
    ready.sources[0]!.label
  );
  expect(group?.textContent).toContain(translate('settings.syncQueue.completedPage'));
  expect(group?.querySelectorAll('button')).toHaveLength(0);
});
it('does not let an older failed read erase a newer filter success', async () => {
  let fail!: (reason: unknown) => void;
  mocks.read.mockReturnValueOnce(
    new Promise((_resolve, reject) => {
      fail = reject;
    })
  );
  const f = await render('all');
  mocks.read.mockResolvedValueOnce({
    ...ready,
    sources: [{ ...ready.sources[0], label: 'Newest action' }],
  });
  await f.rerenderFilter('action-required');
  await act(async () => fail(new Error('private old failure')));
  expect(f.node.textContent).toContain('Newest action');
  expect(f.node.textContent).not.toContain(translate('settings.syncQueue.unavailable'));
});

it.each([
  {
    status: 'queued',
    failureCode: 'temporary',
    nextDueAt: null,
    automaticRetryCount: 0,
    automatic: false,
    action: 'pause',
  },
  {
    status: 'paused',
    failureCode: 'temporary',
    nextDueAt: null,
    automaticRetryCount: 0,
    automatic: false,
    action: 'resume',
  },
  {
    status: 'cancelled',
    failureCode: 'temporary',
    nextDueAt: null,
    automaticRetryCount: 0,
    automatic: false,
    action: null,
  },
  {
    status: 'failed',
    failureCode: 'temporary',
    nextDueAt: 42,
    automaticRetryCount: 1,
    automatic: true,
    action: 'retry',
  },
  {
    status: 'interrupted',
    failureCode: 'interrupted',
    nextDueAt: 42,
    automaticRetryCount: 1,
    automatic: true,
    action: 'retry',
  },
  {
    status: 'failed',
    failureCode: 'temporary',
    nextDueAt: null,
    automaticRetryCount: 0,
    automatic: true,
    action: 'retry',
  },
  {
    status: 'failed',
    failureCode: 'temporary',
    nextDueAt: null,
    automaticRetryCount: 5,
    automatic: false,
    action: 'retry',
  },
  {
    status: 'interrupted',
    failureCode: 'interrupted',
    nextDueAt: null,
    automaticRetryCount: 5,
    automatic: false,
    action: 'retry',
  },
] as const)(
  'labels $status with retained $failureCode and retry count $automaticRetryCount from the actual native status',
  async (item) => {
    mocks.read.mockResolvedValue({
      ...ready,
      operations: [
        {
          ...ready.operations[0],
          status: item.status,
          failureCode: item.failureCode,
          nextDueAt: item.nextDueAt,
          automaticRetryCount: item.automaticRetryCount,
        },
      ],
    });
    const f = await render();
    const row = f.node.querySelector('li[data-operation-id="op"]');
    expect(row?.textContent).toContain(
      translate(
        item.automatic
          ? 'settings.syncQueue.automaticRetry'
          : `settings.syncQueue.status.${item.status}`
      )
    );
    if (!item.automatic)
      expect(row?.textContent).not.toContain(translate('settings.syncQueue.automaticRetry'));
    if (item.action)
      expect(row?.querySelector('button')?.textContent).toBe(
        translate(`settings.syncQueue.action.${item.action}`)
      );
    else expect(row?.querySelector('button')).toBeNull();
  }
);
