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
  if (
    !isPlainRecord(blur) ||
    !isNumber(blur['amount']) ||
    blur['amount'] < 1 ||
    blur['amount'] > 25 ||
    !blurTypes.has(blur['blurType'] as BorderPresetEffects['blur']['blurType']) ||
    !isPlainRecord(focus) ||
    !isNumber(focus['opacity']) ||
    focus['opacity'] < 0.1 ||
    focus['opacity'] > 1
  ) {
    return null;
  }
  return {
    blur: {
      amount: blur['amount'],
      blurType: blur['blurType'] as BorderPresetEffects['blur']['blurType'],
    },
    focus: { opacity: focus['opacity'] },
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
    !isNumber(value['opacity']) ||
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

  return normalizeBorderPresetVisualFields({
    customCss: value['customCss'],
    effects,
    color: value['color'],
    fillColor: value['fillColor'] ?? '#00000000',
    fillOpacity: value['fillOpacity'] ?? 0,
    id: value['id'],
    inheritCustomCss: value['inheritCustomCss'] ?? false,
    name: value['name'],
    opacity: value['opacity'],
    order: value['order'],
    padding: value['padding'],
    radius: value['radius'],
    shadow,
    strokeOpacity: value['strokeOpacity'] ?? value['opacity'],
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
