import {
  collectResourceLifecyclePairViolations,
  runGuardrailCheck,
  runIfExecutedAsScript,
} from './audit-guardrail-core.mjs';

export { collectResourceLifecyclePairViolations };

export function runResourceLifecyclePairCheck({ files = [], scope = 'workspace' } = {}) {
  return runGuardrailCheck({
    collectViolations: collectResourceLifecyclePairViolations,
    files,
    scope,
  });
}

runIfExecutedAsScript(import.meta.url, {
  collectViolations: collectResourceLifecyclePairViolations,
  label: 'Resource lifecycle pairs',
});
