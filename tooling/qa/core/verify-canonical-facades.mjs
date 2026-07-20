/**
 * Shared public root facade guardrail.
 * Ensures explicit shared public root facades and changed same-name owner facades
 * remain thin import/export glue only.
 */

import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

import {
  collectCodeFiles,
  isExecutedAsScript,
  parseFilesArgument,
  printViolations,
  repoRoot,
} from './shared.mjs';
import { collectChangedCodeTargets } from '../runtime/target-files.helpers.mjs';
import {
  ROOT_FACADE_FILE_PATTERN,
  collectMissingFacadeViolations,
  collectModuleReferenceLiterals,
  collectThinFacadeViolations,
  createViolation,
  isChangedOwnerFacadeCandidate,
  isLegacyRootCandidate,
  isSharedPublicRootFacadeFile,
  resolveLegacyFacadeTarget,
} from './verify-canonical-facades.helpers.mjs';

export function collectChangedOwnerFacadeFiles(relativeFiles, { root = repoRoot } = {}) {
  return [...new Set(relativeFiles)].filter(
    (relativePath) =>
      fs.existsSync(path.join(root, relativePath)) &&
      isChangedOwnerFacadeCandidate(relativePath, root)
  );
}

function includesFile(files, relativePath) {
  return files?.has?.(relativePath) || files?.includes?.(relativePath) || false;
}

function isModuleReferenceInScope(relativePath, reference, context) {
  if (!context.changedLineMap) {
    return true;
  }
  if (
    includesFile(context.addedFiles, relativePath) ||
    includesFile(context.untrackedFiles, relativePath)
  ) {
    return true;
  }
  const changedLines = context.changedLineMap.get(relativePath);
  if (!changedLines) {
    return false;
  }
  for (let line = reference.startLine; line <= reference.endLine; line += 1) {
    if (changedLines.has(line)) {
      return true;
    }
  }
  return false;
}

export function collectLegacyRootImportViolations(
  relativeFiles,
  { root = repoRoot, ...context } = {}
) {
  const violations = [];
  for (const relativePath of new Set(relativeFiles)) {
    if (
      !fs.existsSync(path.join(root, relativePath)) ||
      !ROOT_FACADE_FILE_PATTERN.test(relativePath)
    ) {
      continue;
    }

    const sourceText = fs.readFileSync(path.join(root, relativePath), 'utf8');
    const sourceFile = ts.createSourceFile(relativePath, sourceText, ts.ScriptTarget.Latest, true);

    for (const reference of collectModuleReferenceLiterals(sourceFile)) {
      const { literal, line } = reference;
      if (!isModuleReferenceInScope(relativePath, reference, context)) {
        continue;
      }
      const moduleSpecifier = literal.text;
      if (!moduleSpecifier.startsWith('.')) {
        continue;
      }

      const targetFile = resolveLegacyFacadeTarget(relativePath, moduleSpecifier, root);
      if (
        !targetFile ||
        targetFile === relativePath ||
        isSharedPublicRootFacadeFile() ||
        !isLegacyRootCandidate(targetFile, root)
      ) {
        continue;
      }

      violations.push(
        createViolation(
          'legacy-root-import',
          relativePath,
          `Internal import "${moduleSpecifier}" resolves to legacy root facade "${targetFile}". ` +
            'Import the canonical owner path instead.',
          line
        )
      );
    }
  }

  return violations;
}

export function collectCanonicalFacadeViolations(files = [], { root = repoRoot } = {}) {
  return [
    ...collectMissingFacadeViolations(files, root),
    ...collectThinFacadeViolations(files, root),
  ];
}

function resolveCanonicalFacadeRunTargets(files) {
  const targets = collectChangedCodeTargets();

  if (files.length > 0) {
    const relativeFiles = collectCodeFiles(files);
    return {
      addedFiles: new Set(targets.addedFiles),
      changedLineMap: targets.changedLineMap,
      relativeFiles,
      untrackedFiles: targets.untrackedFiles,
    };
  }

  return {
    addedFiles: new Set(targets.addedFiles),
    changedLineMap: targets.changedLineMap,
    relativeFiles: targets.files,
    untrackedFiles: targets.untrackedFiles,
  };
}

export function runCanonicalFacadeCheck({ files = [] } = {}) {
  const targets = resolveCanonicalFacadeRunTargets(files);
  const changedOwnerFacades = collectChangedOwnerFacadeFiles(targets.relativeFiles);
  const targetFiles = [...new Set(changedOwnerFacades)];

  return {
    files: targetFiles,
    violations: [
      ...collectCanonicalFacadeViolations(targetFiles, { root: repoRoot }),
      ...collectLegacyRootImportViolations(targets.relativeFiles, {
        addedFiles: targets.addedFiles,
        changedLineMap: targets.changedLineMap,
        root: repoRoot,
        untrackedFiles: targets.untrackedFiles,
      }),
    ],
  };
}

if (isExecutedAsScript(import.meta.url)) {
  const explicitFiles = parseFilesArgument(process.argv.slice(2)).map((file) => file);
  const repoWide = process.argv.slice(2).includes('--repo-wide');
  const result = runCanonicalFacadeCheck({
    files: repoWide ? collectCodeFiles() : explicitFiles,
  });
  const reportOnly = process.argv.slice(2).includes('--report-only');

  if (result.violations.length > 0) {
    printViolations('Canonical facade guardrail violations found:', result.violations);
    process.exit(reportOnly ? 0 : 1);
  }

  process.stdout.write('Canonical facade guardrail passed\n');
}
