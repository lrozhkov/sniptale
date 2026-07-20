import type { SuggestedEventValidators } from './types';

export function hasSuggestedEventShape(
  value: Record<string, unknown>,
  validators: SuggestedEventValidators
): boolean {
  return (
    validators.isString(value['id']) &&
    validators.isScenarioSuggestedEventKind(value['kind']) &&
    validators.isString(value['message']) &&
    validators.isNumber(value['createdAt']) &&
    validators.hasOptionalField(
      value,
      'sourceStepId',
      validators.isNullable(validators.isString)
    ) &&
    validators.hasOptionalField(
      value,
      'target',
      validators.isNullable(validators.isScenarioTargetDescriptor)
    ) &&
    'status' in value
  );
}
