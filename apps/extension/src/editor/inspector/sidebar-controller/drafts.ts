import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import type {
  EditorFrameSettings,
  EditorSelectionState,
} from '../../../features/editor/document/types';
import { normalizeEditorFrameSettings } from '../../../features/editor/document/constants';
import { useEditorStore } from '../../state/useEditorStore';
import type { EditorPresetStorageState } from '../../../features/editor/document/presets';

function createSizeDraft(width: number | null | undefined, height: number | null | undefined) {
  return {
    width: Math.max(1, Math.round(width ?? 1)),
    height: Math.max(1, Math.round(height ?? 1)),
  };
}

function updateSizeDraftIfChanged(
  setDraft: Dispatch<SetStateAction<{ width: number; height: number }>>,
  draft: { width: number; height: number }
) {
  setDraft((state) =>
    state.width === draft.width && state.height === draft.height ? state : draft
  );
}

function useAuthoritativeImageCanvasDraftSync(args: {
  canvasHeight: number;
  canvasWidth: number;
  resizeInspectorActive: boolean;
  setCanvasSizeDraft: Dispatch<SetStateAction<{ width: number; height: number }>>;
  setImageSizeDraft: Dispatch<SetStateAction<{ width: number; height: number }>>;
  sourceHeight: number;
  sourceWidth: number;
}) {
  useEffect(() => {
    updateSizeDraftIfChanged(
      args.setImageSizeDraft,
      createSizeDraft(args.sourceWidth, args.sourceHeight)
    );
  }, [args.setImageSizeDraft, args.sourceHeight, args.sourceWidth]);

  useEffect(() => {
    updateSizeDraftIfChanged(
      args.setCanvasSizeDraft,
      createSizeDraft(args.canvasWidth, args.canvasHeight)
    );
  }, [args.canvasHeight, args.canvasWidth, args.setCanvasSizeDraft]);

  useEffect(() => {
    if (args.resizeInspectorActive) {
      return;
    }

    updateSizeDraftIfChanged(
      args.setImageSizeDraft,
      createSizeDraft(args.sourceWidth, args.sourceHeight)
    );
    updateSizeDraftIfChanged(
      args.setCanvasSizeDraft,
      createSizeDraft(args.canvasWidth, args.canvasHeight)
    );
  }, [
    args.canvasHeight,
    args.canvasWidth,
    args.resizeInspectorActive,
    args.setCanvasSizeDraft,
    args.setImageSizeDraft,
    args.sourceHeight,
    args.sourceWidth,
  ]);
}

function useCropSelectionCanvasDraftSync(args: {
  cropSelectionHeight: number | undefined;
  cropSelectionWidth: number | undefined;
  setCanvasSizeDraft: Dispatch<SetStateAction<{ width: number; height: number }>>;
}) {
  useEffect(() => {
    if (args.cropSelectionHeight === undefined || args.cropSelectionWidth === undefined) {
      return;
    }

    updateSizeDraftIfChanged(
      args.setCanvasSizeDraft,
      createSizeDraft(args.cropSelectionWidth, args.cropSelectionHeight)
    );
  }, [args.cropSelectionHeight, args.cropSelectionWidth, args.setCanvasSizeDraft]);
}

function useImageCanvasDraftState(args: {
  canvasHeight: number;
  canvasWidth: number;
  cropSelection?: { width: number; height: number } | null;
  inspector: string;
  sourceHeight: number;
  sourceWidth: number;
}) {
  const [imageSizeDraft, setImageSizeDraft] = useState(
    createSizeDraft(args.sourceWidth, args.sourceHeight)
  );
  const [canvasSizeDraft, setCanvasSizeDraft] = useState(
    createSizeDraft(args.canvasWidth, args.canvasHeight)
  );
  const [imageSizeLocked, setImageSizeLocked] = useState(true);
  const [canvasSizeLocked, setCanvasSizeLocked] = useState(false);
  const cropSelectionHeight = args.cropSelection?.height;
  const cropSelectionWidth = args.cropSelection?.width;
  const resizeInspectorActive = args.inspector === 'canvas-size' || args.inspector === 'image-size';

  useAuthoritativeImageCanvasDraftSync({
    canvasHeight: args.canvasHeight,
    canvasWidth: args.canvasWidth,
    resizeInspectorActive,
    setCanvasSizeDraft,
    setImageSizeDraft,
    sourceHeight: args.sourceHeight,
    sourceWidth: args.sourceWidth,
  });
  useCropSelectionCanvasDraftSync({
    cropSelectionHeight,
    cropSelectionWidth,
    setCanvasSizeDraft,
  });

  return {
    canvasSizeDraft,
    canvasSizeLocked,
    imageSizeDraft,
    imageSizeLocked,
    setCanvasSizeDraft,
    setCanvasSizeLocked,
    setImageSizeDraft,
    setImageSizeLocked,
  };
}

