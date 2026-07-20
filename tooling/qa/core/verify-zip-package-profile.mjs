import {
  collectZipPackageProfileViolations,
  runGuardrailCheck,
  runIfExecutedAsScript,
} from './audit-guardrail-core.mjs';

export { collectZipPackageProfileViolations };

export function runZipPackageProfileCheck({ files = [], scope = 'workspace' } = {}) {
  return runGuardrailCheck({ collectViolations: collectZipPackageProfileViolations, files, scope });
}

runIfExecutedAsScript(import.meta.url, {
  collectViolations: collectZipPackageProfileViolations,
  label: 'ZIP package profile',
});
