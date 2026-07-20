import {
  collectHotLoopWorkViolations,
  runGuardrailCheck,
  runIfExecutedAsScript,
} from './audit-guardrail-core.mjs';

export { collectHotLoopWorkViolations };

export function runHotLoopWorkCheck({ files = [], scope = 'workspace' } = {}) {
  return runGuardrailCheck({ collectViolations: collectHotLoopWorkViolations, files, scope });
}

runIfExecutedAsScript(import.meta.url, {
  collectViolations: collectHotLoopWorkViolations,
  label: 'Hot-loop work',
});
