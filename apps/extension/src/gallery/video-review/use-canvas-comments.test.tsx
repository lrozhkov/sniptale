// @vitest-environment jsdom
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
