// @vitest-environment jsdom
import { projectReviewWorkspace } from '../../workflows/video-review/session-durable-access';
import type { ReviewSessionState } from '../../workflows/video-review/session-types';
import { createQuickEditAdvancedState } from '../../features/video/review/advanced/defaults';
import type {
  VideoWorkspaceProjectCreationAcknowledgement,
  VideoWorkspaceSnapshot,
} from '../../composition/persistence/review-workspaces/contracts';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
const requestExit = vi.hoisted(() => vi.fn());
vi.mock('../../platform/runtime-messaging/sync-product-client', () => ({
  createSyncProductClient: () => ({ requestCheckpointExit: requestExit }),
}));
import { ReviewProjectTitle, useReviewProjectCommands } from './project-controls';

it('renames on a single title click, retains a failed draft for retry, and cancels with Escape', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const rename = vi
    .fn<(name: string) => Promise<void>>()
    .mockRejectedValueOnce(new Error('quota'))
    .mockResolvedValue(undefined);
  const render = () =>
    root.render(<ReviewProjectTitle name="Original" busy={false} onRename={rename} />);
  const edit = (value: string) => {
    const input = host.querySelector<HTMLInputElement>('input')!;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const key = (value: string) =>
    host
      .querySelector('input')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true }));
  try {
    act(render);
    act(() => host.querySelector<HTMLButtonElement>('button')!.click());
    expect(document.activeElement).toBe(host.querySelector('input'));
    act(() => edit('  New title  '));
    await act(async () => {
      key('Enter');
    });
    expect(rename).toHaveBeenCalledExactlyOnceWith('New title');
    expect(host.querySelector('input')?.getAttribute('aria-invalid')).toBe('true');
    expect(host.querySelector<HTMLInputElement>('input')!.value).toBe('  New title  ');
    await act(async () => {
      key('Enter');
    });
    expect(rename).toHaveBeenCalledTimes(2);
    expect(host.querySelector('input')).toBeNull();
    act(() => host.querySelector<HTMLButtonElement>('button')!.click());
    act(() => edit('Discard'));
    act(() => key('Escape'));
    expect(host.querySelector('input')).toBeNull();
    expect(rename).toHaveBeenCalledTimes(2);
    act(() => host.querySelector<HTMLButtonElement>('button')!.click());
    act(() => edit('   '));
    await act(async () => {
      key('Enter');
    });
    expect(rename).toHaveBeenCalledTimes(2);
  } finally {
    act(() => root.unmount());
    host.remove();
  }
});

it('flushes project commands, releases Busy after failure, and retains New receipt through retry', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const snapshot: VideoWorkspaceSnapshot = {
    workspace: {
      aggregateId: 'recording:source',
      formatVersion: 1,
      sourceAssetId: 'asset',
      source: { duration: 2, width: 640, height: 360, mimeType: 'video/webm', size: 5 },
      revision: 1,
      history: [],
      cursor: 0,
      advanced: createQuickEditAdvancedState(),
      createdAt: 1,
      updatedAt: 1,
    },
    draft: null,
  };
  const created = vi.fn();
  const flush = vi.fn(async () => {});
  const rename = vi.fn(async (_name: string) => snapshot);
  const createProject = vi
    .fn(async (_receipt: string) => snapshot)
    .mockRejectedValueOnce(new Error('quota'));
  const canStart = vi.fn(() => true);
  const setBusy = vi.fn();
  const failures: unknown[] = [];
  const state = {
    session: {
      rename,
      createProject,
      getSnapshot: () => ({
        snapshot,
        document: projectReviewWorkspace(snapshot),
        dirty: false,
        pending: 0,
        error: null,
        autosaveEnabled: true,
      }),
    },
    canStart,
    setBusy,
    beforeAction: (action: () => void) => action(),
    run: async (action: () => Promise<unknown>) => {
      try {
        await action();
      } catch (error) {
        failures.push(error);
      }
    },
  };
  let commands: ReturnType<typeof useReviewProjectCommands> | undefined;
  function Harness({ enabled = true }: { enabled?: boolean }) {
    commands = useReviewProjectCommands(state, flush, enabled ? created : undefined);
    return null;
  }
  const host = document.createElement('div');
  const root = createRoot(host);
  try {
    act(() => root.render(<Harness />));
    await commands!.rename('Name');
    expect(flush).toHaveBeenCalledOnce();
    expect(rename).toHaveBeenCalledExactlyOnceWith('Name');
    expect(setBusy.mock.calls).toEqual([[true], [false]]);
    flush.mockRejectedValueOnce(new Error('flush failed'));
    await expect(commands!.rename('Refused')).rejects.toThrow('flush failed');
    expect(rename).toHaveBeenCalledOnce();
    expect(setBusy.mock.lastCall).toEqual([false]);
    canStart.mockReturnValueOnce(false);
    await expect(commands!.rename('Busy')).rejects.toThrow('busy');
    await act(async () => commands!.newProject!());
    expect(failures).toHaveLength(1);
    expect(created).not.toHaveBeenCalled();
    await act(async () => commands!.newProject!());
    expect(createProject.mock.calls[0]).toEqual(createProject.mock.calls[1]);
    expect(created).toHaveBeenCalledExactlyOnceWith('recording:source');
    act(() => root.render(<Harness enabled={false} />));
    expect(commands!.newProject).toBeUndefined();
  } finally {
    act(() => root.unmount());
  }
});

function projectDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function projectCommandFixture(retained = false) {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  requestExit.mockReset().mockResolvedValue({ kind: 'checkpoint-exit', outcome: 'requested' });
  const snapshot: VideoWorkspaceSnapshot = {
    workspace: {
      aggregateId: retained ? 'recording:editor-a' : 'recording:source',
      ...(retained ? { sourceMediaId: 'recording:source' } : {}),
      formatVersion: 1,
      sourceAssetId: 'asset',
      source: { duration: 2, width: 640, height: 360, mimeType: 'video/webm', size: 5 },
      revision: 1,
      history: [],
      cursor: 0,
      advanced: createQuickEditAdvancedState(),
      createdAt: 1,
      updatedAt: 1,
    },
    draft: null,
  };
  let current: ReviewSessionState = {
    snapshot,
    document: projectReviewWorkspace(snapshot),
    autosaveEnabled: true,
    dirty: false,
    pending: 0,
    error: null,
  };
  const rootReceipt = (rootId: string) => ({
    rootKind: 'video-review' as const,
    rootId,
    revision: '00000000-0000-4000-8000-000000000005',
  });
  const create = vi.fn<(command: string) => Promise<VideoWorkspaceProjectCreationAcknowledgement>>(
    async (command) => ({
      workspace: { ...snapshot.workspace, aggregateId: 'recording:source' },
      draft: null,
      archiveCheckpointReceipt: rootReceipt(`recording:quick-project:${command}`),
      ...(retained
        ? { retainedEditorCheckpointReceipt: rootReceipt(snapshot.workspace.aggregateId) }
        : {}),
    })
  );
  const created = vi.fn();
  const flush = vi.fn(async () => undefined);
  const failures: unknown[] = [];
  const state = {
    session: {
      createProject: create,
      rename: vi.fn(async () => snapshot),
      getSnapshot: () => current,
    },
    canStart: () => true,
    setBusy: vi.fn(),
    beforeAction: (action: () => void) => action(),
    run: async (action: () => Promise<unknown>) => {
      try {
        await action();
      } catch (error) {
        failures.push(error);
      }
    },
  };
  let commands!: ReturnType<typeof useReviewProjectCommands>;
  function Harness({ selected = state }: { selected?: typeof state }) {
    commands = useReviewProjectCommands(selected, flush, created);
    return null;
  }
  const root = createRoot(document.createElement('div'));
  act(() => root.render(<Harness />));
  return {
    snapshot,
    state,
    create,
    created,
    flush,
    failures,
    commands: () => commands,
    setCurrent: (change: Partial<ReviewSessionState>) => {
      current = { ...current, ...change };
    },
    rebind: () =>
      act(() => root.render(<Harness selected={{ ...state, session: { ...state.session } }} />)),
    unmount: () => act(() => root.render(null)),
    cleanup: () => act(() => root.unmount()),
  };
}

