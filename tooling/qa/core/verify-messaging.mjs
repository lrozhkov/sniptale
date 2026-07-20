/**
 * Messaging structure guardrail.
 * Blocks direct browser messaging calls outside the typed transport seam and
 * blocks new global chrome mocks in tests outside explicit infrastructure allowlists.
 */

import {
  collectCodeFiles,
  isExecutedAsScript,
  printViolations,
  repoRoot,
  toRelativePath,
} from './shared.mjs';
import { collectDefaultRuntimeMessagingImportReport } from './messaging-default-imports.mjs';
import { runAstGrepCheck } from '../audits/ast-grep.mjs';

export function collectMessagingViolations(files, { root = repoRoot } = {}) {
  const astGrepViolations = runAstGrepCheck({
    files,
    groupIds: ['messaging'],
    pathRoot: root,
  }).violations;
  const defaultImportReport = collectDefaultRuntimeMessagingImportReport(files, { root });
  return [...astGrepViolations, ...defaultImportReport.violations];
}

export function runMessagingCheck({ files = [] } = {}) {
  const hasExplicitFiles = files.length > 0;
  const targetFiles = files.length > 0 ? files : collectCodeFiles();
  const defaultImportReport = collectDefaultRuntimeMessagingImportReport(targetFiles, {
    includeRemoved: !hasExplicitFiles,
  });
  return {
    defaultRuntimeMessagingImports: defaultImportReport,
    files: targetFiles.map(toRelativePath),
    violations: [
      ...runAstGrepCheck({
        files: targetFiles,
        groupIds: ['messaging'],
      }).violations,
      ...defaultImportReport.violations,
    ],
  };
}

if (isExecutedAsScript(import.meta.url)) {
  const result = runMessagingCheck();

  if (result.violations.length > 0) {
    process.stdout.write(`${result.defaultRuntimeMessagingImports.summary}\n`);
    printViolations('Messaging guardrail violations found:', result.violations);
    process.exit(1);
  }

  process.stdout.write(`${result.defaultRuntimeMessagingImports.summary}\n`);
  process.stdout.write('Messaging guardrail passed\n');
}
