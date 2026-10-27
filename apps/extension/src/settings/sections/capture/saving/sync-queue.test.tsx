// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CommandPressScope } from '@sniptale/ui/control-language/press';
const mocks = vi.hoisted(() => ({ read: vi.fn(), command: vi.fn() }));
vi.mock('../../../../workflows/sync-transfer/queue-management', () => ({
  createSyncQueueManagement: () => mocks,
}));
import { SyncQueueSection } from './sync-queue';
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
  mocks.command.mockResolvedValue({ kind: 'applied', history: 'delivered' });
});
afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});
async function render() {
  const node = document.createElement('div');
  document.body.append(node);
  const root = createRoot(node);
  await act(async () =>
    root.render(
      <CommandPressScope value={true}>
        <SyncQueueSection />
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
  return { node, button };
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
it('passes continuation explicitly and restarts traversal on refresh', async () => {
  const cursor = { scope, afterOperationId: 'op' };
  mocks.read.mockResolvedValue({ ...ready, nextCursor: cursor });
  const f = await render();
  await act(async () => f.button('settings.syncQueue.next').click());
  expect(mocks.read).toHaveBeenLastCalledWith(cursor);
  await act(async () => f.button('settings.syncQueue.refresh').click());
  expect(mocks.read).toHaveBeenLastCalledWith(null);
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
