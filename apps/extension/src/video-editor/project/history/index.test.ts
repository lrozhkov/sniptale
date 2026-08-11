import { afterEach, describe, expect, it } from 'vitest';
import { createEmptyVideoProject } from '../../../features/video/project/factories/creation';
import { useVideoEditorStore } from '../../state/store';
import {
  VIDEO_EDITOR_PROJECT_HISTORY_ACTION_LIMIT,
  recordVideoEditorProjectHistory,
  resetVideoEditorProjectHistory,
  undoVideoEditorProjectHistory,
} from '.';

afterEach(() => {
  useVideoEditorStore.setState(useVideoEditorStore.getInitialState(), true);
});

describe('video editor project history', () => {
  it('retains exactly the latest 100 undoable actions and evicts the oldest snapshot', () => {
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
        past: [stale],
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
