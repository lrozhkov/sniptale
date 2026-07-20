import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import type {
  EditorFrameSettings,
  EditorSelectionState,
} from '../../../features/editor/document/types';
import type { EditorPresetStorageState } from '../../../features/editor/document/presets';
import {
  createFrameDraftSceneSignature,
  createSceneBackgroundSettingsSignature,
  mergeSceneBackgroundDraft,
  resolveDefaultSceneBackgroundSettings,
  syncAuthoritativeFrameMetadata,
} from './drafts-scene';

function createSizeDraft(width: number | null | undefined, height: number | null | undefined) {
  return {
    width: Math.max(1, width ?? 1),
    height: Math.max(1, height ?? 1),
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
  const [layerSizeDraft, setLayerSizeDraft] = useState(
    createSizeDraft(args.selection.selectedObjectWidth, args.selection.selectedObjectHeight)
  );
  const [layerSizeLocked, setLayerSizeLocked] = useState(args.isResizableLayerSelection);

  useEffect(() => {
    setLayerSizeDraft(
      createSizeDraft(args.selection.selectedObjectWidth, args.selection.selectedObjectHeight)
    );
    setLayerSizeLocked(args.isResizableLayerSelection);
  }, [
    args.isResizableLayerSelection,
    args.selection.selectedObjectHeight,
    args.selection.selectedObjectWidth,
  ]);

  return {
    layerSizeDraft,
    layerSizeLocked,
    setLayerSizeDraft,
    setLayerSizeLocked,
  };
}

function useFrameDraftState(args: {
  frame: EditorFrameSettings;
  sceneBackgroundPresets: EditorPresetStorageState['sceneBackground'];
}) {
  const defaultSceneBackgroundSettings = resolveDefaultSceneBackgroundSettings(
    args.sceneBackgroundPresets
  );
  const [frameDraft, setFrameDraft] = useState(() =>
    mergeSceneBackgroundDraft(args.frame, defaultSceneBackgroundSettings)
  );
  const [defaultSceneSignature, setDefaultSceneSignature] = useState(() =>
    createSceneBackgroundSettingsSignature(defaultSceneBackgroundSettings)
  );

  useEffect(() => {
    setFrameDraft((state) => syncAuthoritativeFrameMetadata(state, args.frame));
  }, [args.frame]);

  useEffect(() => {
    const nextDefaultSceneSignature = createSceneBackgroundSettingsSignature(
      defaultSceneBackgroundSettings
    );

    setFrameDraft((state) => {
      if (
        defaultSceneSignature === nextDefaultSceneSignature ||
        defaultSceneBackgroundSettings === null
      ) {
        return state;
      }

      return createFrameDraftSceneSignature(state) === defaultSceneSignature
        ? syncAuthoritativeFrameMetadata(
            mergeSceneBackgroundDraft(state, defaultSceneBackgroundSettings),
            args.frame
          )
        : state;
    });
    setDefaultSceneSignature(nextDefaultSceneSignature);
  }, [args.frame, defaultSceneBackgroundSettings, defaultSceneSignature]);

  return { frameDraft, setFrameDraft };
}

export function useInspectorSidebarDraftState(args: {
  canvasHeight: number;
  canvasWidth: number;
  frame: EditorFrameSettings;
  inspector: string;
  sceneBackgroundPresets: EditorPresetStorageState['sceneBackground'];
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
    sceneBackgroundPresets: args.sceneBackgroundPresets,
  });

  return {
    ...frameDraftState,
    ...imageCanvasDrafts,
    ...layerDrafts,
  };
}