function useLayerDraftState(args: {
  isResizableLayerSelection: boolean;
  selection: EditorSelectionState;
}) {
  const selectedObjectId = args.selection.selectedObjectId;
  const selectedObjectWidth = args.selection.selectedObjectWidth;
  const selectedObjectHeight = args.selection.selectedObjectHeight;
  const validSelection =
    args.selection.selectedObjectCount === 1 &&
    selectedObjectId !== null &&
    !!selectedObjectWidth &&
    !!selectedObjectHeight;
  const lastValidSelection = useRef<{
    id: string;
    width: number;
    height: number;
    resizable: boolean;
  } | null>(
    validSelection
      ? {
          id: selectedObjectId,
          width: selectedObjectWidth,
          height: selectedObjectHeight,
          resizable: args.isResizableLayerSelection,
        }
      : null
  );
  const [layerSizeDraft, setLayerSizeDraft] = useState(
    createSizeDraft(selectedObjectWidth, selectedObjectHeight)
  );
  const [layerSizeLocked, setLayerSizeLocked] = useState(args.isResizableLayerSelection);

  useEffect(() => {
    if (!validSelection) {
      return;
    }
    const nextSelection = {
      id: selectedObjectId,
      width: selectedObjectWidth,
      height: selectedObjectHeight,
      resizable: args.isResizableLayerSelection,
    };
    const previous = lastValidSelection.current;
    if (
      previous?.id === nextSelection.id &&
      previous.width === nextSelection.width &&
      previous.height === nextSelection.height &&
      previous.resizable === nextSelection.resizable
    ) {
      return;
    }
    lastValidSelection.current = nextSelection;
    setLayerSizeDraft(createSizeDraft(selectedObjectWidth, selectedObjectHeight));
    setLayerSizeLocked(args.isResizableLayerSelection);
  }, [
    args.isResizableLayerSelection,
    args.selection.selectedObjectCount,
    selectedObjectHeight,
    selectedObjectId,
    selectedObjectWidth,
    validSelection,
  ]);

  return {
    layerSizeDraft,
    layerSizeLocked,
    setLayerSizeDraft,
    setLayerSizeLocked,
  };
}

function useFrameDraftState(args: { frame: EditorFrameSettings; inspector: string }) {
  const freshImageBackgroundPending = useEditorStore((state) => state.freshImageBackgroundPending);
  const [frameDraft, setFrameDraft] = useState(() => normalizeEditorFrameSettings(args.frame));
  const lastFillModeRef = useRef<'color' | 'gradient'>(
    args.frame.backgroundMode === 'gradient' ? 'gradient' : 'color'
  );
  if (frameDraft.backgroundMode !== 'image') {
    lastFillModeRef.current = frameDraft.backgroundMode;
  }

  useLayoutEffect(() => {
    setFrameDraft(normalizeEditorFrameSettings(args.frame));
  }, [args.frame]);

  useLayoutEffect(() => {
    if (!freshImageBackgroundPending || args.inspector !== 'frame') return;
    useEditorStore.getState().setFreshImageBackgroundPending(false);
  }, [args.frame, args.inspector, freshImageBackgroundPending]);

  const resetFrameDraft = () => setFrameDraft(normalizeEditorFrameSettings(args.frame));

  return { frameDraft, lastFillModeRef, resetFrameDraft, setFrameDraft };
}

export function useInspectorSidebarDraftState(args: {
  canvasHeight: number;
  canvasWidth: number;
  frame: EditorFrameSettings;
  sceneBackgroundPresets?: EditorPresetStorageState['sceneBackground'];
  inspector: string;
  isResizableLayerSelection: boolean;
  selection: EditorSelectionState;
  sourceHeight: number;
  sourceName: string | null;
  sourceWidth: number;
  cropSelection?: { width: number; height: number } | null;
}) {
  const imageCanvasDrafts = useImageCanvasDraftState(args);
  const layerDrafts = useLayerDraftState(args);
  const frameDraftState = useFrameDraftState({
    frame: args.frame,
    inspector: args.inspector,
  });

  return {
    ...frameDraftState,
    ...imageCanvasDrafts,
    ...layerDrafts,
  };
}
