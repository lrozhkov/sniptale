import {
  canToggleScenarioCaptureAutoOverlay,
  hasScenarioCaptureAutoOverlay,
  toggleScenarioCaptureAutoOverlay,
  type ScenarioCaptureAutoOverlayKind,
} from '../../../features/scenario/capture-step/auto-overlays';
import type { ScenarioCaptureStep } from '../../../features/scenario/contracts/types/project';
import { zoomImageTransform } from '../quick-edit/stage.helpers';
import { createWorkspaceResetPatch } from './helpers';
import type { ScenarioStepPatch } from '../../project/mutation/helpers';

export function createScenarioWorkspaceCanvasActions(args: {
  flushPendingZoom: () => ScenarioCaptureStep;
  onOpenQuickEdit: () => void;
  onUpdateStep: (patch: ScenarioStepPatch) => void;
}) {
  const commitZoom = (delta: number) => {
    const previewStep = args.flushPendingZoom();
    args.onUpdateStep({ imageTransform: zoomImageTransform(previewStep, delta) });
  };

  const togglePreview = (kind: ScenarioCaptureAutoOverlayKind) => {
    const previewStep = args.flushPendingZoom();
    const nextToggle = toggleScenarioCaptureAutoOverlay(previewStep, kind);

    args.onUpdateStep({
      annotationRenderMode: 'overlays',
      overlays: nextToggle.overlays,
    });
  };

  return {
    onDecreaseZoom: () => commitZoom(-0.08),
    onIncreaseZoom: () => commitZoom(0.08),
    onOpenEditor: () => {
      args.flushPendingZoom();
      args.onOpenQuickEdit();
    },
    onResetView: () => {
      args.flushPendingZoom();
      args.onUpdateStep(createWorkspaceResetPatch());
    },
    onToggleClickPreview: () => togglePreview('click'),
    onToggleFramePreview: () => togglePreview('frame'),
  };
}

export function createScenarioWorkspacePreviewToggleState(step: ScenarioCaptureStep) {
  return {
    clickPreviewActive: hasScenarioCaptureAutoOverlay(step.overlays, 'click'),
    clickPreviewVisible: canToggleScenarioCaptureAutoOverlay(step, 'click'),
    framePreviewActive: hasScenarioCaptureAutoOverlay(step.overlays, 'frame'),
    framePreviewVisible: canToggleScenarioCaptureAutoOverlay(step, 'frame'),
  };
}
