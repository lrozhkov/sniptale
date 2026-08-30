import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import ts from 'typescript';

import { getSourceSnapshot } from '../../source/source-snapshot.mjs';

const DECLARATION_FILE_PATTERN = /\.d\.[cm]?ts$/u;
const JS_LIKE_FILE_PATTERN = /\.(?:[cm]?[jt]sx?|mjs|cjs)$/u;

function normalizeModuleSpecifierExpressions(sourceText) {
  return sourceText
    .replace(/\bimport\s*\(\s*(['"])[^'"]+\1\s*\)/gu, "import('')")
    .replace(/\b(vi\.(?:doMock|doUnmock|mock|unmock))\s*\(\s*(['"])[^'"]+\2/gu, "$1(''");
}

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
  return runGit(['diff', ...args, '--name-status', '-M']).stdout;
}

function runGit(args, { env = process.env } = {}) {
  const result = spawnSync('git', args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    env,
    maxBuffer: 16 * 1024 * 1024,
  });

  // Some WSL/Node combinations report EPERM even when Git completed with status 0.
  if (result.status !== 0) {
    return { ok: false, stdout: '' };
  }

  return { ok: true, stdout: result.stdout ?? '' };
}

function collectGitPaths(args) {
  return runGit(args).stdout.split(/\r?\n/u).filter(Boolean);
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

function collectTemporaryIndexRenames(deletedCandidates, untrackedCandidates) {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'sniptale-rename-index-'));
  const temporaryIndex = path.join(temporaryDirectory, 'index');
  const environment = { ...process.env, GIT_INDEX_FILE: temporaryIndex };

  try {
    if (!runGit(['read-tree', 'HEAD'], { env: environment }).ok) return new Map();
    if (!runGit(['add', '-A', '--'], { env: environment }).ok) return new Map();
    const result = runGit(
      ['diff', '--cached', '--name-status', '--find-renames=40%', '--diff-filter=R', 'HEAD'],
      { env: environment }
    );
    if (!result.ok) return new Map();

    return new Map(
      [...parseRenameSourceByTarget(result.stdout)].filter(
        ([target, source]) => deletedCandidates.has(source) && untrackedCandidates.has(target)
      )
    );
  } finally {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

function collectDeletedUntrackedRenameFallback(nativeMap) {
  const deletedCandidates = new Set([
    ...collectGitPaths(['diff', '--cached', '--name-only', '--diff-filter=D']),
    ...collectGitPaths(['diff', '--name-only', '--diff-filter=D']),
  ]);
  const untrackedCandidates = new Set(
    collectGitPaths(['ls-files', '--others', '--exclude-standard'])
  );
  if (deletedCandidates.size === 0 || untrackedCandidates.size === 0) return new Map();

  const nativeSources = new Set(nativeMap.values());
  const hasUnmappedDeleted = [...deletedCandidates].some((source) => !nativeSources.has(source));
  const hasUnmappedUntracked = [...untrackedCandidates].some((target) => !nativeMap.has(target));
  if (!hasUnmappedDeleted || !hasUnmappedUntracked) return new Map();

  return collectTemporaryIndexRenames(deletedCandidates, untrackedCandidates);
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

  const nativeMap = new Map([
    ...parseRenameSourceByTarget(runGitNameStatus(['--cached'])),
    ...parseRenameSourceByTarget(runGitNameStatus([])),
  ]);
  const map = new Map([...collectDeletedUntrackedRenameFallback(nativeMap), ...nativeMap]);
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

function stripTopLevelStatements(relativePath, sourceText, predicate, version) {
  const sourceFile = getSourceSnapshot({
    filePath: relativePath,
    text: sourceText,
    version,
  }).sourceFile;
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

  return memoizeValue(
    'import-or-mock-only-result',
    relativePath,
    () =>
      isDiffOnlyAfterStripping(
        relativePath,
        (statement) =>
          ts.isImportDeclaration(statement) ||
          ts.isExportDeclaration(statement) ||
          isViMockExpressionStatement(statement)
      ) || isTypeOnlyDiffFile(file)
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
      stripTopLevelStatements(relativePath, previousSource, predicate, 'HEAD')
    ) ===
    normalizeModuleSpecifierExpressions(
      stripTopLevelStatements(relativePath, currentSource, predicate, 'current')
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
        verbatimModuleSyntax: true,
      },
      fileName: relativePath,
    })
    .outputText.trim();
}

function hasNoTypeErasedRuntime(relativePath, sourceText) {
  const output = eraseTypes(relativePath, sourceText);
  return output === '' || /^export\s*\{\s*\};?$/u.test(output);
}

function isTypeOnlyDiffFile(file) {
  const relativePath = toWorkspaceRelativePath(file);
  if (DECLARATION_FILE_PATTERN.test(relativePath)) {
    return true;
  }

  const absolutePath = fromWorkspaceRelativePath(relativePath);
  if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
    return memoizeValue('type-only-result', relativePath, () => {
      const previousSource = readPreviousSource(relativePath);
      return previousSource !== null && hasNoTypeErasedRuntime(relativePath, previousSource);
    });
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
