import type { EffectControlSet, LocaleText } from '../effect-controls/index.js';

export const ANIMATION_TEMPLATE_FORMAT = 'sniptale-animation' as const;
export const ANIMATION_TEMPLATE_VERSION = 1 as const;
/** Existing import budgets, shared with JSON and archive admission. */
export const ANIMATION_TEMPLATE_LIMITS = {
  jsonBytes: 10 * 1024 * 1024,
  depth: 128,
  nodes: 250_000,
  stringCharacters: 1_500_000,
  layers: 2048,
  paths: 16384,
  keyframes: 100_000,
  resources: 200,
  resourceBytes: 50 * 1024 * 1024,
  totalResourceBytes: 250 * 1024 * 1024,
  rasterPixels: 3840 * 2160,
  decodedRasterBytes: 128 * 1024 * 1024,
  dimension: 8192,
  frameRate: 240,
  durationSeconds: 3600,
} as const;

export type AnimationSlotBinding =
  | { kind: 'text' | 'color'; slot: string; control: string }
  | {
      kind: 'scalar';
      slot: string;
      control: string;
      unit?: 'identity' | 'percent-to-ratio' | 'degrees-to-radians' | undefined;
    }
  | {
      kind: 'vector';
      slot: string;
      xControl: string;
      yControl: string;
      unit?: 'identity' | 'normalized-to-pixels' | undefined;
    };
/** Preparation metadata uses the same slot types and ownership as runtime admission. */
export interface AnimationTemplateSlot {
  id: string;
  kind: AnimationSlotBinding['kind'] | null;
  value: number | string | readonly number[] | null;
  unavailable: 'animated' | 'unsupported' | 'bound' | 'layout' | null;
}

export type AnimationResource = {
  path: string;
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp' | 'font/ttf' | 'font/otf';
  fontFamily?: string | undefined;
  byteLength: number;
  sha256: string;
  base64: string;
};
export type AnimationObjectHandle = {
  id: string;
  xControl: string;
  yControl: string;
  label: LocaleText & { en: string };
  padding?: number | undefined;
};
export type AnimationObjectLayout = {
  arrow?:
    | {
        start: { xControl: string; yControl: string };
        end: { xControl: string; yControl: string };
        widthControl: string;
        positionSlot: string;
        rotationSlot: string;
        shaftScaleSlot: string;
        headPositionSlot: string;
        headScaleSlot: string;
      }
    | undefined;
  handles?: AnimationObjectHandle[] | undefined;
  reflow?:
    | {
        kind: 'caption' | 'callout';
        textControl: string;
        fontResource: string;
        fontSizeControl: string;
        widthControl: string;
        padding: number;
        minFontSize: number;
        lineHeight: number;
        maxLines: number;
        textSlot: string;
        boxSizeSlot: string;
        boxPositionSlot: string;
        textPositionSlot: string;
        pointer?:
          | { positionSlot: string; scaleSlot: string; rotationSlot: string; width: number }
          | undefined;
        tip?: { xControl: string; yControl: string } | undefined;
      }
    | undefined;
};

/** The source dimensions and frame interval retain their Lottie meaning in every consumer. */
export interface LottieAnimation extends Record<string, unknown> {
  w: number;
  h: number;
  fr: number;
  ip: number;
  op: number;
  layers: unknown[];
}

/** Accepted package bytes and metadata are snapshotted into the project, independently of its catalog. */
export interface AnimationTemplate extends EffectControlSet {
  format: typeof ANIMATION_TEMPLATE_FORMAT;
  version: typeof ANIMATION_TEMPLATE_VERSION;
  id: string;
  label: LocaleText & { en: string };
  description?: LocaleText | undefined;
  tags?: string[] | undefined;
  animation: LottieAnimation;
  resources: AnimationResource[];
  bindings: AnimationSlotBinding[];
  objectLayout?: AnimationObjectLayout | undefined;
}
export type AnimationDiagnostic = { code: string; path: string; message: string };
export type AnimationValidationResult =
  | { ok: true; template: AnimationTemplate; diagnostics: [] }
  | { ok: false; template: null; diagnostics: AnimationDiagnostic[] };
