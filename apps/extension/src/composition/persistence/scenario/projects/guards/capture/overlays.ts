import type {
  ScenarioOverlay,
  ScenarioOverlayAutoSource,
} from '../../../../../../features/scenario/contracts/types/overlays';
import { isRecord, isString } from '../../../../../../contracts/messaging/validators';
import { parseArrowOverlay, parsePointKindOverlay, parseTextOverlay } from './markers';
import { parseBlurOverlay, parseFocusRectOverlay, parseRectKindOverlay } from './shapes';

type OverlayBaseRecord = Record<string, unknown> & { id: string; kind: string };

function parseOverlayAutoSource(value: unknown): ScenarioOverlayAutoSource | undefined {
  return value === 'capture-target' || value === 'capture-click' ? value : undefined;
}

function parseOverlayByKind(value: OverlayBaseRecord): ScenarioOverlay | null {
  const autoSource = parseOverlayAutoSource(value['autoSource']);

  switch (value.kind) {
    case 'focus-rect':
      return parseFocusRectOverlay(value, autoSource);
    case 'click-ring':
    case 'cursor':
      return parsePointKindOverlay({ ...value, kind: value.kind }, autoSource);
    case 'blur-rect':
      return parseBlurOverlay(value, autoSource);
    case 'arrow':
      return parseArrowOverlay(value, autoSource);
    case 'rectangle':
    case 'ellipse':
      return parseRectKindOverlay({ ...value, kind: value.kind }, autoSource);
    case 'text':
      return parseTextOverlay(value, autoSource);
    default:
      return null;
  }
}

function parseOverlay(value: unknown): ScenarioOverlay | null {
  if (!isRecord(value) || !isString(value['id']) || !isString(value['kind'])) {
    return null;
  }

  return parseOverlayByKind({ ...value, id: value['id'], kind: value['kind'] });
}

export function parseCaptureOverlays(value: unknown): ScenarioOverlay[] {
  return Array.isArray(value)
    ? value.map(parseOverlay).filter((overlay): overlay is ScenarioOverlay => overlay !== null)
    : [];
}
