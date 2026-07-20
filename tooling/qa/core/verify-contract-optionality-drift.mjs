import {
  collectContractOptionalityDriftViolations,
  runGuardrailCheck,
  runIfExecutedAsScript,
} from './audit-guardrail-core.mjs';

export { collectContractOptionalityDriftViolations };

export function runContractOptionalityDriftCheck({ files = [], scope = 'workspace' } = {}) {
  return runGuardrailCheck({
    collectViolations: collectContractOptionalityDriftViolations,
    files,
    scope,
  });
}

runIfExecutedAsScript(import.meta.url, {
  collectViolations: collectContractOptionalityDriftViolations,
  label: 'Contract optionality drift',
});
