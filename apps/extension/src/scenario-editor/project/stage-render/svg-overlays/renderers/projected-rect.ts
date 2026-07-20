import type { ScenarioStageLayout } from '../../../../../features/scenario/stage/layout';
import { formatNumber, projectRect } from '../../svg-overlays.helpers';

export function renderProjectedRect(
  layout: ScenarioStageLayout,
  rect: {
    height: number;
    width: number;
    x: number;
    y: number;
  },
  attributes: string[]
) {
  const projectedRect = projectRect(layout, rect);
  return [
    `<rect x="${formatNumber(projectedRect.x)}" y="${formatNumber(projectedRect.y)}"`,
    ` width="${formatNumber(projectedRect.width)}" height="${formatNumber(projectedRect.height)}"`,
    ...attributes,
  ].join('');
}
