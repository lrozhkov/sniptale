import {
  collectRuntimeProtocolContractViolations,
  runGuardrailCheck,
  runIfExecutedAsScript,
} from './audit-guardrail-core.mjs';

export { collectRuntimeProtocolContractViolations };

export function runRuntimeProtocolContractCheck({ files = [], scope = 'workspace' } = {}) {
  return runGuardrailCheck({
    collectViolations: collectRuntimeProtocolContractViolations,
    files,
    scope,
  });
}

runIfExecutedAsScript(import.meta.url, {
  collectViolations: collectRuntimeProtocolContractViolations,
  label: 'Runtime protocol contracts',
});