it.each([false, true])(
  'requests only fixed New roles before opening the returned default; retained=%s',
  async (retained) => {
    const f = projectCommandFixture(retained);
    try {
      await act(async () => f.commands().newProject!());
      const command = f.create.mock.calls[0]![0];
      expect(requestExit.mock.calls.map((call) => call[0].rootId)).toEqual([
        `recording:quick-project:${command}`,
        ...(retained ? ['recording:editor-a'] : []),
      ]);
      expect(requestExit.mock.calls.some((call) => call[0].rootId === 'recording:source')).toBe(
        false
      );
      expect(f.created).toHaveBeenCalledExactlyOnceWith('recording:source');
    } finally {
      f.cleanup();
    }
  }
);

it.each(['edit', 'rebind', 'unmount'] as const)(
  'does not continue a New transition or request the second role after %s during first IPC',
  async (change) => {
    const f = projectCommandFixture(true);
    const rpc = projectDeferred<void>();
    requestExit.mockReturnValueOnce(rpc.promise);
    try {
      await act(async () => f.commands().newProject!());
      expect(requestExit).toHaveBeenCalledOnce();
      if (change === 'edit') f.setCurrent({ dirty: true });
      else if (change === 'rebind') f.rebind();
      else f.unmount();
      await act(async () => rpc.resolve());
      expect(requestExit).toHaveBeenCalledOnce();
      expect(f.created).not.toHaveBeenCalled();
    } finally {
      f.cleanup();
    }
  }
);

it(
  'preserves the native command identity through native and flush refusal and treats ' +
    'exit IPC failure as advisory',
  async () => {
    const f = projectCommandFixture(true);
    try {
      f.create.mockRejectedValueOnce(new Error('Native refused'));
      await act(async () => f.commands().newProject!());
      expect(requestExit).not.toHaveBeenCalled();
      expect(f.created).not.toHaveBeenCalled();
      f.flush.mockRejectedValueOnce(new Error('Recovery refused'));
      await act(async () => f.commands().newProject!());
      expect(f.create).toHaveBeenCalledOnce();
      requestExit.mockRejectedValueOnce(new Error('Worker unavailable'));
      await act(async () => f.commands().newProject!());
      expect(f.create.mock.calls[0]).toEqual(f.create.mock.calls[1]);
      expect(requestExit).toHaveBeenCalledTimes(2);
      expect(f.created).toHaveBeenCalledOnce();
      expect(f.failures).toHaveLength(2);
    } finally {
      f.cleanup();
    }
  }
);

it('does not invent a role RPC for an older or replayed creation ACK without receipts', async () => {
  const f = projectCommandFixture();
  try {
    f.create.mockResolvedValueOnce({ workspace: f.snapshot.workspace, draft: null });
    await act(async () => f.commands().newProject!());
    expect(requestExit).not.toHaveBeenCalled();
    expect(f.created).toHaveBeenCalledOnce();
  } finally {
    f.cleanup();
  }
});

it(
  'rejects a canonical replacement during the second role IPC and retries the same ' +
    'completed command without selecting newer pending work',
  async () => {
    const f = projectCommandFixture(true);
    const rpc = projectDeferred<void>();
    requestExit
      .mockResolvedValueOnce({ kind: 'checkpoint-exit', outcome: 'requested' })
      .mockReturnValueOnce(rpc.promise);
    try {
      await act(async () => f.commands().newProject!());
      expect(requestExit).toHaveBeenCalledTimes(2);
      const replacement = { ...f.snapshot, workspace: { ...f.snapshot.workspace, revision: 2 } };
      f.setCurrent({ snapshot: replacement, document: projectReviewWorkspace(replacement) });
      await act(async () => rpc.resolve());
      expect(f.created).not.toHaveBeenCalled();
      f.create.mockResolvedValueOnce({
        workspace: { ...replacement.workspace, aggregateId: 'recording:source' },
        draft: null,
      });
      await act(async () => f.commands().newProject!());
      expect(f.create.mock.calls[1]).toEqual(f.create.mock.calls[0]);
      expect(requestExit).toHaveBeenCalledTimes(2);
      expect(f.created).toHaveBeenCalledExactlyOnceWith('recording:source');
    } finally {
      f.cleanup();
    }
  }
);
