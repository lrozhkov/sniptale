import {
  DEFAULT_COLOR_ACCENT,
  DEFAULT_COLOR_ACCENT_SOFT,
  DEFAULT_COLOR_TEXT_INVERSE,
  DEFAULT_COLOR_TEXT_PANEL,
  DEFAULT_COLOR_VIDEO_BACKGROUND,
  DEFAULT_COLOR_VIDEO_CURSOR,
  DEFAULT_COLOR_VIDEO_TEXT_BACKGROUND,
  DEFAULT_COLOR_VIDEO_TEXT_BORDER,
} from '@sniptale/ui/default-colors/constants';
import {
  VideoAnnotationArrowKind,
  VideoAnnotationFrameKind,
  VideoAnnotationLeaderLineStyle,
  VideoAnnotationMarkerKind,
  VideoAnnotationPulseKind,
  VideoAnnotationFamily,
  VideoAnnotationMotionFamily,
  VideoAnnotationRenderFamily,
  VideoAnnotationTargetKind,
  VideoCursorAnimationPreset,
  VideoCursorCaptureMode as VideoCursorCaptureModeValue,
  VideoCursorVisualPreset,
  VideoProjectSourceKind,
  VideoSubtitlePlacement,
  type VideoCursorCaptureMode,
  type VideoProjectActionEvent,
  type VideoProjectAnnotationClip,
  type VideoProjectAnnotationStyle,
  type VideoProjectCursorSkin,
  type VideoProjectCursorTrack,
  type VideoProjectShapeStyle,
  type VideoProjectSource,
  type VideoProjectSubtitleTrackStyle,
  type VideoProjectTextStyle,
  VideoOverlayAnimationKind,
  VideoOverlayTemplateKind,
  VideoTemplateDirection,
  VideoTemplateIntensity,
  VideoTransitionRenderKind,
  VideoTransitionTemplateKind,
} from './types/index';
import { getDefaultCursorHidden } from './cursor';

export const DEFAULT_VIDEO_PROJECT_BACKGROUND = DEFAULT_COLOR_VIDEO_BACKGROUND;
export const DEFAULT_IMAGE_CLIP_DURATION = 5;
export const DEFAULT_TEXT_CLIP_DURATION = 5;
export const DEFAULT_SHAPE_CLIP_DURATION = 5;
export const DEFAULT_CLIP_VOLUME = 1;
export const DEFAULT_CLIP_FADE_MS = 0;
export const DEFAULT_VIDEO_ACTION_EVENTS: VideoProjectActionEvent[] = [];

const DEFAULT_VIDEO_CURSOR_SKIN: VideoProjectCursorSkin = {
  animationPreset: VideoCursorAnimationPreset.NONE,
  color: DEFAULT_COLOR_VIDEO_CURSOR,
  hidden: false,
  preset: VideoCursorVisualPreset.ARROW,
  scale: 1,
  shadow: true,
};

export const DEFAULT_VIDEO_TEXT_STYLE: VideoProjectTextStyle = {
  fontSize: 40,
  fontFamily: 'Segoe UI',
  fontWeight: 600,
  color: DEFAULT_COLOR_TEXT_INVERSE,
  backgroundColor: DEFAULT_COLOR_VIDEO_TEXT_BACKGROUND,
  borderColor: DEFAULT_COLOR_VIDEO_TEXT_BORDER,
  borderWidth: 1,
  padding: 16,
  borderRadius: 18,
  lineHeight: 1.25,
  textAlign: 'left',
};

export const DEFAULT_VIDEO_SUBTITLE_TRACK_STYLE: VideoProjectSubtitleTrackStyle = {
  ...DEFAULT_VIDEO_TEXT_STYLE,
  backgroundColor: 'rgba(10, 12, 16, 0.76)',
  borderColor: 'rgba(255, 255, 255, 0.16)',
  borderRadius: 22,
  fontSize: 44,
  fontWeight: 700,
  maxWidthPercent: 82,
  padding: 18,
  placement: VideoSubtitlePlacement.BOTTOM,
  safeAreaPercent: 8,
  textAlign: 'center',
};

export const DEFAULT_VIDEO_SHAPE_STYLE: VideoProjectShapeStyle = {
  fillColor: DEFAULT_COLOR_ACCENT_SOFT,
  strokeColor: DEFAULT_COLOR_ACCENT,
  strokeWidth: 3,
  borderRadius: 18,
};

