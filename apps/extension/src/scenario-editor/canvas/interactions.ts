import type { ScenarioElement } from '@sniptale/runtime-contracts/scenario/types/v3';
import {
  createBeginInteractionHandler,
  createClearInteractionHandler,
  createCommitInteractionHandler,
  createKeyboardInteractionHandler,
  createPreviewInteractionHandler,
} from './actions';
import type { ScenarioCanvasMagnetScope } from './magnet';
import { getActiveInteractionSession, type InteractionSessionSnapshot } from './patches';
import { useInteractionState } from './state';
import type { ScenarioCanvasStageProps } from './types';

interface ScenarioCanvasInteractionOptions {
  onDeleteElement: ScenarioCanvasStageProps['onDeleteElement'];
  onSelectSlide: ScenarioCanvasStageProps['onSelectSlide'];
  onTransactionBegin: ScenarioCanvasStageProps['onBeginElementTransaction'];
  onTransactionCancel: ScenarioCanvasStageProps['onCancelElementTransaction'];
  onTransactionCommit: ScenarioCanvasStageProps['onCommitElementTransaction'];
  onUpdateElement: ScenarioCanvasStageProps['onUpdateElement'];
  magnetScope: ScenarioCanvasMagnetScope | null;
  scale: number;
  selectedElement: ScenarioElement | null;
  snapGridSize: number | null;
}

export function useScenarioCanvasInteractions(options: ScenarioCanvasInteractionOptions) {
  const state = useInteractionState();
  const snapshot: InteractionSessionSnapshot = state;
  const session = getActiveInteractionSession(snapshot);
  const clearPreview = createClearInteractionHandler({
    onTransactionCancel: options.onTransactionCancel,
    onTransactionCommit: options.onTransactionCommit,
    resetInteractionState: state.resetInteractionState,
    snapshot,
    transactionKind: state.transactionKind,
  });

  const handlers = createScenarioCanvasHandlers({
    clearPreview,
    options,
    snapshot,
    state,
  });

  return {
    activeFrameElementId: state.dragSession?.element.id ?? state.resizeSession?.element.id ?? null,
    hasActiveInteraction: session !== null,
    previewFrame: state.previewFrame,
    handlers,
  };
}

function createScenarioCanvasHandlers(args: {
  clearPreview: (commit: boolean) => void;
  options: ScenarioCanvasInteractionOptions;
  snapshot: InteractionSessionSnapshot;
  state: ReturnType<typeof useInteractionState>;
}) {
  return {
    beginTransaction: createBeginInteractionHandler({
      onTransactionBegin: args.options.onTransactionBegin,
      setTransactionKind: args.state.setTransactionKind,
    }),
    clearPreview: args.clearPreview,
    commitInteraction: createCommitInteractionHandler({
      clearInteraction: args.clearPreview,
      magnetScope: args.options.magnetScope,
      onUpdateElement: args.options.onUpdateElement,
      previewFrame: args.state.previewFrame,
      scale: args.options.scale,
      snapGridSize: args.options.snapGridSize,
      snapshot: args.snapshot,
    }),
    handleKeyDown: createKeyboardInteractionHandler({
      clearInteraction: args.clearPreview,
      onDeleteElement: args.options.onDeleteElement,
      onSelectSlide: args.options.onSelectSlide,
      onUpdateElement: args.options.onUpdateElement,
      selectedElement: args.options.selectedElement,
    }),
    setDragSession: args.state.setDragSession,
    setEndpointSession: args.state.setEndpointSession,
    setImageContentSession: args.state.setImageContentSession,
    setResizeSession: args.state.setResizeSession,
    updatePreview: createPreviewInteractionHandler({
      magnetScope: args.options.magnetScope,
      scale: args.options.scale,
      snapGridSize: args.options.snapGridSize,
      setPreviewFrame: args.state.setPreviewFrame,
      snapshot: args.snapshot,
    }),
  };
}
