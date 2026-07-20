export type LocaleText = {
  en?: string;
  ru?: string;
  [locale: string]: string | undefined;
};

export type EffectArtifactType = 'animation' | 'transition';

export type ControlDefinition =
  | {
      defaultValue: string;
      id: string;
      kind: 'color' | 'text';
      label?: LocaleText;
    }
  | {
      defaultValue: number;
      id: string;
      kind: 'number';
      label?: LocaleText;
      max?: number;
      min?: number;
      step?: number;
    };

export type TimelinePhase = {
  duration: number;
  enabled?: boolean;
  id: string;
  label?: string;
  locked?: boolean;
  sceneId?: string | null;
  start: number;
};

export type TimelineKeyframe<T = number> = {
  easing?: 'linear' | 'in' | 'out' | 'inOut' | 'hold' | 'bezier' | string;
  enabled?: boolean;
  handles?: {
    x1: number;
    x2: number;
    y1: number;
    y2: number;
  };
  id: string;
  phaseId?: string | null;
  sceneId?: string | null;
  time: number;
  value: T;
};

export type TimelineTrack<T = number> = {
  enabled?: boolean;
  id: string;
  keyframes: Array<TimelineKeyframe<T>>;
  label?: string;
  layerId?: string;
  phaseId?: string | null;
  property?: string;
  sceneId?: string | null;
  target?: string;
};

export type TimelineMotionPathPoint = {
  inTangent?: { x: number; y: number };
  kind?: 'linear' | 'smooth' | 'corner';
  outTangent?: { x: number; y: number };
  xKeyframeId: string;
  yKeyframeId: string;
};

export type TimelineMotionPath = {
  layerId: string;
  points: TimelineMotionPathPoint[];
};

export type EffectScene = {
  duration: number;
  enabled?: boolean;
  id: string;
  label?: string;
  locked?: boolean;
  start: number;
  transition?: Record<string, unknown> | null;
};

export type EffectLayerEditorCanvasMode = 'bounds' | 'fullFrame' | 'none';

export type EffectLayerEditorTransformProperty =
  | 'anchorX'
  | 'anchorY'
  | 'rotation'
  | 'scaleX'
  | 'scaleY'
  | 'x'
  | 'y';

export type EffectLayerEditorOperation = 'delete' | 'duplicate' | 'reorder';

/**
 * Declares what the authoring UI may safely do with a runtime-owned layer.
 * Omitted values are resolved from the declarative layer type. Runtime-drawn
 * visual layers remain canvas-selectable but expose no transforms by default;
 * non-visual layers such as audio have no canvas box.
 */
export type EffectLayerEditorDefinition = {
  canvas?: EffectLayerEditorCanvasMode;
  keyframeProperties?: string[];
  operations?: EffectLayerEditorOperation[];
  properties?: string[];
  transform?: EffectLayerEditorTransformProperty[];
};

export type EffectLayer = {
  editor?: EffectLayerEditorDefinition;
  id: string;
  locked?: boolean;
  name?: string;
  /**
   * Structural editor hierarchy. A parent must be a non-rendering layer with
   * `type: "group"`. Group nodes do not own clips or animation tracks.
   */
  parentId?: string | null;
  type: string;
  visible?: boolean;
  [property: string]: unknown;
};

export type EffectLayerGroup = Omit<EffectLayer, 'editor' | 'locked' | 'type' | 'visible'> & {
  type: 'group';
};

export type EffectClip = {
  duration: number;
  enabled?: boolean;
  layerId: string;
  locked?: boolean;
  offset?: number;
  sceneId?: string | null;
  start: number;
};

export type EffectTimeline = {
  motionPaths?: TimelineMotionPath[];
  phases: TimelinePhase[];
  tracks: TimelineTrack[];
};

export type EffectDefinition = {
  assets?: string[];
  category?: string;
  clips: EffectClip[];
  controls?: ControlDefinition[];
  description?: LocaleText;
  duration: number;
  /** Canonical EffectV1 document retained by editor/runtime adapters. */
  effectV1?: unknown;
  effectId: string;
  id: string;
  kind: 'composition' | 'layerEffect' | 'overlay' | 'sceneEffect' | 'transitionEffect' | string;
  label?: LocaleText;
  layers: EffectLayer[];
  moduleId: string;
  presets?: unknown[];
  scenes?: EffectScene[];
  target?: string;
  timeline: EffectTimeline;
};

export type RenderFrameContext = {
  controls: Record<string, unknown>;
  duration: number;
  fps: number;
  frameIndex: number;
  height: number;
  progress: number;
  time: number;
  width: number;
  phaseProgress(id: string): number;
  resolveTrack<T = number>(trackId: string, fallback: T): T;
};

export type EffectRenderer = (
  context: RenderFrameContext
) => CanvasImageSource | string | Promise<CanvasImageSource | string>;