export const DEFAULT_VIDEO_ANNOTATION_STYLE: VideoProjectAnnotationStyle = {
  accentColor: DEFAULT_COLOR_ACCENT,
  backgroundColor: 'rgba(10, 12, 16, 0.88)',
  headlineColor: DEFAULT_COLOR_TEXT_INVERSE,
  sublineColor: 'rgba(245, 240, 230, 0.78)',
  badgeTextColor: DEFAULT_COLOR_TEXT_PANEL,
  borderRadius: 22,
  padding: 18,
  blurAmount: 8,
  shimmerAmount: 0.36,
  depthAmount: 0.24,
};

export const DEFAULT_VIDEO_ANNOTATION_TEMPLATE =
  VideoOverlayTemplateKind.LOWER_THIRD_BASIC satisfies VideoOverlayTemplateKind;
export const DEFAULT_VIDEO_ANNOTATION_FAMILY =
  VideoAnnotationFamily.LOWER_THIRD satisfies VideoAnnotationFamily;
export const DEFAULT_VIDEO_ANNOTATION_RENDER_FAMILY =
  VideoAnnotationRenderFamily.PLATE satisfies VideoAnnotationRenderFamily;
export const DEFAULT_VIDEO_ANNOTATION_MOTION_FAMILY =
  VideoAnnotationMotionFamily.SLIDE_CARD satisfies VideoAnnotationMotionFamily;
export const DEFAULT_VIDEO_ANNOTATION_INTRO =
  VideoOverlayAnimationKind.SLIDE_UP_FADE satisfies VideoOverlayAnimationKind;
export const DEFAULT_VIDEO_ANNOTATION_OUTRO =
  VideoOverlayAnimationKind.REVEAL_MASK satisfies VideoOverlayAnimationKind;
export const DEFAULT_VIDEO_ANNOTATION_DIRECTION =
  VideoTemplateDirection.LEFT satisfies VideoTemplateDirection;
export const DEFAULT_VIDEO_ANNOTATION_INTENSITY =
  VideoTemplateIntensity.BALANCED satisfies VideoTemplateIntensity;
export const DEFAULT_VIDEO_ANNOTATION_TARGET =
  VideoAnnotationTargetKind.NONE satisfies VideoAnnotationTargetKind;
export const DEFAULT_VIDEO_ANNOTATION_LEADER_LINE = {
  enabled: false,
  style: VideoAnnotationLeaderLineStyle.STRAIGHT,
  direction: VideoTemplateDirection.LEFT,
  length: 120,
  thickness: 3,
} satisfies VideoProjectAnnotationClip['leaderLine'];
export const DEFAULT_VIDEO_ANNOTATION_CALLOUT_DECOR = {
  arrowKind: VideoAnnotationArrowKind.NONE,
  markerKind: VideoAnnotationMarkerKind.NONE,
  frameKind: VideoAnnotationFrameKind.NONE,
  pulseKind: VideoAnnotationPulseKind.NONE,
} satisfies VideoProjectAnnotationClip['calloutDecor'];
export const DEFAULT_VIDEO_ANNOTATION_INTRO_MS = 420;
export const DEFAULT_VIDEO_ANNOTATION_OUTRO_MS = 360;
export const DEFAULT_VIDEO_TRANSITION_TEMPLATE = VideoTransitionTemplateKind.CROSSFADE;
export const DEFAULT_VIDEO_TRANSITION_RENDER_KIND = VideoTransitionRenderKind.COMPOSITE;
export const DEFAULT_VIDEO_TRANSITION_DIRECTION = VideoTemplateDirection.LEFT;
export const DEFAULT_VIDEO_TRANSITION_INTENSITY = VideoTemplateIntensity.BALANCED;
export const DEFAULT_VIDEO_TRANSITION_HIGHLIGHT_COLOR = DEFAULT_COLOR_ACCENT;

export function createVideoProjectSource(recordingId: string | null): VideoProjectSource {
  return recordingId
    ? {
        kind: VideoProjectSourceKind.RECORDING,
        recordingId,
      }
    : {
        kind: VideoProjectSourceKind.MANUAL,
      };
}

export function createVideoProjectCursorTrack(
  captureMode: VideoCursorCaptureMode = VideoCursorCaptureModeValue.SEPARATE
): VideoProjectCursorTrack {
  return {
    captureMode,
    samples: [],
    skin: {
      ...DEFAULT_VIDEO_CURSOR_SKIN,
      hidden: getDefaultCursorHidden(captureMode),
    },
  };
}
