import { translate } from '../../../platform/i18n';
import type { ViewportPreset, ViewportPresetTarget } from '../../../contracts/settings';
import { getViewportPresetDisplayName } from '../../../features/viewport-presets/display-name';
import {
  assertValidViewportPresetValues,
  createUserViewportPreset,
  isSystemViewportPresetCustomized,
  normalizeViewportPresetOrder,
} from '../../../features/viewport-presets/operations';
import { getSettingsCountLabel } from '../../section-surface/text.helpers';

export interface ViewportPresetDraft {
  name: string;
  target: ViewportPresetTarget;
  width: number;
  height: number;
  nameEdited?: boolean;
}

export function updateViewportPreset(
  presets: readonly ViewportPreset[],
  editingPreset: ViewportPreset,
  draft: ViewportPresetDraft
): ViewportPreset[] {
  assertValidViewportPresetValues(draft);
  const targetChanged = editingPreset.target !== draft.target;
  const nextOrder = targetChanged
    ? Math.max(
        -1,
        ...presets.filter((preset) => preset.target === draft.target).map((item) => item.order)
      ) + 1
    : editingPreset.order;
  return normalizeViewportPresetOrder(
    presets.map((preset) => {
      if (preset.id !== editingPreset.id) return { ...preset };
      if (preset.kind === 'user') {
        return {
          ...preset,
          name: draft.name.trim(),
          target: draft.target,
          width: draft.width,
          height: draft.height,
          order: nextOrder,
        };
      }
      const nextNameOverride = draft.nameEdited ? draft.name.trim() : preset.nameOverride;
      const { nameOverride: _nameOverride, ...systemPreset } = preset;
      const updated = {
        ...systemPreset,
        ...(nextNameOverride === undefined ? {} : { nameOverride: nextNameOverride }),
        target: draft.target,
        width: draft.width,
        height: draft.height,
        order: nextOrder,
      };
      return { ...updated, customized: isSystemViewportPresetCustomized(updated) };
    })
  );
}

export function createViewportPreset(
  draft: ViewportPresetDraft,
  presets: readonly ViewportPreset[]
): ViewportPreset {
  return createUserViewportPreset({
    id: crypto.randomUUID(),
    name: draft.name,
    target: draft.target,
    width: draft.width,
    height: draft.height,
    order:
      Math.max(
        -1,
        ...presets.filter((preset) => preset.target === draft.target).map((preset) => preset.order)
      ) + 1,
  });
}

export function moveViewportPreset(
  presets: readonly ViewportPreset[],
  presetId: string,
  direction: -1 | 1
): ViewportPreset[] {
  const preset = presets.find((item) => item.id === presetId);
  if (!preset) return presets.map((item) => ({ ...item }));
  const group = presets
    .filter((item) => item.target === preset.target)
    .sort((left, right) => left.order - right.order);
  const index = group.findIndex((item) => item.id === presetId);
  const swapWith = group[index + direction];
  if (!swapWith) return presets.map((item) => ({ ...item }));
  return normalizeViewportPresetOrder(
    presets.map((item) => {
      if (item.id === preset.id) return { ...item, order: swapWith.order };
      if (item.id === swapWith.id) return { ...item, order: preset.order };
      return { ...item };
    })
  );
}

export function getDeleteMessage(preset?: ViewportPreset): string {
  return (
    `${translate('viewportPresets.section.deleteMessagePrefix')} "${
      preset ? getViewportPresetDisplayName(preset) : ''
    }"` + `${translate('viewportPresets.section.deleteMessageSuffix')}`
  );
}

export function getViewportPresetCountLabel(count: number): string {
  return getSettingsCountLabel(count, {
    one: 'viewportPresets.section.countOne',
    few: 'viewportPresets.section.countFew',
    many: 'viewportPresets.section.countMany',
  });
}
