import type { Paint } from '@sniptale/foundation/paint';
import type { GuideImageSource } from './image-source';

/** Interactive scenes have bounded authored content; media bytes belong to persistence. */
export const TOUR_LIMITS = {
  maxSlides: 300,
  maxAudioResources: 1000,
  maxHotspots: 20,
  maxAnnotations: 20,
  maxMasks: 20,
  maxButtons: 120,
  maxTextLength: 4000,
  maxDurationSeconds: 3600,
  maxZoom: 8,
} as const;

/** Coordinates use the untransformed source bitmap, never editor viewport pixels. */
export interface TourPoint {
  x: number;
  y: number;
}
export interface TourRect extends TourPoint {
  width: number;
  height: number;
}

/** URL navigation is authored data; only a direct viewer gesture may execute it. */
export type TourAction =
  | { kind: 'none' | 'next' | 'previous' | 'end' | 'restart' }
  | { kind: 'slide'; slideId: string }
  | { kind: 'action'; actionId: string }
  | { kind: 'url'; url: string };

export interface TourHintSurface {
  fillPaint: Paint;
  surfaceCss: string;
  textColor: string;
  width: number;
  padding: number;
  radius: number;
}
export const TOUR_HINT_SURFACE: TourHintSurface = {
  fillPaint: { kind: 'solid', color: '#ffffff' },
  surfaceCss: '',
  textColor: '#111827',
  width: 340,
  padding: 12,
  radius: 14,
};

export interface TourTextAppearance {
  /** Distance from the hotspot center in CSS pixels; captions ignore it. */
  calloutGap?: number | undefined;
  surface?: TourHintSurface | undefined;
  presentation: 'callout' | 'caption-top' | 'caption-bottom';
  alignment: 'start' | 'center' | 'end';
  placement: 'auto' | 'top' | 'bottom' | 'left' | 'right';
}

/**
 * Object purpose owns presentation, including version-1 inherited/legacy appearances.
 * Keep authored styling intact; an action point can never become a slide caption.
 */
export function resolveTourTextAppearance(
  kind: 'hotspot' | 'annotation',
  value: TourTextAppearance | null,
  defaults: TourTextAppearance
): TourTextAppearance {
  const appearance = value ?? defaults;
  return {
    ...appearance,
    calloutGap: appearance.calloutGap ?? defaults.calloutGap ?? 30,
    ...((appearance.surface ?? defaults.surface)
      ? { surface: appearance.surface ?? defaults.surface }
      : {}),
    presentation:
      kind === 'hotspot'
        ? 'callout'
        : appearance.presentation === 'caption-top'
          ? 'caption-top'
          : 'caption-bottom',
  };
}

export interface TourMarkerAppearance {
  color: string | null;
  pulseColor: string | null;
  size: number;
}
export const TOUR_MARKER_DEFAULTS: TourMarkerAppearance = {
  color: null,
  pulseColor: null,
  size: 30,
};

/** Resolve whole-object overrides without materializing or aliasing authored defaults. */
export function resolveTourMarkerAppearance(
  style: TourDocument['style'],
  hotspot?: Pick<TourHotspot, 'markerAppearance'>
): TourMarkerAppearance {
  return { ...(hotspot?.markerAppearance ?? style.markerAppearance ?? TOUR_MARKER_DEFAULTS) };
}

/** A visual focus belongs to one action and cannot execute navigation. */
export type TourHotspotVisual =
  | { kind: 'point'; pulse: boolean }
  | {
      kind: 'frame' | 'highlight' | 'spotlight';
      strokeWidth?: number | undefined;
      radius?: number | undefined;
      rect: TourRect;
      color: string;
      opacity: number;
      animation: TourHighlightAnimation;
    };

export interface TourHotspot {
  markerAppearance?: TourMarkerAppearance | null | undefined;
  narration?: TourObjectNarration | null | undefined;
  id: string;
  point: TourPoint;
  targetRect: TourRect | null;
  label: string;
  text: string;
  visual: TourHotspotVisual;
  timing?: TourTiming | undefined;
  camera?: TourCamera | undefined;
  appearance: TourTextAppearance | null;
}

export interface TourAnnotation {
  timing?: TourTiming | undefined;
  camera?: TourCamera | undefined;
  narration?: TourObjectNarration | null | undefined;
  id: string;
  text: string;
  anchor: TourPoint | null;
  appearance: TourTextAppearance | null;
}

/** Independent highlight entry/exit phases; None retains its dormant duration. */
export interface TourHighlightAnimation {
  enter: { kind: 'none' | 'fade'; durationMs: number };
  exit: { kind: 'none' | 'fade'; durationMs: number };
}
export const TOUR_HIGHLIGHT_ANIMATION_DEFAULTS: TourHighlightAnimation = {
  enter: { kind: 'none', durationMs: 250 },
  exit: { kind: 'none', durationMs: 250 },
};

