/**
 * Dead export advisory report.
 * Finds exported symbols in src/** without external importers while avoiding
 * noisy barrel, registry, and type-only surfaces.
 */

import path from 'node:path';

import { repoRoot } from '../../../../analysis/repository/shared-paths.mjs';
import { isExecutedAsScript } from '../../../../runtime/process/shared-cli.mjs';
import { isProductSourcePath } from '../../../../analysis/repository/src-production-targets.mjs';
import { materializeSourceIndex } from '../../../../analysis/source-index/index.mjs';
import { isAllowedViolation, loadBaseline } from '../../../../policy/baselines/shared-baseline.mjs';

const PUBLIC_CONTRACT_SURFACE_PATTERNS = [
  /^apps\/extension\/src\/contracts\//u,
  /^packages\/runtime-contracts\/src\//u,
];

const PUBLIC_TYPE_ONLY_SURFACE_PATTERNS = [
  /^apps\/extension\/src\/features\/editor\/document\/shape-settings\.ts$/u,
  /^packages\/ui\/src\//u,
  /^packages\/runtime-contracts\/src\/web-snapshot\/types\.ts$/u,
];

function isSourceFileInScope(relativePath) {
  return (
    isProductSourcePath(relativePath) &&
    /\.(ts|tsx)$/.test(relativePath) &&
    !/\.test\.[cm]?[jt]sx?$/.test(relativePath) &&
    !/\.spec\.[cm]?[jt]sx?$/.test(relativePath)
  );
}

function isIgnoredSourceFile(relativePath) {
  const baseName = path.posix.basename(relativePath);
  return baseName === 'index.ts' || baseName === 'index.tsx';
}

function isTypeOnlyDeclaration(declarationKind) {
  return declarationKind === 'InterfaceDeclaration' || declarationKind === 'TypeAliasDeclaration';
}

function isPublicDeadExportSurface(relativePath, declarationKind) {
  return (
    PUBLIC_CONTRACT_SURFACE_PATTERNS.some((pattern) => pattern.test(relativePath)) ||
    (isTypeOnlyDeclaration(declarationKind) &&
      PUBLIC_TYPE_ONLY_SURFACE_PATTERNS.some((pattern) => pattern.test(relativePath)))
  );
}

function collectUsedExportsByFile(records) {
  const usedExportsByFile = new Map();
  for (const record of records) {
    for (const usage of record.usages) {
      if (!usedExportsByFile.has(usage.target)) usedExportsByFile.set(usage.target, new Set());
      for (const name of usage.names) usedExportsByFile.get(usage.target).add(name);
    }
  }
  return usedExportsByFile;
}

function sortUnusedExports(exportsList) {
  exportsList.sort((left, right) =>
    left.file === right.file
      ? left.exportName.localeCompare(right.exportName)
      : left.file.localeCompare(right.file)
  );
}

function collectUnusedDeclarations(records) {
  const unusedValueExports = [];
  const unusedTypeExports = [];
  const usedExportsByFile = collectUsedExportsByFile(records);

  for (const record of records) {
    if (!isSourceFileInScope(record.file) || isIgnoredSourceFile(record.file)) continue;
    const usedExports = usedExportsByFile.get(record.file) ?? new Set();

    for (const { exportName, kind } of record.exports) {
      if (usedExports.has('*') || usedExports.has(exportName)) {
        continue;
      }
      if (isPublicDeadExportSurface(record.file, kind)) continue;
      const target = isTypeOnlyDeclaration(kind) ? unusedTypeExports : unusedValueExports;
      target.push({ file: record.file, exportName, kind });
    }
  }

  sortUnusedExports(unusedValueExports);
  sortUnusedExports(unusedTypeExports);

  return { unusedValueExports, unusedTypeExports };
}

export function runDeadExportsCheck({
  baseline = loadBaseline(),
  tsConfigFilePath = path.join(repoRoot, 'tsconfig.json'),
  cachePath,
} = {}) {
  const index = materializeSourceIndex({ cachePath, tsConfigFilePath });
  const report = collectUnusedDeclarations(index.records);
  return {
    unusedValueExports: report.unusedValueExports.filter(
      ({ exportName, file }) =>
        !isAllowedViolation(baseline, {
          rule: 'dead-value-export',
          file,
          message: exportName,
        })
    ),
    unusedTypeExports: report.unusedTypeExports.filter(
      ({ exportName, file }) =>
        !isAllowedViolation(baseline, {
          rule: 'dead-type-export',
          file,
          message: exportName,
        })
    ),
    sourceIndexStats: index.stats,
  };
}

export function summarizeDeadExportsReport(report) {
  return {
    unusedValueExportCount: report.unusedValueExports.length,
    unusedTypeExportCount: report.unusedTypeExports.length,
  };
}

function formatExportReportSection(header, exportsList) {
  const lines = [`${header}`];
  for (const item of exportsList) {
    lines.push(`- ${item.file} :: ${item.exportName} (${item.kind})`);
  }
  lines.push('');
  return lines.join('\n');
}

export function formatDeadExportsReport(report) {
  const summary = summarizeDeadExportsReport(report);
  return [
    formatExportReportSection('Unused value exports:', report.unusedValueExports),
    formatExportReportSection('Unused type exports:', report.unusedTypeExports),
    `Dead exports report completed (${summary.unusedValueExportCount} value, ${summary.unusedTypeExportCount} type)`,
    '',
  ].join('\n');
}

if (isExecutedAsScript(import.meta.url)) {
  const report = runDeadExportsCheck();
  process.stdout.write(formatDeadExportsReport(report));
}
