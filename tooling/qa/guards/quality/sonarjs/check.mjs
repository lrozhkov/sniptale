import { ESLint } from 'eslint';
import globals from 'globals';
import sonarjs from 'eslint-plugin-sonarjs';
import tseslint from 'typescript-eslint';

import {
  emitScopedReportCliResult,
  parseScopedReportCliArgs,
} from '../../../composition/runtime/scoped-report-cli.mjs';
import { collectCodeFiles } from '../../../analysis/repository/shared-files.mjs';
import { isExecutedAsScript } from '../../../runtime/process/shared-cli.mjs';
import {
  fromRelativePath,
  repoRoot,
  toRelativePath,
} from '../../../analysis/repository/shared-paths.mjs';
import { loadSonarjsBaseline, reconcileSonarjsBaseline } from './sonarjs-baseline.helpers.mjs';
import { resolveScopedTargetFiles } from '../../../runtime/scope/target-files.helpers.mjs';
import { isProductSourcePath } from '../../../analysis/repository/src-production-targets.mjs';

export const SONARJS_TYPE_AWARE_RULE_IDS = [
  'sonarjs/arguments-order',
  'sonarjs/different-types-comparison',
  'sonarjs/no-misleading-array-reverse',
  'sonarjs/no-try-promise',
  'sonarjs/reduce-initial-value',
];
export const SONARJS_RULE_CONFIG = Object.fromEntries(
  SONARJS_TYPE_AWARE_RULE_IDS.map((ruleId) => [ruleId, 'error'])
);
const SONARJS_RULE_ID_SET = new Set(SONARJS_TYPE_AWARE_RULE_IDS);
const SONARJS_BASELINE_PATH = 'tooling/configs/qa/sonarjs-baseline.json';
const JS_TS_SOURCE_PATTERN = /\.(?:ts|tsx|js|mjs|cjs)$/u;
const TEST_SUPPORT_FILE_PATTERN =
  /(?:^|\/)(?:test-support\.[cm]?[jt]sx?|.*\.test-support\.[cm]?[jt]sx?)$/u;
const GENERATED_PATH_PATTERNS = [
  /^dist\//u,
  /^build\//u,
  /^temp\//u,
  /^tmp\//u,
  /^tasks\//u,
  /^docs\/tasks\//u,
  /^src\/vendor\//u,
  /^src\/.*\/vendor\//u,
  /^src\/.*\/generated\//u,
  /^src\/.*\/__generated__\//u,
  /^apps\/extension\/src\/vendor\//u,
  /^apps\/extension\/src\/.*\/vendor\//u,
  /^apps\/extension\/src\/.*\/generated\//u,
  /^apps\/extension\/src\/.*\/__generated__\//u,
];
function createSonarjsConfig(files, ignores = []) {
  return {
    files,
    ignores,
    languageOptions: {
      ecmaVersion: 'latest',
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.serviceworker,
        chrome: 'readonly',
      },
      parser: tseslint.parser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
        projectService: true,
        tsconfigRootDir: repoRoot,
      },
      sourceType: 'module',
    },
    plugins: { sonarjs },
    rules: SONARJS_RULE_CONFIG,
  };
}

export function isSonarjsProductionFile(relativePath) {
  return (
    isProductSourcePath(relativePath) &&
    JS_TS_SOURCE_PATTERN.test(relativePath) &&
    !relativePath.endsWith('.d.ts') &&
    !relativePath.includes('.test.') &&
    !relativePath.includes('.spec.') &&
    !TEST_SUPPORT_FILE_PATTERN.test(relativePath) &&
    !GENERATED_PATH_PATTERNS.some((pattern) => pattern.test(relativePath))
  );
}

export function collectSonarjsProductionFiles(explicitFiles = []) {
  return collectCodeFiles(explicitFiles).filter(isSonarjsProductionFile);
}

