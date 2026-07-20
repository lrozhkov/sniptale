import type { ScenarioSuggestedEventKind } from '@sniptale/runtime-contracts/scenario/types/base';
import type { ScenarioTargetDescriptor } from '@sniptale/runtime-contracts/scenario/types/geometry';

export type SuggestedEventDataRecord = Record<string, string | number | boolean | null>;

export type SuggestedEventValidators = {
  hasOptionalField: (
    value: Record<string, unknown>,
    key: string,
    predicate: (value: unknown) => boolean
  ) => boolean;
  isNullable: <T>(
    predicate: (value: unknown) => value is T
  ) => (value: unknown) => value is T | null;
  isNumber: (value: unknown) => value is number;
  isRecord: (value: unknown) => value is Record<string, unknown>;
  isScenarioStringDataRecord: (value: unknown) => value is SuggestedEventDataRecord;
  isScenarioSuggestedEventKind: (value: unknown) => value is ScenarioSuggestedEventKind;
  isScenarioTargetDescriptor: (value: unknown) => value is ScenarioTargetDescriptor;
  isString: (value: unknown) => value is string;
};
