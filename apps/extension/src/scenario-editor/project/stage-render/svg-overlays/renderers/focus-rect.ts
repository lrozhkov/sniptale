import type { ScenarioOverlay } from '../../../../../features/scenario/contracts/types/overlays';
import type { ScenarioStageLayout } from '../../../../../features/scenario/stage/layout';
import { escapeSvgAttribute } from '../../svg-overlays.helpers';
import { renderProjectedRect } from './projected-rect';
import { SCENARIO_FOCUS_RECT_RADIUS } from '../../../../../features/scenario/capture-step/annotation-styles';

export function renderFocusRectOverlay(
  layout: ScenarioStageLayout,
  overlay: Extract<ScenarioOverlay, { kind: 'focus-rect' }>,
  selected: boolean,
  stroke: string
) {
  return renderProjectedRect(layout, overlay.rect, [
    ' fill="none"',
    ` stroke="${escapeSvgAttribute(stroke)}" stroke-width="${selected ? 4 : 3}"`,
    selected ? ' stroke-dasharray="10 6"' : '',
    ` rx="${SCENARIO_FOCUS_RECT_RADIUS}" ry="${SCENARIO_FOCUS_RECT_RADIUS}" />`,
  ]);
}
