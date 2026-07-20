import type { ScenarioOverlay } from '../../../../../features/scenario/contracts/types/overlays';
import { shouldRenderScenarioArrowHead } from '../../arrow-head';
import type { ScenarioStageLayout } from '../../../../../features/scenario/stage/layout';
import { escapeSvgAttribute, formatNumber, projectPoint } from '../../svg-overlays.helpers';

export function renderArrowOverlay(
  layout: ScenarioStageLayout,
  overlay: Extract<ScenarioOverlay, { kind: 'arrow' }>,
  selected: boolean,
  stroke: string
) {
  const start = projectPoint(layout, overlay.start);
  const end = projectPoint(layout, overlay.end);
  const markerEnd = shouldRenderScenarioArrowHead(start, end)
    ? ' marker-end="url(#sniptaleScenarioArrowHead)"'
    : '';
  return [
    `<line x1="${formatNumber(start.x)}" y1="${formatNumber(start.y)}"`,
    ` x2="${formatNumber(end.x)}" y2="${formatNumber(end.y)}"`,
    ` stroke="${escapeSvgAttribute(stroke)}" stroke-width="${
      selected ? overlay.strokeWidth + 1 : overlay.strokeWidth
    }"`,
    ` stroke-linecap="round"${markerEnd} />`,
  ].join('');
}
