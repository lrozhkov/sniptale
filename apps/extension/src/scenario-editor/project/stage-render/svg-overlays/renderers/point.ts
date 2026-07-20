import type { ScenarioOverlay } from '../../../../../features/scenario/contracts/types/overlays';
import type { ScenarioStageLayout } from '../../../../../features/scenario/stage/layout';
import { escapeSvgAttribute, formatNumber, projectPoint } from '../../svg-overlays.helpers';
import {
  SCENARIO_CLICK_RING_FILL,
  SCENARIO_CLICK_RING_RADIUS,
  SCENARIO_CLICK_RING_STROKE_WIDTH,
} from '../../../../../features/scenario/capture-step/annotation-styles';

export function renderPointOverlay(
  layout: ScenarioStageLayout,
  overlay: Extract<ScenarioOverlay, { kind: 'click-ring' | 'cursor' }>,
  selected: boolean,
  stroke: string
) {
  const point = projectPoint(layout, overlay.point);
  const radius = overlay.kind === 'click-ring' ? SCENARIO_CLICK_RING_RADIUS : 10;
  const fill = overlay.kind === 'click-ring' ? SCENARIO_CLICK_RING_FILL : '#111827';
  const strokeWidth = selected
    ? overlay.kind === 'click-ring'
      ? SCENARIO_CLICK_RING_STROKE_WIDTH + 1
      : 3
    : overlay.kind === 'click-ring'
      ? SCENARIO_CLICK_RING_STROKE_WIDTH
      : 2;

  return [
    `<circle cx="${formatNumber(point.x)}" cy="${formatNumber(point.y)}"`,
    ` r="${radius}" fill="${escapeSvgAttribute(fill)}" stroke="${escapeSvgAttribute(
      stroke
    )}" stroke-width="${strokeWidth}" />`,
  ].join('');
}
