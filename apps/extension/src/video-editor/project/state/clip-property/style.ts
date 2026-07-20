import type { VideoEditorProjectState, VideoEditorProjectSliceSet } from '../contracts';
import { createClipMediaStyleActions, createClipTextStyleActions } from './content';
import { createTextClipToAnnotationActions } from './conversion';

type VideoEditorStoreSet = VideoEditorProjectSliceSet;

export function createClipPropertyStyleActions(
  set: VideoEditorStoreSet
): Pick<
  VideoEditorProjectState,
  | 'updateMediaClipFitMode'
  | 'updateMediaClipFitScalePercent'
  | 'updateMediaClipShadowIntensity'
  | 'updateMediaClipShadowMode'
  | 'applyMediaClipVisualsToTrack'
  | 'convertTextClipToAnnotation'
  | 'updateTextClipContent'
  | 'updateTextClipStyle'
  | 'updateAnnotationClipContent'
  | 'updateAnnotationClipStyle'
  | 'updateAnnotationClipTemplate'
  | 'updateShapeClipStyle'
> {
  return {
    ...createClipMediaStyleActions(set),
    ...createTextClipToAnnotationActions(set),
    ...createClipTextStyleActions(set),
  };
}
