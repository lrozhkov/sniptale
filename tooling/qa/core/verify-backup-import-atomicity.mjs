import {
  collectBackupImportAtomicityViolations,
  runGuardrailCheck,
  runIfExecutedAsScript,
} from './audit-guardrail-core.mjs';

export { collectBackupImportAtomicityViolations };

export function runBackupImportAtomicityCheck({ files = [], scope = 'workspace' } = {}) {
  return runGuardrailCheck({
    collectViolations: collectBackupImportAtomicityViolations,
    files,
    scope,
  });
}

runIfExecutedAsScript(import.meta.url, {
  collectViolations: collectBackupImportAtomicityViolations,
  label: 'Backup import atomicity',
});
