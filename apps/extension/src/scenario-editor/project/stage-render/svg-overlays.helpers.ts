import type {
  ScenarioPoint,
  ScenarioRect,
} from '@sniptale/runtime-contracts/scenario/types/geometry';
import type { ScenarioStageLayout } from '../../../features/scenario/stage/layout';

export { escapeSvgAttribute, escapeSvgText, formatNumber } from './svg/format';

export function projectPoint(layout: ScenarioStageLayout, point: ScenarioPoint): ScenarioPoint {
  return {
    x: layout.imageRect.x + point.x * (layout.imageRect.width / layout.sourceViewport.width),
    y: layout.imageRect.y + point.y * (layout.imageRect.height / layout.sourceViewport.height),
  };
}

export function projectRect(layout: ScenarioStageLayout, rect: ScenarioRect): ScenarioRect {
  return {
    x: layout.imageRect.x + rect.x * (layout.imageRect.width / layout.sourceViewport.width),
    y: layout.imageRect.y + rect.y * (layout.imageRect.height / layout.sourceViewport.height),
    width: rect.width * (layout.imageRect.width / layout.sourceViewport.width),
    height: rect.height * (layout.imageRect.height / layout.sourceViewport.height),
  };
}
