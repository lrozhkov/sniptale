import {
  collectStatsCounterSemanticsViolations,
  runGuardrailCheck,
  runIfExecutedAsScript,
} from './audit-guardrail-core.mjs';

export { collectStatsCounterSemanticsViolations };

export function runStatsCounterSemanticsCheck({ files = [], scope = 'workspace' } = {}) {
  return runGuardrailCheck({
    collectViolations: collectStatsCounterSemanticsViolations,
    files,
    scope,
  });
}

runIfExecutedAsScript(import.meta.url, {
  collectViolations: collectStatsCounterSemanticsViolations,
  label: 'Stats counter semantics',
});
