import type { ScenarioPoint } from '../geometry';
import type { ScenarioElementStylePatch, ScenarioV3ElementBase } from './base';

interface ScenarioPanelStyle {
  backgroundColor: string;
  borderColor: string;
  borderWidth: number;
  textColor: string;
}

interface ScenarioCalloutConnector {
  end: ScenarioPoint;
  start: ScenarioPoint;
}

export interface ScenarioCalloutElement extends ScenarioV3ElementBase<'callout'> {
  connector: ScenarioCalloutConnector | null;
  panel: ScenarioPanelStyle;
  text: string;
}

export interface ScenarioCalloutElementPatch extends ScenarioElementStylePatch {
  connector?: ScenarioCalloutConnector | null;
  panel?: Partial<ScenarioPanelStyle>;
  text?: string;
}
