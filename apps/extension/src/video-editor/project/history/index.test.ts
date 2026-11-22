import { createTextClip } from '../../../features/video/project/factories/overlay-clip';
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
  captureVideoEditorProjectHistory,
  restoreVideoEditorProjectHistory,
  beginVideoEditorProjectHistoryTransaction,
  endVideoEditorProjectHistoryTransaction,
  recordVideoEditorProjectHistory,
  resetVideoEditorProjectHistory,
  undoVideoEditorProjectHistory,
  redoVideoEditorProjectHistory,
} from '.';
import { parseVideoProjectHistoryCheckpoint } from '../../../features/video/project/history-checkpoint';
import { applyVideoProjectHistoryChangeValues } from '../../../features/video/project/history-change';
import { EDITOR_HISTORY_LIMITS } from '../../../features/editor-history/policy';

afterEach(() => {
  useVideoEditorStore.setState(useVideoEditorStore.getInitialState(), true);
});

describe('video editor project history', () => {
  it('retains the configured number of undoable actions and evicts the oldest snapshot', () => {
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
        epoch: crypto.randomUUID(),
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
  const project = createEmptyVideoProject('x'.repeat(EDITOR_HISTORY_LIMITS.maxBytes + 1));
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
  const label = '界'.repeat(Math.floor(EDITOR_HISTORY_LIMITS.maxBytes / 5));
  let project = createEmptyVideoProject(`First ${label}`);
  let history = resetVideoEditorProjectHistory(project.id);
  for (const prefix of ['Second', 'Third']) {
    const next = { ...project, name: `${prefix} ${label}` };
    history = recordVideoEditorProjectHistory(history, project, next);
    project = next;
  }
  expect(history.past).toHaveLength(1);
  expect(new TextEncoder().encode(JSON.stringify(history)).byteLength).toBeLessThanOrEqual(
    EDITOR_HISTORY_LIMITS.maxBytes
  );
  const undo = undoVideoEditorProjectHistory(history, project);
  expect(undo?.status).toBe('applied');
  if (!undo || undo.status !== 'applied') throw new Error('Expected budgeted undo');
  expect(undo.project.name).toBe(`Second ${label}`);
  expect(undo.history.future).toHaveLength(1);
  expect(new TextEncoder().encode(JSON.stringify(undo.history)).byteLength).toBeLessThanOrEqual(
    EDITOR_HISTORY_LIMITS.maxBytes
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

it('cancels the full transaction while preserving Redo and current selection', () => {
  const store = useVideoEditorStore;
  const project = createEmptyVideoProject('Original');
  const clip = createTextClip(project.tracks[0]!.id, project.width, project.height, 0);
  clip.playbackWindow = {
    offset: 0.5,
    holdAt: 3,
    fadePhase: { offset: 0.5, duration: 4 },
    gainPhase: { offset: 0.5, duration: 4 },
  };
  project.version = 43;
  project.clips = [clip];
  project.duration = clip.duration;
  store.getState().setProject(project);
  store.getState().renameProject('Redo name');
  store.getState().undoProject();
  store.getState().selectClip(clip.id);
  const before = store.getState().project!;
  const past = store.getState().projectHistory.past;
  const future = store.getState().projectHistory.future;
  const lease = store.getState().beginProjectHistoryTransaction();
  if (!lease) throw new Error('Missing transaction');
  store.getState().updateClipFades(clip.id, { fadeInMs: 300 });
  expect(store.getState().project?.clips[0]?.playbackWindow?.fadePhase).toBeUndefined();
  store.getState().selectScene();
  store.getState().endProjectHistoryTransaction(lease, 'cancel');
  const { updatedAt: _beforeTime, ...expected } = before;
  const { updatedAt: _afterTime, ...actual } = store.getState().project!;
  expect(actual).toEqual(expected);
  expect(store.getState().selection).toEqual({ kind: 'scene' });
  expect(store.getState().projectHistory).toMatchObject({ transaction: null, error: null });
  expect(store.getState().projectHistory.past).toBe(past);
  expect(store.getState().projectHistory.future).toBe(future);
  store.getState().redoProject();
  expect(store.getState().project?.name).toBe('Redo name');
  expect(store.getState().project?.clips[0]?.playbackWindow).toEqual(clip.playbackWindow);
});

it('keeps an empty cancelled transaction and repeated cancellation free of edits', () => {
  const store = useVideoEditorStore;
  store.getState().setProject(createEmptyVideoProject('Original'));
  const before = store.getState().project;
  const lease = store.getState().beginProjectHistoryTransaction();
  if (!lease) throw new Error('Missing transaction');
  store.getState().endProjectHistoryTransaction(lease, 'cancel');
  expect(store.getState().project).toBe(before);
  expect(store.getState().projectHistory).toMatchObject({
    past: [],
    future: [],
    transaction: null,
  });
  store.getState().endProjectHistoryTransaction(lease, 'cancel');
  expect(store.getState().project).toBe(before);
});

it('does not cancel a foreign lease or restore a retired project', () => {
  const store = useVideoEditorStore;
  store.getState().setProject(createEmptyVideoProject('Original'));
  const lease = store.getState().beginProjectHistoryTransaction();
  if (!lease) throw new Error('Missing transaction');
  store.getState().renameProject('Pending');
  store.getState().endProjectHistoryTransaction(Symbol('foreign'), 'cancel');
  expect(store.getState().project?.name).toBe('Pending');
  expect(store.getState().isProjectHistoryTransactionCurrent(lease)).toBe(true);
  const replacement = createEmptyVideoProject('Replacement');
  store.getState().setProject(replacement);
  const current = store.getState().project;
  store.getState().endProjectHistoryTransaction(lease, 'cancel');
  expect(store.getState().project).toBe(current);
  expect(store.getState().project?.id).toBe(replacement.id);
  expect(store.getState().projectHistory).toMatchObject({
    past: [],
    future: [],
    transaction: null,
  });
});

it('preserves immutable effect bytes when cancelling a changed transaction', () => {
  const project = createProjectWithEffects();
  const blob = new Blob(['x'], { type: 'image/png' });
  project.effectSnapshots![0]!.assets = [
    {
      id: 'image',
      kind: 'image',
      mimeType: 'image/png',
      byteLength: 1,
      sha256: 'b'.repeat(64),
      blob,
    },
  ];
  const store = useVideoEditorStore;
  store.getState().setProject(project);
  const original = store.getState().project!.name;
  const lease = store.getState().beginProjectHistoryTransaction();
  if (!lease) throw new Error('Missing transaction');
  store.getState().renameProject('Pending');
  store.getState().endProjectHistoryTransaction(lease, 'cancel');
  expect(store.getState().project?.name).toBe(original);
  expect(store.getState().project?.effectSnapshots?.[0]?.assets[0]?.blob).toBe(blob);
  expect(store.getState().projectHistory.past).toHaveLength(0);
});

it('captures retained history without encoding old payloads and retains its epoch through navigation', () => {
  let project = createEmptyVideoProject('Initial');
  let history = resetVideoEditorProjectHistory(project.id);
  const epoch = history.epoch;
  for (let index = 0; index < 50; index++) {
    const next = { ...project, name: `Edit ${index}` };
    history = recordVideoEditorProjectHistory(history, project, next);
    project = next;
  }
  const stringify = vi.spyOn(JSON, 'stringify');
  let captured;
  try {
    captured = captureVideoEditorProjectHistory(history);
    expect(captured?.past).toHaveLength(50);
    expect(stringify).not.toHaveBeenCalled();
    expect(captureVideoEditorProjectHistory(history)).toEqual(captured);
    expect(stringify).not.toHaveBeenCalled();
  } finally {
    stringify.mockRestore();
  }
  expect(captured?.epoch).toBe(epoch);
  expect(captured?.past.every((entry) => !entry.value.includes('selection'))).toBe(true);
  const undone = undoVideoEditorProjectHistory(history, project);
  if (!undone || undone.status !== 'applied') throw new Error('Undo refused');
  const after = captureVideoEditorProjectHistory(undone.history);
  expect(after?.epoch).toBe(epoch);
  expect(after?.past).toHaveLength(49);
  expect(after?.future).toHaveLength(1);
  expect(resetVideoEditorProjectHistory(project.id).epoch).not.toBe(epoch);
});

it('captures the old source identity after deleting its final current placement', () => {
  const project = createEmptyVideoProject('Source');
  project.baseRecordingId = 'retained-recording';
  project.source = { kind: 'recording', recordingId: 'retained-recording' };
  const next = { ...project, baseRecordingId: null, source: { kind: 'manual' as const } };
  const history = recordVideoEditorProjectHistory(
    resetVideoEditorProjectHistory(project.id),
    project,
    next
  );
  expect(captureVideoEditorProjectHistory(history)?.past[0]?.sources).toContainEqual({
    kind: 'recording',
    id: 'retained-recording',
  });
  const pending = {
    ...history,
    transaction: { before: null, changed: false, lease: Symbol(), projectId: project.id },
  };
  expect(captureVideoEditorProjectHistory(pending)).toBeNull();
  expect(captureVideoEditorProjectHistory({ ...history, error: 'snapshotFailed' })).toBeNull();
});

it('captures a draft recovery inverse without sealing the live gesture or dropping its Redo branch', () => {
  const project = createEmptyVideoProject('Before');
  const later = { ...project, name: 'Later' };
  const recorded = recordVideoEditorProjectHistory(
    resetVideoEditorProjectHistory(project.id),
    project,
    later
  );
  const undo = undoVideoEditorProjectHistory(recorded, later);
  if (!undo || undo.status !== 'applied') throw new Error('Undo refused');
  const before = undo.project;
  const baseline = captureVideoEditorProjectHistory(undo.history)!;
  const draft = { ...before, name: 'Partial gesture' };
  const history = recordVideoEditorProjectHistory(
    beginVideoEditorProjectHistoryTransaction(undo.history, before),
    before,
    draft
  );
  const lease = history.transaction!.lease;
  const captured = captureVideoEditorProjectHistory(history, draft)!;
  expect(captured.future).toEqual(baseline.future);
  expect(captured.past).toEqual(baseline.past);
  expect(history.transaction?.lease).toBe(lease);
  expect(history.past).toBe(undo.history.past);
  expect(history.future).toBe(undo.history.future);
  const raw: unknown = JSON.parse(captured.recovery!.value);
  const checkpoint = parseVideoProjectHistoryCheckpoint(
    { version: 1, projectId: draft.id, past: [raw], future: [] },
    draft,
    EDITOR_HISTORY_LIMITS
  );
  expect(checkpoint).not.toBeNull();
  expect(applyVideoProjectHistoryChangeValues(draft, checkpoint!.past[0]!)).toEqual(before);
  const closed = endVideoEditorProjectHistoryTransaction(history, draft);
  expect(closed.past).toHaveLength(1);
  expect(closed.future).toEqual([]);
  expect(captureVideoEditorProjectHistory(closed)?.past[0]?.value).toBe(captured.recovery?.value);
});

it('preserves the original Redo branch when an active gesture returns to its initial values', () => {
  const project = createEmptyVideoProject('Before');
  const later = { ...project, name: 'Later' };
  const undo = undoVideoEditorProjectHistory(
    recordVideoEditorProjectHistory(resetVideoEditorProjectHistory(project.id), project, later),
    later
  );
  if (!undo || undo.status !== 'applied') throw new Error('Undo refused');
  const base = captureVideoEditorProjectHistory(undo.history);
  const active = recordVideoEditorProjectHistory(
    beginVideoEditorProjectHistoryTransaction(undo.history, undo.project),
    undo.project,
    { ...undo.project, name: 'Temporary' }
  );
  expect(captureVideoEditorProjectHistory(active, undo.project)).toEqual(base);
  expect(active.transaction).not.toBeNull();
  expect(captureVideoEditorProjectHistory(active)).toBeNull();
  expect(captureVideoEditorProjectHistory(active, { ...undo.project, id: 'other' })).toBeNull();
});

it('counts draft recovery within the action cap and keeps an oversized current draft independent', () => {
  let project = createEmptyVideoProject('Initial');
  let history = resetVideoEditorProjectHistory(project.id);
  for (let index = 0; index < EDITOR_HISTORY_LIMITS.maxActions; index++) {
    const next = { ...project, name: `Edit ${index}` };
    history = recordVideoEditorProjectHistory(history, project, next);
    project = next;
  }
  const draft = { ...project, name: 'Draft' };
  const active = recordVideoEditorProjectHistory(
    beginVideoEditorProjectHistoryTransaction(history, project),
    project,
    draft
  );
  const captured = captureVideoEditorProjectHistory(active, draft)!;
  expect(captured.past).toHaveLength(EDITOR_HISTORY_LIMITS.maxActions - 1);
  expect(captured.recovery).toBeDefined();
  expect(active.past).toHaveLength(EDITOR_HISTORY_LIMITS.maxActions);
  const large = createEmptyVideoProject('x'.repeat(EDITOR_HISTORY_LIMITS.maxBytes + 1));
  const small = { ...large, name: 'Small draft' };
  const hugeInverse = recordVideoEditorProjectHistory(
    beginVideoEditorProjectHistoryTransaction(resetVideoEditorProjectHistory(large.id), large),
    large,
    small
  );
  const bounded = captureVideoEditorProjectHistory(hugeInverse, small);
  expect(bounded).toMatchObject({ past: [], future: [] });
  expect(bounded).not.toHaveProperty('recovery');
  expect(small.name).toBe('Small draft');
  expect(hugeInverse.transaction).not.toBeNull();
});

it('adopts admitted encoded inverses without serializing retained payloads again', () => {
  const project = createEmptyVideoProject('Current');
  const change = { kind: 'record' as const, fields: [] };
  Object.defineProperty(change, 'toJSON', {
    value: () => {
      throw new Error('Payload reencoded');
    },
  });
  const value = { change, value: '{"kind":"record","fields":[]}', bytes: 29, sources: [] };
  const restored = restoreVideoEditorProjectHistory(project.id, {
    projectId: project.id,
    epoch: 'admitted',
    past: [value],
    future: [],
  });
  expect(restored.error).toBeNull();
  expect(captureVideoEditorProjectHistory(restored)?.past[0]?.value).toBe(value.value);
  expect(
    restoreVideoEditorProjectHistory('other-project', {
      projectId: project.id,
      epoch: 'admitted',
      past: [value],
      future: [],
    }).error
  ).toBe('projectMismatch');
});
