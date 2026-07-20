import {
  hasOptionalField,
  isNullable,
  isNumber,
  isRecord,
  isString,
} from '../../../../../../../contracts/messaging/validators';
import {
  isScenarioStringDataRecord,
  isScenarioSuggestedEventKind,
  isScenarioTargetDescriptor,
} from '../../../../../../../contracts/messaging/scenario/validators';

export function buildSuggestedEventValidators() {
  return {
    hasOptionalField,
    isNullable,
    isNumber,
    isRecord,
    isScenarioStringDataRecord,
    isScenarioSuggestedEventKind,
    isScenarioTargetDescriptor,
    isString,
  };
}
