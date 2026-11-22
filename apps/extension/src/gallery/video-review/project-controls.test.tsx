// @vitest-environment jsdom
import { projectReviewWorkspace } from '../../workflows/video-review/session-durable-access';
import type { ReviewSessionState } from '../../workflows/video-review/session-types';
import { createQuickEditAdvancedState } from '../../features/video/review/advanced/defaults';
import type { VideoWorkspaceSnapshot } from '../../composition/persistence/review-workspaces/contracts';
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

it('releases Busy after a failed flush and opens a new session after retrying the save', async () => {
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
  const saveBuffered = vi.fn(async () => snapshot).mockRejectedValueOnce(new Error('quota'));
  const canStart = vi.fn(() => true);
  const setBusy = vi.fn();
  const failures: unknown[] = [];
  const state = {
    session: {
      rename,
      saveBuffered,
      getCheckpointExitReceipt: () => null,
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
    expect(saveBuffered).toHaveBeenCalledTimes(2);
    expect(created).toHaveBeenCalledExactlyOnceWith(
      expect.stringMatching(/^recording:quick-project:/),
      'recording:source'
    );
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
  const save = vi.fn(async () => snapshot);
  const getCheckpointExitReceipt = vi.fn<() => ReturnType<typeof rootReceipt> | null>(() =>
    rootReceipt(snapshot.workspace.aggregateId)
  );
  const created = vi.fn();
  const flush = vi.fn(async () => undefined);
  const failures: unknown[] = [];
  const state = {
    session: {
      saveBuffered: save,
      getCheckpointExitReceipt,
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
    save,
    getCheckpointExitReceipt,
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
  'requests only the retained project receipt before opening a new session; independent=%s',
  async (retained) => {
    const f = projectCommandFixture(retained);
    try {
      await act(async () => f.commands().newProject!());
      expect(f.save).toHaveBeenCalledOnce();
      expect(requestExit.mock.calls.map((call) => call[0].rootId)).toEqual([
        retained ? 'recording:editor-a' : 'recording:source',
      ]);
      expect(f.created).toHaveBeenCalledExactlyOnceWith(
        expect.stringMatching(/^recording:quick-project:/),
        'recording:source'
      );
    } finally {
      f.cleanup();
    }
  }
);

it.each(['edit', 'rebind', 'unmount'] as const)(
  'does not open a new session after %s during the retained checkpoint request',
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
  'retains the old project through save or flush refusal and treats ' +
    'exit IPC failure as advisory',
  async () => {
    const f = projectCommandFixture(true);
    try {
      f.save.mockRejectedValueOnce(new Error('Native refused'));
      await act(async () => f.commands().newProject!());
      expect(requestExit).not.toHaveBeenCalled();
      expect(f.created).not.toHaveBeenCalled();
      f.flush.mockRejectedValueOnce(new Error('Recovery refused'));
      await act(async () => f.commands().newProject!());
      expect(f.save).toHaveBeenCalledOnce();
      requestExit.mockRejectedValueOnce(new Error('Worker unavailable'));
      await act(async () => f.commands().newProject!());
      expect(f.save).toHaveBeenCalledTimes(2);
      expect(requestExit).toHaveBeenCalledOnce();
      expect(f.created).toHaveBeenCalledOnce();
      expect(f.failures).toHaveLength(2);
    } finally {
      f.cleanup();
    }
  }
);

it('opens a new session without a checkpoint request when the current project has no receipt', async () => {
  const f = projectCommandFixture();
  try {
    f.getCheckpointExitReceipt.mockReturnValueOnce(null);
    await act(async () => f.commands().newProject!());
    expect(requestExit).not.toHaveBeenCalled();
    expect(f.created).toHaveBeenCalledOnce();
  } finally {
    f.cleanup();
  }
});

it('does not switch away from a project replaced while requesting its checkpoint', async () => {
  const f = projectCommandFixture(true);
  const rpc = projectDeferred<void>();
  requestExit.mockReturnValueOnce(rpc.promise);
  try {
    await act(async () => f.commands().newProject!());
    expect(requestExit).toHaveBeenCalledOnce();
    const replacement = { ...f.snapshot, workspace: { ...f.snapshot.workspace, revision: 2 } };
    f.setCurrent({ snapshot: replacement, document: projectReviewWorkspace(replacement) });
    await act(async () => rpc.resolve());
    expect(f.created).not.toHaveBeenCalled();
    f.getCheckpointExitReceipt.mockReturnValueOnce(null);
    await act(async () => f.commands().newProject!());
    expect(f.save).toHaveBeenCalledTimes(2);
    expect(requestExit).toHaveBeenCalledOnce();
    expect(f.created).toHaveBeenCalledExactlyOnceWith(
      expect.stringMatching(/^recording:quick-project:/),
      'recording:source'
    );
  } finally {
    f.cleanup();
  }
});
