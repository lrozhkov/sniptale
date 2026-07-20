import {
  collectMessagingSchemaCastViolations,
  runGuardrailCheck,
  runIfExecutedAsScript,
} from './audit-guardrail-core.mjs';

export { collectMessagingSchemaCastViolations };

export function runMessagingSchemaCastCheck({ files = [], scope = 'workspace' } = {}) {
  return runGuardrailCheck({
    collectViolations: collectMessagingSchemaCastViolations,
    files,
    scope,
  });
}

runIfExecutedAsScript(import.meta.url, {
  collectViolations: collectMessagingSchemaCastViolations,
  label: 'Messaging schema casts',
});
