import type {
  ScenarioArrowElement,
  ScenarioAssetRef,
  ScenarioCalloutElement,
  ScenarioCodeElement,
  ScenarioElement,
  ScenarioElementFrame,
  ScenarioImageElement,
  ScenarioLineElement,
  ScenarioSlideClickSettings,
  ScenarioSlide,
  ScenarioSlideCanvas,
  ScenarioShapeElement,
  ScenarioTextElement,
} from '@sniptale/runtime-contracts/scenario/types/v3';
export type ScenarioInspectorTool = 'export';

export interface ScenarioInspectorExportCommand {
  onOpenExport: () => void;
}

export interface ScenarioInspectorElementPatch {
  code?: string;
  animation?: Partial<ScenarioElement['animation']>;
  assetRef?: ScenarioAssetRef;
  build?: Partial<ScenarioElement['build']>;
  connector?: ScenarioCalloutElement['connector'];
  contentTransform?: Partial<ScenarioImageElement['contentTransform']>;
  cornerRadius?: number;
  dash?: ScenarioLineElement['dash'];
  editDocumentId?: string | null;
  end?: ScenarioLineElement['end'];
  fillColor?: string;
  fit?: ScenarioImageElement['fit'];
  frame?: Partial<ScenarioElementFrame>;
  head?: ScenarioArrowElement['head'];
  language?: string;
  locked?: boolean;
  name?: string;
  opacity?: number;
  panel?: Partial<ScenarioCalloutElement['panel']>;
  shape?: ScenarioShapeElement['shape'];
  start?: ScenarioLineElement['start'];
  strokeColor?: string;
  strokeWidth?: number;
  style?: Partial<ScenarioTextElement['style'] | ScenarioCodeElement['style']>;
  text?: string;
  visible?: boolean;
}

export interface ScenarioInspectorSlidePatch {
  backgroundTransition?: ScenarioSlide['backgroundTransition'];
  canvas?: Partial<ScenarioSlideCanvas>;
  clicks?: Partial<ScenarioSlideClickSettings>;
  guide?: ScenarioSlide['guide'];
  layout?: ScenarioSlide['layout'];
  notes?: string;
  templateId?: string | null;
  title?: string;
  transition?: ScenarioSlide['transition'];
}

export interface ScenarioInspectorProps {
  activeTool?: ScenarioInspectorTool | null;
  embedded?: boolean;
  elements: ScenarioElement[];
  onDeleteElement: (elementId: string) => void;
  onEditImageElement?: (elementId: string) => void;
  onUpdateSlide?: (patch: ScenarioInspectorSlidePatch) => void;
  onUpdateElement: (elementId: string, patch: ScenarioInspectorElementPatch) => void;
  exportCommand?: ScenarioInspectorExportCommand;
  selectedElementId: string | null;
  slide?: ScenarioSlide;
}
