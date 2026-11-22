// @vitest-environment jsdom
import { createReviewCommandFixture } from './editor-fixture.test-support';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { useCanvasComments } from './use-canvas-comments';
import { createVideoReviewSession } from '../../workflows/video-review/session';
import { parseReviewOperation } from '../../features/video/review/validation';
import { parseVideoWorkspace } from '../../composition/persistence/review-workspaces/parser';
import { createCanvasComment } from '../../features/video/review/comments';
import { createQuickEditAdvancedState } from '../../features/video/review/advanced/defaults';
import type { VideoWorkspaceSnapshot } from '../../composition/persistence/review-workspaces/contracts';
import type { commitVideoWorkspace } from '../../composition/persistence/review-workspaces/store';
it('edits comments during a held publication and retries storage without duplicate history', async () => {
  const comment = createCanvasComment({ id: 'c', at: 0 });
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  let snapshot: VideoWorkspaceSnapshot = {
    workspace: {
      aggregateId: 'recording:r',
      sourceAssetId: 's',
      formatVersion: 1,
      source: { duration: 4, width: 640, height: 360, size: 5, mimeType: 'video/webm' },
      revision: 1,
      cursor: 1,
      history: [{ id: 'create', at: 1, target: 'canvasComment', before: null, after: comment }],
      advanced: createQuickEditAdvancedState(),
      createdAt: 1,
      updatedAt: 1,
    },
    draft: null,
  };
  let failNextWrite = false;
  let holdNextWrite = false;
  let enterWrite!: () => void;
  let releaseWrite!: () => void;
  const entered = new Promise<void>((resolve) => {
    enterWrite = resolve;
  });
  const released = new Promise<void>((resolve) => {
    releaseWrite = resolve;
  });
  const session = createVideoReviewSession(snapshot, {
    commitVideoWorkspace: async (args: Parameters<typeof commitVideoWorkspace>[0]) => {
      if (failNextWrite) {
        failNextWrite = false;
        throw new Error('Temporary storage failure');
      }
      const operation = parseReviewOperation(args.operation, 4);
      if (!operation) throw new Error('Invalid test operation');
      snapshot = {
        ...snapshot,
        workspace: {
          ...snapshot.workspace,
          history: [...snapshot.workspace.history, operation],
          cursor: snapshot.workspace.cursor + 1,
          revision: snapshot.workspace.revision + 1,
        },
      };
      return snapshot;
    },
    saveVideoWorkspaceSnapshot: async (request) => {
      if (holdNextWrite) {
        holdNextWrite = false;
        enterWrite();
        await released;
      }
      if (failNextWrite) {
        failNextWrite = false;
        throw new Error('Temporary storage failure');
      }
      const workspace = parseVideoWorkspace(request.workspace);
      if (!workspace || request.draft !== null) throw new Error('Invalid test snapshot');
      expect(request.expectedRevision).toBe(snapshot.workspace.revision);
      snapshot = {
        workspace: { ...workspace, revision: snapshot.workspace.revision + 1 },
        draft: null,
      };
      return structuredClone(snapshot);
    },
    saveVideoWorkspaceDraft: async () => snapshot,
    saveVideoWorkspaceAdvanced: async () => snapshot,
    readVideoWorkspace: async () => snapshot,
    moveVideoWorkspaceHistory: async () => snapshot,
  });
  const root = createRoot(document.createElement('div'));
  let controller!: ReturnType<typeof useCanvasComments>;
  function Harness() {
    controller = useCanvasComments({
      session,
      commands: createReviewCommandFixture(() => ({
        duration: 4,
        time: 0,
        session,
        document: session.getSnapshot().document,
        advanced: snapshot.workspace.advanced,
      })),
      time: 0,
      busy: false,
      exporterPhase: 'idle',
      canStart: () => true,
      run: (action) => action(),
    });
    return null;
  }
  try {
    await act(async () => root.render(<Harness />));
    controller.onDraft('c', 'Unsaved text');
    await act(async () =>
      controller.onPatch(comment, { style: { ...comment.style, fontSize: 18 } })
    );
    expect(session.getSnapshot().document.canvasComments[0]).toMatchObject({
      text: 'Unsaved text',
      style: { fontSize: 18 },
    });
    holdNextWrite = true;
    const publishing = session.flush();
    await entered;
    await act(async () => controller.onPatch(comment, { position: { x: 0.2, y: 0.4 } }));
    expect(session.getSnapshot().document.canvasComments[0]!.position).toEqual({ x: 0.2, y: 0.4 });
    releaseWrite();
    await publishing;
    await session.flush();
    expect(session.getSnapshot().document.canvasComments[0]!.style.fontSize).toBe(18);
    failNextWrite = true;
    await act(async () => {
      await controller.onPatch(comment, { text: 'Retry me' });
      await expect(session.flush()).rejects.toThrow('Temporary storage failure');
    });
    const historyLength = session.getSnapshot().snapshot.workspace.history.length;
    await act(async () => controller.onPatch(comment, { text: 'Retry me' }));
    expect(session.getSnapshot().snapshot.workspace.history).toHaveLength(historyLength);
    expect(session.getSnapshot().document.canvasComments[0]!.text).toBe('Retry me');
    await session.flush();
    expect(session.getSnapshot().error).toBeNull();
    await act(async () => controller.onPatch({ ...comment, id: 'missing' }, { text: 'gone' }));
    expect(session.getSnapshot().document.canvasComments).toHaveLength(1);
  } finally {
    releaseWrite();
    await session.dispose();
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});

async function importedOverlayFixture(failAdmission = false) {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const overlay = createCanvasComment({ id: 'imported', at: 0 });
  let saved: VideoWorkspaceSnapshot = {
    workspace: {
      aggregateId: 'recording:overlay',
      sourceAssetId: 'source',
      formatVersion: 1,
      source: { duration: 4, width: 640, height: 360, mimeType: 'video/webm', size: 5 },
      revision: 1,
      cursor: 1,
      createdAt: 1,
      updatedAt: 1,
      advanced: createQuickEditAdvancedState(),
      history: [
        { id: 'imported-overlay', at: 1, target: 'canvasComment', before: null, after: overlay },
      ],
    },
    draft: null,
  };
  const read = async () => structuredClone(saved);
  const admission = vi.fn(async () => ({ release: async () => undefined }));
  if (failAdmission) admission.mockRejectedValueOnce(new Error('Admission unavailable'));
  const session = createVideoReviewSession(saved, {
    acquireSyncCheckpointEdit: admission,
    readVideoWorkspace: read,
    commitVideoWorkspace: read,
    moveVideoWorkspaceHistory: read,
    saveVideoWorkspaceAdvanced: read,
    saveVideoWorkspaceDraft: read,
    saveVideoWorkspaceSnapshot: async (request) => {
      const workspace = parseVideoWorkspace(request.workspace);
      if (!workspace || request.draft !== null) throw new Error('Invalid controlled publication');
      expect(request.expectedRevision).toBe(saved.workspace.revision);
      saved = { workspace: { ...workspace, revision: saved.workspace.revision + 1 }, draft: null };
      return read();
    },
  });
  session.setAutosaveEnabled(false);
  const root = createRoot(document.createElement('div'));
  let controller!: ReturnType<typeof useCanvasComments>;
  const selection = vi.fn();
  let props = { busy: false, exporterPhase: 'idle', allowed: true };
  function Harness() {
    controller = useCanvasComments({
      session,
      commands: createReviewCommandFixture(() => ({
        duration: 4,
        time: 0,
        sourceAssetId: saved.workspace.sourceAssetId,
        session,
        document: session.getSnapshot().document,
        advanced: saved.workspace.advanced,
      })),
      time: 0,
      busy: props.busy,
      exporterPhase: props.exporterPhase,
      canStart: () => props.allowed,
      onSelectionChange: selection,
      run: (action) => action(),
    });
    return null;
  }
  await act(async () => root.render(<Harness />));
  return {
    session,
    read,
    selection,
    controls: () => controller,
    current: () => session.getSnapshot().document.canvasComments[0]!,
    update: async (patch: Partial<typeof props>) => {
      props = { ...props, ...patch };
      await act(async () => root.render(<Harness />));
    },
    close: async () => {
      await act(async () => root.unmount());
      await session.dispose();
      vi.unstubAllGlobals();
    },
  };
}

it('preserves overlay text after refusal, flushes for export and restores deletion with Undo', async () => {
  const f = await importedOverlayFixture(true);
  try {
    f.controls().onDraft('imported', 'Typed before export');
    await f.update({ busy: true, exporterPhase: 'preparing' });
    await act(async () => {
      await expect(f.controls().flushTexts()).rejects.toThrow('Admission unavailable');
    });
    expect(f.current().text).toBe('');
    await act(async () => f.controls().flushTexts());
    expect(f.current().text).toBe('Typed before export');
    const accepted = f.session.getSnapshot().snapshot.workspace.history.length;
    await act(async () => f.controls().flushTexts());
    expect(f.session.getSnapshot().snapshot.workspace.history).toHaveLength(accepted);
    await act(async () => f.controls().onDelete(f.current()));
    expect(f.session.getSnapshot().document.canvasComments).toHaveLength(1);
    await f.update({ busy: false, exporterPhase: 'idle' });
    await act(async () => f.controls().onSelect('imported'));
    expect(f.controls().selectedId).toBe('imported');
    await act(async () => f.controls().onDelete(f.current()));
    expect(f.controls().selectedId).toBeNull();
    expect(f.selection).toHaveBeenLastCalledWith(null, undefined);
    expect(f.session.getSnapshot().document.canvasComments).toEqual([]);
    await act(async () => f.session.history('undo'));
    expect(f.current().text).toBe('Typed before export');
    await act(async () => f.session.history('redo'));
    expect(f.session.getSnapshot().document.canvasComments).toEqual([]);
    await act(async () => f.session.saveBuffered());
    expect((await f.read()).workspace.cursor).toBe(3);
    expect((await f.read()).workspace.history).toHaveLength(3);
  } finally {
    await f.close();
  }
});

it('preserves overlay placement on attachment changes and blocks export-time editing', async () => {
  const f = await importedOverlayFixture();
  try {
    f.controls().setGeometry({
      output: { width: 800, height: 400 },
      videoTransform: { x: 100, y: 50, width: 600, height: 300 },
    });
    await act(async () => {
      expect(await f.controls().onSwitchAttachment(f.current(), 'viewport')).toBe(true);
    });
    expect(f.current()).toMatchObject({ attachment: 'viewport', position: { x: 0.5, y: 0.5 } });
    const retained = f.session.getSnapshot().snapshot.workspace.history.length;
    await act(async () => {
      expect(await f.controls().onSwitchAttachment(f.current(), 'viewport')).toBe(false);
    });
    expect(f.session.getSnapshot().snapshot.workspace.history).toHaveLength(retained);
    await f.update({ exporterPhase: 'encoding' });
    await act(async () => f.controls().onPatch(f.current(), { position: { x: 0.1, y: 0.9 } }));
    expect(f.current().position).toEqual({ x: 0.5, y: 0.5 });
    await f.update({ exporterPhase: 'idle', allowed: false });
    await act(async () => {
      expect(await f.controls().onSwitchAttachment(f.current(), 'content')).toBe(false);
    });
    await f.update({ allowed: true });
    await act(async () => f.controls().onPatch(f.current(), { position: { x: 0.1, y: 0.9 } }));
    await act(async () => {
      expect(await f.controls().onSwitchAttachment(f.current(), 'content')).toBe(false);
    });
    expect(f.current().attachment).toBe('viewport');
    await act(async () => f.session.history('undo'));
    expect(f.current().position).toEqual({ x: 0.5, y: 0.5 });
    await act(async () => f.session.history('undo'));
    expect(f.current().attachment).toBe('content');
  } finally {
    await f.close();
  }
});

async function mountCommentCommands() {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  let snapshot: VideoWorkspaceSnapshot = {
    workspace: {
      aggregateId: 'recording:commands',
      sourceAssetId: 'source',
      formatVersion: 1,
      source: { duration: 10, width: 640, height: 360, size: 5, mimeType: 'video/webm' },
      revision: 1,
      cursor: 0,
      history: [],
      advanced: createQuickEditAdvancedState(),
      createdAt: 1,
      updatedAt: 1,
    },
    draft: null,
  };
  const session = createVideoReviewSession(snapshot, {
    commitVideoWorkspace: async (args: Parameters<typeof commitVideoWorkspace>[0]) => {
      const operation = parseReviewOperation(args.operation, 10);
      if (!operation) throw new Error('Invalid comment command');
      snapshot = {
        ...snapshot,
        workspace: {
          ...snapshot.workspace,
          history: [...snapshot.workspace.history, operation],
          cursor: snapshot.workspace.cursor + 1,
          revision: snapshot.workspace.revision + 1,
        },
      };
      return snapshot;
    },
    saveVideoWorkspaceSnapshot: async () => snapshot,
    saveVideoWorkspaceDraft: async () => snapshot,
    saveVideoWorkspaceAdvanced: async () => snapshot,
    readVideoWorkspace: async () => snapshot,
    moveVideoWorkspaceHistory: async () => snapshot,
  });
  const live = { time: 2, sourceAssetId: 'source' };
  const pause = vi.fn();
  let admit = (action: () => void) => action();
  const commands = createReviewCommandFixture(
    () => ({
      duration: 10,
      time: live.time,
      sourceAssetId: live.sourceAssetId,
      session,
      document: session.getSnapshot().document,
      advanced: snapshot.workspace.advanced,
    }),
    { pause, beforeAction: (action) => admit(action) }
  );
  const selection = vi.fn();
  const args: Parameters<typeof useCanvasComments>[0] = {
    commands,
    session,
    time: 0,
    busy: false,
    exporterPhase: 'idle',
    canStart: () => true,
    run: (action) => action(),
    onSelectionChange: selection,
  };
  let controller!: ReturnType<typeof useCanvasComments>;
  function Harness() {
    controller = useCanvasComments(args);
    return null;
  }
  const root = createRoot(document.createElement('div'));
  const render = () => act(async () => root.render(<Harness />));
  await render();
  return {
    args,
    commands,
    session,
    live,
    pause,
    selection,
    render,
    controller: () => controller,
    deferAdmission: (receiver: (action: () => void) => void) => {
      admit = receiver;
    },
    history: () => session.getSnapshot().snapshot.workspace.history,
    close: async () => {
      await act(async () => root.unmount());
      vi.unstubAllGlobals();
    },
  };
}

it('adds at captured live time with current document spacing and local selection context', async () => {
  const fixture = await mountCommentCommands();
  try {
    const first = createCanvasComment({ id: 'existing', at: 1 });
    await fixture.session.commit({
      id: 'existing',
      at: 1,
      target: 'canvasComment',
      before: null,
      after: first,
    });
    fixture.live.time = 6;
    await act(async () => fixture.controller().onAdd());
    const added = fixture.session
      .getSnapshot()
      .document.canvasComments.find((item) => item.id !== first.id)!;
    expect(added.start).toBe(6);
    expect(added.position).toEqual({ x: 0.5, y: 0.5 });
    expect(fixture.args.time).toBe(0);
    expect(fixture.pause).toHaveBeenCalledOnce();
    expect(fixture.controller().selectedId).toBe(added.id);
    expect(fixture.selection).toHaveBeenCalledExactlyOnceWith(
      added.id,
      expect.objectContaining({
        position: expect.objectContaining({ source: expect.objectContaining({ sourceTime: 6 }) }),
        document: expect.objectContaining({ canvasComments: [first] }),
      })
    );
  } finally {
    await fixture.close();
  }
});

it('keeps controlled selection authoritative and forwards explicit selection context', async () => {
  const fixture = await mountCommentCommands();
  try {
    fixture.args.selectedId = 'controlled';
    await fixture.render();
    const context = fixture.commands.capture()!;
    await act(async () => fixture.controller().onSelect('requested', context));
    expect(fixture.controller().selectedId).toBe('controlled');
    expect(fixture.selection).toHaveBeenLastCalledWith('requested', context);
    await act(async () => fixture.controller().onAdd());
    expect(fixture.controller().selectedId).toBe('controlled');
    expect(fixture.selection.mock.lastCall?.[1]?.scope.session).toBe(fixture.session);
  } finally {
    await fixture.close();
  }
});

it('refuses missing captures, absent source time and stale deferred admission', async () => {
  const fixture = await mountCommentCommands();
  try {
    const capture = vi.spyOn(fixture.commands, 'capture');
    capture.mockReturnValueOnce(null);
    await fixture.controller().onAdd();
    const context = fixture.commands.capture()!;
    capture.mockReturnValueOnce({
      ...context,
      position: { ...context.position, source: null, media: null },
    });
    await fixture.controller().onAdd();
    let admitted: (() => void) | undefined;
    fixture.deferAdmission((action) => {
      admitted = action;
    });
    await fixture.controller().onAdd();
    fixture.live.sourceAssetId = 'replaced';
    await act(async () => admitted!());
    expect(fixture.history()).toHaveLength(0);
    expect(fixture.selection).not.toHaveBeenCalled();
    expect(fixture.pause).toHaveBeenCalledOnce();
  } finally {
    await fixture.close();
  }
});

it('suppresses queued writes and late selection after a source change', async () => {
  const fixture = await mountCommentCommands();
  try {
    let queued: (() => Promise<unknown>) | undefined;
    let release!: () => void;
    fixture.args.run = (action) => {
      queued = action;
      return new Promise<void>((resolve) => {
        release = resolve;
      });
    };
    await fixture.render();
    const pending = fixture.controller().onAdd();
    fixture.live.sourceAssetId = 'replacement';
    await queued!();
    await act(async () => {
      release();
      await pending;
    });
    expect(fixture.history()).toHaveLength(0);
    expect(fixture.selection).not.toHaveBeenCalled();
    const committed = fixture.controller().onAdd();
    await queued!();
    expect(fixture.history()).toHaveLength(1);
    fixture.live.sourceAssetId = 'another-source';
    await act(async () => {
      release();
      await committed;
    });
    expect(fixture.selection).not.toHaveBeenCalled();
    expect(fixture.controller().selectedId).toBeNull();
  } finally {
    await fixture.close();
  }
});

it.each(['busy', 'export', 'canStart'] as const)(
  'refuses %s commands without changing history',
  async (blocked) => {
    const fixture = await mountCommentCommands();
    try {
      fixture.args.busy = blocked === 'busy';
      fixture.args.exporterPhase = blocked === 'export' ? 'rendering' : 'idle';
      fixture.args.canStart = () => blocked !== 'canStart';
      await fixture.render();
      const comment = createCanvasComment({ id: 'absent', at: 1 });
      await fixture.controller().onAdd();
      await fixture.controller().onPatch(comment, { text: 'blocked' });
      await fixture.controller().onDelete(comment);
      await fixture
        .controller()
        .onShowOnVideo({ id: 'annotation', text: 'note', anchor: { kind: 'point', time: 2 } });
      expect(await fixture.controller().onSwitchAttachment(comment, 'content')).toBe(false);
      expect(fixture.history()).toHaveLength(0);
      expect(fixture.selection).not.toHaveBeenCalled();
    } finally {
      await fixture.close();
    }
  }
);

it('persists linked overlays and drafts, maps attachments, and clears deleted selection', async () => {
  const fixture = await mountCommentCommands();
  try {
    await act(async () =>
      fixture.controller().onShowOnVideo({
        id: 'annotation',
        text: 'linked',
        anchor: { kind: 'range', start: 1, end: 3 },
      })
    );
    const linked = fixture.session.getSnapshot().document.canvasComments[0]!;
    expect(linked.annotationId).toBe('annotation');
    fixture.controller().onDraft(linked.id, 'annotation owns this');
    fixture.controller().onDraft('deleted', 'gone');
    await fixture.controller().flushTexts();
    expect(fixture.history()).toHaveLength(1);
    await act(async () => fixture.controller().onAdd());
    const comment = fixture.session
      .getSnapshot()
      .document.canvasComments.find((item) => !item.annotationId)!;
    fixture.controller().onDraft(comment.id, 'saved draft');
    await fixture.controller().flushTexts();
    expect(
      fixture.session.getSnapshot().document.canvasComments.find((item) => item.id === comment.id)!
        .text
    ).toBe('saved draft');
    fixture.controller().onDraft(comment.id, 'saved draft');
    await fixture.controller().flushTexts();
    const historyLength = fixture.history().length;
    expect(await fixture.controller().onSwitchAttachment(comment, comment.attachment)).toBe(false);
    const viewport = { ...comment, attachment: 'viewport' as const, position: { x: 0.1, y: 0.1 } };
    expect(await fixture.controller().onSwitchAttachment(viewport, 'content')).toBe(false);
    fixture.controller().setGeometry({
      output: { width: 640, height: 360 },
      videoTransform: { x: 0, y: 0, width: 640, height: 360 },
    });
    expect(await fixture.controller().onSwitchAttachment(viewport, 'content')).toBe(true);
    expect(fixture.history()).toHaveLength(historyLength + 1);
    const current = fixture.session
      .getSnapshot()
      .document.canvasComments.find((item) => item.id === comment.id)!;
    await act(async () => fixture.controller().onDelete(current));
    expect(fixture.controller().selectedId).toBeNull();
    expect(fixture.selection).toHaveBeenLastCalledWith(null, undefined);
    expect(fixture.session.getSnapshot().document.canvasComments).toEqual([linked]);
  } finally {
    await fixture.close();
  }
});
