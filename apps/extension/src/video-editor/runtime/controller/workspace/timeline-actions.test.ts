import { expect, it, vi } from 'vitest';
import { createEmptyVideoProject } from '../../../../features/video/project/factories/creation';
import { VideoEditorSelectionKind } from '../../../contracts/selection';
import type { VideoEditorControllerStorePort } from '../../../contracts/controller-store';
import type { VideoEditorWorkspaceState } from '../workspace-state';
import { createWorkspaceTimelineEditingActions } from './timeline-actions';

function createStore(project = createEmptyVideoProject('Timeline actions')) {
  const store = {
    project,
    recordingId: 'recording-1',
    selectedClipId: null,
    selection: { kind: VideoEditorSelectionKind.SCENE },
    setError: vi.fn(),
    updateClipPlaybackRate: vi.fn(),
    updateProject: vi.fn((updater: (currentProject: typeof project) => typeof project) => {
      store.project = updater(store.project);
    }),
  };

  return store as Pick<
    VideoEditorControllerStorePort,
    | 'project'
    | 'recordingId'
    | 'selectedClipId'
    | 'selection'
    | 'setError'
    | 'updateClipPlaybackRate'
    | 'updateProject'
  > as VideoEditorControllerStorePort;
}

function createWorkspace() {
  return {
    clearPlaybackRange: vi.fn(),
    confirm: { request: vi.fn() },
    inspector: { openSelection: vi.fn() },
    setPlaybackRange: vi.fn(),
  } as unknown as Pick<
    VideoEditorWorkspaceState,
    'clearPlaybackRange' | 'confirm' | 'inspector' | 'setPlaybackRange'
  >;
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
