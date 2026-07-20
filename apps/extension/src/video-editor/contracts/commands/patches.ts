import type { VideoClipTransitionKind } from '../../../features/video/project/types/index';
import type {
  VideoProject,
  VideoProjectMotionRegion,
  VideoProjectTransition,
} from '../../../features/video/project/types/index';
import type { VideoProjectEffectInstance } from '../../../features/video/project/effect-instance/types';

export type VideoEditorAudioEnvelopePatch = {
  volumeEnvelopeEnd?: number;
  volumeEnvelopeStart?: number;
};

export type VideoEditorFadePatch = {
  fadeInMs?: number;
  fadeOutMs?: number;
};

export type VideoEditorTransitionPatch = {
  transitionIn?: VideoClipTransitionKind;
  transitionOut?: VideoClipTransitionKind;
};

export type VideoEditorCursorSkinPatch = Partial<
  NonNullable<NonNullable<VideoProject['cursorTrack']>['skin']>
>;

export type VideoEditorActionEventPatch = Partial<
  Pick<NonNullable<VideoProject['actionEvents'][number]>, 'duration' | 'label' | 'point' | 'preset'>
>;

export type VideoEditorMotionRegionPatch = Partial<
  Pick<
    VideoProjectMotionRegion,
    | 'duration'
    | 'cameraMode'
    | 'easing'
    | 'focusArea'
    | 'focusMode'
    | 'motionBlurAmount'
    | 'overlayZoomMode'
    | 'path'
    | 'focusPoint'
    | 'scale'
    | 'targetActionEventId'
    | 'zoomInDuration'
    | 'zoomOutDuration'
  >
>;

export type VideoEditorTransitionTemplatePatch = Partial<
  Pick<VideoProjectTransition, 'direction' | 'highlightColor' | 'intensity' | 'templateKind'>
>;

export type VideoProjectEffectInstancePatch = {
  controls?: Partial<VideoProjectEffectInstance['controls']>;
  enabled?: boolean;
  startTime?: number;
};