/** Spotlight is presentation; redact requires irreversible raster preparation at export. */
export interface TourMask {
  /** Absent/null inherits animation independently from color and opacity. */
  highlightAnimation?: TourHighlightAnimation | null | undefined;
  /** Absent preserves legacy local styling; true resolves central effect defaults. */
  inheritStyle?: boolean | undefined;
  narration?: TourObjectNarration | null | undefined;
  id: string;
  rect: TourRect;
  kind: 'spotlight' | 'highlight' | 'blur' | 'redact';
  /** Highlight paint; spotlight settings remain independent when switching modes. */
  paint?: Paint | undefined;
  spotlightColor?: string | undefined;
  spotlightOpacity?: number | undefined;
  /** Visual blur radius in source-image pixels; not irreversible redaction. */
  blurRadius?: number | undefined;
  color: string;
  opacity: number;
}

/** Central defaults are separate for effects with distinct visual semantics. */
export interface TourMaskDefaults {
  highlight: { paint: Paint; opacity: number; animation?: TourHighlightAnimation | undefined };
  spotlight: { color: string; opacity: number };
  blur: { radius: number };
}
export const TOUR_MASK_DEFAULTS: TourMaskDefaults = {
  highlight: { paint: { kind: 'solid', color: '#f97316' }, opacity: 0.3 },
  spotlight: { color: '#111827', opacity: 0.6 },
  blur: { radius: 12 },
};

/** Resolves detached visual phases; inactive effect kinds retain dormant authored settings. */
export function resolveTourHighlightAnimation(
  mask: Pick<TourMask, 'kind' | 'highlightAnimation'>,
  defaults: TourMaskDefaults = TOUR_MASK_DEFAULTS
): TourHighlightAnimation {
  const value =
    mask.kind === 'highlight'
      ? (mask.highlightAnimation ??
        defaults.highlight.animation ??
        TOUR_HIGHLIGHT_ANIMATION_DEFAULTS)
      : TOUR_HIGHLIGHT_ANIMATION_DEFAULTS;
  return { enter: { ...value.enter }, exit: { ...value.exit } };
}

/** Resolve without mutating authored objects, including legacy local masks and redactions. */
export function resolveTourMask(mask: TourMask, defaults = TOUR_MASK_DEFAULTS): TourMask {
  if (!mask.inheritStyle || mask.kind === 'redact') return mask;
  return {
    ...mask,
    paint: defaults.highlight.paint,
    opacity: defaults.highlight.opacity,
    spotlightColor: defaults.spotlight.color,
    spotlightOpacity: defaults.spotlight.opacity,
    blurRadius: defaults.blur.radius,
  };
}

/** Legacy documents retain their shared default until a separate category is edited. */
export function tourTextDefaults(style: TourDocument['style'], kind: 'hotspot' | 'annotation') {
  return kind === 'hotspot'
    ? (style.hotspotAppearance ?? style.textAppearance)
    : style.textAppearance;
}

/** Independent audio reference, with an explicit trim inside the decoded duration. */
export interface TourNarration {
  assetId: string;
  duration: number;
  trimStart: number;
  trimEnd: number;
  gain: number;
  transcript: string;
}

/** A stored material outlives any individual slide/object attachment. */
export interface TourAudioResource {
  assetId: string;
  duration: number;
  name: string;
}
/** Activation is an explicit click/keyboard activation, never hover. */
export interface TourObjectNarration extends TourNarration {
  trigger: 'activation' | 'enter';
}

export interface TourTiming {
  mode: 'inherit' | 'manual' | 'auto';
  holdSeconds: number;
  truncateNarration: boolean;
}

export interface TourCamera {
  /** Optional explicit automatic target; otherwise fit the recorded target. */
  targetZoom?: number | undefined;
  delayMs?: number | undefined;
  durationMs?: number | undefined;
  mode: 'inherit' | 'off' | 'auto' | 'manual';
  center: TourPoint;
  zoom: number;
}

/** Geometry revision is separate from immutable provenance and image-editor document identity. */
export interface TourImage {
  assetId: string;
  galleryAssetId: string | null;
  editDocumentId: string | null;
  width: number;
  height: number;
  alt: string;
  source: GuideImageSource;
}

