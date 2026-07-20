import { SCENARIO_ARROW_HEAD_MARKER } from '../arrow-head';
import { escapeSvgAttribute, formatNumber } from './format';

export function buildScenarioDefs(
  viewportClipId: string,
  viewport: { height: number; width: number; x: number; y: number }
) {
  return [
    '<defs>',
    [
      `<clipPath id="${escapeSvgAttribute(viewportClipId)}"><rect x="${formatNumber(viewport.x)}"`,
      ` y="${formatNumber(viewport.y)}" width="${formatNumber(viewport.width)}"`,
      ` height="${formatNumber(viewport.height)}" rx="18" ry="18" /></clipPath>`,
    ].join(''),
    `<marker id="sniptaleScenarioArrowHead" markerWidth="${SCENARIO_ARROW_HEAD_MARKER.width}"`,
    ` markerHeight="${SCENARIO_ARROW_HEAD_MARKER.height}" refX="${SCENARIO_ARROW_HEAD_MARKER.refX}"`,
    ` refY="${SCENARIO_ARROW_HEAD_MARKER.refY}" orient="auto">`,
    `<path d="${escapeSvgAttribute(SCENARIO_ARROW_HEAD_MARKER.path)}" fill="${escapeSvgAttribute(
      SCENARIO_ARROW_HEAD_MARKER.fill
    )}" /></marker>`,
    '</defs>',
  ].join('');
}
