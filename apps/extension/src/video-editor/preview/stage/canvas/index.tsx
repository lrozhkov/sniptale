import type React from 'react';

import { PreviewStageFrame } from './layers';
import {
  createPreviewStageAnnotationTargetOverlay,
  createPreviewStageSelectionOverlay,
  PreviewStageRoot,
} from './root';
import type { PreviewStageCanvasProps } from '../types';

export function PreviewStageCanvas(params: PreviewStageCanvasProps) {
  const mode = params.mode ?? 'editor';
  return (
    <PreviewStageFrame>
      <PreviewStageRoot {...createPreviewStageRootProps(params, mode)} />
    </PreviewStageFrame>
  );
}

function createPreviewStageRootProps(
  params: PreviewStageCanvasProps,
  mode: PreviewStageCanvasProps['mode']
): React.ComponentProps<typeof PreviewStageRoot> {
  return {
    ...params,
    guides: params.guides ?? [],
    mode,
    onGuideChange: params.onGuideChange ?? (() => undefined),
    ...createPreviewStageCanvasOverlays(params, mode),
  };
}

function createPreviewStageCanvasOverlays(
  params: PreviewStageCanvasProps,
  mode: PreviewStageCanvasProps['mode']
) {
  return {
    selectionOverlay: createPreviewStageSelectionOverlay({
      beginInteraction: params.beginInteraction,
      camera: params.camera,
      mode,
      project: params.project,
      selectedClip: params.selectedClip,
      selectedClipLocked: params.selectedClipLocked,
      stageRef: params.stageRef,
    }),
    targetOverlay: createPreviewStageAnnotationTargetOverlay({
      camera: params.camera,
      mode,
      onUpdateAnnotationClipTemplate: params.onUpdateAnnotationClipTemplate,
      project: params.project,
      selectedClip: params.selectedClip,
      selectedClipLocked: params.selectedClipLocked,
      stageRef: params.stageRef,
    }),
  };
}
