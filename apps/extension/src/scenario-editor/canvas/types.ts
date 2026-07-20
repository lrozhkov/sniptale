import type {
  ScenarioElement,
  ScenarioElementFrame,
  ScenarioImageElement,
  ScenarioLineElement,
  ScenarioPoint,
  ScenarioSlide,
  ScenarioV3ElementKind,
} from '@sniptale/runtime-contracts/scenario/types/v3';
import type { ScenarioSlideRenderAssetMap } from '../project/stage-render/slide';
import type { ScenarioDrawingDocument } from '../drawing';
import type { ScenarioCanvasViewportController } from './viewport-state';

export interface ScenarioCanvasElementPatch {
  contentTransform?: Partial<ScenarioImageElement['contentTransform']>;
  end?: ScenarioLineElement['end'];
  frame?: Partial<ScenarioElementFrame>;
  start?: ScenarioLineElement['start'];
}

export interface ScenarioCanvasStageProps {
  assets?: ScenarioSlideRenderAssetMap;
  assetsLoading?: boolean;
  clickIndex?: number;
  drawingDocument?: ScenarioDrawingDocument;
  onBeginElementTransaction?: (elementId: string, kind: ScenarioCanvasTransactionKind) => void;
  onCancelElementTransaction?: (elementId: string, kind: ScenarioCanvasTransactionKind) => void;
  onCommitElementTransaction?: (elementId: string, kind: ScenarioCanvasTransactionKind) => void;
  onDeleteElement: (elementId: string) => void;
  onEditImageElement?: (elementId: string) => void;
  activeInsertKind?: ScenarioV3ElementKind | null;
  onClearActiveInsertKind?: () => void;
  onInsertElementFromDrag?: (
    kind: ScenarioV3ElementKind,
    origin: ScenarioPoint,
    current: ScenarioPoint
  ) => void;
  onInsertElementAtPoint?: (kind: ScenarioV3ElementKind, point: ScenarioPoint) => void;
  onSelectElement: (elementId: string) => void;
  onSelectSlide: () => void;
  onUpdateElement: (elementId: string, patch: ScenarioCanvasElementPatch) => void;
  selectedElementId: string | null;
  slide: ScenarioSlide;
  viewportController?: ScenarioCanvasViewportController;
}

export interface ScenarioCanvasDragSession {
  element: ScenarioElement;
  originClientX: number;
  originClientY: number;
}

export type ScenarioCanvasTransactionKind = 'endpoint' | 'imageContent' | 'move' | 'resize';

export type ScenarioCanvasResizeHandle = 'ne' | 'nw' | 'se' | 'sw';

export interface ScenarioCanvasResizeSession extends ScenarioCanvasDragSession {
  handle: ScenarioCanvasResizeHandle;
}

export type ScenarioCanvasEndpointHandle = 'end' | 'start';

export interface ScenarioCanvasEndpointSession extends ScenarioCanvasDragSession {
  handle: ScenarioCanvasEndpointHandle;
}

export interface ScenarioCanvasImageContentSession extends ScenarioCanvasDragSession {
  contentTransform: ScenarioImageElement['contentTransform'];
}

export interface ScenarioCanvasPointPatch {
  end?: ScenarioPoint;
  start?: ScenarioPoint;
}
