import {
  collectNetworkFetchPolicyViolations,
  runGuardrailCheck,
  runIfExecutedAsScript,
} from './audit-guardrail-core.mjs';

export { collectNetworkFetchPolicyViolations };

export function runNetworkFetchPolicyCheck({ files = [], scope = 'workspace' } = {}) {
  return runGuardrailCheck({
    collectViolations: collectNetworkFetchPolicyViolations,
    files,
    scope,
  });
}

runIfExecutedAsScript(import.meta.url, {
  collectViolations: collectNetworkFetchPolicyViolations,
  label: 'Network fetch policy',
});