function createEslint() {
  return new ESLint({
    cache: false,
    cwd: repoRoot,
    errorOnUnmatchedPattern: false,
    overrideConfigFile: true,
    overrideConfig: [createSonarjsConfig(['**/*.{ts,tsx,js,mjs,cjs}'])],
  });
}

function formatEslintMessage(result, message) {
  return {
    rule: message.ruleId ?? 'sonarjs-eslint',
    file: toRelativePath(result.filePath),
    line: message.line,
    column: message.column,
    message: message.message,
  };
}

async function lintSonarjsFiles(files) {
  const results = await createEslint().lintFiles(files);
  return collectSonarjsViolationsFromEslintResults(results);
}

function collectSonarjsViolationsFromEslintResults(results) {
  return results.flatMap((result) => {
    const relativePath = toRelativePath(result.filePath);
    if (!isSonarjsProductionFile(relativePath)) return [];
    return result.messages
      .filter((message) => message.fatal || SONARJS_RULE_ID_SET.has(message.ruleId))
      .filter((message) => message.severity === 2 || message.fatal)
      .map((message) => formatEslintMessage(result, message));
  });
}

function collectTargets({ files, scope }) {
  return resolveScopedTargetFiles({
    collectFiles: collectSonarjsProductionFiles,
    files,
    relativeFilter: isSonarjsProductionFile,
    scope,
  });
}

export async function runSonarjsCheck({
  baselinePath = fromRelativePath(SONARJS_BASELINE_PATH),
  files = [],
  lintFiles = lintSonarjsFiles,
  scope = 'workspace',
} = {}) {
  const targets = collectTargets({ files, scope });
  const baseline = loadSonarjsBaseline({
    baselinePath,
    baselineRelativePath: SONARJS_BASELINE_PATH,
    isProductionFile: isSonarjsProductionFile,
    supportedRuleIds: SONARJS_TYPE_AWARE_RULE_IDS,
  });
  if (targets.files.length === 0) {
    return {
      skipped: baseline.violations.length === 0,
      files: [],
      violations: baseline.violations,
    };
  }

  const sonarViolations = await lintFiles(targets.files);
  const { staleViolations, unbaselinedViolations } = reconcileSonarjsBaseline(
    sonarViolations,
    baseline.entries,
    {
      baselineRelativePath: SONARJS_BASELINE_PATH,
      files: targets.relativeFiles,
      repoWide: scope === 'repo-wide',
    }
  );

  return {
    skipped: false,
    files: targets.relativeFiles,
    ...(staleViolations.length > 0 ? { advisories: staleViolations } : {}),
    violations: [...baseline.violations, ...unbaselinedViolations],
  };
}

function groupViolations(violations) {
  return violations
    .toSorted((left, right) =>
      [left.rule, left.file, left.line ?? 0, left.column ?? 0, left.message]
        .join('\0')
        .localeCompare(
          [right.rule, right.file, right.line ?? 0, right.column ?? 0, right.message].join('\0')
        )
    )
    .map((violation) => ({
      ...violation,
      message: `[${violation.rule}] ${violation.message}`,
    }));
}

async function runCli() {
  const { explicitFiles, reportOnly, repoWide, scope } = parseScopedReportCliArgs(
    process.argv.slice(2)
  );
  const result = await runSonarjsCheck({
    files: explicitFiles,
    scope,
  });
  const groupedResult = {
    ...result,
    violations: groupViolations(result.violations),
  };
  const exitCode = emitScopedReportCliResult({
    labels: {
      failureHeader: 'SonarJS violations found:',
      passedRepoWide: 'SonarJS: OK (repo-wide production scan)\n',
      passedWorkspace: 'SonarJS: OK (focused production scan)\n',
      reportOnlyHeader: 'SonarJS report-only findings:',
      skippedRepoWide: 'SonarJS: skipped (no production files)\n',
      skippedWorkspace: 'SonarJS: skipped (no changed production files)\n',
    },
    repoWide,
    reportOnly,
    result: groupedResult,
  });
  process.exitCode = exitCode;
}

if (isExecutedAsScript(import.meta.url)) {
  await runCli();
}
