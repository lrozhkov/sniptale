import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

import { collectCodeFiles, isExecutedAsScript, toRelativePath } from './shared.mjs';
import {
  getNodeLine,
  runScopedCodeFileCheck,
  scanRepoScopedTypeScriptFiles,
} from './repo-scoped-typescript-scan.mjs';
import { emitScopedReportCliResult, parseScopedReportCliArgs } from './scoped-report-cli.mjs';
import { TARGET_FILE_PATTERNS } from './verify-detached-this-methods.data.mjs';
import {
  collectDetachedThisMethodReferences,
  collectThisMethodIndex,
} from './verify-detached-this-methods.helpers.mjs';

function collectProductionTypeScriptRecords(files) {
  const records = [];
  scanRepoScopedTypeScriptFiles(files, {
    includeTestLikeFiles: false,
    targetFilePatterns: TARGET_FILE_PATTERNS,
    visitFile: ({ filePath, normalizedPath, relativePath, sourceFile }) => {
      records.push({ filePath, normalizedPath, relativePath, sourceFile });
    },
  });
  return records;
}

function createSourceFile(filePath) {
  return ts.createSourceFile(
    filePath,
    fs.readFileSync(filePath, 'utf8'),
    ts.ScriptTarget.Latest,
    true
  );
}

function buildIndexRecords(files) {
  return collectProductionTypeScriptRecords(files).map((record) => ({
    ...record,
    sourceFile: record.sourceFile ?? createSourceFile(record.filePath),
  }));
}

function resolveRelativeImport(importer, specifier) {
  if (!specifier.startsWith('.')) return null;
  const base = path.resolve(path.dirname(importer), specifier);
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    `${base}.mjs`,
    path.join(base, 'index.ts'),
    path.join(base, 'index.tsx'),
  ];
  return (
    candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile()) ??
    null
  );
}

export function collectBoundedImportClosure(files) {
  const pending = files.map((file) => path.resolve(file));
  const visited = new Set();
  while (pending.length > 0) {
    const filePath = pending.shift();
    if (!filePath || visited.has(filePath) || !fs.existsSync(filePath)) continue;
    visited.add(filePath);
    const sourceFile = createSourceFile(filePath);
    for (const statement of sourceFile.statements) {
      if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier))
        continue;
      const imported = resolveRelativeImport(filePath, statement.moduleSpecifier.text);
      if (imported && !visited.has(imported)) pending.push(imported);
    }
  }
  return [...visited].sort();
}

export function collectDetachedThisMethodViolations(
  files,
  { collectIndexFiles = collectBoundedImportClosure, indexFiles = null } = {}
) {
  const targetRecords = collectProductionTypeScriptRecords(files);
  if (targetRecords.length === 0) {
    return [];
  }

  const allIndexFiles = indexFiles ?? collectIndexFiles(files);
  const recordsByPath = new Map(
    targetRecords.map((record) => [toRelativePath(record.filePath), record])
  );
  for (const record of buildIndexRecords(allIndexFiles)) {
    recordsByPath.set(toRelativePath(record.filePath), record);
  }

  const index = collectThisMethodIndex(
    [...recordsByPath.values()].map((record) => record.sourceFile)
  );
  return targetRecords.flatMap((record) =>
    collectDetachedThisMethodReferences({
      getNodeLine,
      index,
      relativePath: record.relativePath,
      sourceFile: record.sourceFile,
    })
  );
}

export function runDetachedThisMethodCheck({
  collectFiles = collectCodeFiles,
  collectIndexFiles = collectBoundedImportClosure,
  files = [],
  indexFiles = null,
  scope = 'workspace',
} = {}) {
  return runScopedCodeFileCheck({
    collectFiles,
    collectViolations: (targetFiles) =>
      collectDetachedThisMethodViolations(targetFiles, { collectIndexFiles, indexFiles }),
    files,
    scope,
  });
}

if (isExecutedAsScript(import.meta.url)) {
  const { explicitFiles, reportOnly, repoWide, scope } = parseScopedReportCliArgs(
    process.argv.slice(2)
  );
  const result = runDetachedThisMethodCheck({
    files: explicitFiles,
    scope,
  });

  process.exit(
    emitScopedReportCliResult({
      labels: {
        failureHeader: 'Detached this-sensitive method references found:',
        passedRepoWide: 'Detached this-sensitive method repo-wide inventory passed\n',
        passedWorkspace: 'Detached this-sensitive method advisory passed\n',
        reportOnlyHeader: 'Detached this-sensitive method report found references:',
        skippedRepoWide: 'Detached this-sensitive method repo-wide check skipped: no code files\n',
        skippedWorkspace: 'Detached this-sensitive method check skipped: no changed code files\n',
      },
      repoWide,
      reportOnly,
      result,
    })
  );
}
