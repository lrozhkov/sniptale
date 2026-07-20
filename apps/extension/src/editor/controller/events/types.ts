import type { Canvas, FabricObject, Point, Rect, TPointerEvent } from 'fabric';
import type { CropSelection, DrawSession, PanSession } from '../core/types';
import type { SourceState } from '../../document/model/source-state';
import type { EditorObjectType, EditorTool } from '../../../features/editor/document/types';
import type { EditorSelectionNudge } from '../tools/nudge';
import type { EditorTextInlineStyleCommand } from '../text-formatting';
import type { EditorRasterToolSessionState } from '../raster-tools/types';
import type { EditorRasterTargetReference } from '../raster/types';

type TransformOrigin = Pick<import('fabric').Transform, 'originX' | 'originY'>;

export interface EditorControllerEventHandlers {
  handleCanvasBeforeRender: () => void;
  handleCanvasAfterRender: () => void;
  handleSelectionChange: (event?: {
    deselected?: FabricObject[];
    selected?: FabricObject[];
  }) => void;
  handleObjectMoving: (event: { target?: FabricObject }) => void;
  handleObjectResizing: (event: { target?: FabricObject; transform?: TransformOrigin }) => void;
  handleObjectScaling: (event: { target?: FabricObject; transform?: TransformOrigin }) => void;
  handleObjectModified: (event: { target?: FabricObject; transform?: TransformOrigin }) => void;
  handlePathCreated: (event: { path: FabricObject }) => void;
  handleMouseDownBefore: (event: { e: TPointerEvent; target?: FabricObject }) => void;
  handleMouseDown: (event: { e: TPointerEvent; target?: FabricObject }) => void;
  handleMouseMoveBefore: (event: { e: TPointerEvent; target?: FabricObject }) => void;
  handleMouseMove: (event: { e: TPointerEvent }) => void;
  handleMouseUp: () => void;
  handleDoubleClick: (event: { target?: FabricObject; e: TPointerEvent }) => void;
  handleWindowKeyDown: (event: KeyboardEvent) => void;
  handleWindowKeyUp: (event: KeyboardEvent) => void;
  handleWindowBlur: () => void;
  handleViewportMouseDown: (event: MouseEvent) => void;
  handleViewportWheel: (event: WheelEvent) => void;
  handleViewportScroll: () => void;
  handleWindowMouseMove: (event: MouseEvent) => void;
  handleWindowMouseUp: () => void;
}

export interface EditorControllerEventStateBindings {
  getCanvas: () => Canvas | null;
  getViewportElement: () => HTMLElement | null;
  getCanvasDocumentSize: () => { width: number; height: number };
  getDrawSession: () => DrawSession | null;
  setDrawSession: (drawSession: DrawSession | null) => void;
  getSource: () => SourceState | null;
  setSource: (source: SourceState | null) => void;
  getActiveTool: () => EditorTool;
  getHistoryMuted: () => number;
  getIsSpacePressed: () => boolean;
  setIsSpacePressed: (value: boolean) => void;
  getPanSession: () => PanSession | null;
  setPanSession: (session: PanSession | null) => void;
  getViewportSyncFrame: () => number;
  setViewportSyncFrame: (frame: number) => void;
  getRasterToolSession: () => EditorRasterToolSessionState;
}

export interface EditorControllerEventCropBindings {
  getCropGuide: () => Rect | null;
  getCropSelection: () => CropSelection | null;
  getCropSelectionMouseEnabled: () => boolean;
  setCropState: (cropGuide: Rect | null, cropSelection: CropSelection | null) => void;
}

export interface EditorControllerEventObjectBindings {
  getActiveCropRect: () => Rect | null;
  ensureObjectReachable: (object: FabricObject) => boolean;
  applyGridSnap: (object: FabricObject) => void;
  nextLabelIndex: (type: EditorObjectType) => number;
  prepareObject: (object: FabricObject) => void;
  startDrawSession: (tool: DrawSession['tool'], start: Point, object: FabricObject) => void;
  decorateShape: (
    object: FabricObject,
    type: Extract<EditorObjectType, 'rectangle' | 'ellipse' | 'diamond'>
  ) => void;
  addObject: (object: FabricObject) => void;
  switchToSelectTool: () => void;
  advanceStepValue: () => void;
  beginRichShapeTextEditing?: (object: FabricObject) => boolean;
}

export interface EditorControllerEventCommandBindings {
  cancelTransientInteraction: () => boolean;
  undo: () => void;
  redo: () => void;
  duplicateSelection: () => void;
  nudgeSelection?: (nudge: EditorSelectionNudge) => boolean;
  finalizeSelectionNudge?: (code?: string) => void;
  deleteSelection: () => void;
  applyCropSelection: () => void;
  applyTextSelectionStyle?: (command: EditorTextInlineStyleCommand) => boolean;
  commitHistory: () => void;
  syncRuntimeState: () => void;
  syncViewportState: () => void;
  zoomViewportAtPoint: (delta: number, point: { clientX: number; clientY: number }) => void;
  clearRasterSelection: () => void;
  applyRasterBitmap: (
    reference: EditorRasterTargetReference,
    bitmap: HTMLCanvasElement
  ) => Promise<void>;
  copyRasterSelection: () => void;
  cutRasterSelection: () => void;
  deleteRasterSelectionPixels: () => void;
  pasteRasterClipboard: () => void;
}

export type EditorControllerEventBindings = EditorControllerEventStateBindings &
  EditorControllerEventCropBindings &
  EditorControllerEventObjectBindings &
  EditorControllerEventCommandBindings;
