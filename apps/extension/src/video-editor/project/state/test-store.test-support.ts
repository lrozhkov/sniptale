import { create } from 'zustand';
import { hydrateVideoProject } from '../../../features/video/project/hydration';
import type { VideoProject } from '../../../features/video/project/types';
import { createActionPointPlacementMode } from '../selection/placement';
import { createSceneSelection, resolveInitialVideoEditorSelection } from '../selection/model';
import { createVideoEditorProjectActions } from './actions';
import type { VideoEditorProjectState } from './contracts';

interface VideoEditorProjectTestState extends VideoEditorProjectState {
  clearPlacementMode: () => void;
  selectActionSegment: (actionEventId: string) => void;
  selectClip: (clipId: string | null) => void;
  selectCursorSegment: (sampleId: string) => void;
  selectMotionRegion: (motionRegionId: string) => void;
  selectObjectTrack: (objectTrackId: string) => void;
  selectScene: () => void;
  selectTrack: (trackId: string | null) => void;
  selectTransition: (transitionId: string) => void;
  startActionPointPlacement: (actionEventId: string) => void;
  setCurrentTime: (time: number) => void;
  setProject: (project: VideoProject) => void;
}

export function createVideoEditorProjectTestStore() {
  return create<VideoEditorProjectTestState>()((set, get) => ({
    project: null,
    currentTime: 0,
    placementMode: null,
    selection: createSceneSelection(),
    selectedTrackId: null,
    selectedClipId: null,
    clearPlacementMode: () => set({ placementMode: null }),
    selectActionSegment: (actionEventId) =>
      set({ selection: { kind: 'action-segment', actionEventId } }),
    selectClip: (clipId) =>
      set({
        selectedClipId: clipId,
        selection: clipId ? { kind: 'clip', clipId } : createSceneSelection(),
      }),
    selectCursorSegment: (sampleId) => set({ selection: { kind: 'cursor-segment', sampleId } }),
    selectMotionRegion: (motionRegionId) =>
      set({ selection: { kind: 'motion-region', motionRegionId } }),
    selectObjectTrack: (objectTrackId) =>
      set({ selection: { kind: 'object-track', objectTrackId } }),
    selectScene: () =>
      set({ selectedClipId: null, selectedTrackId: null, selection: createSceneSelection() }),
    selectTrack: (trackId) =>
      set({
        selectedClipId: null,
        selectedTrackId: trackId,
        selection: trackId ? { kind: 'track', trackId } : createSceneSelection(),
      }),
    selectTransition: (transitionId) =>
      set({ selection: { kind: 'transition-junction', transitionId } }),
    startActionPointPlacement: (actionEventId) =>
      set({ placementMode: createActionPointPlacementMode(actionEventId) }),
    setCurrentTime: (currentTime) => set({ currentTime }),
    setProject: (project) => {
      const hydratedProject = hydrateVideoProject(project);
      const selection = resolveInitialVideoEditorSelection(hydratedProject);
      set({
        project: hydratedProject,
        selectedClipId: selection.kind === 'clip' ? selection.clipId : null,
        selectedTrackId: hydratedProject.tracks[0]?.id ?? null,
        selection,
      });
    },
    ...createVideoEditorProjectActions(set, get),
  }));
}
