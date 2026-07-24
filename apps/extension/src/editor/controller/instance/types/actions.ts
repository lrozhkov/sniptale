import type { FabricObject, Point, Rect } from 'fabric';

import type {
  EditorRasterEffect,
  EditorRasterEffectId,
} from '../../../../features/editor/document/effects';
import type {
  BrowserFrameState,
  EditorDocument,
  EditorFrameSettings,
  EditorObjectType,
  EditorTool,
  EditorViewportState,
} from '../../../../features/editor/document/types';
import type {
  EditorRenderedImageOptions,
  EditorRenderToDataUrlOptions,
} from '../../../document/model/render-options';
import type { ApplyDocumentOptions, DrawSession, OpenImageOptions } from '../../core/types';
import type { EditorLayerTransformationId } from '../../layer-effects/registry';
import type { EditorControllerPublicApiAdapter } from '../../public-api/types';
import type { EditorTextInlineStyleCommand } from '../../text-formatting';
import type {
  EditorTechnicalDataKind,
  EditorTechnicalDataLayout,
} from '../../tools/technical-data';
import type { EditorSelectionNudge } from '../../tools/nudge';
import type { EditorControllerRelayoutOptions } from './shared';

export interface EditorControllerInstanceDocumentActions {
  applyDocument(document: EditorDocument, options: ApplyDocumentOptions): Promise<void>;
  openImage(dataUrl: string, sourceName?: string | null, options?: OpenImageOptions): Promise<void>;
  loadDocument(document: EditorDocument): Promise<void>;
  closeDocument(): void;
  exportDocument(): EditorDocument;
  renderToDataUrl(options: EditorRenderToDataUrlOptions): string;
  copyRenderedImage(options?: EditorRenderedImageOptions): Promise<void>;
  withHistoryMuted<T>(callback: () => T): T;
  commitHistory(): void;
  undo(): Promise<void>;
  redo(): Promise<void>;
  resetToOriginal(): Promise<void>;
}

export interface EditorControllerInstanceLifecycleActions {
  mount(
    canvasElement: HTMLCanvasElement,
    viewportElement: HTMLElement,
    stageElement: HTMLElement
  ): void;
  dispose(): void;
  setActiveTool(tool: EditorTool): void;
  suspendToolMode(): void;
  setCropSelectionMouseEnabled(enabled: boolean): void;
  insertImage(dataUrl: string, name?: string | null): Promise<void>;
  insertTechnicalData(
    kinds: readonly EditorTechnicalDataKind[],
    layout?: EditorTechnicalDataLayout
  ): void;
  clearCropSelection(): void;
  previewCanvasSize(width: number, height: number): void;
  clearCanvasSizePreview(): void;
  cancelCropMode(): void;
  applyCropSelection(): Promise<void>;
}

export interface EditorControllerInstanceSelectionActions {
  clearSelection(): void;
  applyActiveSettingsToSelection(): void;
  applyTextSelectionStyle(command: EditorTextInlineStyleCommand): boolean;
  deleteSelection(): void;
  duplicateSelection(): Promise<void>;
  nudgeSelection(nudge: EditorSelectionNudge): boolean;
  finalizeSelectionNudge(code?: string): void;
  bringForwardSelection(): void;
  sendBackwardSelection(): void;
  bringSelectionToFront(): void;
  sendSelectionToBack(): void;
  selectLayer(
    id: string,
    options?: { additive?: boolean; focusViewport?: boolean; range?: boolean; toggle?: boolean }
  ): void;
}

export interface EditorControllerInstanceLayerActions {
  moveSelection(direction: 1 | -1): void;
  moveSelectionToEdge(edge: 'front' | 'back'): void;
  reorderLayer(draggedId: string, targetId: string): void;
  renameLayer(id: string, name: string): void;
  toggleLayerVisibility(id: string): void;
  toggleLayerLock(id: string): void;
  resizeLayer(id: string, width: number, height: number): void;
  mergeSelectedLayers(): Promise<void>;
  applyLayerEffect(id: string, effect: EditorRasterEffect): Promise<void>;
  updateLayerEffect(id: string, effect: EditorRasterEffect): Promise<void>;
  previewLayerEffect(id: string, effect: EditorRasterEffect): void;
  resetLayerEffectPreview(id: string): void;
  removeLayerEffect(id: string, effectId: EditorRasterEffectId): void;
  applyLayerTransformation(
    id: string,
    transformationId: EditorLayerTransformationId
  ): Promise<void>;
}

export interface EditorControllerInstanceSceneActions {
  resizeCanvas(width: number, height: number): void;
  resizeImage(width: number, height: number): void;
  applyFrameSettings(frame: EditorFrameSettings): void;
  applyBrowserFrame(browserFrame: BrowserFrameState): Promise<void>;
  previewBrowserFrame(browserFrame: BrowserFrameState): Promise<void>;
  removeBrowserFrame(): Promise<void>;
  previewRemoveBrowserFrame(): Promise<void>;
  zoomIn(): void;
  zoomOut(): void;
  zoomToFit(): void;
  resetZoom(): void;
  setZoom(value: number): void;
  setZoomAtViewportPoint(value: number, point: { clientX: number; clientY: number }): void;
  navigateViewportTo(relativeX: number, relativeY: number): void;
}

export interface EditorControllerInstanceObjectCapabilities {
  getPublicApiAdapter(): EditorControllerPublicApiAdapter;
  applyGridSnap(object: FabricObject): void;
  buildViewportState(): EditorViewportState;
  syncViewportState(): void;
  scheduleViewportStateSync(): void;
  cancelTransientInteraction(): boolean;
  startDrawSession(tool: DrawSession['tool'], start: Point, object: FabricObject): void;
  getActiveCropRect(): Rect | null;
  decorateShape(
    object: FabricObject,
    type: Extract<EditorObjectType, 'rectangle' | 'ellipse' | 'diamond'>
  ): void;
  addObject(object: FabricObject): void;
  logBrowserFrame(stage: string, payload?: Record<string, unknown>): void;
  ensureBrowserFrameOnTop(): void;
  relayoutScene(
    frame: EditorFrameSettings,
    browserFrame: BrowserFrameState,
    options?: EditorControllerRelayoutOptions
  ): void;
  prepareObject(object: FabricObject): void;
  rebuildFrameDecorations(): Promise<void>;
  sendFrameObjectsToBack(): void;
  ensureObjectReachable(object: FabricObject): boolean;
  ensureReachableObjects(): boolean;
  focusObjectInViewport(object: FabricObject): void;
  scheduleZoomToFit(): void;
  syncRuntimeState(): void;
  applyToolMode(): void;
  refreshActiveToolSettingsPreview(): void;
  switchToSelectTool(): void;
  nextLabelIndex(type: EditorObjectType): number;
  advanceStepValue(): void;
}
