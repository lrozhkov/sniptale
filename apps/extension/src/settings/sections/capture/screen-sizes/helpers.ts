import { translate } from '../../../../platform/i18n';
import type { ViewportPreset, ViewportPresetTarget } from '../../../../contracts/settings';
import { getViewportPresetDisplayName } from '../../../../features/viewport-presets/display-name';
import {
  assertValidViewportPresetValues,
  createUserViewportPreset,
  isSystemViewportPresetCustomized,
  normalizeViewportPresetOrder,
} from '../../../../features/viewport-presets/operations';

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

export function moveViewportPresetBefore(
  presets: readonly ViewportPreset[],
  presetId: string,
  beforePresetId: string | null
): ViewportPreset[] {
  const preset = presets.find((item) => item.id === presetId);
  if (!preset) return [...presets];
  const target =
    beforePresetId === null ? null : presets.find((item) => item.id === beforePresetId);
  if (target && target.target !== preset.target) return [...presets];
  const sameTarget = presets.filter(
    (item) => item.target === preset.target && item.id !== presetId
  );
  const insertionIndex =
    beforePresetId === null
      ? sameTarget.length
      : sameTarget.findIndex((item) => item.id === beforePresetId);
  if (insertionIndex < 0) return [...presets];
  sameTarget.splice(insertionIndex, 0, preset);
  const reorderedTarget = sameTarget.map((item, order) => ({ ...item, order }));
  const byTarget = new Map<ViewportPresetTarget, ViewportPreset[]>([
    [
      'viewport',
      preset.target === 'viewport'
        ? reorderedTarget
        : presets.filter((item) => item.target === 'viewport'),
    ],
    [
      'window',
      preset.target === 'window'
        ? reorderedTarget
        : presets.filter((item) => item.target === 'window'),
    ],
  ]);
  return normalizeViewportPresetOrder([...byTarget.get('viewport')!, ...byTarget.get('window')!]);
}

export function getDeleteMessage(preset?: ViewportPreset): string {
  return (
    `${translate('viewportPresets.section.deleteMessagePrefix')} "${
      preset ? getViewportPresetDisplayName(preset) : ''
    }"` + `${translate('viewportPresets.section.deleteMessageSuffix')}`
  );
}
