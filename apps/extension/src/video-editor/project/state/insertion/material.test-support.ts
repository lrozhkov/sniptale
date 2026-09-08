import { createStore } from 'zustand/vanilla';
import {
  createEmptyVideoProject,
  createVideoProjectAsset,
} from '../../../../features/video/project/factories/creation';
import { VideoProjectAssetType } from '../../../../features/video/project/types';
import { createVideoEditorProjectActions } from '../actions';
import type { VideoEditorProjectState } from '../contracts';
import { resetVideoEditorProjectHistory } from '../../history';

export function setup(hasAudio = false, type: VideoProjectAssetType = VideoProjectAssetType.VIDEO) {
  const project = createEmptyVideoProject('Materials');
  const asset = createVideoProjectAsset(
    'Source',
    type,
    { kind: 'project-asset', projectAssetId: 'source' },
    {
      width: 1280,
      height: 720,
      duration: 6,
      mimeType: 'video/webm',
      size: 100,
      hasAudio,
      audioPeaks: null,
    }
  );
  project.assets = [asset];
  const store = createStore<VideoEditorProjectState>()((set, get) => ({
    project,
    currentTime: 3,
    placementMode: null,
    selection: { kind: 'scene' },
    selectedTrackId: null,
    projectHistory: resetVideoEditorProjectHistory(project.id),
    ...createVideoEditorProjectActions(set, get),
  }));
  return { store, asset, project };
}
