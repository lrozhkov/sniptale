import {
  collectPrivacyFeatureSettingsViolations,
  runGuardrailCheck,
  runIfExecutedAsScript,
} from './audit-guardrail-core.mjs';

export { collectPrivacyFeatureSettingsViolations };

export function runPrivacyFeatureSettingsCheck({ files = [], scope = 'workspace' } = {}) {
  return runGuardrailCheck({
    collectViolations: collectPrivacyFeatureSettingsViolations,
    files,
    scope,
  });
}

runIfExecutedAsScript(import.meta.url, {
  collectViolations: collectPrivacyFeatureSettingsViolations,
  label: 'Privacy feature settings',
});
