import { createProjectWithEffects } from '../state/effects.effect-instance.test-support';
import { createVideoProjectCursorTrack } from '../../../features/video/project/defaults';
import { materializeVideoProjectCursorSourceObservations } from '../../../features/video/project/cursor-source-observations';
import { isHydratableVideoProject } from '../../../features/video/project/validation/root';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createEmptyVideoProject,
  createVideoProjectFromRecording,
} from '../../../features/video/project/factories/creation';
import { useVideoEditorStore } from '../../state/store';
import {
  VIDEO_EDITOR_PROJECT_HISTORY_ACTION_LIMIT,
  recordVideoEditorProjectHistory,
  resetVideoEditorProjectHistory,
  undoVideoEditorProjectHistory,
  redoVideoEditorProjectHistory,
} from '.';

afterEach(() => {
  useVideoEditorStore.setState(useVideoEditorStore.getInitialState(), true);
});

describe('video editor project history', () => {
  it('retains exactly the latest 50 undoable actions and evicts the oldest snapshot', () => {
    let project = createEmptyVideoProject('Edit 0');
    let history = resetVideoEditorProjectHistory(project.id);

    for (let index = 1; index <= VIDEO_EDITOR_PROJECT_HISTORY_ACTION_LIMIT + 1; index += 1) {
      const nextProject = { ...project, name: `Edit ${index}` };
      history = recordVideoEditorProjectHistory(history, project, nextProject);
      project = nextProject;
    }

    expect(history.past).toHaveLength(VIDEO_EDITOR_PROJECT_HISTORY_ACTION_LIMIT);
    for (let index = 0; index < VIDEO_EDITOR_PROJECT_HISTORY_ACTION_LIMIT; index += 1) {
      const transition = undoVideoEditorProjectHistory(history, project);
      expect(transition).not.toBeNull();
      expect(transition?.status).toBe('applied');
      if (!transition || transition.status !== 'applied') {
        throw new Error('Expected an applied undo transition');
      }
      history = transition.history;
      project = transition.project;
    }
    expect(project.name).toBe('Edit 1');
    expect(undoVideoEditorProjectHistory(history, project)).toBeNull();
  });

  it('preserves undo and redo ordering and invalidates redo after a branched edit', () => {
    const store = useVideoEditorStore;
    store.getState().setProject(createEmptyVideoProject('Initial'));
    store.getState().renameProject('First');
    store.getState().renameProject('Second');

    store.getState().undoProject();
    expect(store.getState().project?.name).toBe('First');
    store.getState().undoProject();
    expect(store.getState().project?.name).toBe('Initial');
    store.getState().redoProject();
    expect(store.getState().project?.name).toBe('First');

    store.getState().renameProject('Branched');
    expect(store.getState().project?.name).toBe('Branched');
    expect(store.getState().projectHistory.future).toEqual([]);
    store.getState().redoProject();
    expect(store.getState().project?.name).toBe('Branched');
  });

  it('records a continuous edit transaction as one undoable action', () => {
    const store = useVideoEditorStore;
    store.getState().setProject(createEmptyVideoProject('Initial'));

    const lease = store.getState().beginProjectHistoryTransaction();
    store.getState().renameProject('Drag frame 1');
    store.getState().renameProject('Drag frame 2');
    store.getState().renameProject('Drag frame 3');
    store.getState().endProjectHistoryTransaction(lease!);

    expect(store.getState().projectHistory.past).toHaveLength(1);
    store.getState().undoProject();
    expect(store.getState().project?.name).toBe('Initial');
  });

  it('does not create a history entry or invalidate redo for a net-unchanged transaction', () => {
    const store = useVideoEditorStore;
    store.getState().setProject(createEmptyVideoProject('Initial'));
    store.getState().renameProject('Edited');
    store.getState().undoProject();

    const lease = store.getState().beginProjectHistoryTransaction();
    store.getState().renameProject('Temporary drag value');
    store.getState().renameProject('Initial');
    store.getState().endProjectHistoryTransaction(lease!);

    expect(store.getState().projectHistory.past).toHaveLength(0);
    expect(store.getState().projectHistory.future).toHaveLength(1);
  });

  it('invalidates redo once when a transaction commits a branched edit', () => {
    const store = useVideoEditorStore;
    store.getState().setProject(createEmptyVideoProject('Initial'));
    store.getState().renameProject('Edited');
    store.getState().undoProject();

    const lease = store.getState().beginProjectHistoryTransaction();
    store.getState().renameProject('Branch frame 1');
    store.getState().renameProject('Branch frame 2');
    store.getState().endProjectHistoryTransaction(lease!);

    expect(store.getState().projectHistory.past).toHaveLength(1);
    expect(store.getState().projectHistory.future).toEqual([]);
  });

  it('preserves redo and revision state when a stale updater returns the current project', () => {
    useVideoEditorStore.getState().setProject(createEmptyVideoProject('Initial'));
    useVideoEditorStore.getState().renameProject('Edited');
    useVideoEditorStore.getState().undoProject();
    const projectBeforeStaleUpdate = useVideoEditorStore.getState().project;
    const historyBeforeStaleUpdate = useVideoEditorStore.getState().projectHistory;

    useVideoEditorStore.getState().updateProject((currentProject) => currentProject);

    expect(useVideoEditorStore.getState().project).toBe(projectBeforeStaleUpdate);
    expect(useVideoEditorStore.getState().projectHistory).toBe(historyBeforeStaleUpdate);
    expect(useVideoEditorStore.getState().projectHistory.future).toHaveLength(1);
  });

  it('resets history for project switching and persisted reloads', () => {
    const first = createEmptyVideoProject('First project');
    const second = createEmptyVideoProject('Second project');
    useVideoEditorStore.getState().setProject(first);
    useVideoEditorStore.getState().renameProject('First edited');
    expect(useVideoEditorStore.getState().projectHistory.past).toHaveLength(1);

    useVideoEditorStore.getState().setProject(second);
    expect(useVideoEditorStore.getState().project?.id).toBe(second.id);
    expect(useVideoEditorStore.getState().projectHistory).toMatchObject({
      projectId: second.id,
      past: [],
      future: [],
    });

    const persistedReload = { ...second, name: 'Persisted reload' };
    useVideoEditorStore.getState().renameProject('Unsaved local edit');
    useVideoEditorStore.getState().setProject(persistedReload);
    useVideoEditorStore.getState().undoProject();
    expect(useVideoEditorStore.getState().project?.name).toBe('Persisted reload');
  });

  it('discards an active transaction when the accepted project is replaced', () => {
    const store = useVideoEditorStore;
    const first = createEmptyVideoProject('First');
    const second = createEmptyVideoProject('Second');
    store.getState().setProject(first);
    const lease = store.getState().beginProjectHistoryTransaction();
    store.getState().renameProject('First drag frame');

    store.getState().setProject(second);
    store.getState().endProjectHistoryTransaction(lease!);
    store.getState().undoProject();

    expect(store.getState().project?.id).toBe(second.id);
    expect(store.getState().projectHistory).toMatchObject({
      projectId: second.id,
      past: [],
      future: [],
      transaction: null,
    });
  });

  it('rejects stale cross-project history instead of replacing the active project', () => {
    const active = createEmptyVideoProject('Active');
    const stale = createEmptyVideoProject('Stale');
    useVideoEditorStore.getState().setProject(active);
    useVideoEditorStore.setState({
      projectHistory: {
        projectId: stale.id,
        past: recordVideoEditorProjectHistory(resetVideoEditorProjectHistory(stale.id), stale, {
          ...stale,
          name: 'Edited stale',
        }).past,
        future: [],
        error: null,
        transaction: null,
      },
    });

    useVideoEditorStore.getState().undoProject();

    expect(useVideoEditorStore.getState().project?.id).toBe(active.id);
    expect(useVideoEditorStore.getState().projectHistory.error).toBe('projectMismatch');
    expect(useVideoEditorStore.getState().projectHistory.past).toEqual([]);
  });
});

