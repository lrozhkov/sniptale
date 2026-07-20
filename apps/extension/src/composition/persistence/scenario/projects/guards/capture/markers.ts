import type {
  ScenarioOverlay,
  ScenarioOverlayAutoSource,
} from '../../../../../../features/scenario/contracts/types/overlays';
import { isNumber, isString } from '../../../../../../contracts/messaging/validators';
import { parsePoint } from '../helpers';

export function parsePointKindOverlay(
  value: Record<string, unknown> & { id: string; kind: 'click-ring' | 'cursor' },
  autoSource: ScenarioOverlayAutoSource | undefined
): ScenarioOverlay | null {
  const point = parsePoint(value['point']);
  return point
    ? { id: value.id, ...(autoSource ? { autoSource } : {}), kind: value.kind, point }
    : null;
}

export function parseArrowOverlay(
  value: Record<string, unknown> & { id: string },
  autoSource: ScenarioOverlayAutoSource | undefined
): ScenarioOverlay | null {
  const start = parsePoint(value['start']);
  const end = parsePoint(value['end']);
  return start && end && isString(value['color']) && isNumber(value['strokeWidth'])
    ? {
        id: value.id,
        ...(autoSource ? { autoSource } : {}),
        kind: 'arrow',
        start,
        end,
        color: value['color'],
        strokeWidth: value['strokeWidth'],
      }
    : null;
}

export function parseTextOverlay(
  value: Record<string, unknown> & { id: string },
  autoSource: ScenarioOverlayAutoSource | undefined
): ScenarioOverlay | null {
  const point = parsePoint(value['point']);
  return point &&
    isString(value['text']) &&
    isString(value['color']) &&
    isNumber(value['fontSize']) &&
    isString(value['fontFamily']) &&
    isNumber(value['fontWeight'])
    ? {
        id: value.id,
        ...(autoSource ? { autoSource } : {}),
        kind: 'text',
        point,
        text: value['text'],
        color: value['color'],
        fontSize: value['fontSize'],
        fontFamily: value['fontFamily'],
        fontWeight: value['fontWeight'],
      }
    : null;
}
