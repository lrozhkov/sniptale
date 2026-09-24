import { useEffect, useRef } from 'react';
import type { SizeDraft } from './resize-tool-options';

type ResizeToolPreviewController = {
  clearCanvasSizePreview: () => void;
  clearCropSelection: () => void;
  previewCanvasSize: (width: number, height: number) => void;
  setCropSelectionMouseEnabled: (enabled: boolean) => void;
};

interface UseCanvasResizePreviewArgs {
  canvasSizeDraft: SizeDraft;
  canvasSizeMatchesDraft: boolean;
  controller: ResizeToolPreviewController;
  cropSelection: SizeDraft | null;
  cropSelectionMatchesDraft: boolean;
  isCanvasMode: boolean;
}

export function useCanvasResizePreview(args: UseCanvasResizePreviewArgs) {
  const { width: draftWidth, height: draftHeight } = args.canvasSizeDraft;
  const previousCropSelectionRef = useRef<SizeDraft | null>(null);
  const previousCanvasSizeDraftRef = useRef<SizeDraft | null>(null);
  const cropSelectionChanged = hasSizeDraftChanged(
    previousCropSelectionRef.current,
    args.cropSelection
  );

  useEffect(() => {
    args.controller.setCropSelectionMouseEnabled(args.isCanvasMode);

    if (!args.isCanvasMode) {
      args.controller.clearCanvasSizePreview();
      args.controller.clearCropSelection();
    }

    return () => args.controller.setCropSelectionMouseEnabled(true);
  }, [args.controller, args.isCanvasMode]);

  useEffect(() => {
    return () => {
      args.controller.clearCanvasSizePreview();
      args.controller.setCropSelectionMouseEnabled(true);
    };
  }, [args.controller]);

  useEffect(() => {
    previousCropSelectionRef.current = args.cropSelection;
  }, [args.cropSelection]);

  useEffect(() => {
    const draftChanged = hasSizeDraftChanged(previousCanvasSizeDraftRef.current, {
      width: draftWidth,
      height: draftHeight,
    });
    previousCanvasSizeDraftRef.current = { width: draftWidth, height: draftHeight };
    if (cropSelectionChanged || !draftChanged) {
      return;
    }

    if (args.isCanvasMode && !args.canvasSizeMatchesDraft && !args.cropSelectionMatchesDraft) {
      args.controller.previewCanvasSize(draftWidth, draftHeight);
    }
  }, [
    draftHeight,
    draftWidth,
    args.canvasSizeMatchesDraft,
    args.controller,
    args.cropSelectionMatchesDraft,
    args.isCanvasMode,
    cropSelectionChanged,
  ]);
}

function hasSizeDraftChanged(previous: SizeDraft | null, next: SizeDraft | null): boolean {
  if (previous === null || next === null) {
    return previous !== next;
  }

  return previous.height !== next.height || previous.width !== next.width;
}
