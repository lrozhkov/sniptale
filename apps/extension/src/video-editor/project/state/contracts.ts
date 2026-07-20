import type { StateCreator } from 'zustand';
import type { VideoProject } from '../../../features/video/project/types/index';
import type { VideoEditorPlacementMode } from '../../contracts/placement';
import type { VideoEditorSelection } from '../../contracts/selection';
import type { VideoEditorProjectActions } from '../../contracts/commands/project';

export interface VideoEditorProjectSliceState {
  project: VideoProject | null;
  currentTime: number;
  placementMode: VideoEditorPlacementMode | null;
  selection: VideoEditorSelection;
  selectedTrackId: string | null;
  selectedClipId: string | null;
}

type VideoEditorProjectSlice = VideoEditorProjectSliceState & VideoEditorProjectActions;
export type VideoEditorProjectState = VideoEditorProjectSlice;

export type VideoEditorProjectSliceSet<
  TState extends VideoEditorProjectSliceState = VideoEditorProjectState,
> = Parameters<StateCreator<TState>>[0];

export type VideoEditorProjectSliceGet<
  TState extends VideoEditorProjectSliceState = VideoEditorProjectState,
> = Parameters<StateCreator<TState>>[1];
