import type { FabricObject, Point, Rect } from 'fabric';
import type {
  BrowserFrameState,
  EditorFrameSettings,
  EditorObjectType,
  EditorViewportState,
} from '../../../../features/editor/document/types';
import type { DrawSession } from '../../core/types';
import type { EditorControllerPublicApiAdapter } from '../../public-api/types';
import type { EditorControllerRelayoutOptions } from './shared';

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
