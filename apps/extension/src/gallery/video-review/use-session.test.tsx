// @vitest-environment jsdom
import { EDITOR_AUTOSAVE_POLICY } from '../../features/autosave/policy';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { VideoWorkspaceSnapshot } from '../../composition/persistence/review-workspaces/contracts';
import { createQuickEditAdvancedState } from '../../features/video/review/advanced/defaults';
import {
  parseVideoWorkspace,
  parseVideoWorkspaceDraft,
} from '../../composition/persistence/review-workspaces/parser';
import { createVideoReviewSession } from '../../workflows/video-review/session';
import { useReviewComposer, useReviewSnapshot } from './use-session';

const sessions: ReturnType<typeof createVideoReviewSession>[] = [];
let root: Root;
let host: HTMLDivElement;
let composer: ReturnType<typeof useReviewComposer>;
const annotation = {
  id: 'comment',
  text: 'Final dictated text',
  anchor: { kind: 'point' as const, time: 1 },
};
function setup() {
  let snapshot: VideoWorkspaceSnapshot = {
    workspace: {
      aggregateId: 'recording:r',
      sourceAssetId: 'asset',
      formatVersion: 1,
      source: { duration: 4, width: 320, height: 180, mimeType: 'video/webm', size: 200 },
      revision: 1,
      cursor: 0,
      advanced: createQuickEditAdvancedState(),
      history: [],
      createdAt: 1,
      updatedAt: 1,
    },
    draft: null,
  };
  const deps = {
    saveVideoWorkspaceDraft: vi.fn(async (args) => {
      snapshot = {
        ...snapshot,
        draft: args.annotation
          ? {
              aggregateId: 'recording:r',
              annotation: args.annotation,
              before: args.before,
              revision: (snapshot.draft?.revision ?? 0) + 1,
              updatedAt: 2,
            }
          : null,
      };
      return structuredClone(snapshot);
    }),
    commitVideoWorkspace: vi.fn(async (args) => {
      snapshot = {
        ...snapshot,
        workspace: {
          ...snapshot.workspace,
          history: [...snapshot.workspace.history, args.operation],
          cursor: snapshot.workspace.cursor + 1,
          revision: snapshot.workspace.revision + 1,
        },
        draft: null,
      };
      return structuredClone(snapshot);
    }),
    readVideoWorkspace: vi.fn(async () => structuredClone(snapshot)),
    moveVideoWorkspaceHistory: vi.fn(async () => structuredClone(snapshot)),
    saveVideoWorkspaceSnapshot: vi.fn(async (args) => {
      expect(args.expectedRevision).toBe(snapshot.workspace.revision);
      const workspace = parseVideoWorkspace(args.workspace);
      if (!workspace) throw new Error('Invalid fixture publication');
      const draft = args.draft === null ? null : parseVideoWorkspaceDraft(args.draft, 4);
      if (args.draft !== null && !draft) throw new Error('Invalid fixture draft');
      snapshot = {
        workspace: { ...workspace, revision: snapshot.workspace.revision + 1 },
        draft: draft ? { ...draft, revision: (snapshot.draft?.revision ?? 0) + 1 } : null,
      };
      return structuredClone(snapshot);
    }),
    saveVideoWorkspaceAdvanced: vi.fn(async () => structuredClone(snapshot)),
  } satisfies Parameters<typeof createVideoReviewSession>[1];
  const session = createVideoReviewSession(snapshot, deps);
  sessions.push(session);
  function Harness() {
    useReviewSnapshot(session);
    composer = useReviewComposer(session);
    return null;
  }
  act(() => root.render(<Harness />));
  return { session, deps, Harness };
}