it('admits an exclusive typing lease only while history is idle', () => {
  const store = useVideoEditorStore;
  store.getState().setProject(createEmptyVideoProject('Typing'));
  const foreign = store.getState().beginProjectHistoryTransaction();
  expect(foreign).not.toBeNull();
  expect(store.getState().beginProjectHistoryTransaction({ onlyIfIdle: true })).toBeNull();
  expect(store.getState().isProjectHistoryTransactionCurrent(foreign!)).toBe(true);
  expect(store.getState().beginProjectHistoryTransaction()).toBe(foreign);
  store.getState().endProjectHistoryTransaction(foreign!);
  const typing = store.getState().beginProjectHistoryTransaction({ onlyIfIdle: true });
  expect(typing).not.toBeNull();
  expect(typing).not.toBe(foreign);
  store.getState().endProjectHistoryTransaction(typing!);
});

it('does not clone a snapshot discarded by the existing history byte budget', () => {
  const project = createEmptyVideoProject('x'.repeat(9 * 1024 * 1024));
  const next = { ...project, name: 'Small replacement', updatedAt: project.updatedAt + 1 };
  const clone = vi.spyOn(globalThis, 'structuredClone');
  try {
    const result = recordVideoEditorProjectHistory(
      resetVideoEditorProjectHistory(project.id),
      project,
      next
    );
    expect(result.past).toEqual([]);
    expect(result.future).toEqual([]);
    expect(result.error).toBeNull();
    expect(clone).not.toHaveBeenCalled();
  } finally {
    clone.mockRestore();
  }
});

