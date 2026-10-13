import { parseColor } from '@sniptale/foundation/color';
import {
  resolveEffectV1ControlDefault,
  type EffectV1Document,
} from '@sniptale/runtime-contracts/effect-v1';

/** Controls carry appearance; partial presets can identify it only when exactly one matches. */
export function reviewAnnotationPresetId(
  document: EffectV1Document,
  overrides: Readonly<Record<string, string | number>>,
  locale: string
): string {
  const matches = (document.controlPresets ?? []).filter((preset) =>
    Object.entries(preset.values).every(([id, expected]) => {
      const control = document.controls.find((item) => item.id === id);
      if (!control) return false;
      const actual = overrides[id] ?? resolveEffectV1ControlDefault(control, locale);
      if (control.kind !== 'color' || typeof actual !== 'string' || typeof expected !== 'string')
        return actual === expected;
      const a = parseColor(actual),
        b = parseColor(expected);
      return a && b
        ? a.red === b.red && a.green === b.green && a.blue === b.blue && a.alpha === b.alpha
        : actual === expected;
    })
  );
  return matches.length === 1 ? matches[0]!.id : '';
}
