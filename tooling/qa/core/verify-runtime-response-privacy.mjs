import {
  collectRuntimeResponsePrivacyViolations,
  runGuardrailCheck,
  runIfExecutedAsScript,
} from './audit-guardrail-core.mjs';

export { collectRuntimeResponsePrivacyViolations };

export function runRuntimeResponsePrivacyCheck({ files = [], scope = 'workspace' } = {}) {
  return runGuardrailCheck({
    collectViolations: collectRuntimeResponsePrivacyViolations,
    files,
    scope,
  });
}

runIfExecutedAsScript(import.meta.url, {
  collectViolations: collectRuntimeResponsePrivacyViolations,
  label: 'Runtime response privacy',
});
