import type {
  ScenarioOverlay,
  ScenarioOverlayAutoSource,
} from '../../../../../../features/scenario/contracts/types/overlays';
import { isNumber, isRecord, isString } from '../../../../../../contracts/messaging/validators';
import { parseRect } from '../helpers';
import type { BlurSettings } from '../../../../../../features/highlighter/contracts';

function parseOptionalBlurBorderFields(parsedBlurSettings: Record<string, unknown>) {
  const nextSettings: Partial<BlurSettings> = {};

  if (
    parsedBlurSettings['borderPresetId'] === null ||
    isString(parsedBlurSettings['borderPresetId'])
  ) {
    nextSettings.borderPresetId = parsedBlurSettings['borderPresetId'];
  }
  if (isNumber(parsedBlurSettings['radius'])) nextSettings.radius = parsedBlurSettings['radius'];
  if (isNumber(parsedBlurSettings['shadow'])) nextSettings.shadow = parsedBlurSettings['shadow'];
  if (isString(parsedBlurSettings['strokeColor'])) {
    nextSettings.strokeColor = parsedBlurSettings['strokeColor'];
  }
  if (isNumber(parsedBlurSettings['strokeOpacity'])) {
    nextSettings.strokeOpacity = parsedBlurSettings['strokeOpacity'];
  }
  if (
    parsedBlurSettings['strokeStyle'] === 'solid' ||
    parsedBlurSettings['strokeStyle'] === 'dashed' ||
    parsedBlurSettings['strokeStyle'] === 'dotted' ||
    parsedBlurSettings['strokeStyle'] === 'dash' ||
    parsedBlurSettings['strokeStyle'] === 'dot' ||
    parsedBlurSettings['strokeStyle'] === 'dash-dot' ||
    parsedBlurSettings['strokeStyle'] === 'long-dash'
  ) {
    nextSettings.strokeStyle = parsedBlurSettings['strokeStyle'];
  }
  if (isNumber(parsedBlurSettings['strokeWidth'])) {
    nextSettings.strokeWidth = parsedBlurSettings['strokeWidth'];
  }

  return nextSettings;
}

function parseBlurSettings(
  value: Record<string, unknown>
): Extract<ScenarioOverlay, { kind: 'blur-rect' }>['blurSettings'] | null {
  const blurSettings = value['blurSettings'];
  if (
    isRecord(blurSettings) &&
    isNumber(blurSettings['amount']) &&
    (blurSettings['blurType'] === 'gaussian' ||
      blurSettings['blurType'] === 'distortion' ||
      blurSettings['blurType'] === 'pixelate' ||
      blurSettings['blurType'] === 'solid') &&
    (blurSettings['showBorder'] === undefined || typeof blurSettings['showBorder'] === 'boolean')
  ) {
    return {
      amount: blurSettings['amount'],
      blurType: blurSettings['blurType'],
      showBorder: blurSettings['showBorder'] ?? false,
      ...parseOptionalBlurBorderFields(blurSettings),
    };
  }

  return isNumber(value['radius'])
    ? {
        amount: value['radius'],
        blurType: 'gaussian',
        showBorder: true,
      }
    : null;
}

export function parseFocusRectOverlay(
  value: Record<string, unknown> & { id: string },
  autoSource: ScenarioOverlayAutoSource | undefined
): ScenarioOverlay | null {
  const rect = parseRect(value['rect']);
  return rect
    ? { id: value.id, ...(autoSource ? { autoSource } : {}), kind: 'focus-rect', rect }
    : null;
}

export function parseBlurOverlay(
  value: Record<string, unknown> & { id: string },
  autoSource: ScenarioOverlayAutoSource | undefined
): ScenarioOverlay | null {
  const rect = parseRect(value['rect']);
  const blurSettings = parseBlurSettings(value);

  return rect && blurSettings
    ? {
        id: value.id,
        ...(autoSource ? { autoSource } : {}),
        kind: 'blur-rect',
        rect,
        blurSettings,
      }
    : null;
}

export function parseRectKindOverlay(
  value: Record<string, unknown> & { id: string; kind: 'rectangle' | 'ellipse' },
  autoSource: ScenarioOverlayAutoSource | undefined
): Extract<ScenarioOverlay, { kind: 'rectangle' | 'ellipse' }> | null {
  const rect = parseRect(value['rect']);
  return rect &&
    isString(value['strokeColor']) &&
    isString(value['fillColor']) &&
    isNumber(value['strokeWidth'])
    ? {
        id: value.id,
        ...(autoSource ? { autoSource } : {}),
        kind: value.kind,
        rect,
        strokeColor: value['strokeColor'],
        fillColor: value['fillColor'],
        strokeWidth: value['strokeWidth'],
      }
    : null;
}
