import {
  collectStateMachineProofViolations,
  runGuardrailCheck,
  runIfExecutedAsScript,
} from './audit-guardrail-core.mjs';

export { collectStateMachineProofViolations };

export function runStateMachineProofCheck({ files = [], scope = 'workspace' } = {}) {
  return runGuardrailCheck({ collectViolations: collectStateMachineProofViolations, files, scope });
}

runIfExecutedAsScript(import.meta.url, {
  collectViolations: collectStateMachineProofViolations,
  label: 'State-machine proof',
});
