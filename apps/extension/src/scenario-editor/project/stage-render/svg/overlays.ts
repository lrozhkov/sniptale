import type { ScenarioCaptureStep } from '../../../../features/scenario/contracts/types/project';
import { shouldRenderScenarioStepOverlays } from '../../../../features/scenario/capture-step/editor-document';
import { renderScenarioOverlaySvg } from '../svg-overlays';
import type { ScenarioStageLayout } from '../../../../features/scenario/stage/layout';

export function buildScenarioOverlayMarkup(
  assetDataUrl: string,
  layout: ScenarioStageLayout,
  step: ScenarioCaptureStep,
  selectedOverlayId?: string | null
) {
  if (!shouldRenderScenarioStepOverlays(step)) {
    return '';
  }

  return step.overlays
    .map((overlay) =>
      renderScenarioOverlaySvg({
        assetDataUrl,
        layout,
        overlay,
        selected: overlay.id === selectedOverlayId,
      })
    )
    .join('');
}
