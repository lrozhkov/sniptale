import {
  resolveEffectLocaleText,
  type EffectV1Document,
  type ControlDefinition,
} from '@sniptale/runtime-contracts/effect-v1';
import { getCurrentLocale, translate } from '../../../../../platform/i18n';

export function getEffectControlSections(document: EffectV1Document) {
  const axes = new Set(
    document.objectLayout?.handles?.flatMap((handle) => [handle.xControl, handle.yControl]) ?? []
  );
  const groups = [
    ['content', 'objectText'],
    ['typography', 'objectTypography'],
    ['appearance', 'objectAppearance'],
    ['geometry', 'objectGeometry'],
    ['processing', 'objectProcessing'],
    ['animation', 'objectAnimation'],
    ['advanced', 'objectAdvanced'],
  ] as const;
  const known = new Set<string>(groups.map(([id]) => id));
  const controls = document.controls.filter((control) => !axes.has(control.id));
  return groups
    .map(([id, key]) => ({
      id,
      semantic: id,
      label: translate(`videoEditor.effectsLibrary.${key}`),
      advanced: id === 'advanced',
      controls: controls
        .filter(
          (control) =>
            (control.group && known.has(control.group) ? control.group : 'advanced') === id
        )
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    }))
    .filter((section) => section.controls.length > 0);
}

export function getEffectSequenceOptions(_documentId: string, control: ControlDefinition) {
  return (
    control.options?.map((option) => ({
      value: String(option.value),
      label: resolveEffectLocaleText(option.label, getCurrentLocale()),
    })) ?? null
  );
}
