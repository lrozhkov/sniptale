import {
  VIEWPORT_PRESET_MAX_DIMENSION,
  VIEWPORT_PRESET_MAX_NAME_LENGTH,
  type SystemViewportPreset,
  type UserViewportPreset,
  type ViewportPreset,
  type ViewportPresetTarget,
} from './contracts';
import { getCanonicalSystemViewportPreset } from './catalog';

const targetOrder: readonly ViewportPresetTarget[] = ['viewport', 'window'];
const selectorTargetOrder: readonly ViewportPresetTarget[] = ['window', 'viewport'];

type ViewportPresetSelectorGroup = {
  presets: ViewportPreset[];
  target: ViewportPresetTarget;
};

export function isValidViewportPresetDimension(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= VIEWPORT_PRESET_MAX_DIMENSION
  );
}

export function isValidViewportPresetName(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length >= 1 &&
    value.trim().length <= VIEWPORT_PRESET_MAX_NAME_LENGTH
  );
}

export function assertValidViewportPresetValues(params: {
  name: unknown;
  target: unknown;
  width: unknown;
  height: unknown;
}): void {
  if (!isValidViewportPresetName(params.name)) {
    throw new Error('Viewport preset name is invalid');
  }
  if (
    (params.target !== 'viewport' && params.target !== 'window') ||
    !isValidViewportPresetDimension(params.width) ||
    !isValidViewportPresetDimension(params.height)
  ) {
    throw new Error('Viewport preset dimensions or target are invalid');
  }
}

export function normalizeViewportPresetOrder(presets: readonly ViewportPreset[]): ViewportPreset[] {
  return targetOrder.flatMap((target) =>
    presets
      .filter((preset) => preset.target === target)
      .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id))
      .map((preset, order) => {
        const reordered = { ...preset, order };
        return reordered.kind === 'system'
          ? { ...reordered, customized: isSystemViewportPresetCustomized(reordered) }
          : reordered;
      })
  );
}

export function groupViewportPresetsForSelector(
  presets: readonly ViewportPreset[]
): ViewportPresetSelectorGroup[] {
  return selectorTargetOrder.flatMap((target) => {
    const groupedPresets = presets.filter((preset) => preset.target === target);
    return groupedPresets.length > 0 ? [{ presets: groupedPresets, target }] : [];
  });
}

export function orderViewportPresetsForSelector(
  presets: readonly ViewportPreset[]
): ViewportPreset[] {
  return groupViewportPresetsForSelector(presets).flatMap((group) => group.presets);
}

export function createUserViewportPreset(params: {
  id: string;
  name: string;
  target: ViewportPresetTarget;
  width: number;
  height: number;
  order: number;
}): UserViewportPreset {
  assertValidViewportPresetValues(params);
  return {
    kind: 'user',
    enabled: true,
    ...params,
    name: params.name.trim(),
  };
}

export function resetSystemViewportPreset(
  presets: readonly ViewportPreset[],
  preset: SystemViewportPreset
): ViewportPreset[] {
  const canonical = getCanonicalSystemViewportPreset(preset.systemKey);
  return normalizeViewportPresetOrder(
    presets.map((item) => (item.id === preset.id ? canonical : { ...item }))
  );
}

export function isSystemViewportPresetCustomized(preset: SystemViewportPreset): boolean {
  const canonical = getCanonicalSystemViewportPreset(preset.systemKey);
  return (
    preset.nameOverride !== undefined ||
    preset.enabled !== canonical.enabled ||
    preset.order !== canonical.order ||
    preset.target !== canonical.target ||
    preset.width !== canonical.width ||
    preset.height !== canonical.height
  );
}
