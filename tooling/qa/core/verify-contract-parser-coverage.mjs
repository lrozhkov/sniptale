import {
  collectContractParserCoverageViolations,
  runGuardrailCheck,
  runIfExecutedAsScript,
} from './audit-guardrail-core.mjs';

export { collectContractParserCoverageViolations };

export function runContractParserCoverageCheck({ files = [], scope = 'workspace' } = {}) {
  return runGuardrailCheck({
    collectViolations: collectContractParserCoverageViolations,
    files,
    scope,
  });
}

runIfExecutedAsScript(import.meta.url, {
  collectViolations: collectContractParserCoverageViolations,
  label: 'Contract parser coverage',
});
