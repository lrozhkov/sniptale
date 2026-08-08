import type { BorderPadding, BorderPreset } from '../../../features/highlighter/contracts';
import {
  coerceBorderShadowIntensity,
  normalizeBorderPresetVisualFields,
} from '@sniptale/ui/highlighter-style/normalize';
import { isBoolean, isNumber, isPlainRecord, isString } from '../infrastructure/guards/primitives';
import {
  cloneBorderPresetEffects,
  isSystemBorderPresetKey,
  type BorderPresetEffects,
} from '@sniptale/runtime-contracts/highlighter/border-preset';
import { multiplyColorAlpha, normalizeColor } from '@sniptale/foundation/color';

const borderStyles = new Set<BorderPreset['style']>(['solid', 'dashed', 'dotted']);
const blurTypes = new Set<BorderPresetEffects['blur']['blurType']>([
  'gaussian',
  'distortion',
  'pixelate',
  'solid',
]);

function parseBorderPresetEffects(value: unknown): BorderPresetEffects | null {
  if (value === undefined) return cloneBorderPresetEffects(undefined);
  if (!isPlainRecord(value)) return null;
  const blur = value['blur'];
  const focus = value['focus'];
  const capture = value['capture'];
  const linkedTemplates = value['linkedTemplates'];
  if (
    !isPlainRecord(blur) ||
    !isNumber(blur['amount']) ||
    blur['amount'] < 1 ||
    blur['amount'] > 25 ||
    !blurTypes.has(blur['blurType'] as BorderPresetEffects['blur']['blurType']) ||
    !isPlainRecord(focus) ||
    !isNumber(focus['opacity']) ||
    focus['opacity'] < 0 ||
    focus['opacity'] > 1 ||
    (focus['blurAmount'] !== undefined &&
      (!isNumber(focus['blurAmount']) || focus['blurAmount'] < 0 || focus['blurAmount'] > 25)) ||
    (capture !== undefined &&
      (!isPlainRecord(capture) ||
        (capture['hideFrame'] !== undefined && !isBoolean(capture['hideFrame'])))) ||
    !isValidLinkedTemplates(linkedTemplates)
  ) {
    return null;
  }
  return {
    blur: {
      amount: blur['amount'],
      blurType: blur['blurType'] as BorderPresetEffects['blur']['blurType'],
    },
    focus: {
      blurAmount: focus['blurAmount'] === undefined ? 0 : (focus['blurAmount'] as number),
      opacity: focus['opacity'],
    },
    capture: {
      hideFrame:
        isPlainRecord(capture) && isBoolean(capture['hideFrame']) ? capture['hideFrame'] : false,
    },
    linkedTemplates: parseLinkedTemplates(linkedTemplates),
  };
}

function isValidLinkedTemplateId(value: unknown): boolean {
  return value === undefined || value === null || (isString(value) && value.length > 0);
}

function isValidLinkedTemplates(value: unknown): boolean {
  return (
    value === undefined ||
    (isPlainRecord(value) &&
      isValidLinkedTemplateId(value['calloutPresetId']) &&
      isValidLinkedTemplateId(value['stepBadgePresetId']))
  );
}

function parseLinkedTemplates(value: unknown): NonNullable<BorderPresetEffects['linkedTemplates']> {
  if (!isPlainRecord(value)) {
    return { calloutPresetId: null, stepBadgePresetId: null };
  }
  return {
    calloutPresetId: isString(value['calloutPresetId']) ? value['calloutPresetId'] : null,
    stepBadgePresetId: isString(value['stepBadgePresetId']) ? value['stepBadgePresetId'] : null,
  };
}

function isNonNegativeInteger(value: unknown): value is number {
  return isNumber(value) && Number.isInteger(value) && value >= 0;
}

function isBorderPadding(value: unknown): value is BorderPadding {
  return (
    isPlainRecord(value) &&
    isNumber(value['top']) &&
    isNumber(value['left']) &&
    isNumber(value['right']) &&
    isNumber(value['bottom'])
  );
}

