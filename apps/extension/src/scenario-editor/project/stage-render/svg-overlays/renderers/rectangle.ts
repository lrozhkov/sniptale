import type { ScenarioOverlay } from '../../../../../features/scenario/contracts/types/overlays';
import type { ScenarioStageLayout } from '../../../../../features/scenario/stage/layout';
import { escapeSvgAttribute } from '../../svg-overlays.helpers';
import { renderProjectedRect } from './projected-rect';

export function renderRectangleOverlay(
  layout: ScenarioStageLayout,
  overlay: Extract<ScenarioOverlay, { kind: 'rectangle' }>,
  selected: boolean,
  stroke: string
) {
  return renderProjectedRect(layout, overlay.rect, [
    ` fill="${escapeSvgAttribute(overlay.fillColor)}" stroke="${escapeSvgAttribute(stroke)}"`,
    ` stroke-width="${selected ? overlay.strokeWidth + 1 : overlay.strokeWidth}" rx="10" ry="10" />`,
  ]);
}
