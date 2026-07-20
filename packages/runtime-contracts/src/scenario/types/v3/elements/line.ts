import type { ScenarioPoint } from '../geometry';
import type { ScenarioElementStylePatch, ScenarioV3ElementBase } from './base';

type ScenarioStrokeDash = 'dashed' | 'dotted' | 'solid';

interface ScenarioConnectorStyle {
  dash: ScenarioStrokeDash;
  end: ScenarioPoint;
  start: ScenarioPoint;
  strokeColor: string;
  strokeWidth: number;
}

export interface ScenarioLineElement
  extends ScenarioConnectorStyle, ScenarioV3ElementBase<'line'> {}

export interface ScenarioArrowElement
  extends ScenarioConnectorStyle, ScenarioV3ElementBase<'arrow'> {
  head: 'both' | 'end' | 'start';
}

export interface ScenarioLineElementPatch extends ScenarioElementStylePatch {
  dash?: ScenarioStrokeDash;
  end?: ScenarioPoint;
  start?: ScenarioPoint;
  strokeColor?: string;
  strokeWidth?: number;
}

export interface ScenarioArrowElementPatch extends ScenarioLineElementPatch {
  head?: ScenarioArrowElement['head'];
}
