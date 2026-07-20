import {
  DEFAULT_VIDEO_ANNOTATION_DIRECTION,
  DEFAULT_VIDEO_ANNOTATION_INTENSITY,
  DEFAULT_VIDEO_ANNOTATION_INTRO,
  DEFAULT_VIDEO_ANNOTATION_INTRO_MS,
  DEFAULT_VIDEO_ANNOTATION_OUTRO,
  DEFAULT_VIDEO_ANNOTATION_OUTRO_MS,
} from '../defaults';
import {
  VideoOverlayAnimationKind,
  VideoOverlayTemplateKind,
  VideoTemplateDirection,
  VideoTemplateIntensity,
  type VideoProjectAnnotationClip,
} from '../types/index';

type AnnotationTemplateKind = VideoProjectAnnotationClip['templateKind'];

type AnnotationMotionPreset = Pick<
  VideoProjectAnnotationClip,
  | 'direction'
  | 'intensity'
  | 'introAnimation'
  | 'introDurationMs'
  | 'outroAnimation'
  | 'outroDurationMs'
>;

const ANNOTATION_MOTION_PRESETS: Record<AnnotationTemplateKind, AnnotationMotionPreset> = {
  [VideoOverlayTemplateKind.LOWER_THIRD_BASIC]: {
    direction: DEFAULT_VIDEO_ANNOTATION_DIRECTION,
    intensity: DEFAULT_VIDEO_ANNOTATION_INTENSITY,
    introAnimation: DEFAULT_VIDEO_ANNOTATION_INTRO,
    introDurationMs: DEFAULT_VIDEO_ANNOTATION_INTRO_MS,
    outroAnimation: DEFAULT_VIDEO_ANNOTATION_OUTRO,
    outroDurationMs: DEFAULT_VIDEO_ANNOTATION_OUTRO_MS,
  },
  [VideoOverlayTemplateKind.LOWER_THIRD_ACCENT]: {
    direction: VideoTemplateDirection.RIGHT,
    intensity: DEFAULT_VIDEO_ANNOTATION_INTENSITY,
    introAnimation: VideoOverlayAnimationKind.SLIDE_LEFT_FADE,
    introDurationMs: 420,
    outroAnimation: VideoOverlayAnimationKind.REVEAL_MASK,
    outroDurationMs: 320,
  },
  [VideoOverlayTemplateKind.LOWER_THIRD_EDITORIAL]: {
    direction: VideoTemplateDirection.LEFT,
    intensity: VideoTemplateIntensity.SOFT,
    introAnimation: VideoOverlayAnimationKind.SCALE_FADE,
    introDurationMs: 320,
    outroAnimation: VideoOverlayAnimationKind.SOFT_BLUR_REVEAL,
    outroDurationMs: 240,
  },
  [VideoOverlayTemplateKind.LOWER_THIRD_STACKED]: {
    direction: VideoTemplateDirection.UP,
    intensity: VideoTemplateIntensity.SOFT,
    introAnimation: VideoOverlayAnimationKind.SCALE_FADE,
    introDurationMs: 360,
    outroAnimation: VideoOverlayAnimationKind.SCALE_FADE,
    outroDurationMs: 260,
  },
  [VideoOverlayTemplateKind.LOWER_THIRD_BADGE]: {
    direction: VideoTemplateDirection.RIGHT,
    intensity: DEFAULT_VIDEO_ANNOTATION_INTENSITY,
    introAnimation: VideoOverlayAnimationKind.SHIMMER_ENTRY,
    introDurationMs: 440,
    outroAnimation: VideoOverlayAnimationKind.SHIMMER_SWEEP,
    outroDurationMs: 320,
  },
  [VideoOverlayTemplateKind.LOWER_THIRD_STATUS_TICKER]: {
    direction: VideoTemplateDirection.RIGHT,
    intensity: VideoTemplateIntensity.BALANCED,
    introAnimation: VideoOverlayAnimationKind.SHIMMER_ENTRY,
    introDurationMs: 380,
    outroAnimation: VideoOverlayAnimationKind.SHIMMER_SWEEP,
    outroDurationMs: 260,
  },
  [VideoOverlayTemplateKind.CALLOUT_CARD]: {
    direction: VideoTemplateDirection.RIGHT,
    intensity: VideoTemplateIntensity.BALANCED,
    introAnimation: VideoOverlayAnimationKind.CONNECTOR_DRAW,
    introDurationMs: 460,
    outroAnimation: VideoOverlayAnimationKind.CONNECTOR_DRAW,
    outroDurationMs: 280,
  },
  [VideoOverlayTemplateKind.CALLOUT_CONNECTOR]: {
    direction: VideoTemplateDirection.RIGHT,
    intensity: VideoTemplateIntensity.BALANCED,
    introAnimation: VideoOverlayAnimationKind.CONNECTOR_DRAW,
    introDurationMs: 480,
    outroAnimation: VideoOverlayAnimationKind.CONNECTOR_DRAW,
    outroDurationMs: 260,
  },
  [VideoOverlayTemplateKind.CALLOUT_NOTIFICATION_BANNER]: {
    direction: VideoTemplateDirection.LEFT,
    intensity: VideoTemplateIntensity.BALANCED,
    introAnimation: VideoOverlayAnimationKind.SLIDE_LEFT_FADE,
    introDurationMs: 320,
    outroAnimation: VideoOverlayAnimationKind.SLIDE_LEFT_FADE,
    outroDurationMs: 260,
  },
  [VideoOverlayTemplateKind.POINTER_LABEL]: {
    direction: VideoTemplateDirection.LEFT,
    intensity: VideoTemplateIntensity.SOFT,
    introAnimation: VideoOverlayAnimationKind.ANCHOR_POP,
    introDurationMs: 300,
    outroAnimation: VideoOverlayAnimationKind.CONNECTOR_DRAW,
    outroDurationMs: 260,
  },
  [VideoOverlayTemplateKind.FEATURE_SPOTLIGHT_CARD]: {
    direction: VideoTemplateDirection.LEFT,
    intensity: VideoTemplateIntensity.BOLD,
    introAnimation: VideoOverlayAnimationKind.CONNECTOR_DRAW,
    introDurationMs: 520,
    outroAnimation: VideoOverlayAnimationKind.CONNECTOR_DRAW,
    outroDurationMs: 320,
  },
  [VideoOverlayTemplateKind.FOCUS_SCAN_FRAME]: {
    direction: VideoTemplateDirection.LEFT,
    intensity: VideoTemplateIntensity.BOLD,
    introAnimation: VideoOverlayAnimationKind.SHIMMER_ENTRY,
    introDurationMs: 500,
    outroAnimation: VideoOverlayAnimationKind.SHIMMER_SWEEP,
    outroDurationMs: 300,
  },
  [VideoOverlayTemplateKind.SIDE_NOTE]: {
    direction: VideoTemplateDirection.LEFT,
    intensity: VideoTemplateIntensity.SOFT,
    introAnimation: VideoOverlayAnimationKind.SLIDE_LEFT_FADE,
    introDurationMs: 340,
    outroAnimation: VideoOverlayAnimationKind.SLIDE_LEFT_FADE,
    outroDurationMs: 280,
  },
  [VideoOverlayTemplateKind.TITLE_REVEAL]: {
    direction: VideoTemplateDirection.UP,
    intensity: DEFAULT_VIDEO_ANNOTATION_INTENSITY,
    introAnimation: VideoOverlayAnimationKind.REVEAL_MASK,
    introDurationMs: 420,
    outroAnimation: VideoOverlayAnimationKind.SCALE_FADE,
    outroDurationMs: 300,
  },
  [VideoOverlayTemplateKind.SECTION_DIVIDER]: {
    direction: VideoTemplateDirection.UP,
    intensity: VideoTemplateIntensity.SOFT,
    introAnimation: VideoOverlayAnimationKind.SCALE_FADE,
    introDurationMs: 320,
    outroAnimation: VideoOverlayAnimationKind.SCALE_FADE,
    outroDurationMs: 260,
  },
  [VideoOverlayTemplateKind.TITLE_CURSOR_REVEAL]: {
    direction: VideoTemplateDirection.RIGHT,
    intensity: VideoTemplateIntensity.BOLD,
    introAnimation: VideoOverlayAnimationKind.SHIMMER_ENTRY,
    introDurationMs: 460,
    outroAnimation: VideoOverlayAnimationKind.SHIMMER_SWEEP,
    outroDurationMs: 280,
  },
  [VideoOverlayTemplateKind.SHIMMER_LABEL]: {
    direction: VideoTemplateDirection.RIGHT,
    intensity: VideoTemplateIntensity.BOLD,
    introAnimation: VideoOverlayAnimationKind.SHIMMER_ENTRY,
    introDurationMs: 460,
    outroAnimation: VideoOverlayAnimationKind.SHIMMER_SWEEP,
    outroDurationMs: 280,
  },
  [VideoOverlayTemplateKind.SIDE_REVEAL_PANEL]: {
    direction: VideoTemplateDirection.LEFT,
    intensity: VideoTemplateIntensity.BALANCED,
    introAnimation: VideoOverlayAnimationKind.SLIDE_LEFT_FADE,
    introDurationMs: 520,
    outroAnimation: VideoOverlayAnimationKind.SLIDE_LEFT_FADE,
    outroDurationMs: 420,
  },
  [VideoOverlayTemplateKind.SCENE_PROGRESS_CARD]: {
    direction: VideoTemplateDirection.RIGHT,
    intensity: VideoTemplateIntensity.BALANCED,
    introAnimation: VideoOverlayAnimationKind.SHIMMER_ENTRY,
    introDurationMs: 420,
    outroAnimation: VideoOverlayAnimationKind.SHIMMER_SWEEP,
    outroDurationMs: 280,
  },
  [VideoOverlayTemplateKind.THREE_D_REVEAL_CARD]: {
    direction: VideoTemplateDirection.RIGHT,
    intensity: VideoTemplateIntensity.BOLD,
    introAnimation: VideoOverlayAnimationKind.THREE_D_REVEAL,
    introDurationMs: 520,
    outroAnimation: VideoOverlayAnimationKind.SOFT_BLUR_REVEAL,
    outroDurationMs: 360,
  },
};

export function getAnnotationMotionPreset(templateKind: AnnotationTemplateKind) {
  return ANNOTATION_MOTION_PRESETS[templateKind];
}
