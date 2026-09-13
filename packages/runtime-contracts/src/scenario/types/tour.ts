import type { GuideImageSource } from './image-source';

/** Interactive scenes have bounded authored content; media bytes belong to persistence. */
export const TOUR_LIMITS = {
  maxSlides: 300,
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
  | { kind: 'url'; url: string };

export interface TourTextAppearance {
  presentation: 'callout' | 'caption-top' | 'caption-bottom';
  alignment: 'start' | 'center' | 'end';
  placement: 'auto' | 'top' | 'bottom' | 'left' | 'right';
}

export interface TourHotspot {
  id: string;
  point: TourPoint;
  targetRect: TourRect | null;
  label: string;
  text: string;
  action: TourAction;
  appearance: TourTextAppearance | null;
  pulse: boolean;
}

export interface TourAnnotation {
  id: string;
  text: string;
  anchor: TourPoint | null;
  appearance: TourTextAppearance | null;
}

/** Spotlight is presentation; redact requires irreversible raster preparation at export. */
export interface TourMask {
  id: string;
  rect: TourRect;
  kind: 'spotlight' | 'highlight' | 'redact';
  color: string;
  opacity: number;
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

export interface TourTiming {
  mode: 'inherit' | 'manual' | 'auto';
  holdSeconds: number;
  truncateNarration: boolean;
  autoplayTarget: string | null;
}

export interface TourCamera {
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
  fit: 'contain' | 'cover';
  camera: TourCamera;
  hotspots: TourHotspot[];
  annotations: TourAnnotation[];
  masks: TourMask[];
  narration: TourNarration | null;
  timing: TourTiming;
}

export interface TourNavigationButton {
  id: string;
  label: string;
  action: TourAction;
}
export interface TourNavigationSlide {
  kind: 'navigation';
  id: string;
  title: string;
  description: string;
  background: { color: string; image: TourImage | null };
  buttons: TourNavigationButton[];
  narration: TourNarration | null;
  timing: TourTiming;
}
export type TourSlide = TourImageSlide | TourNavigationSlide;

/** Separate interactive document, sharing only media provenance with a reference guide. */
export interface TourDocument {
  version: 1;
  id: string;
  stage: { aspect: '16:9' | '4:3' | '9:16'; background: string };
  style: { accent: string; text: string; surface: string; textAppearance: TourTextAppearance };
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
