import type {
  ApplyEditorControllerDocumentOptions,
  ApplyEditorControllerDocumentStateOptions,
} from './apply-types';
import type { EditorDocument } from '../../../features/editor/document/types';

import type { SourceState } from '../../document/model/source-state';
import type {
  CloseEditorControllerCanvasOptions,
  CloseEditorControllerDocumentOptions,
  CloseEditorControllerStateOptions,
} from './lifecycle/close/types';

function createCloseEditorControllerStateOptions(
  options: CloseEditorControllerDocumentOptions
): CloseEditorControllerStateOptions {
  return {
    setActiveTool: options.setActiveTool,
    setCropState: options.setCropState,
    setDrawSession: options.setDrawSession,
    setHistory: options.setHistory,
    setOriginalDocument: options.setOriginalDocument,
    setPanSession: options.setPanSession,
    setSource: options.setSource,
    setZoomLevel: options.setZoomLevel,
  };
}

function getViewportDevicePixelRatioBaselinePatch(viewportDevicePixelRatioBaseline?: number) {
  return viewportDevicePixelRatioBaseline === undefined ? {} : { viewportDevicePixelRatioBaseline };
}

export function createCloseEditorControllerCanvasOptions(
  options: CloseEditorControllerDocumentOptions,
  canvas: NonNullable<CloseEditorControllerDocumentOptions['canvas']>
): CloseEditorControllerCanvasOptions {
  return {
    canvas,
    setCanvasDocumentSize: options.setCanvasDocumentSize,
    ...createCloseEditorControllerStateOptions(options),
    zoomLevel: options.zoomLevel,
    ...getViewportDevicePixelRatioBaselinePatch(options.viewportDevicePixelRatioBaseline),
  };
}

function createApplyEditorControllerDocumentStateSetters(
  options: Pick<
    ApplyEditorControllerDocumentStateOptions,
    | 'setActiveTool'
    | 'setCanvasDocumentSize'
    | 'setCropState'
    | 'setHistory'
    | 'setOriginalDocument'
    | 'setSource'
  >
) {
  return {
    setActiveTool: options.setActiveTool,
    setCanvasDocumentSize: options.setCanvasDocumentSize,
    setCropState: options.setCropState,
    setHistory: options.setHistory,
    setOriginalDocument: options.setOriginalDocument,
    setSource: options.setSource,
  };
}

export function createApplyEditorControllerDocumentStateOptions(
  options: ApplyEditorControllerDocumentOptions,
  canvas: NonNullable<ApplyEditorControllerDocumentOptions['canvas']>
): ApplyEditorControllerDocumentStateOptions {
  return {
    canvas,
    ...createApplyEditorControllerDocumentSharedOptions(options),
  };
}

export function createApplyEditorControllerDocumentSharedOptions(
  options: ApplyEditorControllerDocumentOptions
) {
  const syncBackgroundLayerPatch = options.syncBackgroundLayer
    ? { syncBackgroundLayer: options.syncBackgroundLayer }
    : {};
  return {
    document: options.document,
    zoomLevel: options.zoomLevel,
    ...getViewportDevicePixelRatioBaselinePatch(options.viewportDevicePixelRatioBaseline),
    prepareObject: options.prepareObject,
    ...syncBackgroundLayerPatch,
    rebuildFrameDecorations: options.rebuildFrameDecorations,
    applyOptions: options.applyOptions ?? options.options ?? {},
    applyToolMode: options.applyToolMode,
    hasHistory: options.hasHistory,
    ...createApplyEditorControllerDocumentStateSetters(options),
  };
}

export function createPreparedEditorDocumentStateOptions(args: {
  options: Pick<
    ApplyEditorControllerDocumentStateOptions,
    | 'applyOptions'
    | 'applyToolMode'
    | 'hasHistory'
    | 'setActiveTool'
    | 'setCanvasDocumentSize'
    | 'setCropState'
    | 'setHistory'
    | 'setOriginalDocument'
    | 'setSource'
  >;
  prepared: {
    normalizedDocument: EditorDocument;
  } & Awaited<
    ReturnType<typeof import('./apply/orchestrate').applyEditorDocumentToCanvas>
  >['prepared'];
  source: SourceState | null;
}) {
  return {
    applyOptions: args.options.applyOptions,
    applyToolMode: args.options.applyToolMode,
    hasHistory: args.options.hasHistory,
    prepared: args.prepared,
    ...createApplyEditorControllerDocumentStateSetters(args.options),
    source: args.source,
  };
}
