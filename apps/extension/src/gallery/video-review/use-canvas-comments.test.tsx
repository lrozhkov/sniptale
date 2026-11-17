// @vitest-environment jsdom
import { createReviewCommandFixture } from './editor-fixture.test-support';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { useCanvasComments } from './use-canvas-comments';
import { createVideoReviewSession } from '../../workflows/video-review/session';
import { parseReviewOperation } from '../../features/video/review/validation';
import { createCanvasComment } from '../../features/video/review/comments';
import { createQuickEditAdvancedState } from '../../features/video/review/advanced/defaults';
import type { VideoWorkspaceSnapshot } from '../../composition/persistence/review-workspaces/contracts';
import type { commitVideoWorkspace } from '../../composition/persistence/review-workspaces/store';
it('merges pending comment text into a geometry patch using the latest persisted style', async () => {
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
    saveVideoWorkspaceSnapshot: async () => snapshot,
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
    await act(async () => controller.onPatch(comment, { position: { x: 0.2, y: 0.4 } }));
    expect(session.getSnapshot().document.canvasComments[0]!.style.fontSize).toBe(18);
    failNextWrite = true;
    await act(async () => {
      await expect(controller.onPatch(comment, { text: 'Retry me' })).rejects.toThrow();
    });
    await act(async () => controller.onPatch(comment, { text: 'Retry me' }));
    expect(session.getSnapshot().document.canvasComments[0]!.text).toBe('Retry me');
    expect(session.getSnapshot().error).toBeNull();
    await act(async () => controller.onPatch({ ...comment, id: 'missing' }, { text: 'gone' }));
    expect(session.getSnapshot().document.canvasComments).toHaveLength(1);
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
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
    history: () => snapshot.workspace.history,
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
