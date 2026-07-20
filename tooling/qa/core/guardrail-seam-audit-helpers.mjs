import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import ts from 'typescript';

import { collectCodeFiles, fromRelativePath, readText } from './shared.mjs';
import { resolveImportCandidates, resolveRelativeImport } from './path-import-helpers.mjs';

const CODE_FILE_PATTERN = /\.(?:ts|tsx|js|mjs|cjs)$/u;
const TEST_FILE_PATTERN = /\.(?:test|spec)\.(?:ts|tsx)$/u;
const SUPPORT_FILE_PATTERN =
  /\.(?:test-helpers|test-support|fixtures|test\.fixtures|test\.helpers)\.(?:ts|tsx)$/u;

export function isProductionCodeFile(file) {
  return (
    CODE_FILE_PATTERN.test(file) &&
    !TEST_FILE_PATTERN.test(file) &&
    !SUPPORT_FILE_PATTERN.test(file)
  );
}

export function readProductionCodeFiles() {
  return collectCodeFiles().filter(isProductionCodeFile);
}

export function fileExists(file) {
  return fs.existsSync(fromRelativePath(file));
}

function toStem(file) {
  return path.posix.basename(file).replace(/\.(?:ts|tsx|js|mjs|cjs)$/u, '');
}

function deriveFamilyKeys(file) {
  const keys = new Set();
  let current = toStem(file);

  keys.add(current);
  for (let iteration = 0; iteration < 3; iteration += 1) {
    const dotIndex = current.lastIndexOf('.');
    const hyphenIndex = current.lastIndexOf('-');
    const nextIndex = Math.max(dotIndex, hyphenIndex);
    if (nextIndex <= 0) {
      break;
    }
    current = current.slice(0, nextIndex);
    keys.add(current);
  }

  return [...keys];
}

export function fileReferencesTarget(importer, targetFile) {
  const candidates = resolveImportCandidates(targetFile);
  const sourceFile = ts.createSourceFile(
    importer,
    readText(importer),
    ts.ScriptTarget.Latest,
    true
  );
  let found = false;

  function visit(node) {
    if (found) {
      return;
    }

    if (ts.isStringLiteralLike(node) && node.text.startsWith('.')) {
      if (candidates.has(resolveRelativeImport(importer, node.text))) {
        found = true;
        return;
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return found;
}

export function collectSiblingFamilyFiles(file, allCodeFiles) {
  const directory = path.posix.dirname(file);
  const keys = deriveFamilyKeys(file);

  return allCodeFiles.filter((candidate) => {
    if (candidate === file || path.posix.dirname(candidate) !== directory) {
      return false;
    }

    const candidateStem = toStem(candidate);
    return keys.some(
      (key) =>
        candidateStem === key ||
        candidateStem.startsWith(`${key}-`) ||
        candidateStem.startsWith(`${key}.`) ||
        key.startsWith(`${candidateStem}-`) ||
        key.startsWith(`${candidateStem}.`)
    );
  });
}

export function hasShellChildren(file, allCodeFiles) {
  const directory = path.posix.dirname(file);
  const stem = toStem(file);

  return allCodeFiles.some((candidate) => {
    if (candidate === file || path.posix.dirname(candidate) !== directory) {
      return false;
    }

    const candidateStem = toStem(candidate);
    return candidateStem.startsWith(`${stem}-`) || candidateStem.startsWith(`${stem}.`);
  });
}

export function hasExactAdjacentTest(file) {
  const directory = path.posix.dirname(file);
  const stem = toStem(file);
  const candidates = [
    `${directory}/${stem}.test.ts`,
    `${directory}/${stem}.test.tsx`,
    `${directory}/${stem}.spec.ts`,
    `${directory}/${stem}.spec.tsx`,
  ];

  return candidates.some(fileExists);
}

export function countTopLevelFunctions(sourceFile) {
  let count = 0;

  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.body) {
      count += 1;
      continue;
    }

    if (!ts.isVariableStatement(statement)) {
      continue;
    }

    for (const declaration of statement.declarationList.declarations) {
      const initializer = declaration.initializer;
      if (
        initializer &&
        (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer))
      ) {
        count += 1;
      }
    }
  }

  return count;
}

export function countBranchNodes(sourceFile) {
  let count = 0;

  function visit(node) {
    if (
      ts.isIfStatement(node) ||
      ts.isSwitchStatement(node) ||
      ts.isConditionalExpression(node) ||
      ts.isForStatement(node) ||
      ts.isWhileStatement(node) ||
      ts.isDoStatement(node)
    ) {
      count += 1;
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return count;
}

function runGit(args) {
  const executable = process.platform === 'win32' ? 'git.exe' : 'git';
  const result = spawnSync(executable, args, {
    cwd: process.cwd(),
    encoding: 'utf8',
  });

  if (result.error || result.status !== 0) {
    return [];
  }

  return result.stdout
    .split(/\r?\n/u)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function collectDeletedWorkspaceFiles() {
  const staged = runGit(['diff', '--cached', '--name-only', '--diff-filter=D']);
  const unstaged = runGit(['diff', '--name-only', '--diff-filter=D']);

  return [...new Set([...staged, ...unstaged])].sort();
}
