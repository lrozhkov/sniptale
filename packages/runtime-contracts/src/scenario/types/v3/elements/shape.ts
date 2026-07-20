import type { ScenarioElementStylePatch, ScenarioV3ElementBase } from './base';

export interface ScenarioShapeElement extends ScenarioV3ElementBase<'shape'> {
  cornerRadius: number;
  fillColor: string;
  shape: 'ellipse' | 'rect';
  strokeColor: string;
  strokeWidth: number;
}

export interface ScenarioShapeElementPatch extends ScenarioElementStylePatch {
  cornerRadius?: number;
  fillColor?: string;
  shape?: ScenarioShapeElement['shape'];
  strokeColor?: string;
  strokeWidth?: number;
}
