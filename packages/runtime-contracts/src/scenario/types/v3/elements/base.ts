import type { ScenarioElementFrame } from '../geometry';
import type {
  ScenarioElementAnimationSettings,
  ScenarioElementBuildSettings,
} from '../presentation';

export const SCENARIO_V3_ELEMENT_KINDS = {
  arrow: 'arrow',
  callout: 'callout',
  code: 'code',
  image: 'image',
  line: 'line',
  shape: 'shape',
  text: 'text',
} as const;

export type ScenarioV3ElementKind =
  (typeof SCENARIO_V3_ELEMENT_KINDS)[keyof typeof SCENARIO_V3_ELEMENT_KINDS];

export interface ScenarioV3ElementBase<TKind extends ScenarioV3ElementKind> {
  animation: ScenarioElementAnimationSettings;
  build: ScenarioElementBuildSettings;
  createdAt: number;
  frame: ScenarioElementFrame;
  id: string;
  kind: TKind;
  locked: boolean;
  name: string;
  opacity: number;
  role: string | null;
  stylePresetId?: string | null;
  updatedAt: number;
  visible: boolean;
}

export interface ScenarioElementStylePatch {
  animation?: Partial<ScenarioElementAnimationSettings>;
  build?: Partial<ScenarioElementBuildSettings>;
  locked?: boolean;
  name?: string;
  opacity?: number;
  stylePresetId?: string | null;
  visible?: boolean;
}