it('keeps admitted history isolated from later mutation of the source snapshot', () => {
  const project = createEmptyVideoProject('Original');
  const next = { ...project, name: 'Changed' };
  const history = recordVideoEditorProjectHistory(
    resetVideoEditorProjectHistory(project.id),
    project,
    next
  );
  project.name = 'External mutation';
  const result = undoVideoEditorProjectHistory(history, next);
  expect(result?.status).toBe('applied');
  if (result?.status === 'applied') expect(result.project.name).toBe('Original');
});

it('retains a small edit and both navigation directions when captured facts exceed the history byte budget', () => {
  const project = createVideoProjectFromRecording({
    recordingId: 'dense-recording',
    filename: 'dense.webm',
    duration: 3,
    width: 1920,
    height: 1080,
    mimeType: 'video/webm',
    size: 1024,
  });
  project.version = 33;
  const clip = project.clips.find((item) => item.type === 'VIDEO');
  if (!clip || clip.type !== 'VIDEO') throw new Error('Expected recording clip');
  clip.sourceInstanceId = 'source-instance';
  const track = createVideoProjectCursorTrack();
  track.sourceObservations = [
    {
      recordingId: 'dense-recording',
      sourceInstanceId: 'source-instance',
      samples: Array.from({ length: 20000 }, (_, index) => ({
        id: `captured-sample-${index}`,
        time: index / 10000,
        x: 0.5,
        y: 0.5,
        visible: true,
        recordingPoint: { x: 0.5, y: 0.5 },
        observationClockId: 'captured-source-observation-clock',
        captureSegment: 0,
        observation: 'observed' as const,
      })),
    },
  ];
  project.cursorTrack = track;
  project.cursorTrack = materializeVideoProjectCursorSourceObservations(project);
  expect(isHydratableVideoProject(project)).toBe(true);
  expect(new TextEncoder().encode(JSON.stringify(project)).byteLength).toBeGreaterThan(
    8 * 1024 * 1024
  );
  const next = { ...project, backgroundColor: '#123456' };
  const history = recordVideoEditorProjectHistory(
    resetVideoEditorProjectHistory(project.id),
    project,
    next
  );
  expect(history.error).toBeNull();
  expect(history.past).toHaveLength(1);
  expect(new TextEncoder().encode(JSON.stringify(history)).byteLength).toBeLessThan(4096);
  const undo = undoVideoEditorProjectHistory(history, next);
  expect(undo?.status).toBe('applied');
  if (!undo || undo.status !== 'applied') throw new Error('Expected undo');
  expect(undo.project.backgroundColor).toBe(project.backgroundColor);
  expect(undo.project.cursorTrack).toEqual(project.cursorTrack);
  const redo = redoVideoEditorProjectHistory(undo.history, undo.project);
  expect(redo?.status).toBe('applied');
  if (!redo || redo.status !== 'applied') throw new Error('Expected redo');
  expect(redo.project.backgroundColor).toBe('#123456');
  expect(redo.project.cursorTrack).toEqual(project.cursorTrack);
});

