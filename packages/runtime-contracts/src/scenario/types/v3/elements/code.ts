import type { ScenarioElementStylePatch, ScenarioV3ElementBase } from './base';

interface ScenarioCodeStyle {
  backgroundColor: string;
  fontSize: number;
  textColor: string;
}

export interface ScenarioCodeElement extends ScenarioV3ElementBase<'code'> {
  code: string;
  language: string;
  style: ScenarioCodeStyle;
}

export interface ScenarioCodeElementPatch extends ScenarioElementStylePatch {
  code?: string;
  language?: string;
  style?: Partial<ScenarioCodeStyle>;
}
