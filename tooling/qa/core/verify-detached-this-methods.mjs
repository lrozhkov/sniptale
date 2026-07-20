import fs from 'node:fs';
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

export function collectDetachedThisMethodViolations(
  files,
  { collectIndexFiles = collectCodeFiles, indexFiles = null } = {}
) {
  const targetRecords = collectProductionTypeScriptRecords(files);
  if (targetRecords.length === 0) {
    return [];
  }

  const allIndexFiles = indexFiles ?? collectIndexFiles();
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
  collectIndexFiles = collectCodeFiles,
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
