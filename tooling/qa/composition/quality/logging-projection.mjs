/** Projects the canonical Oxlint no-console receipt into the stable logical logging control. */

import { collectChangedTargets } from '../../runtime/scope/changed-targets.helpers.mjs';
import { createSkippedStep, createViolationStep } from '../checkpoint/focused-qa-results.mjs';
import { toRelativePath } from '../../analysis/repository/shared-paths.mjs';
import {
  isProductionSrcTypeScriptFile,
  normalizeRepoSrcPath,
} from '../../analysis/repository/src-production-targets.mjs';

export const LOGGING_OXLINT_RULE = 'no-console';

function isLoggingTarget(file) {
  return isProductionSrcTypeScriptFile(normalizeRepoSrcPath(toRelativePath(file)));
}

export function resolveLoggingTargets({ files = [], scope = 'workspace' } = {}) {
  const candidates = files.length > 0 ? files : collectChangedTargets({ scope }).changedFiles;
  return candidates.filter(isLoggingTarget).map(toRelativePath);
}

export function parseNoConsoleDiagnostic(line) {
  if (!/no-console/u.test(line)) return null;
  const diagnosticPattern = new RegExp(
    '^(.*?):(\\d+):(\\d+):\\s*(.*?)\\s*\\[' +
      '(?:(?:Error|Warning|Warn)/)?(?:eslint/no-console|eslint\\(no-console\\)|no-console)' +
      '\\]\\s*$',
    'u'
  );
  const match = diagnosticPattern.exec(line);
  if (!match) {
    throw new Error(`Malformed Oxlint no-console diagnostic: ${line}`);
  }
  return {
    rule: 'raw-console-logging',
    file: toRelativePath(match[1]),
    line: Number(match[2]),
    column: Number(match[3]),
    message: match[4],
  };
}

export function projectLoggingStepFromOxlint({ step, files = [], lintedFiles = null }) {
  const targets = resolveLoggingTargets({ files: lintedFiles ?? files });
  if (targets.length === 0 || step.status === 'skipped') {
    return createSkippedStep('Logging policy');
  }
  const diagnostics = `${step.stdout ?? ''}\n${step.stderr ?? ''}`
    .split(/\r?\n/u)
    .filter(Boolean)
    .map(parseNoConsoleDiagnostic)
    .filter(Boolean)
    .filter(({ file }) => targets.includes(file));
  return createViolationStep('Logging policy', 'Logging policy violations found:', {
    violations: diagnostics,
  });
}
