import {
  QA_CONTROL_CATALOG,
  collectCiClosureReport,
  collectQaOccurrences,
  selectQaControls,
} from './catalog.mjs';
export { FOCUSED_VIOLATION_STEP_TOOLS, FULL_VIOLATION_STEP_TOOLS } from './definitions.data.mjs';

export const QA_STEP_OCCURRENCES = Object.freeze(collectQaOccurrences());

export function collectQaRuleDefinitions() {
  return QA_CONTROL_CATALOG.map((control) => ({ ...control }));
}

export function collectQaStepDefinitionsByLane() {
  return Object.fromEntries(
    [...new Set(QA_STEP_OCCURRENCES.map(({ lane }) => lane))].map((lane) => [
      lane,
      collectQaOccurrences({ lane }),
    ])
  );
}

export function collectRegisteredQaTools() {
  return new Set(QA_CONTROL_CATALOG.map(({ tool }) => tool));
}

export function findQaStepDefinition({ id, label, lane } = {}) {
  return QA_STEP_OCCURRENCES.find(
    (occurrence) =>
      (id == null || occurrence.id === id) &&
      (label == null || occurrence.label === label) &&
      (lane == null || occurrence.lane === lane)
  );
}

export const QA_RULE_DEFINITIONS = Object.freeze(collectQaRuleDefinitions());
export { collectCiClosureReport, QA_CONTROL_CATALOG, selectQaControls };
