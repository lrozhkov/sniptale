/**
 * Dead export advisory report.
 * Finds exported symbols in src/** without external importers while avoiding
 * noisy facade, barrel, registry, and type-only surfaces.
 */

import path from 'node:path';
import fs from 'node:fs';

import { Project } from 'ts-morph';

import { isExecutedAsScript, repoRoot } from './shared.mjs';
import { isProductSourcePath } from './src-production-targets.mjs';
import {
  markDynamicImportUsage,
  markImportUsage,
  markReExportUsage,
} from './verify-dead-exports.usage.mjs';

const EXPLICIT_IGNORE_FILES = new Set(['packages/platform/src/browser/app-facade-removal.test.ts']);

const PUBLIC_CONTRACT_SURFACE_PATTERNS = [
  /^apps\/extension\/src\/contracts\//u,
  /^packages\/runtime-contracts\/src\//u,
];

const PUBLIC_TYPE_ONLY_SURFACE_PATTERNS = [
  /^apps\/extension\/src\/features\/editor\/document\/shape-settings\.ts$/u,
  /^packages\/ui\/src\//u,
  /^packages\/runtime-contracts\/src\/web-snapshot\/types\.ts$/u,
];

function normalizePath(value) {
  return value.replaceAll(path.sep, '/');
}

function isSourceFileInScope(relativePath) {
  return (
    isProductSourcePath(relativePath) &&
    /\.(ts|tsx)$/.test(relativePath) &&
    !/\.test\.[cm]?[jt]sx?$/.test(relativePath) &&
    !/\.spec\.[cm]?[jt]sx?$/.test(relativePath)
  );
}

function isSameNameOwnerFacadeFile(relativePath, rootDir) {
  const extension = path.posix.extname(relativePath);
  if (extension !== '.ts' && extension !== '.tsx') {
    return false;
  }

  const ownerDirectoryPath = relativePath.slice(0, -extension.length);
  const absoluteOwnerDirectoryPath = path.join(rootDir, ownerDirectoryPath);

  return (
    path.posix.basename(relativePath, extension) === path.posix.basename(ownerDirectoryPath) &&
    fs.existsSync(absoluteOwnerDirectoryPath) &&
    fs.statSync(absoluteOwnerDirectoryPath).isDirectory()
  );
}

function isIgnoredSourceFile(relativePath, rootDir) {
  const baseName = path.posix.basename(relativePath);
  return (
    EXPLICIT_IGNORE_FILES.has(relativePath) ||
    isSameNameOwnerFacadeFile(relativePath, rootDir) ||
    baseName === 'index.ts' ||
    baseName === 'index.tsx' ||
    /\.data\.[cm]?[jt]sx?$/.test(relativePath) ||
    /\.constants\.[cm]?[jt]sx?$/.test(relativePath) ||
    /design-system-registry/.test(relativePath)
  );
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

function getRelativeSourcePath(sourceFile, rootDir) {
  return normalizePath(path.relative(rootDir, sourceFile.getFilePath()));
}

function isDeclarationOwnedBySourceFile(declaration, relativePath, rootDir) {
  return getRelativeSourcePath(declaration.getSourceFile(), rootDir) === relativePath;
}

function collectExportedDeclarationsByFile(project, rootDir) {
  const exportedDeclarationsByFile = new Map();

  for (const sourceFile of project.getSourceFiles()) {
    const relativePath = getRelativeSourcePath(sourceFile, rootDir);
    if (!isSourceFileInScope(relativePath) || isIgnoredSourceFile(relativePath, rootDir)) {
      continue;
    }

    const ownedExportedDeclarations = new Map();
    for (const [exportName, declarations] of sourceFile.getExportedDeclarations()) {
      const ownedDeclarations = declarations.filter((declaration) =>
        isDeclarationOwnedBySourceFile(declaration, relativePath, rootDir)
      );
      if (ownedDeclarations.length > 0) {
        ownedExportedDeclarations.set(exportName, ownedDeclarations);
      }
    }

    exportedDeclarationsByFile.set(relativePath, ownedExportedDeclarations);
  }

  return exportedDeclarationsByFile;
}

function collectUsedExportsByFile(project, rootDir, exportedDeclarationsByFile) {
  const usedExportsByFile = new Map();
  for (const sourceFile of project.getSourceFiles()) {
    markImportUsage(sourceFile, rootDir, exportedDeclarationsByFile, usedExportsByFile);
    markReExportUsage(sourceFile, rootDir, exportedDeclarationsByFile, usedExportsByFile);
    markDynamicImportUsage(
      project,
      sourceFile,
      rootDir,
      exportedDeclarationsByFile,
      usedExportsByFile
    );
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

function collectUnusedDeclarations(exportedDeclarationsByFile, usedExportsByFile) {
  const unusedValueExports = [];
  const unusedTypeExports = [];

  for (const [relativePath, exportedDeclarations] of exportedDeclarationsByFile.entries()) {
    const usedExports = usedExportsByFile.get(relativePath) ?? new Set();

    for (const [exportName, declarations] of exportedDeclarations) {
      if (usedExports.has('*') || usedExports.has(exportName)) {
        continue;
      }

      for (const declaration of declarations) {
        const declarationKind = declaration.getKindName();
        if (isPublicDeadExportSurface(relativePath, declarationKind)) {
          continue;
        }
        const target = isTypeOnlyDeclaration(declarationKind)
          ? unusedTypeExports
          : unusedValueExports;
        target.push({
          file: relativePath,
          exportName,
          kind: declarationKind,
        });
      }
    }
  }

  sortUnusedExports(unusedValueExports);
  sortUnusedExports(unusedTypeExports);

  return { unusedValueExports, unusedTypeExports };
}

function collectUnusedExports(project, rootDir) {
  const exportedDeclarationsByFile = collectExportedDeclarationsByFile(project, rootDir);
  const usedExportsByFile = collectUsedExportsByFile(project, rootDir, exportedDeclarationsByFile);

  return collectUnusedDeclarations(exportedDeclarationsByFile, usedExportsByFile);
}

export function runDeadExportsCheck({
  tsConfigFilePath = path.join(repoRoot, 'tsconfig.json'),
} = {}) {
  const rootDir = path.dirname(tsConfigFilePath);
  const project = new Project({
    tsConfigFilePath,
    skipAddingFilesFromTsConfig: false,
  });

  return collectUnusedExports(project, rootDir);
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
