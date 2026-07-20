import type { ScenarioElementStylePatch, ScenarioV3ElementBase } from './base';

interface ScenarioTextStyle {
  align: 'center' | 'left' | 'right';
  color: string;
  fontSize: number;
  fontWeight: number;
}

export interface ScenarioTextElement extends ScenarioV3ElementBase<'text'> {
  style: ScenarioTextStyle;
  text: string;
}

export interface ScenarioTextElementPatch extends ScenarioElementStylePatch {
  style?: Partial<ScenarioTextStyle>;
  text?: string;
}
