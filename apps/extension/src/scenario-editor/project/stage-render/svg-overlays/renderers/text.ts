import type { ScenarioOverlay } from '../../../../../features/scenario/contracts/types/overlays';
import type { ScenarioStageLayout } from '../../../../../features/scenario/stage/layout';
import {
  escapeSvgAttribute,
  escapeSvgText,
  formatNumber,
  projectPoint,
} from '../../svg-overlays.helpers';

export function renderTextOverlay(
  layout: ScenarioStageLayout,
  overlay: Extract<ScenarioOverlay, { kind: 'text' }>,
  stroke: string
) {
  const point = projectPoint(layout, overlay.point);
  return [
    `<text x="${formatNumber(point.x)}" y="${formatNumber(point.y)}"`,
    ` fill="${escapeSvgAttribute(stroke)}" font-size="${overlay.fontSize}"`,
    ` font-family="${escapeSvgAttribute(overlay.fontFamily)}"`,
    ` font-weight="${overlay.fontWeight}" dominant-baseline="hanging">`,
    escapeSvgText(overlay.text),
    '</text>',
  ].join('');
}
