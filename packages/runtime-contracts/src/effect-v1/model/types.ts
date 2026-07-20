import type {
  ControlDefinition,
  EffectClip,
  EffectLayer,
  EffectScene,
  EffectTimeline,
  LocaleText,
} from './base.js';
import type { EffectV1Command } from '../command/types.js';
import type { EffectV1Expression } from './operations.js';

export { EFFECT_V1_COMMAND_OPS, EFFECT_V1_EXPRESSION_OPS } from './operations.js';
export type { EffectV1Command } from '../command/types.js';
export type {
  EffectV1Filter,
  EffectV1Paint,
  EffectV1PathSegment,
  EffectV1Shadow,
  EffectV1SvgPartTransform,
} from './drawing.js';
export type {
  EffectV1CommandOp,
  EffectV1Expression,
  EffectV1ExpressionOp,
  EffectV1RuntimeInputName,
} from './operations.js';

export const EFFECT_V1_SCHEMA = 'sniptale.effect.v1' as const;
export const EFFECT_V1_KINDS = ['standalone', 'targetEffect', 'transition'] as const;

export type EffectV1Kind = (typeof EFFECT_V1_KINDS)[number];

export type EffectV1Asset = {
  byteLength?: number;
  dataUrl?: string;
  duration?: number;
  height?: number;
  id: string;
  kind: 'audio' | 'image' | 'svg';
  mimeType: string;
  path?: string;
  sha256?: string;
  svgText?: string;
  width?: number;
};

export type EffectV1GraphProgram = {
  commands: EffectV1Command[];
  definitions?: Record<string, EffectV1Expression>;
  kind: 'graph';
  version: 1;
};

export type EffectV1Program = EffectV1GraphProgram;

export type EffectV1Document = {
  assets: EffectV1Asset[];
  clips: EffectClip[];
  controls: ControlDefinition[];
  description?: LocaleText;
  duration: number;
  id: string;
  kind: EffectV1Kind;
  label: LocaleText;
  layers: EffectLayer[];
  presets?: unknown[];
  program: EffectV1Program;
  scenes: EffectScene[];
  schemaVersion: typeof EFFECT_V1_SCHEMA;
  timeline: EffectTimeline;
};

export type EffectV1Diagnostic = {
  code: string;
  message: string;
  path: string;
  severity: 'error' | 'warning';
  suggestion?: string;
};

export type EffectV1ValidationResult = {
  diagnostics: EffectV1Diagnostic[];
  document?: EffectV1Document;
  ok: boolean;
  summary: { errors: number; warnings: number };
};

export type EffectV1InputContract = {
  optional: readonly import('./operations.js').EffectV1RuntimeInputName[];
  required: readonly import('./operations.js').EffectV1RuntimeInputName[];
};
