import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import ts from 'typescript';

import { normalizeModuleSpecifierExpressions } from './import-only-diff-normalizer.mjs';

const DECLARATION_FILE_PATTERN = /\.d\.[cm]?ts$/u;
const JS_LIKE_FILE_PATTERN = /\.(?:[cm]?[jt]sx?|mjs|cjs)$/u;

function runGitShowHead(relativePath) {
  const result = spawnSync('git', ['show', `HEAD:${relativePath}`], {
    cwd: process.cwd(),
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });

  if (result.stdout) {
    return result.stdout;
  }

  if (result.status !== 0 || result.error) {
    return null;
  }

  return result.stdout;
}

function runGitNameStatus(args) {
  const result = spawnSync('git', ['diff', ...args, '--name-status', '-M'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });

  if (result.stdout) {
    return result.stdout;
  }

  if (result.status !== 0 || result.error) {
    return '';
  }

  return result.stdout;
}

function parseRenameSourceByTarget(nameStatusText) {
  const renameSourceByTarget = new Map();

  for (const line of nameStatusText.split(/\r?\n/u)) {
    const [status, source, target] = line.split('\t');
    if (!status?.startsWith('R') || !source || !target) {
      continue;
    }

    renameSourceByTarget.set(target, source);
  }

  return renameSourceByTarget;
}

let renameSourceByTargetCache = null;
const cwdScopedCaches = new Map();

function memoizeValue(cacheName, key, readValue) {
  const cwd = process.cwd();
  const existingCache = cwdScopedCaches.get(cacheName);
  const cache =
    existingCache?.cwd === cwd
      ? existingCache
      : {
          cwd,
          map: new Map(),
        };
  cwdScopedCaches.set(cacheName, cache);
  if (!cache.map.has(key)) {
    cache.map.set(key, readValue());
  }

  return cache.map.get(key);
}

export function collectRenameSourceByTarget() {
  const cwd = process.cwd();
  if (renameSourceByTargetCache?.cwd === cwd) {
    return renameSourceByTargetCache.map;
  }

  const map = new Map([
    ...parseRenameSourceByTarget(runGitNameStatus(['--cached'])),
    ...parseRenameSourceByTarget(runGitNameStatus([])),
  ]);
  renameSourceByTargetCache = { cwd, map };
  return map;
}

function readPreviousSource(relativePath) {
  if (!relativePath) {
    return null;
  }

  return memoizeValue('previous-source', relativePath, () => {
    const renameSource = collectRenameSourceByTarget().get(relativePath);
    return (renameSource ? runGitShowHead(renameSource) : null) ?? runGitShowHead(relativePath);
  });
}

export function isRenameOnlyDiffTarget(file) {
  return collectRenameSourceByTarget().has(toWorkspaceRelativePath(file));
}

function toWorkspaceRelativePath(file) {
  const absolutePath = path.isAbsolute(file) ? file : path.join(process.cwd(), file);
  return path.relative(process.cwd(), absolutePath).replaceAll(path.sep, '/');
}

function fromWorkspaceRelativePath(relativePath) {
  return path.join(process.cwd(), relativePath);
}

function isJsLikeFile(relativePath) {
  return JS_LIKE_FILE_PATTERN.test(relativePath);
}

function isViMockExpressionStatement(statement) {
  if (!ts.isExpressionStatement(statement) || !ts.isCallExpression(statement.expression)) {
    return false;
  }

  const callee = statement.expression.expression;
  return (
    ts.isPropertyAccessExpression(callee) &&
    ts.isIdentifier(callee.expression) &&
    callee.expression.text === 'vi' &&
    (callee.name.text === 'mock' || callee.name.text === 'doMock')
  );
}

function stripTopLevelStatements(relativePath, sourceText, predicate) {
  const sourceFile = ts.createSourceFile(
    relativePath,
    sourceText,
    ts.ScriptTarget.ESNext,
    true,
    relativePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
  const statementRanges = sourceFile.statements
    .filter(predicate)
    .map((statement) => ({
      end: statement.getEnd(sourceFile),
      start: statement.getFullStart(),
    }))
    .sort((left, right) => right.start - left.start);

  let stripped = sourceText;
  for (const range of statementRanges) {
    stripped = `${stripped.slice(0, range.start)}${stripped.slice(range.end)}`;
  }

  return stripped.trim();
}

export function isImportOnlyDiffFile(file) {
  const relativePath = toWorkspaceRelativePath(file);
  if (!isJsLikeFile(relativePath)) {
    return false;
  }

  return memoizeValue(
    'import-only-result',
    relativePath,
    () =>
      isDiffOnlyAfterStripping(
        relativePath,
        (statement) => ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)
      ) || isTypeOnlyDiffFile(file)
  );
}

export function isImportOrMockOnlyDiffFile(file) {
  const relativePath = toWorkspaceRelativePath(file);
  if (!isJsLikeFile(relativePath)) {
    return false;
  }

  return memoizeValue('import-or-mock-only-result', relativePath, () =>
    isDiffOnlyAfterStripping(
      relativePath,
      (statement) =>
        ts.isImportDeclaration(statement) ||
        ts.isExportDeclaration(statement) ||
        isViMockExpressionStatement(statement)
    )
  );
}

function isDiffOnlyAfterStripping(file, predicate) {
  const relativePath = toWorkspaceRelativePath(file);
  const absolutePath = fromWorkspaceRelativePath(relativePath);
  if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
    return false;
  }

  const previousSource = readPreviousSource(relativePath);
  if (previousSource == null) {
    return false;
  }

  const currentSource = readCurrentSource(relativePath);
  if (previousSource === currentSource) {
    return isRenameOnlyDiffTarget(relativePath);
  }

  return (
    normalizeModuleSpecifierExpressions(
      stripTopLevelStatements(relativePath, previousSource, predicate)
    ) ===
    normalizeModuleSpecifierExpressions(
      stripTopLevelStatements(relativePath, currentSource, predicate)
    )
  );
}

function readCurrentSource(relativePath) {
  return memoizeValue('current-source', relativePath, () =>
    fs.readFileSync(fromWorkspaceRelativePath(relativePath), 'utf8')
  );
}

function eraseTypes(relativePath, sourceText) {
  return ts
    .transpileModule(sourceText, {
      compilerOptions: {
        jsx: ts.JsxEmit.ReactJSX,
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ESNext,
      },
      fileName: relativePath,
    })
    .outputText.trim();
}

function isTypeOnlyDiffFile(file) {
  const relativePath = toWorkspaceRelativePath(file);
  if (DECLARATION_FILE_PATTERN.test(relativePath)) {
    return true;
  }

  const absolutePath = fromWorkspaceRelativePath(relativePath);
  if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
    return false;
  }

  return memoizeValue('type-only-result', relativePath, () => {
    const previousSource = readPreviousSource(relativePath);
    if (previousSource == null) {
      return false;
    }

    const currentSource = readCurrentSource(relativePath);
    if (previousSource === currentSource) {
      return false;
    }

    return eraseTypes(relativePath, previousSource) === eraseTypes(relativePath, currentSource);
  });
}

export function filterImportOnlyDiffFiles(files) {
  return files.filter((file) => !isImportOnlyDiffFile(file));
}

export function filterImportOrMockOnlyDiffFiles(files) {
  return files.filter((file) => !isImportOrMockOnlyDiffFile(file));
}