function parseBorderPreset(value: unknown): BorderPreset | null {
  const effects = isPlainRecord(value) ? parseBorderPresetEffects(value['effects']) : null;
  if (
    !isPlainRecord(value) ||
    !isString(value['id']) ||
    !isString(value['name']) ||
    (value['enabled'] !== undefined && !isBoolean(value['enabled'])) ||
    (value['origin'] !== undefined && value['origin'] !== 'system' && value['origin'] !== 'user') ||
    (value['systemPresetKey'] !== undefined &&
      !isSystemBorderPresetKey(value['systemPresetKey'])) ||
    (value['customized'] !== undefined && !isBoolean(value['customized'])) ||
    !isNumber(value['order']) ||
    !isNumber(value['width']) ||
    !isString(value['color']) ||
    !isString(value['customCss']) ||
    !isNumber(value['radius']) ||
    (value['opacity'] !== undefined && !isNumber(value['opacity'])) ||
    (value['strokeOpacity'] !== undefined && !isNumber(value['strokeOpacity'])) ||
    (value['fillColor'] !== undefined && !isString(value['fillColor'])) ||
    (value['fillOpacity'] !== undefined && !isNumber(value['fillOpacity'])) ||
    (value['inheritCustomCss'] !== undefined && !isBoolean(value['inheritCustomCss'])) ||
    !isBorderPadding(value['padding']) ||
    !borderStyles.has(value['style'] as BorderPreset['style']) ||
    effects === null
  ) {
    return null;
  }

  const shadow = coerceBorderShadowIntensity(value['shadow']);
  if (shadow === null) {
    return null;
  }

  const color = normalizeColor(value['color']);
  const fillColor = normalizeColor(isString(value['fillColor']) ? value['fillColor'] : '#00000000');
  if (!color || !fillColor) return null;
  const strokeOpacity = isNumber(value['strokeOpacity'])
    ? value['strokeOpacity'] / 100
    : isNumber(value['opacity'])
      ? value['opacity'] <= 1
        ? value['opacity']
        : value['opacity'] / 100
      : 1;
  const canonicalColor = multiplyColorAlpha(color, strokeOpacity);
  const canonicalFillColor = isNumber(value['fillOpacity'])
    ? multiplyColorAlpha(fillColor, value['fillOpacity'] / 100)
    : fillColor;
  if (!canonicalColor || !canonicalFillColor) return null;

  return normalizeBorderPresetVisualFields({
    customCss: value['customCss'],
    effects,
    color: canonicalColor,
    fillColor: canonicalFillColor,
    id: value['id'],
    inheritCustomCss: value['inheritCustomCss'] ?? false,
    name: value['name'],
    order: value['order'],
    padding: value['padding'],
    radius: value['radius'],
    shadow,
    style: value['style'] as BorderPreset['style'],
    width: value['width'],
    ...(value['enabled'] === undefined ? {} : { enabled: value['enabled'] }),
    ...(value['origin'] === undefined ? {} : { origin: value['origin'] as 'system' | 'user' }),
    ...(value['systemPresetKey'] === undefined
      ? {}
      : { systemPresetKey: value['systemPresetKey'] }),
    ...(!isNonNegativeInteger(value['basedOnRevision'])
      ? {}
      : { basedOnRevision: value['basedOnRevision'] }),
    ...(value['customized'] === undefined ? {} : { customized: value['customized'] }),
  });
}

export function parseBorderPresetsFromStorage(value: unknown): {
  borderPresets?: BorderPreset[];
  invalidFieldCount: number;
} {
  if (value === undefined) {
    return { invalidFieldCount: 0 };
  }

  if (!Array.isArray(value)) {
    return { invalidFieldCount: 1 };
  }

  const borderPresets = value
    .map(parseBorderPreset)
    .filter((preset): preset is BorderPreset => preset !== null);

  return {
    borderPresets,
    invalidFieldCount:
      value.length - borderPresets.length + value.filter(hasInvalidBasedOnRevision).length,
  };
}

function hasInvalidBasedOnRevision(value: unknown): boolean {
  return (
    isPlainRecord(value) &&
    value['basedOnRevision'] !== undefined &&
    !isNonNegativeInteger(value['basedOnRevision'])
  );
}
