// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { VideoWorkspaceSnapshot } from '../../composition/persistence/review-workspaces/contracts';
import { createQuickEditAdvancedState } from '../../features/video/review/advanced/defaults';
import type { ReviewSelection } from '../../features/video/review/types';
import type { ReviewAnnotationEffect } from '../../features/video/review/annotation-effects/types';
import { parseVideoWorkspace } from '../../composition/persistence/review-workspaces/parser';
import { createVideoReviewSession } from '../../workflows/video-review/session';
import { useReviewAdvanced } from './use-advanced';
import { useReviewSnapshot } from './use-session';
import { useReviewAnnotationEffects } from './annotation-effects-editor';
import {
  ReviewAnnotationAcquisitionError,
  type applyReviewAnnotationCatalogDocument,
} from '../../workflows/video-review/annotation-acquisition';

const source = readFileSync(
  'apps/extension/public/video-effects/effects/annotations/sniptale-title/effect.sniptale-effect.json',
  'utf8'
);
const snapshot = {
  id: `effect:${'a'.repeat(64)}`,
  sha256: 'a'.repeat(64),
  source,
  schemaVersion: 'sniptale.effect.v1' as const,
  kind: 'standalone' as const,
  documentId: 'sniptale-title',
  retainedByteLength: new TextEncoder().encode(source).byteLength,
  assets: [],
};
const instance: ReviewAnnotationEffect = {
  id: 'first',
  snapshotId: snapshot.id,
  start: 1,
  end: 3,
  enabled: true,
  attachment: 'content',
  transform: { x: 0.2, y: 0.3, width: 0.4, height: 0.2, rotation: 0 },
  controls: {},
  order: 0,
};
let root: Root;
let editor: ReturnType<typeof useReviewAnnotationEffects>;
let advanced: ReturnType<typeof useReviewAdvanced>;
let session: ReturnType<typeof createVideoReviewSession>;
let blocked = false;
let holdFlush: (() => Promise<void>) | null = null;
function setup() {
  const initial = createQuickEditAdvancedState();
  initial.ui.mode = 'advanced';
  initial.annotationEffects = { enabled: true, instances: [structuredClone(instance)] };
  let stored: VideoWorkspaceSnapshot = {
    workspace: {
      aggregateId: 'recording:r',
      sourceAssetId: 'source',
      formatVersion: 1,
      source: { duration: 4, width: 640, height: 360, mimeType: 'video/webm', size: 5 },
      revision: 1,
      cursor: 0,
      history: [],
      advanced: initial,
      effectSnapshots: [snapshot],
      createdAt: 1,
      updatedAt: 1,
    },
    draft: null,
  };
  const read = vi.fn(async () => structuredClone(stored));
  const save = vi.fn(
    async (
      args: Parameters<
        NonNullable<Parameters<typeof createVideoReviewSession>[1]>['saveVideoWorkspaceSnapshot']
      >[0]
    ) => {
      const workspace = parseVideoWorkspace(args.workspace);
      if (!workspace) throw new Error('Invalid fixture workspace.');
      stored = {
        workspace: { ...workspace, revision: stored.workspace.revision + 1 },
        draft: null,
      };
      return structuredClone(stored);
    }
  );
  session = createVideoReviewSession(stored, {
    readVideoWorkspace: read,
    moveVideoWorkspaceHistory: read,
    saveVideoWorkspaceAdvanced: read,
    saveVideoWorkspaceDraft: read,
    commitVideoWorkspace: read,
    saveVideoWorkspaceSnapshot: save,
  });
  session.setAutosaveEnabled(false);
  const select = vi.fn<(selection: ReviewSelection) => void>();
  const pause = vi.fn();
  const acquire = vi.fn<typeof applyReviewAnnotationCatalogDocument>(async (args) => {
    args.signal.throwIfAborted();
    const id = args.instanceId ?? crypto.randomUUID();
    await args.session.applyAnnotationEffect({
      expectedSourceAssetId: 'source',
      snapshot,
      instance: { ...structuredClone(instance), id, start: args.start, end: args.end ?? 4 },
      resources: [],
      signal: args.signal,
    });
    return id;
  });
  function Harness() {
    const current = useReviewSnapshot(session);
    advanced = useReviewAdvanced(session);
    editor = useReviewAnnotationEffects(
      {
        session,
        lane: advanced.advanced.annotationEffects,
        setLane: advanced.setAnnotationEffects,
        flush: async () => {
          await holdFlush?.();
          await advanced.flush();
        },
        allowed: () => !blocked && current.snapshot.workspace.advanced.ui.mode === 'advanced',
        pause,
        select,
      },
      acquire
    );
    return null;
  }
  act(() => root.render(<Harness />));
  const choice = {
    catalog: {
      assets: [],
      createdAt: 1,
      updatedAt: 1,
      documents: [],
      enabled: true,
      label: { en: 'Title', ru: 'Заголовок' },
      description: { en: '', ru: '' },
      packId: 'pack',
      retainedByteLength: 1,
      source: 'builtin' as const,
      sourceSha256: 'a'.repeat(64),
      version: '1',
    },
    documentId: 'sniptale-title',
    start: 0,
    end: 2,
    locale: 'en',
    plane: { width: 640, height: 360 },
  };
  return { save, select, pause, acquire, choice, render: () => root.render(<Harness />) };
}
const settle = async (action: () => void) => {
  await act(async () => {
    action();
    await vi.advanceTimersByTimeAsync(0);
  });
};
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.useFakeTimers();
  blocked = false;
  holdFlush = null;
  root = createRoot(document.createElement('div'));
});
afterEach(async () => {
  await act(async () => root.unmount());
  await session.dispose();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('explains an unsupported catalog choice without admitting an instance or retrying it', async () => {
  const { acquire, choice } = setup();
  acquire.mockRejectedValueOnce(new ReviewAnnotationAcquisitionError('unsupported-kind'));
  const before = structuredClone(session.getSnapshot().snapshot.workspace);
  await settle(() => editor.add(choice));
  expect(editor.failure).toBe('unsupported');
  expect(editor.pending).toBe(false);
  expect(session.getSnapshot().snapshot.workspace).toEqual(before);
  await settle(() => editor.retry());
  expect(acquire).toHaveBeenCalledOnce();
});

it('keeps drag drafts outside history, cancels exactly, and commits each completed gesture once', async () => {
  const { save } = setup();
  act(() => {
    expect(editor.beginGesture('first')).toBe(true);
    editor.previewGesture({ start: 0.5, end: 2.5 });
  });
  expect(editor.previewLane?.instances[0]?.start).toBe(0.5);
  expect(
    session.getSnapshot().document.advancedContent.annotationEffects?.instances[0]?.start
  ).toBe(1);
  expect(session.getSnapshot().snapshot.workspace.history).toHaveLength(0);
  act(() => editor.cancelGesture());
  expect(editor.previewLane).toEqual(editor.lane);
  await settle(() => {
    editor.beginGesture('first');
    editor.previewGesture({ start: 0.25, end: 2.25 });
    editor.commitGesture();
  });
  await settle(() => {
    editor.beginGesture('first');
    editor.previewGesture({ start: 0.5, end: 2.5 });
    editor.commitGesture();
  });
  expect(session.getSnapshot().snapshot.workspace.history).toHaveLength(2);
  expect(session.getSnapshot().snapshot.workspace.revision).toBe(1);
  expect(save).not.toHaveBeenCalled();
  await act(async () => session.history('undo'));
  expect(editor.lane?.instances[0]?.start).toBe(0.25);
  await act(async () => session.history('redo'));
  expect(editor.lane?.instances[0]?.start).toBe(0.5);
});

it('allows overlapping duplicates and enabled toggles without allocating another immutable source', async () => {
  const { select, save } = setup();
  await settle(() => editor.duplicate('first'));
  expect(editor.lane?.instances.map((item) => [item.start, item.end, item.order])).toEqual([
    [1, 3, 0],
    [1, 3, 1],
  ]);
  const id = editor.lane!.instances[1]!.id;
  expect(select).toHaveBeenLastCalledWith({ kind: 'annotation-effect', id });
  await settle(() => editor.enabled(false));
  await settle(() => editor.change(id, { enabled: false }));
  expect(editor.lane).toMatchObject({
    enabled: false,
    instances: [{ enabled: true }, { enabled: false }],
  });
  expect(session.getSnapshot().snapshot.workspace.effectSnapshots).toHaveLength(1);
  await settle(() => editor.remove(id));
  expect(editor.lane?.instances).toHaveLength(1);
  await act(async () => session.history('undo'));
  expect(editor.lane?.instances).toHaveLength(2);
  expect(save).not.toHaveBeenCalled();
});

it('rejects invalid timing and SDK controls before they poison the content buffer', async () => {
  setup();
  for (const patch of [
    { end: 5 },
    { end: 1 },
    { controls: { unknown: 42 } },
    { transform: { ...instance.transform, width: 0 } },
  ]) {
    await settle(() => editor.change('first', patch));
    expect(editor.failure).toBe('invalid');
  }
  expect(advanced.pending).toBe(false);
  expect(session.getSnapshot().snapshot.workspace.history).toHaveLength(0);
  await settle(() => editor.change('first', { start: 0 }));
  expect(editor.failure).toBeNull();
  expect(session.getSnapshot().snapshot.workspace.history).toHaveLength(1);
});

it('rebases over flushed unrelated field edits, while refusing a stale body draft', async () => {
  setup();
  act(() => {
    advanced.setActionsEnabled(false);
    editor.beginGesture('first');
    editor.previewGesture({ start: 0 });
  });
  await settle(() => editor.commitGesture());
  expect(session.getSnapshot().document.advancedContent.actionsEnabled).toBe(false);
  expect(session.getSnapshot().snapshot.workspace.history).toHaveLength(2);
  act(() => {
    editor.beginGesture('first');
    editor.previewGesture({ start: 0.5 });
    advanced.setAnnotationEffects(
      (lane) => lane && { ...lane, instances: lane.instances.map((item) => ({ ...item, end: 2 })) }
    );
  });
  await settle(() => editor.commitGesture());
  expect(editor.failure).toBe('stale');
  expect(editor.lane?.instances[0]).toMatchObject({ start: 0, end: 2 });
  expect(session.getSnapshot().snapshot.workspace.history).toHaveLength(3);
});

it('blocks duplicate acquisition while pending and retries an admitted Save without adding again', async () => {
  const { choice, save, acquire, select } = setup();
  session.setAutosaveEnabled(true);
  save.mockRejectedValueOnce(new Error('Quota')).mockRejectedValueOnce(new Error('Still quota'));
  await settle(() => {
    editor.add(choice);
    editor.add(choice);
  });
  expect(acquire).toHaveBeenCalledOnce();
  expect(editor.failure).toBe('save');
  expect(editor.lane?.instances).toHaveLength(2);
  const id = editor.lane!.instances[1]!.id;
  expect(select).toHaveBeenLastCalledWith({ kind: 'annotation-effect', id });
  expect(session.getSnapshot().dirty).toBe(true);
  await settle(() => editor.retry());
  expect(editor.failure).toBe('save');
  expect(session.getSnapshot().dirty).toBe(true);
  await settle(() => editor.retry());
  expect(acquire).toHaveBeenCalledOnce();
  expect(editor.lane?.instances).toHaveLength(2);
  expect(session.getSnapshot().snapshot.workspace.history).toHaveLength(1);
  expect(session.getSnapshot().dirty).toBe(false);
});

it('retries an unadmitted choice and refuses all mutations while another editor action owns admission', async () => {
  const { choice, acquire } = setup();
  blocked = true;
  await settle(() => {
    editor.add(choice);
    editor.remove('first');
    editor.change('first', { start: 0 });
  });
  expect(acquire).not.toHaveBeenCalled();
  expect(session.getSnapshot().snapshot.workspace.history).toHaveLength(0);
  blocked = false;
  acquire.mockRejectedValueOnce(new Error('Unavailable'));
  await settle(() => editor.add(choice));
  expect(editor.failure).toBe('acquisition');
  expect(editor.lane?.instances).toHaveLength(1);
  await settle(() => editor.retry());
  expect(editor.failure).toBeNull();
  expect(editor.lane?.instances).toHaveLength(2);
});

it('aborts a pending choice on actual unmount and ignores its late completion', async () => {
  const { choice, acquire, select } = setup();
  let release!: () => void;
  let signal!: AbortSignal;
  acquire.mockImplementationOnce(async (args) => {
    signal = args.signal;
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    args.signal.throwIfAborted();
    return 'late';
  });
  await settle(() => editor.add(choice));
  expect(editor.pending).toBe(true);
  await act(async () => root.unmount());
  expect(signal.aborted).toBe(true);
  await act(async () => {
    release();
    await vi.advanceTimersByTimeAsync(0);
  });
  expect(select).not.toHaveBeenCalled();
  expect(session.getSnapshot().snapshot.workspace.history).toHaveLength(0);
});

it('joins a same-turn field draft before explicit Save and reports its completion', async () => {
  const { save } = setup();
  await act(async () => {
    expect(editor.beginGesture('first')).toBe(true);
    editor.previewGesture({ controls: { title: 'Last typed title' } });
    await editor.flush();
    await session.saveBuffered();
  });
  expect(
    session.getSnapshot().document.advancedContent.annotationEffects?.instances[0]?.controls[
      'title'
    ]
  ).toBe('Last typed title');
  expect(session.getSnapshot().snapshot.workspace.history).toHaveLength(1);
  expect(save).toHaveBeenCalledOnce();
  expect(editor.previewLane).toEqual(editor.lane);
});

it('keeps Save behind held publication and retains the field draft after flush failure', async () => {
  const { save } = setup();
  let release: (() => void) | undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  holdFlush = () => held;
  let saved = false;
  let saving: Promise<void> | undefined;
  await act(async () => {
    editor.beginGesture('first');
    editor.previewGesture({ controls: { title: 'Held title' } });
    saving = editor.flush().then(async () => {
      await session.saveBuffered();
      saved = true;
    });
    await Promise.resolve();
  });
  expect(saved).toBe(false);
  expect(save).not.toHaveBeenCalled();
  await act(async () => {
    release?.();
    await saving;
  });
  expect(saved).toBe(true);
  expect(save).toHaveBeenCalledOnce();
  holdFlush = async () => {
    throw new Error('Synthetic write failure');
  };
  await act(async () => {
    editor.beginGesture('first');
    editor.previewGesture({ controls: { title: 'Recoverable title' } });
    await expect(editor.flush()).rejects.toThrow('Annotation draft was not committed.');
  });
  expect(editor.previewLane?.instances[0]?.controls['title']).toBe('Recoverable title');
  expect(
    session.getSnapshot().document.advancedContent.annotationEffects?.instances[0]?.controls[
      'title'
    ]
  ).toBe('Held title');
  expect(save).toHaveBeenCalledOnce();
  holdFlush = null;
  await act(async () => {
    await editor.flush();
    await session.saveBuffered();
  });
  expect(save).toHaveBeenCalledTimes(2);
  expect(session.getSnapshot().snapshot.workspace.history).toHaveLength(2);
});

it('protects the field on unload, retains cancelled edits and removes the guard on teardown', async () => {
  setup();
  act(() => {
    editor.beginGesture('first');
  });
  const unchanged = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(unchanged);
  expect(unchanged.defaultPrevented).toBe(false);
  act(() => editor.previewGesture({ controls: { title: 'Unflushed title' } }));
  const changed = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(changed);
  expect(changed.defaultPrevented).toBe(true);
  expect(editor.previewLane?.instances[0]?.controls['title']).toBe('Unflushed title');
  expect(session.getSnapshot().snapshot.workspace.history).toHaveLength(0);
  act(() => root.render(null));
  const after = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(after);
  expect(after.defaultPrevented).toBe(false);
});

it('reports the actual draft lifetime synchronously for atomic idle selection admission', async () => {
  setup();
  expect(editor.hasPending()).toBe(false);
  act(() => {
    expect(editor.beginGesture('first')).toBe(true);
    expect(editor.hasPending()).toBe(true);
    editor.previewGesture({ controls: { title: 'Pending field' } });
    expect(editor.hasPending()).toBe(true);
    editor.cancelGesture();
    expect(editor.hasPending()).toBe(false);
  });
  await act(async () => {
    await editor.flush();
  });
  expect(editor.hasPending()).toBe(false);
  expect(session.getSnapshot().snapshot.workspace.history).toHaveLength(0);
});

it('retries the retained live field before clearing a completed edit failure', async () => {
  setup();
  holdFlush = async () => {
    throw new Error('Held field save failed.');
  };
  act(() => {
    editor.beginGesture('first');
    editor.previewGesture({ controls: { title: 'Recovered field' } });
  });
  await settle(() => editor.commitGesture());
  expect(editor.failure).toBe('edit');
  expect(editor.gestureId).toBe('first');
  expect(editor.previewLane?.instances[0]?.controls['title']).toBe('Recovered field');
  expect(session.getSnapshot().snapshot.workspace.history).toHaveLength(0);
  holdFlush = null;
  await settle(() => editor.retry());
  expect(editor.failure).toBeNull();
  expect(editor.gestureId).toBeNull();
  expect(
    session.getSnapshot().document.advancedContent.annotationEffects?.instances[0]?.controls[
      'title'
    ]
  ).toBe('Recovered field');
  expect(session.getSnapshot().snapshot.workspace.history).toHaveLength(1);
});
