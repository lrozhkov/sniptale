import type {
  VideoEditorProjectState,
  VideoEditorProjectSliceSet,
  VideoEditorProjectSliceGet,
} from '../contracts';
import {
  addAnnotationOverlayToProject,
  addAssetClipToProject,
  addShapeOverlayToProject,
  addSubtitleOverlayToProject,
  addTextOverlayToProject,
  addVideoBlockToProject,
} from '../asset-actions';
import { applyProjectUpdate } from '../helpers';
import { VideoEditorSelectionKind } from '../../../contracts/selection';

type VideoEditorStoreSet = VideoEditorProjectSliceSet;
type VideoEditorStoreGet = VideoEditorProjectSliceGet;

function applyInsertionResult(
  set: VideoEditorStoreSet,
  result: {
    project: NonNullable<VideoEditorProjectState['project']>;
    selectedClipId: string | null;
    selectedTrackId: string | null;
  }
): string | null {
  set((state) => applyProjectUpdate(state, () => result.project));
  set({
    selectedClipId: result.selectedClipId,
    selectedTrackId: result.selectedTrackId,
    ...(result.selectedClipId
      ? { selection: { kind: VideoEditorSelectionKind.CLIP, clipId: result.selectedClipId } }
      : {}),
  });
  return result.selectedClipId;
}

export function createAssetInsertionAction(
  set: VideoEditorStoreSet,
  get: VideoEditorStoreGet
): VideoEditorProjectState['addAssetClip'] {
  return (asset, trackId = null, startTime, timelineLaneId) => {
    const { project, selectedTrackId, currentTime } = get();
    if (!project) {
      return null;
    }

    const insertionTime = startTime ?? currentTime;
    const preferredTrackId = trackId ?? selectedTrackId;
    const result =
      timelineLaneId === undefined
        ? addAssetClipToProject(project, asset, preferredTrackId, insertionTime)
        : addAssetClipToProject(project, asset, preferredTrackId, insertionTime, timelineLaneId);
    return applyInsertionResult(set, result);
  };
}

export function createTextInsertionAction(
  set: VideoEditorStoreSet,
  get: VideoEditorStoreGet
): VideoEditorProjectState['addTextOverlay'] {
  return (trackId = null, startTime) => {
    const { project, selectedTrackId, currentTime } = get();
    if (!project) {
      return null;
    }

    const result = addTextOverlayToProject(
      project,
      trackId ?? selectedTrackId,
      startTime ?? currentTime
    );
    return applyInsertionResult(set, result);
  };
}

export function createAnnotationInsertionAction(
  set: VideoEditorStoreSet,
  get: VideoEditorStoreGet
): VideoEditorProjectState['addAnnotationOverlay'] {
  return (trackId = null, startTime, templateKind) => {
    const { project, selectedTrackId, currentTime } = get();
    if (!project) {
      return null;
    }

    const result = addAnnotationOverlayToProject(
      project,
      trackId ?? selectedTrackId,
      startTime ?? currentTime,
      templateKind
    );
    return applyInsertionResult(set, result);
  };
}

export function createSubtitleInsertionAction(
  set: VideoEditorStoreSet,
  get: VideoEditorStoreGet
): VideoEditorProjectState['addSubtitleOverlay'] {
  return (trackId = null, startTime) => {
    const { project, selectedTrackId, currentTime } = get();
    if (!project) {
      return null;
    }

    const result = addSubtitleOverlayToProject(
      project,
      trackId ?? selectedTrackId,
      startTime ?? currentTime
    );
    return applyInsertionResult(set, result);
  };
}

export function createVideoBlockInsertionAction(
  set: VideoEditorStoreSet,
  get: VideoEditorStoreGet
): VideoEditorProjectState['addVideoBlock'] {
  return (blockKind, trackId = null, startTime) => {
    const { project, selectedTrackId, currentTime } = get();
    if (!project) {
      return null;
    }

    const result = addVideoBlockToProject(
      project,
      blockKind,
      trackId ?? selectedTrackId,
      startTime ?? currentTime
    );
    return applyInsertionResult(set, result);
  };
}

export function createShapeInsertionAction(
  set: VideoEditorStoreSet,
  get: VideoEditorStoreGet
): VideoEditorProjectState['addShapeOverlay'] {
  return (shapeType, trackId = null, startTime) => {
    const { project, selectedTrackId, currentTime } = get();
    if (!project) {
      return null;
    }

    const result = addShapeOverlayToProject(
      project,
      trackId ?? selectedTrackId,
      startTime ?? currentTime,
      shapeType
    );
    return applyInsertionResult(set, result);
  };
}
