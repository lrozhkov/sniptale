import ts from 'typescript';

import {
  collectDeletedWorkspaceFiles,
  collectSiblingFamilyFiles,
  countBranchNodes,
  countTopLevelFunctions,
  fileExists,
  fileReferencesTarget,
  hasExactAdjacentTest,
  hasShellChildren,
  isProductionCodeFile,
  readProductionCodeFiles,
} from './guardrail-seam-audit-helpers.mjs';
import { isCodeFile, readText, splitLines } from './shared.mjs';
import { isProductSourcePath } from './src-production-targets.mjs';

function collectRelevantReferenceFiles(targetFiles, codeFiles) {
  return [...new Set([...targetFiles, ...codeFiles])]
    .filter((file) => isCodeFile(file))
    .filter(fileExists);
}

export function collectDeletedInternalAggregateHints({ targetFiles = [], codeFiles = [] } = {}) {
  const allCodeFiles = readProductionCodeFiles();
  const referenceFiles = collectRelevantReferenceFiles(targetFiles, codeFiles);
  const missingFiles = [
    ...targetFiles.filter(
      (file) => isProductSourcePath(file) && isProductionCodeFile(file) && !fileExists(file)
    ),
    ...collectDeletedWorkspaceFiles().filter(
      (file) => isProductSourcePath(file) && isProductionCodeFile(file)
    ),
  ];
  const hints = [];

  for (const missingFile of [...new Set(missingFiles)]) {
    const siblingFamilyFiles = collectSiblingFamilyFiles(missingFile, allCodeFiles);
    if (siblingFamilyFiles.length === 0) {
      continue;
    }

    const references = referenceFiles.filter((file) => fileReferencesTarget(file, missingFile));
    if (references.length > 0) {
      hints.push(
        `deleted internal aggregate still referenced: ${missingFile} by ${references
          .slice(0, 3)
          .join(', ')}`
      );
      continue;
    }

    hints.push(
      `deleted internal aggregate detected: ${missingFile}; audit stale import/mock paths`
    );
  }

  return hints;
}

export function collectThinShellHints(codeFiles) {
  const allCodeFiles = readProductionCodeFiles();
  const hints = [];

  for (const file of codeFiles.filter(
    (entry) => isProductSourcePath(entry) && isProductionCodeFile(entry)
  )) {
    if (!fileExists(file) || !hasShellChildren(file, allCodeFiles)) {
      continue;
    }

    const source = readText(file);
    const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    const lineCount = splitLines(source).length;
    const topLevelFunctionCount = countTopLevelFunctions(sourceFile);
    const branchCount = countBranchNodes(sourceFile);

    if (lineCount <= 120 && topLevelFunctionCount <= 3 && branchCount <= 5) {
      continue;
    }

    hints.push(
      [
        `thin-shell candidate still owns local logic: ${file}`,
        `(${lineCount} lines, ${topLevelFunctionCount} top-level functions, ${branchCount} branches)`,
      ].join(' ')
    );
  }

  return hints;
}

export function collectOwnerLocalProofHints(codeFiles) {
  const allCodeFiles = readProductionCodeFiles();
  const hints = [];

  for (const file of codeFiles.filter(
    (entry) => isProductSourcePath(entry) && isProductionCodeFile(entry)
  )) {
    if (!fileExists(file) || hasShellChildren(file, allCodeFiles)) {
      continue;
    }

    if (collectSiblingFamilyFiles(file, allCodeFiles).length === 0 || hasExactAdjacentTest(file)) {
      continue;
    }

    hints.push(
      `owner-local proof may be missing: ${file} has same-family seams but no exact adjacent test file`
    );
  }

  return hints;
}