function refuseRecoveryPublication(deps: ReturnType<typeof setup>['deps'], historyOnly = false) {
  const persist = deps.saveVideoWorkspaceSnapshot.getMockImplementation()!;
  let blocked = true;
  deps.saveVideoWorkspaceSnapshot.mockImplementation(async (request) => {
    if (blocked && (!historyOnly || parseVideoWorkspace(request.workspace)?.history.length))
      throw new Error('Quota');
    return persist(request);
  });
  return () => {
    blocked = false;
  };
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.useFakeTimers();
  host = document.createElement('div');
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  for (const session of sessions.splice(0)) await session.dispose();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('warns before closing for a local note draft before it reaches the review session', async () => {
  const { session, deps } = setup();
  const close = () => window.dispatchEvent(new Event('beforeunload', { cancelable: true }));
  expect(close()).toBe(true);
  act(() => composer.change(annotation, null));
  expect(session.getSnapshot().dirty).toBe(true);
  expect(close()).toBe(false);
  await act(async () => composer.flush());
  await act(async () => session.flush());
  expect((await deps.readVideoWorkspace()).draft?.annotation).toEqual(annotation);
  expect(close()).toBe(true);
});

it('coalesces many field changes, restores recovery on reopen, and commits exactly one operation', async () => {
  const { session, deps, Harness } = setup();
  act(() => {
    composer.change({ ...annotation, text: 'F' }, null);
    composer.change({ ...annotation, text: 'Final' });
    composer.change(annotation);
  });
  expect(deps.saveVideoWorkspaceDraft).not.toHaveBeenCalled();
  await act(async () => vi.advanceTimersByTimeAsync(EDITOR_AUTOSAVE_POLICY.delay));
  expect(deps.saveVideoWorkspaceSnapshot).toHaveBeenCalledOnce();
  await act(async () => session.flush());
  expect(deps.saveVideoWorkspaceSnapshot).toHaveBeenCalledOnce();
  expect(session.getSnapshot().snapshot.workspace.history).toHaveLength(0);
  await act(async () => root.render(null));
  act(() => root.render(<Harness />));
  expect(composer.annotation?.text).toBe(annotation.text);
  await act(async () => composer.save());
  expect(session.getSnapshot().snapshot.workspace.history).toHaveLength(1);
  expect(session.getSnapshot().snapshot.draft).toBeNull();
  expect(composer.annotation).toBeNull();
});

it('retains text after failed commit and allows retry without duplicate history', async () => {
  const { session, deps } = setup();
  const allow = refuseRecoveryPublication(deps, true);
  act(() => composer.change(annotation, null));
  await act(async () => {
    await expect(composer.save({ durable: true })).rejects.toThrow('Quota');
  });
  expect(composer.annotation?.text).toBe(annotation.text);
  expect(session.getSnapshot().document.annotations).toEqual([annotation]);
  expect(composer.getCurrent().before).toEqual(annotation);
  allow();
  await act(async () => composer.save({ durable: true }));
  expect(session.getSnapshot().snapshot.workspace.history).toHaveLength(1);
});

it('keeps a failed recovery buffer editable and retries its latest text without adding history', async () => {
  const { session, deps } = setup();
  const allow = refuseRecoveryPublication(deps);
  act(() => composer.change({ ...annotation, text: 'Keep this draft' }, null));
  await act(async () => {
    await composer.flush();
    await expect(session.flush()).rejects.toThrow('Quota');
  });
  expect(session.getSnapshot().dirty).toBe(true);
  expect(composer.saving).toBe(false);
  allow();
  act(() => composer.change(annotation));
  await act(async () => composer.flush());
  expect(session.getSnapshot().snapshot.draft?.annotation.text).toBe(annotation.text);
  expect(composer.dirty).toBe(false);
  expect(deps.commitVideoWorkspace).not.toHaveBeenCalled();
});

function gatePublication(
  deps: ReturnType<typeof setup>['deps'],
  outcome: 'saved' | 'failed' = 'saved'
) {
  const original = deps.saveVideoWorkspaceSnapshot.getMockImplementation()!;
  let release!: () => void;
  let entered!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  deps.saveVideoWorkspaceSnapshot.mockImplementationOnce(async (args) => {
    entered();
    await held;
    if (outcome === 'failed') throw new Error('Quota after unmount');
    return original(args);
  });
  return { release, started };
}

it.each(['saved', 'failed'] as const)(
  'settles an acquired recovery publication after unmount when it is %s',
  async (outcome) => {
    const { session, deps } = setup();
    const gate = gatePublication(deps, outcome);
    act(() => composer.change(annotation, null));
    await act(async () => composer.flush());
    const publication = session.flush();
    try {
      await act(async () => {
        await gate.started;
        root.render(null);
      });
      expect(deps.saveVideoWorkspaceSnapshot).toHaveBeenCalledOnce();
      gate.release();
      await act(async () => {
        if (outcome === 'failed') await expect(publication).rejects.toThrow('Quota after unmount');
        else await publication;
      });
      expect(session.getSnapshot()).toMatchObject({ pending: 0, saving: false });
      if (outcome === 'saved')
        expect((await deps.readVideoWorkspace()).draft?.annotation.text).toBe(annotation.text);
      else expect(session.getSnapshot()).toMatchObject({ error: 'storage', dirty: true });
      expect(deps.commitVideoWorkspace).not.toHaveBeenCalled();
    } finally {
      gate.release();
      await publication.catch(() => undefined);
    }
  }
);

it('keeps later typing dirty while an older recovery publication is pending', async () => {
  const { session, deps } = setup();
  const gate = gatePublication(deps);
  act(() => composer.change({ ...annotation, text: 'old' }, null));
  await act(async () => composer.flush());
  const publication = session.flush();
  try {
    await gate.started;
    act(() => composer.change(annotation));
    gate.release();
    await act(async () => publication);
    expect(composer.dirty).toBe(true);
    expect(composer.annotation?.text).toBe(annotation.text);
    await act(async () => {
      await composer.flush();
      await session.flush();
    });
    expect(deps.saveVideoWorkspaceSnapshot).toHaveBeenCalledTimes(2);
    expect((await deps.readVideoWorkspace()).draft?.annotation.text).toBe(annotation.text);
    expect(composer.dirty).toBe(false);
  } finally {
    gate.release();
    await publication.catch(() => undefined);
  }
});

it('preserves the next field deadline when an automatic publication acknowledges older typing', async () => {
  const { session, deps } = setup();
  const gate = gatePublication(deps);
  act(() => composer.change({ ...annotation, text: 'old' }, null));
  await act(async () => vi.advanceTimersByTimeAsync(2 * EDITOR_AUTOSAVE_POLICY.delay));
  const publication = session.flush();
  try {
    await gate.started;
    act(() => composer.change(annotation));
    await act(async () => vi.advanceTimersByTimeAsync(50));
    gate.release();
    await act(async () => publication);
    expect(deps.saveVideoWorkspaceSnapshot).toHaveBeenCalledOnce();
    expect(composer.dirty).toBe(true);
    await act(async () => vi.advanceTimersByTimeAsync(EDITOR_AUTOSAVE_POLICY.delay - 51));
    expect(composer.dirty).toBe(true);
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(composer.dirty).toBe(false);
    await act(async () => session.flush());
    expect(deps.saveVideoWorkspaceSnapshot).toHaveBeenCalledTimes(2);
  } finally {
    gate.release();
    await publication.catch(() => undefined);
  }
});

it('clears an unchanged edit without adding history and explicitly reloads saved recovery', async () => {
  const { deps, session } = setup();
  act(() => composer.change(annotation, annotation));
  await act(async () => composer.save());
  expect(deps.commitVideoWorkspace).not.toHaveBeenCalled();
  expect(composer.annotation).toBeNull();
  act(() => composer.change(annotation, null));
  await act(async () => {
    await composer.flush();
    await session.flush();
  });
  act(() => composer.change({ ...annotation, text: 'Local unsaved edit' }));
  await act(async () => composer.reload());
  expect(composer.annotation?.text).toBe(annotation.text);
  expect(composer.dirty).toBe(false);
  await act(async () => composer.discard());
  expect(session.getSnapshot().snapshot.draft).toBeNull();
  expect(session.getSnapshot().snapshot.workspace.history).toHaveLength(0);
});

it('joins Save and new-note completion and consumes recovery once', async () => {
  const { session, deps } = setup();
  act(() => composer.change(annotation, null));
  await act(async () => {
    await Promise.all([composer.save(), composer.finishNew(), composer.finishNew()]);
  });
  expect(deps.commitVideoWorkspace).not.toHaveBeenCalled();
  await act(async () => session.flush());
  expect((await deps.readVideoWorkspace()).workspace.history).toHaveLength(1);
  expect(session.getSnapshot().snapshot.workspace.history).toHaveLength(1);
  expect(composer.getCurrent().annotation).toBeNull();
});

it('finishes whitespace without history and leaves existing edits explicit', async () => {
  const { session, deps } = setup();
  act(() => composer.change({ ...annotation, text: '  ' }, null));
  await act(async () => composer.finishNew());
  expect(session.getSnapshot().snapshot.draft).toBeNull();
  expect(deps.commitVideoWorkspace).not.toHaveBeenCalled();
  act(() => composer.change({ ...annotation, text: 'Edited' }, annotation));
  await act(async () => composer.finishNew());
  expect(composer.getCurrent().annotation?.text).toBe('Edited');
  expect(deps.commitVideoWorkspace).not.toHaveBeenCalled();
});

it('retains an accepted note after failed durable completion while autosave is paused', async () => {
  const { session, deps } = setup();
  const allow = refuseRecoveryPublication(deps, true);
  act(() => composer.change(annotation, null));
  await act(async () => {
    await expect(composer.finishNew({ durable: true })).rejects.toThrow('Quota');
  });
  expect(composer.annotation?.text).toBe(annotation.text);
  expect(deps.commitVideoWorkspace).not.toHaveBeenCalled();
  await act(async () => session.setAutosaveEnabled(false));
  await act(async () => composer.finishNew());
  expect(session.getSnapshot().document.annotations).toEqual([annotation]);
  expect(session.getSnapshot().snapshot.draft).toBeNull();
  expect(session.getSnapshot().dirty).toBe(true);
  expect(deps.commitVideoWorkspace).not.toHaveBeenCalled();
  allow();
  await act(async () => {
    session.setAutosaveEnabled(true);
    await session.flush();
  });
  expect(session.getSnapshot().dirty).toBe(false);
  expect((await deps.readVideoWorkspace()).workspace.history).toHaveLength(1);
});

it('keeps the accepted note as the before-state when text changes after a failed durable exit', async () => {
  const { session, deps } = setup();
  const allow = refuseRecoveryPublication(deps, true);
  act(() => composer.change(annotation, null));
  await act(async () => {
    await expect(composer.finishNew({ durable: true })).rejects.toThrow('Quota');
  });
  const edited = { ...annotation, text: 'Edited after the failure' };
  act(() => composer.change(edited));
  allow();
  await act(async () => composer.save({ durable: true }));
  expect(composer.annotation).toBeNull();
  expect(session.getSnapshot().document.annotations).toEqual([edited]);
  const saved = await deps.readVideoWorkspace();
  expect(saved.workspace.history).toHaveLength(2);
  expect(saved.workspace.history[1]).toMatchObject({
    target: 'annotation',
    before: annotation,
    after: edited,
  });
  expect(saved.draft).toBeNull();
});
