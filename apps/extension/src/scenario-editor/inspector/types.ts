import type {
  ScenarioArrowElement,
  ScenarioAssetRef,
  ScenarioCalloutElement,
  ScenarioCodeElement,
  ScenarioElement,
  ScenarioElementFrame,
  ScenarioProjectPresentationSettings,
  ScenarioProjectV3,
  ScenarioImageElement,
  ScenarioLineElement,
  ScenarioSlideClickSettings,
  ScenarioSlide,
  ScenarioSlideCanvas,
  ScenarioShapeElement,
  ScenarioTextElement,
} from '@sniptale/runtime-contracts/scenario/types/v3';
import type { ScenarioCanvasViewportControls } from '../canvas/viewport-state';

export type ScenarioInspectorTool = 'export' | 'grid';

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

export interface ScenarioInspectorProjectPresentationPatch {
  backgroundTransition?: ScenarioProjectPresentationSettings['backgroundTransition'];
  controls?: Partial<ScenarioProjectPresentationSettings['controls']>;
  defaultLayoutId?: ScenarioProjectPresentationSettings['defaultLayoutId'];
  grid?: Partial<ScenarioProjectPresentationSettings['grid']>;
  themeId?: ScenarioProjectPresentationSettings['themeId'];
  transition?: ScenarioProjectPresentationSettings['transition'];
}

export interface ScenarioInspectorProps {
  activeTool?: ScenarioInspectorTool | null;
  canvasControls?: ScenarioCanvasViewportControls | null;
  embedded?: boolean;
  elements: ScenarioElement[];
  hideLayers?: boolean;
  layersCollapsible?: boolean;
  onDeleteElement: (elementId: string) => void;
  onEditImageElement?: (elementId: string) => void;
  onInsertImageFile?: (file?: File) => Promise<void> | void;
  onMoveElement: (elementId: string, direction: 'backward' | 'forward') => void;
  onSelectElement: (elementId: string) => void;
  onUpdateSlide?: (patch: ScenarioInspectorSlidePatch) => void;
  onUpdatePresentation?: (patch: ScenarioInspectorProjectPresentationPatch) => void;
  onUpdateElement: (elementId: string, patch: ScenarioInspectorElementPatch) => void;
  presentation?: ScenarioProjectPresentationSettings;
  exportCommand?: ScenarioInspectorExportCommand;
  project?: ScenarioProjectV3;
  selectedElementId: string | null;
  slide?: ScenarioSlide;
}
