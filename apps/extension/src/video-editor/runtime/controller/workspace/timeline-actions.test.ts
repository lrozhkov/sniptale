import { expect, it, vi } from 'vitest';
import { createEmptyVideoProject } from '../../../../features/video/project/factories/creation';
import { VideoEditorSelectionKind } from '../../../contracts/selection';
import { useVideoEditorStore, type VideoEditorState } from '../../../state/store';
import type { VideoEditorWorkspaceState } from '../workspace-state';
import { createWorkspaceTimelineEditingActions } from './timeline-actions';

function createStore(project = createEmptyVideoProject('Timeline actions')) {
  const store: VideoEditorState = {
    ...useVideoEditorStore.getInitialState(),
    project,
    recordingId: 'recording-1',
    selectedClipId: null,
    selection: { kind: VideoEditorSelectionKind.SCENE },
    setError: vi.fn(),
    updateClipPlaybackRate: vi.fn(),
    updateProject: vi.fn((updater: (currentProject: typeof project) => typeof project) => {
      const currentProject = store.project;
      if (currentProject) store.project = updater(currentProject);
    }),
  };

  return store;
}

function createWorkspace(): Pick<
  VideoEditorWorkspaceState,
  'clearPlaybackRange' | 'confirm' | 'inspector' | 'setPlaybackRange'
> {
  return {
    clearPlaybackRange: vi.fn(),
    confirm: {
      dialog: null,
      onCancel: vi.fn(),
      onConfirm: vi.fn(),
      request: vi.fn(),
    },
    inspector: { mode: 'selection', openGridSettings: vi.fn(), openSelection: vi.fn() },
    setPlaybackRange: vi.fn(),
  };
}

function createSelectedClipActions() {
  return {
    deleteSelectedClip: vi.fn(),
    duplicateSelectedClip: vi.fn(),
    splitSelectedClip: vi.fn(),
  };
}

it('deletes the selected object track from timeline delete actions', () => {
  const store = createStore();
  store.selection = {
    kind: VideoEditorSelectionKind.OBJECT_TRACK,
    objectTrackId: 'visual-cursor',
  };
  store.deleteObjectTrack = vi.fn();

  createWorkspaceTimelineEditingActions(
    store,
    createWorkspace(),
    createSelectedClipActions()
  ).onDeleteSelectedTimelineObject();

  expect(store.deleteObjectTrack).toHaveBeenCalledWith('visual-cursor');
});
