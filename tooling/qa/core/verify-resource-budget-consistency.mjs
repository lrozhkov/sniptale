import {
  collectResourceBudgetConsistencyViolations,
  runGuardrailCheck,
  runIfExecutedAsScript,
} from './audit-guardrail-core.mjs';

export { collectResourceBudgetConsistencyViolations };

export function runResourceBudgetConsistencyCheck({ files = [], scope = 'workspace' } = {}) {
  return runGuardrailCheck({
    collectViolations: collectResourceBudgetConsistencyViolations,
    files,
    scope,
  });
}

runIfExecutedAsScript(import.meta.url, {
  collectViolations: collectResourceBudgetConsistencyViolations,
  label: 'Resource budget consistency',
});
