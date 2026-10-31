import {
  EFFECT_V1_CONTROL_GROUP_LIMIT,
  EFFECT_V1_CONTROL_ICONS,
} from '../model/control-presentation.js';
import { resolveEffectV1ControlGroupIcons } from '../model/control-group-icons.js';
import { isRecord } from './shared.js';
import type { EffectV1DiagnosticReporter } from './shared.js';
type EffectV1ValidationErrorReport = Pick<EffectV1DiagnosticReporter, 'error'>;

export function validateEffectV1ControlGroupIcons(
  definitions: unknown,
  controls: unknown,
  report: EffectV1ValidationErrorReport
): void {
  if (!Array.isArray(definitions) || definitions.length > EFFECT_V1_CONTROL_GROUP_LIMIT) return;
  const groups: unknown[] = definitions;
  const accepted = resolveEffectV1ControlGroupIcons(groups, controls);
  for (const [index, group] of groups.entries()) {
    if (
      !isRecord(group) ||
      !EFFECT_V1_CONTROL_ICONS.some((icon) => icon === group['icon']) ||
      accepted.has(index)
    )
      continue;
    report.error(
      'CONTROL_GROUP_ICON_DUPLICATE',
      `$.controlGroups[${index}].icon`,
      'Custom group icons must be unique and must not repeat icons of used semantic roots.'
    );
  }
}
