import type { ScenarioOverlay } from '../../../../features/scenario/contracts/types/overlays';
import type { ScenarioStageLayout } from '../../../../features/scenario/stage/layout';
import {
  renderArrowOverlay,
  renderBlurRectOverlay,
  renderEllipseOverlay,
  renderFocusRectOverlay,
  renderPointOverlay,
  renderRectangleOverlay,
  renderTextOverlay,
} from './renderers';

function buildOverlayStroke(overlay: ScenarioOverlay, selected: boolean): string {
  if (selected) {
    return '#f97316';
  }

  switch (overlay.kind) {
    case 'focus-rect':
      return '#f97316';
    case 'click-ring':
      return '#eb5757';
    case 'cursor':
      return '#111827';
    case 'arrow':
      return overlay.color;
    case 'rectangle':
    case 'ellipse':
      return overlay.strokeColor;
    case 'text':
      return overlay.color;
    case 'blur-rect':
      return '#475569';
  }
}

export function renderScenarioOverlaySvg(args: {
  assetDataUrl: string;
  layout: ScenarioStageLayout;
  overlay: ScenarioOverlay;
  selected: boolean;
}): string {
  const { assetDataUrl, layout, overlay, selected } = args;
  const stroke = buildOverlayStroke(overlay, selected);

  switch (overlay.kind) {
    case 'focus-rect':
      return renderFocusRectOverlay(layout, overlay, selected, stroke);
    case 'click-ring':
    case 'cursor':
      return renderPointOverlay(layout, overlay, selected, stroke);
    case 'arrow':
      return renderArrowOverlay(layout, overlay, selected, stroke);
    case 'rectangle':
      return renderRectangleOverlay(layout, overlay, selected, stroke);
    case 'ellipse':
      return renderEllipseOverlay(layout, overlay, selected, stroke);
    case 'text':
      return renderTextOverlay(layout, overlay, stroke);
    case 'blur-rect':
      return renderBlurRectOverlay(assetDataUrl, layout, overlay, selected, stroke);
  }
}
