/**
 * Diff-aware suppression-directive guardrail.
 * Blocks new inline ESLint and TypeScript suppression comments in changed code.
 */

import fs from 'node:fs';
import {
  collectCodeFiles,
  isCodeFile,
  isExecutedAsScript,
  isIgnoredRelativePath,
  parseFilesArgument,
  printViolations,
  toRelativePath,
} from '../../core/shared.mjs';
import { isProductSourcePath } from '../../core/src-production-targets.mjs';
import { collectChangedTargets } from '../../runtime/changed-targets.helpers.mjs';

const SUPPRESSION_RULES = [
  {
    message:
      'introduces an ESLint suppression directive in changed code. Fix the rule violation instead of muting it inline.',
    pattern: /(^|\s)(?:\/\/|\/\*|\*)\s*eslint-(?:disable(?:-next-line|-line)?|enable)\b/u,
    rule: 'eslint-suppression-directive',
  },
  {
    message:
      'introduces a TypeScript suppression directive in changed code. ' +
      'Narrow the type locally or refactor the seam instead.',
    pattern: /(^|\s)(?:\/\/|\/\*|\*)\s*@ts-(?:ignore|expect-error|nocheck)\b/u,
    rule: 'typescript-suppression-directive',
  },
];

function isSuppressionTarget(relativePath) {
  return isCodeFile(relativePath) && !isIgnoredRelativePath(relativePath);
}

function isProductionSuppressionTarget(relativePath) {
  return (
    isSuppressionTarget(relativePath) &&
    isProductSourcePath(relativePath) &&
    !relativePath.includes('/test-harness/') &&
    !/\.(test|spec)\.[cm]?[jt]sx?$/u.test(relativePath)
  );
}

function createViolation(relativePath, line, suppressionRule) {
  return {
    rule: suppressionRule.rule,
    file: relativePath,
    line,
    message: suppressionRule.message,
  };
}

/**
 * Collect suppression-directive violations from code files.
 *
 * @param {string[]} files
 * @param {{ changedLineMap?: Map<string, Set<number>>, untrackedFiles?: Set<string> }} [options]
 * @returns {{ rule: string, file: string, line: number, message: string }[]}
 */
export function collectSuppressionDirectiveViolations(
  files,
  { changedLineMap = new Map(), untrackedFiles = new Set() } = {}
) {
  const violations = [];

  for (const filePath of files) {
    const relativePath = toRelativePath(filePath);
    if (!isSuppressionTarget(relativePath)) {
      continue;
    }

    const changedLineNumbers = untrackedFiles.has(relativePath)
      ? null
      : (changedLineMap.get(relativePath) ?? null);
    const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/u);

    for (const [index, lineText] of lines.entries()) {
      const lineNumber = index + 1;
      if (changedLineNumbers != null && !changedLineNumbers.has(lineNumber)) {
        continue;
      }

      for (const suppressionRule of SUPPRESSION_RULES) {
        if (suppressionRule.pattern.test(lineText)) {
          violations.push(createViolation(relativePath, lineNumber, suppressionRule));
          break;
        }
      }
    }
  }

  return violations;
}

/**
 * Run the suppression-directive guardrail over changed or explicit files.
 *
 * @param {{ files?: string[], scope?: 'workspace' | 'staged' | 'production' }} [options]
 * @returns {{ files: string[], violations: { rule: string, file: string, line: number, message: string }[] }}
 */
export function runSuppressionDirectiveCheck({ files = [], scope = 'workspace' } = {}) {
  if (files.length > 0) {
    const explicitFiles = files.filter((file) =>
      isProductionSuppressionTarget(toRelativePath(file))
    );

    return {
      files: explicitFiles.map(toRelativePath),
      violations: collectSuppressionDirectiveViolations(explicitFiles, {
        untrackedFiles: new Set(explicitFiles.map(toRelativePath)),
      }),
    };
  }

  if (scope === 'production') {
    const productionFiles = collectCodeFiles().filter(isProductionSuppressionTarget);

    return {
      files: productionFiles,
      violations: collectSuppressionDirectiveViolations(productionFiles),
    };
  }

  const targets = collectChangedTargets({ scope });
  const codeFiles = targets.changedFiles.filter(isSuppressionTarget);

  return {
    files: codeFiles,
    violations: collectSuppressionDirectiveViolations(codeFiles, {
      changedLineMap: targets.changedLineMap,
      untrackedFiles: targets.untrackedFiles,
    }),
  };
}

if (isExecutedAsScript(import.meta.url)) {
  const argv = process.argv.slice(2);
  const files = parseFilesArgument(argv);
  const scope = argv.includes('--production')
    ? 'production'
    : argv.includes('--staged')
      ? 'staged'
      : 'workspace';
  const result = runSuppressionDirectiveCheck({ files, scope });

  if (result.violations.length > 0) {
    printViolations('Suppression directive violations found:', result.violations);
    process.exit(1);
  }

  process.stdout.write('Suppression directive policy passed\n');
}
