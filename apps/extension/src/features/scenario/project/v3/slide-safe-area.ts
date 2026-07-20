import { SCENARIO_V3_LIMITS } from './limits';
import { isNumberInRange, isRecord } from './value-guards';

export function hasValidSlideSafeAreaBounds(value: unknown): value is Record<string, unknown> {
  return (
    isRecord(value) &&
    isNumberInRange(value['bottom'], 0, SCENARIO_V3_LIMITS.maxSafeAreaInset) &&
    isNumberInRange(value['left'], 0, SCENARIO_V3_LIMITS.maxSafeAreaInset) &&
    isNumberInRange(value['right'], 0, SCENARIO_V3_LIMITS.maxSafeAreaInset) &&
    isNumberInRange(value['top'], 0, SCENARIO_V3_LIMITS.maxSafeAreaInset)
  );
}
