import type { VideoEditorProjectState, VideoEditorProjectSliceSet } from '../contracts';
import { createClipPropertyTransformActions } from './audio';
import { createClipPropertyStyleActions } from './style';
import { createClipPropertyTimingActions } from './timing';

type VideoEditorStoreSet = VideoEditorProjectSliceSet;

type VideoEditorProjectClipPropertyActionKeys =
  | 'updateClipTransform'
  | 'updateClipMuted'
  | 'updateClipVolume'
  | 'updateClipAudioEnvelope'
  | 'updateClipFades'
  | 'updateClipTransitions'
  | 'updateClipPlaybackRate'
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
  | 'updateShapeClipStyle';

export function createVideoEditorProjectClipPropertyActions(
  set: VideoEditorStoreSet
): Pick<VideoEditorProjectState, VideoEditorProjectClipPropertyActionKeys> {
  const transformActions = createClipPropertyTransformActions(set);
  const timingActions = createClipPropertyTimingActions(set);
  const styleActions = createClipPropertyStyleActions(set);

  return {
    ...transformActions,
    ...timingActions,
    ...styleActions,
  };
}