export interface TourImageSlide {
  kind: 'image';
  id: string;
  title: string;
  image: TourImage | null;
  origin: { stepId: string; blockId: string } | null;
  /** Unverified positions after image geometry changed; blocks publication until reviewed. */
  requiresTargetReview?: boolean | undefined;
  fit: 'contain' | 'cover';
  camera: TourCamera;
  actions: TourSlideAction[];
  masks: TourMask[];
  /** Image narration belongs to actions; the container cannot own a competing voice. */
  narration: null;
  timing: TourTiming;
}

export type TourSlideAction =
  | { type: 'hotspot'; object: TourHotspot }
  | { type: 'annotation'; object: TourAnnotation };

export type TourSlideObject = TourSlideAction | { type: 'mask'; object: TourMask };

/** Ordered actions precede permanent image effects in the authoring object list. */
export function getTourSlideObjects(slide: TourImageSlide): TourSlideObject[] {
  return [...slide.actions, ...slide.masks.map((object) => ({ type: 'mask' as const, object }))];
}

/** Returns references to authored hotspots without creating a second ordering authority. */
export function getTourHotspots(slide: TourImageSlide): TourHotspot[] {
  return slide.actions.flatMap((entry) => (entry.type === 'hotspot' ? [entry.object] : []));
}

/** Returns references to authored text actions. */
export function getTourAnnotations(slide: TourImageSlide): TourAnnotation[] {
  return slide.actions.flatMap((entry) => (entry.type === 'annotation' ? [entry.object] : []));
}

/** Resolves the active visual region without changing authored target geometry. */
export function tourHotspotMask(hotspot: TourHotspot): TourMask | null {
  const visual = hotspot.visual;
  if (visual.kind === 'point') return null;
  return {
    id: hotspot.id,
    kind: visual.kind === 'frame' ? 'highlight' : visual.kind,
    rect: visual.rect,
    color: visual.color,
    opacity: visual.opacity,
    spotlightColor: visual.color,
    spotlightOpacity: visual.opacity,
    highlightAnimation: visual.animation,
  };
}

export interface TourNavigationButton {
  narration?: TourObjectNarration | null | undefined;
  id: string;
  label: string;
  action: TourAction;
}
/** Authored composition overrides; dimensions are percentages except the reference-pixel gap. */
export interface TourNavigationLayout {
  width: number;
  align: 'start' | 'center' | 'end';
  vertical: 'start' | 'center' | 'end';
  padding: number;
  gap: number;
  columns: 1 | 2 | 3;
}
export const TOUR_NAVIGATION_LAYOUT: TourNavigationLayout = {
  width: 64,
  align: 'center',
  vertical: 'center',
  padding: 6,
  gap: 12,
  columns: 1,
};
export interface TourNavigationSlide {
  kind: 'navigation';
  id: string;
  title: string;
  description: string;
  background: { color: string; image: TourImage | null; paint?: Paint | undefined };
  layout?: TourNavigationLayout | undefined;
  buttons: TourNavigationButton[];
  narration: TourNarration | null;
  timing: TourTiming;
}
export type TourSlide = TourImageSlide | TourNavigationSlide;

/** One continuous authored music binding, independent from narration and viewer mute. */
export interface TourBackgroundMusic {
  assetId: string;
  duration: number;
  volume: number;
  loop: boolean;
  ducking: { enabled: boolean; level: number };
}
/** Initializes author settings only for a deliberate first attachment. */
export function createTourBackgroundMusic(
  source: Pick<TourBackgroundMusic, 'assetId' | 'duration'>
): TourBackgroundMusic {
  return {
    assetId: source.assetId,
    duration: source.duration,
    volume: 0.3,
    loop: true,
    ducking: { enabled: true, level: 0.25 },
  };
}

/** Separate interactive document, sharing only media provenance with a reference guide. */
export interface TourDocument {
  backgroundMusic?: TourBackgroundMusic | null | undefined;
  audioResources?: TourAudioResource[] | undefined;
  version: 2;
  id: string;
  stage: {
    aspect: '16:9' | '4:3' | '9:16';
    background: string;
    paint?: Paint | undefined;
    image?: TourImage | null | undefined;
    imageFit?: 'contain' | 'cover' | undefined;
  };
  style: {
    accent: string;
    text: string;
    surface: string;
    textAppearance: TourTextAppearance;
    hotspotAppearance?: TourTextAppearance | undefined;
    markerAppearance?: TourMarkerAppearance | undefined;
    maskDefaults?: TourMaskDefaults | undefined;
  };
  playback: { autoplay: boolean; loop: boolean; minimumHoldSeconds: number; autoZoom: boolean };
  transition: { kind: 'none' | 'fade' | 'slide'; durationMs: number; hotspotTravelMs: number };
  slides: TourSlide[];
  endScreen: {
    enabled: boolean;
    title: string;
    description: string;
    button: { label: string; url: string } | null;
    restart: boolean;
  };
}
