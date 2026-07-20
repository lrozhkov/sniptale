import type { BorderPadding, BorderPreset } from '../../../features/highlighter/contracts';
import {
  coerceBorderShadowIntensity,
  normalizeBorderPresetVisualFields,
} from '@sniptale/ui/highlighter-style/normalize';
import { isBoolean, isNumber, isRecord, isString } from '../infrastructure/guards/primitives';

const borderStyles = new Set<BorderPreset['style']>(['solid', 'dashed', 'dotted']);

function isBorderPadding(value: unknown): value is BorderPadding {
  return (
    isRecord(value) &&
    isNumber(value['top']) &&
    isNumber(value['left']) &&
    isNumber(value['right']) &&
    isNumber(value['bottom'])
  );
}

function parseBorderPreset(value: unknown): BorderPreset | null {
  if (
    !isRecord(value) ||
    !isString(value['id']) ||
    !isString(value['name']) ||
    (value['isSystemDefault'] !== undefined && !isBoolean(value['isSystemDefault'])) ||
    (value['enabled'] !== undefined && !isBoolean(value['enabled'])) ||
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
    !borderStyles.has(value['style'] as BorderPreset['style'])
  ) {
    return null;
  }

  const shadow = coerceBorderShadowIntensity(value['shadow']);
  if (shadow === null) {
    return null;
  }

  return normalizeBorderPresetVisualFields({
    customCss: value['customCss'],
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
    ...(value['isSystemDefault'] === undefined
      ? {}
      : { isSystemDefault: value['isSystemDefault'] }),
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
    invalidFieldCount: value.length - borderPresets.length,
  };
}
