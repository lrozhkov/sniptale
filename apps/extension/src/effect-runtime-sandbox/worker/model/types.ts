import type {
  EffectV1RuntimeInputName,
  TimelineMotionPath,
} from '@sniptale/runtime-contracts/effect-v1';

import type { EffectRuntimeWorkerAsset } from '../../../contracts/effect-runtime/types';

export interface NormalizedScene {
  duration: number;
  enabled: boolean;
  id: string;
  label: string;
  locked: boolean;
  start: number;
  transition: Record<string, unknown> | null;
}

export interface NormalizedTimelineHandles {
  x1: number;
  x2: number;
  y1: number;
  y2: number;
}

export interface NormalizedTimelineKeyframe {
  easing: string;
  enabled: boolean;
  handles: NormalizedTimelineHandles;
  id: string;
  phaseId: string | null;
  sceneId: string | null;
  time: number;
  value: unknown;
}

export interface NormalizedTimelineTrack {
  enabled: boolean;
  id: string;
  keyframes: NormalizedTimelineKeyframe[];
  label: string;
  layerId: string | null;
  phaseId: string | null;
  property: string;
  sceneId: string | null;
  target: string;
}

export interface NormalizedTimelinePhase {
  duration: number;
  enabled: boolean;
  id: string;
  label: string;
  locked: boolean;
  sceneId: string | null;
  start: number;
}

export interface NormalizedTimeline {
  duration: number;
  motionPaths?: TimelineMotionPath[];
  phases: NormalizedTimelinePhase[];
  scenes: NormalizedScene[];
  tracks: NormalizedTimelineTrack[];
}

export interface NormalizedLayer extends Record<string, unknown> {
  id: string;
  opacity: number;
  type: string;
  visible: boolean;
  x: number;
  y: number;
}

export interface NormalizedClip {
  duration: number;
  enabled: boolean;
  layerId: string;
  locked: boolean;
  offset: number;
  sceneId: string | null;
  start: number;
}

export interface ResolvedLayer extends NormalizedLayer {
  active: boolean;
  clip: NormalizedClip | null;
  clipProgress: number;
  localTime: number;
}

export interface RuntimeLayerState extends Record<string, unknown> {
  active?: boolean;
  opacity?: number;
  x?: number;
  y?: number;
}

export interface RuntimeCanvas {
  __sniptaleLogicalHeight?: number;
  __sniptaleLogicalWidth?: number;
  height: number;
  width: number;
  getContext(
    contextId: '2d',
    options?: CanvasRenderingContext2DSettings
  ): RuntimeCanvasContext | null;
  transferToImageBitmap?: () => ImageBitmap;
}

type RuntimeContextProperties = Pick<
  OffscreenCanvasRenderingContext2D,
  | 'fillStyle'
  | 'filter'
  | 'font'
  | 'globalAlpha'
  | 'globalCompositeOperation'
  | 'lineCap'
  | 'lineJoin'
  | 'lineWidth'
  | 'shadowBlur'
  | 'shadowColor'
  | 'shadowOffsetX'
  | 'shadowOffsetY'
  | 'strokeStyle'
  | 'textAlign'
  | 'textBaseline'
>;

type RuntimeContextMethods = Pick<
  OffscreenCanvasRenderingContext2D,
  | 'arc'
  | 'arcTo'
  | 'beginPath'
  | 'bezierCurveTo'
  | 'clearRect'
  | 'clip'
  | 'closePath'
  | 'createLinearGradient'
  | 'createRadialGradient'
  | 'ellipse'
  | 'fill'
  | 'fillRect'
  | 'fillText'
  | 'lineTo'
  | 'measureText'
  | 'moveTo'
  | 'quadraticCurveTo'
  | 'rect'
  | 'restore'
  | 'rotate'
  | 'roundRect'
  | 'save'
  | 'scale'
  | 'setTransform'
  | 'stroke'
  | 'translate'
>;

export type RuntimeCanvasContext = RuntimeContextProperties &
  RuntimeContextMethods & {
    __sniptaleLogicalScaleX?: number;
    __sniptaleLogicalScaleY?: number;
    drawImage(
      image: CanvasImageSource | RuntimeCanvas,
      dx: number,
      dy: number,
      dWidth?: number,
      dHeight?: number
    ): void;
    drawImage(
      image: CanvasImageSource | RuntimeCanvas,
      sx: number,
      sy: number,
      sWidth: number,
      sHeight: number,
      dx: number,
      dy: number,
      dWidth: number,
      dHeight: number
    ): void;
  };

export interface EffectRuntimeRenderContext {
  assets: Record<string, EffectRuntimeWorkerAsset>;
  clips: NormalizedClip[];
  controls: Record<string, number | string>;
  createCanvas(width: number, height: number): RuntimeCanvas;
  duration: number;
  durationInFrames: number;
  effectId: string;
  fps: number;
  frame: number;
  frameIndex: number;
  height: number;
  inputFrames: Partial<Record<EffectV1RuntimeInputName, ImageBitmap>>;
  kind: 'composition' | 'effect';
  layers: NormalizedLayer[];
  progress: number;
  scene: NormalizedScene;
  sceneProgress: number;
  scenes: NormalizedScene[];
  sceneTime: number;
  time: number;
  timeline: NormalizedTimeline;
  width: number;
  isLayerActive(layerId: string, at?: number): boolean;
  phaseProgress(phaseId: string, at?: number): number;
  resolveLayer(layerId: string, at?: number): ResolvedLayer;
  resolveTrack(trackId: string, fallback: unknown, at?: number): unknown;
  track(trackId: string, fallback: unknown, at?: number): unknown;
}

export type EffectRuntimeGraphFrameContext = Omit<
  Pick<
    EffectRuntimeRenderContext,
    | 'assets'
    | 'controls'
    | 'createCanvas'
    | 'duration'
    | 'frameIndex'
    | 'height'
    | 'inputFrames'
    | 'progress'
    | 'resolveLayer'
    | 'time'
    | 'track'
    | 'width'
  >,
  'resolveLayer'
> & {
  resolveLayer(layerId: string, at?: number): RuntimeLayerState | null | undefined;
};
