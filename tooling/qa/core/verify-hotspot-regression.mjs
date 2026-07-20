/**
 * Hotspot regression guardrail.
 * Blocks changed oversized files from growing further in lines or token budget.
 */

import fs from 'node:fs';

import { encoding_for_model } from 'tiktoken';

import { createHeadFileTextResolver } from './git-head-sources.mjs';
import { QUALITY_LIMITS } from './quality.config.mjs';
import {
  collectCodeFiles,
  isDataCarrierFile,
  isExecutedAsScript,
  isTokenBudgetFile,
  parseFilesArgument,
  printViolations,
  splitLines,
  toRelativePath,
} from './shared.mjs';
import { resolveScopedTargetFiles } from '../runtime/target-files.helpers.mjs';

function createViolation(rule, file, message) {
  return { rule, file, message };
}

function countLines(text) {
  return splitLines(text).length;
}

function createLineGrowthViolation(relativePath, previousText, currentText) {
  if (isDataCarrierFile(relativePath)) {
    return null;
  }

  const currentLines = countLines(currentText);
  const previousLines = countLines(previousText);
  if (currentLines <= QUALITY_LIMITS.maxFileLines || currentLines <= previousLines) {
    return null;
  }

  return createViolation(
    'hotspot-regression-lines',
    relativePath,
    [
      `Oversized file grew from ${previousLines} to ${currentLines} lines`,
      `(limit ${QUALITY_LIMITS.maxFileLines}).`,
    ].join(' ')
  );
}

function createTokenGrowthViolation(relativePath, previousText, currentText, encoding) {
  if (!isTokenBudgetFile(relativePath)) {
    return null;
  }

  const currentTokens = encoding.encode(currentText).length;
  const previousTokens = encoding.encode(previousText).length;
  if (currentTokens <= QUALITY_LIMITS.maxLogicTokens || currentTokens <= previousTokens) {
    return null;
  }

  return createViolation(
    'hotspot-regression-tokens',
    relativePath,
    [
      `Token-heavy file grew from ${previousTokens} to ${currentTokens} tokens`,
      `(limit ${QUALITY_LIMITS.maxLogicTokens}).`,
    ].join(' ')
  );
}

export function collectHotspotRegressionViolations(files, { getPreviousSource = null } = {}) {
  const violations = [];
  const encoding = encoding_for_model('gpt-4o-mini');
  const resolvePreviousSource =
    getPreviousSource ??
    createHeadFileTextResolver(files.map((filePath) => toRelativePath(filePath)));

  try {
    for (const filePath of files) {
      const relativePath = toRelativePath(filePath);
      const previousText = resolvePreviousSource(relativePath);
      if (previousText === null) {
        continue;
      }

      const currentText = fs.readFileSync(filePath, 'utf8');
      for (const violation of [
        createLineGrowthViolation(relativePath, previousText, currentText),
        createTokenGrowthViolation(relativePath, previousText, currentText, encoding),
      ]) {
        if (violation) {
          violations.push(violation);
        }
      }
    }
  } finally {
    encoding.free();
  }

  return violations;
}

export function runHotspotRegressionCheck({ files = [] } = {}) {
  const targets = resolveScopedTargetFiles({
    files,
    collectFiles: collectCodeFiles,
  });
  const targetFiles = targets.files;

  return {
    skipped: targetFiles.length === 0,
    files: targetFiles.map(toRelativePath),
    violations: collectHotspotRegressionViolations(targetFiles),
  };
}

if (isExecutedAsScript(import.meta.url)) {
  const explicitFiles = parseFilesArgument(process.argv.slice(2));
  const result = runHotspotRegressionCheck({ files: explicitFiles });

  if (result.skipped) {
    process.stdout.write('Hotspot regression check skipped: no changed code files\n');
    process.exit(0);
  }

  if (result.violations.length > 0) {
    printViolations('Hotspot regression violations found:', result.violations);
    process.exit(1);
  }

  process.stdout.write('Hotspot regression guardrail passed\n');
}
