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

export type VideoEditorActionEventPatch = {
  /** Moves the presentation of this appearance, retaining its captured anchor. */
  time?: number;
  /** Exact current appearance that authorizes a point edit. */
  clipId?: string | null;
  /** Point placement updates the visual override, preserving the captured point. */
  point?: VideoProject['actionEvents'][number]['point'];
  /** Replaces the sparse override; null restores all inherited settings. */
  presentation?:
    | import('../../../features/video/project/types').VideoProjectActionPresentationOverride
    | null;
};

export type VideoEditorMotionRegionPatch = Partial<
  Pick<
    VideoProjectMotionRegion,
    | 'startTime'
    | 'duration'
    | 'incomingConnection'
    | 'easing'
    | 'focusArea'
    | 'focusMode'
    | 'motionBlurAmount'
    | 'overlayZoomMode'
    | 'focusPoint'
    | 'scale'
    | 'targetAction'
    | 'zoomInDuration'
    | 'zoomOutDuration'
  >
> & { sourceClipId?: string | null };

export type VideoEditorTransitionTemplatePatch = Partial<
  Pick<VideoProjectTransition, 'direction' | 'highlightColor' | 'intensity' | 'templateKind'>
>;

export type VideoProjectEffectInstancePatch = {
  controls?: Partial<VideoProjectEffectInstance['controls']>;
  enabled?: boolean;
  startTime?: number;
};
