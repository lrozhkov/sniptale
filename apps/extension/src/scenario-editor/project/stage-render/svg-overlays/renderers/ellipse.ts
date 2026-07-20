import type { ScenarioOverlay } from '../../../../../features/scenario/contracts/types/overlays';
import type { ScenarioStageLayout } from '../../../../../features/scenario/stage/layout';
import { escapeSvgAttribute, formatNumber, projectRect } from '../../svg-overlays.helpers';

export function renderEllipseOverlay(
  layout: ScenarioStageLayout,
  overlay: Extract<ScenarioOverlay, { kind: 'ellipse' }>,
  selected: boolean,
  stroke: string
) {
  const rect = projectRect(layout, overlay.rect);
  return [
    `<ellipse cx="${formatNumber(rect.x + rect.width / 2)}" cy="${formatNumber(rect.y + rect.height / 2)}"`,
    ` rx="${formatNumber(rect.width / 2)}" ry="${formatNumber(rect.height / 2)}"`,
    ` fill="${escapeSvgAttribute(overlay.fillColor)}" stroke="${escapeSvgAttribute(stroke)}"`,
    ` stroke-width="${selected ? overlay.strokeWidth + 1 : overlay.strokeWidth}" />`,
  ].join('');
}