it('counts UTF8 operation metadata across both history directions without retaining current content', () => {
  const label = '界'.repeat(1_500_000);
  let project = createEmptyVideoProject(`First ${label}`);
  let history = resetVideoEditorProjectHistory(project.id);
  for (const prefix of ['Second', 'Third']) {
    const next = { ...project, name: `${prefix} ${label}` };
    history = recordVideoEditorProjectHistory(history, project, next);
    project = next;
  }
  expect(history.past).toHaveLength(1);
  expect(new TextEncoder().encode(JSON.stringify(history)).byteLength).toBeLessThanOrEqual(
    8 * 1024 * 1024
  );
  const undo = undoVideoEditorProjectHistory(history, project);
  expect(undo?.status).toBe('applied');
  if (!undo || undo.status !== 'applied') throw new Error('Expected budgeted undo');
  expect(undo.project.name).toBe(`Second ${label}`);
  expect(undo.history.future).toHaveLength(1);
  expect(new TextEncoder().encode(JSON.stringify(undo.history)).byteLength).toBeLessThanOrEqual(
    8 * 1024 * 1024
  );
});

it('preserves redo for a net-unchanged transaction with immutable effect asset bytes', () => {
  const project = createProjectWithEffects();
  project.name = 'Initial';
  project.effectSnapshots![0]!.assets = [
    {
      id: 'image',
      kind: 'image',
      mimeType: 'image/png',
      byteLength: 1,
      sha256: 'b'.repeat(64),
      blob: new Blob(['x'], { type: 'image/png' }),
    },
  ];
  const store = useVideoEditorStore;
  store.getState().setProject(project);
  store.getState().renameProject('Warm fixture');
  store.getState().renameProject('Initial');
  store.getState().setProject(store.getState().project!);
  store.getState().renameProject('Edited');
  store.getState().undoProject();
  const lease = store.getState().beginProjectHistoryTransaction();
  store.getState().renameProject('Temporary');
  store.getState().renameProject('Initial');
  store.getState().endProjectHistoryTransaction(lease!);
  expect(store.getState().projectHistory.past).toHaveLength(0);
  expect(store.getState().projectHistory.future).toHaveLength(1);
});

it('refuses an unavailable changed-value clone without changing the active project', () => {
  const project = createEmptyVideoProject('Original');
  const next = { ...project, name: 'Changed' };
  const clone = vi.spyOn(globalThis, 'structuredClone').mockImplementation(() => {
    throw new Error('Clone unavailable');
  });
  try {
    const history = recordVideoEditorProjectHistory(
      resetVideoEditorProjectHistory(project.id),
      project,
      next
    );
    expect(history).toMatchObject({ error: 'snapshotFailed', past: [], future: [] });
    expect(project.name).toBe('Original');
    expect(next.name).toBe('Changed');
  } finally {
    clone.mockRestore();
  }
});

it('refuses failed restoration and leaves the current project available for a later edit', () => {
  const project = createEmptyVideoProject('Original');
  const next = { ...project, name: 'Changed' };
  const history = recordVideoEditorProjectHistory(
    resetVideoEditorProjectHistory(project.id),
    project,
    next
  );
  const clone = vi.spyOn(globalThis, 'structuredClone').mockImplementation(() => {
    throw new Error('Clone unavailable');
  });
  let failed;
  try {
    failed = undoVideoEditorProjectHistory(history, next);
    expect(failed).toMatchObject({
      status: 'failed',
      history: { error: 'snapshotFailed', past: [], future: [] },
    });
    expect(next.name).toBe('Changed');
  } finally {
    clone.mockRestore();
  }
  if (!failed) throw new Error('Expected refused restoration');
  const recovered = recordVideoEditorProjectHistory(failed.history, next, {
    ...next,
    name: 'Retried',
  });
  expect(recovered.error).toBeNull();
  expect(recovered.past).toHaveLength(1);
});

it('restores independent selections in both navigation directions', () => {
  const project = createEmptyVideoProject('Original');
  const next = { ...project, name: 'Changed' };
  const selected = { kind: 'track' as const, trackId: project.tracks[0]!.id };
  const history = recordVideoEditorProjectHistory(
    resetVideoEditorProjectHistory(project.id),
    project,
    next,
    selected
  );
  selected.trackId = 'Later caller mutation';
  const undo = undoVideoEditorProjectHistory(history, next, { kind: 'scene' });
  expect(undo?.status).toBe('applied');
  if (!undo || undo.status !== 'applied') throw new Error('Expected undo');
  expect(undo.selection).toEqual({ kind: 'track', trackId: project.tracks[0]!.id });
  const redo = redoVideoEditorProjectHistory(undo.history, undo.project, undo.selection);
  expect(redo?.status).toBe('applied');
  if (!redo || redo.status !== 'applied') throw new Error('Expected redo');
  expect(redo.selection).toEqual({ kind: 'scene' });
});
