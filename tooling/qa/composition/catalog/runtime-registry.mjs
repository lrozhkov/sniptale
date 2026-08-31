import { QA_CONTROL_CATALOG } from './catalog.mjs';

export const OBSERVED_QA_RULES = Object.freeze(
  [...QA_CONTROL_CATALOG].sort((left, right) => left.label.localeCompare(right.label))
);

export function findObservedQaRule(label) {
  return OBSERVED_QA_RULES.find((definition) => definition.label === label);
}

export function assertObservedQaRuleId(id) {
  if (!OBSERVED_QA_RULES.some((definition) => definition.id === id)) {
    throw new Error(`Unregistered QA lifecycle step emitted: ${id}`);
  }
}
