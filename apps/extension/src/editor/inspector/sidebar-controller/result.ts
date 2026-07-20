import type { EditorInspectorContentController } from '../content/types';
import type { EditorInspectorStoreSlice } from './store';

type EditorInspectorSidebarExpandedController = Omit<EditorInspectorContentController, 'hasImage'>;

type EditorInspectorSidebarFloatingStoreFields = Pick<
  EditorInspectorStoreSlice,
  | 'activeTool'
  | 'inspectorCollapsed'
  | 'setActiveTool'
  | 'setImageData'
  | 'setLayerEffectsCategory'
  | 'syncActiveTool'
  | 'updateWorkspace'
>;

type EditorInspectorSidebarControllerStoreResult = EditorInspectorSidebarFloatingStoreFields &
  Pick<
    EditorInspectorSidebarExpandedController,
    'inspector' | 'layers' | 'selection' | 'setInspector'
  >;

export function createEditorInspectorSidebarControllerStoreResult(
  store: EditorInspectorStoreSlice
): EditorInspectorSidebarControllerStoreResult {
  return {
    activeTool: store.activeTool,
    inspector: store.inspector,
    inspectorCollapsed: store.inspectorCollapsed,
    layers: store.layers,
    selection: store.selection,
    setActiveTool: store.setActiveTool,
    setImageData: store.setImageData,
    setInspector: store.setInspector,
    setLayerEffectsCategory: store.setLayerEffectsCategory,
    syncActiveTool: store.syncActiveTool,
    updateWorkspace: store.updateWorkspace,
  };
}

export function buildEditorInspectorSidebarControllerResult<
  TStore extends EditorInspectorSidebarControllerStoreResult,
  TLocalState extends object,
  TDerived extends object,
  TActions extends object,
>(args: {
  store: TStore;
  localState: TLocalState;
  derived: TDerived;
  actions: TActions;
  handleCloseDocument: () => void;
}) {
  return {
    ...args.store,
    ...args.localState,
    ...args.derived,
    ...args.actions,
    handleCloseDocument: args.handleCloseDocument,
  };
}
