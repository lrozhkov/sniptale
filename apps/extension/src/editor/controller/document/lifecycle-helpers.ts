import type { Canvas, FabricObject } from 'fabric';
import type { EditorDocument } from '../../../features/editor/document/types';
import { useEditorStore } from '../../state/useEditorStore';
import { deriveNextEditorStepValueFromAnnotations } from '../../objects/step-tool/value';
import { isFrameObject } from '../../document/model';
import type { ApplyDocumentOptions } from '../core/types';
import type { SourceState } from '../../document/model/source-state';

type PreparedEditorDocument = Awaited<
  ReturnType<typeof import('./apply/orchestrate').applyEditorDocumentToCanvas>
>['prepared'];

function syncPreparedEditorDocumentStore(
  prepared: PreparedEditorDocument,
  canvasObjects: FabricObject[]
): ReturnType<typeof useEditorStore.getState>['activeTool'] {
  const store = useEditorStore.getState();
  const nextStepValue = deriveNextEditorStepValueFromAnnotations(
    store.toolSettings.step,
    canvasObjects
  );

  store.updateFrame(prepared.frame);
  store.setBrowserFrame(prepared.browserFrame);
  store.setCropReady(false);
  if (nextStepValue !== store.toolSettings.step.value) {
    store.updateStepSettings({ value: nextStepValue });
  }

  return store.activeTool;
}

export function applyPreparedEditorDocumentState(options: {
  applyOptions: ApplyDocumentOptions;
  applyToolMode: () => void;
  canvasObjects: FabricObject[];
  hasHistory: boolean;
  prepared: PreparedEditorDocument;
  source: SourceState | null;
  setActiveTool: (tool: ReturnType<typeof useEditorStore.getState>['activeTool']) => void;
  setCanvasDocumentSize: (size: { width: number; height: number }) => void;
  setCropState: (cropGuide: null, cropSelection: null) => void;
  setHistory: (document: EditorDocument) => void;
  setOriginalDocument: (document: EditorDocument) => void;
  setSource: (source: SourceState | null) => void;
}) {
  const {
    applyOptions,
    applyToolMode,
    canvasObjects,
    hasHistory,
    prepared,
    source,
    setActiveTool,
    setCanvasDocumentSize,
    setCropState,
    setHistory,
    setOriginalDocument,
    setSource,
  } = options;

  setCanvasDocumentSize(prepared.canvasSize);
  setSource(source);
  setCropState(null, null);
  setActiveTool(syncPreparedEditorDocumentStore(prepared, canvasObjects));
  applyToolMode();

  if (applyOptions.updateOriginal) {
    setOriginalDocument(prepared.normalizedDocument);
  }

  if (applyOptions.resetHistory || !hasHistory) {
    setHistory(prepared.normalizedDocument);
  }
}

export function createBrowserFrameRebuildPayload(args: {
  canvas: Canvas;
  canvasDocumentSize: { width: number; height: number };
  browserEnabled: boolean;
  renderToken: number;
}) {
  return {
    renderToken: args.renderToken,
    frameObjects: args.canvas.getObjects().filter((object) => isFrameObject(object)).length,
    browserEnabled: args.browserEnabled,
    canvasWidth: args.canvasDocumentSize.width,
    canvasHeight: args.canvasDocumentSize.height,
  };
}

export function createBrowserFrameRebuildDonePayload(args: {
  header: FabricObject | null;
  renderToken: number;
  frameObjectsCount: number;
}) {
  const { header, renderToken, frameObjectsCount } = args;

  return {
    renderToken,
    backgroundObjects: frameObjectsCount,
    headerVisible: header?.visible !== false,
    headerWidth: header?.getScaledWidth(),
    headerHeight: header?.getScaledHeight(),
    headerLeft: header?.left,
    headerTop: header?.top,
  };
}
