/**
 * Messaging structure guardrail.
 * Blocks direct browser messaging calls outside the typed transport seam and
 * blocks new global chrome mocks in tests outside explicit infrastructure allowlists.
 */

import fs from 'node:fs';
import path from 'node:path';

import { collectCodeFiles } from '../../analysis/repository/shared-files.mjs';
import { repoRoot, toRelativePath } from '../../analysis/repository/shared-paths.mjs';
import { isExecutedAsScript, printViolations } from '../../runtime/process/shared-cli.mjs';
import { collectDefaultRuntimeMessagingImportReport } from './messaging/messaging-default-imports.mjs';
import { DEFAULT_RUNTIME_MESSAGING_IMPORT_BASELINE } from '../../policy/messaging/messaging.mjs';
import { projectAstGrepReceipt, runAstGrepCheck } from '../../audits/ast-grep/ast-grep.mjs';

function collectBaselineFiles(baseline, root) {
  return [...new Set([...baseline].map((key) => key.slice(0, key.lastIndexOf('#'))))].map((file) =>
    path.join(root, file)
  );
}

function isBaselineOwnedTarget(file, baseline, root) {
  const relativePath = path.isAbsolute(file) ? path.relative(root, file) : file;
  return [...baseline].some((key) => key.startsWith(`${relativePath.replaceAll('\\', '/')}#`));
}

export function collectMessagingViolations(files, { astGrepReceipt = null, root = repoRoot } = {}) {
  const astGrepViolations = (
    astGrepReceipt
      ? projectAstGrepReceipt(astGrepReceipt, ['messaging'])
      : runAstGrepCheck({ files, groupIds: ['messaging'], pathRoot: root })
  ).violations;
  const defaultImportReport = collectDefaultRuntimeMessagingImportReport(files, { root });
  return [...astGrepViolations, ...defaultImportReport.violations];
}

export function runMessagingCheck({
  baseline = DEFAULT_RUNTIME_MESSAGING_IMPORT_BASELINE,
  files = [],
  root = repoRoot,
  targetFiles = null,
  astGrepReceipt = null,
} = {}) {
  const changedFiles = targetFiles ?? files;
  const fullScan = targetFiles === null && files.length === 0;
  const shouldScan =
    fullScan ||
    files.length > 0 ||
    changedFiles.some((file) => isBaselineOwnedTarget(file, baseline, root));
  if (!shouldScan) {
    return {
      defaultRuntimeMessagingImports: collectDefaultRuntimeMessagingImportReport([], {
        baseline,
        root,
      }),
      files: [],
      skipped: true,
      violations: [],
    };
  }
  const scopedFiles = files.length > 0 ? files : fullScan ? collectCodeFiles() : [];
  const scanFiles = [
    ...new Set(
      [...scopedFiles, ...collectBaselineFiles(baseline, root)].map((file) =>
        path.isAbsolute(file) ? file : path.join(root, file)
      )
    ),
  ];
  const defaultImportReport = collectDefaultRuntimeMessagingImportReport(scanFiles, {
    baseline,
    includeRemoved: true,
    root,
  });
  return {
    defaultRuntimeMessagingImports: defaultImportReport,
    files: scanFiles.map(toRelativePath),
    violations: [
      ...(astGrepReceipt
        ? projectAstGrepReceipt(astGrepReceipt, ['messaging'])
        : runAstGrepCheck({
            files: scanFiles.filter((file) => fs.existsSync(file)),
            groupIds: ['messaging'],
            pathRoot: root,
          })
      ).violations,
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
