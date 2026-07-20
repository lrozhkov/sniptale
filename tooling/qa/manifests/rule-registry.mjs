import { QA_RULE_DEFINITIONS, collectQaRuleDefinitions } from '../core/qa-steps/definitions.mjs';

export function collectRuleRegistry() {
  return collectQaRuleDefinitions();
}

export const RULE_REGISTRY = QA_RULE_DEFINITIONS;
