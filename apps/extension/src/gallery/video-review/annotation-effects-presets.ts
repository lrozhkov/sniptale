import { parseColor } from '@sniptale/foundation/color';
import type { EffectControlSet } from '@sniptale/runtime-contracts/effect-controls';
import { resolveEffectControlDefault } from '@sniptale/runtime-contracts/effect-controls';

/** Controls carry appearance; partial presets can identify it only when exactly one matches. */
export function reviewAnnotationPresetId(
  document: EffectControlSet,
  overrides: Readonly<Record<string, string | number>>,
  locale: string
): string {
  const matches = (document.controlPresets ?? []).filter((preset) =>
    Object.entries(preset.values).every(([id, expected]) => {
      const control = document.controls.find((item) => item.id === id);
      if (!control) return false;
      const actual = overrides[id] ?? resolveEffectControlDefault(control, locale);
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
