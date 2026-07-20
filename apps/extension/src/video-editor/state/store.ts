import { create, type StateCreator } from 'zustand';
import { createVideoEditorProjectActions } from '../project/state/actions';
import { createExportStateActions } from './export-state';
import { createVideoEditorTimelineState } from './root-state';
import type { VideoEditorState } from './types';

export type { VideoEditorState } from './types';

const createVideoEditorStoreState: StateCreator<VideoEditorState> = (set, get) => ({
  ...createVideoEditorTimelineState(set),
  ...createVideoEditorProjectActions(set, get),
  ...createExportStateActions(set),
});

export const useVideoEditorStore = create<VideoEditorState>()(createVideoEditorStoreState);
