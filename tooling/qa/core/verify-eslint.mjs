/**
 * Deterministic ESLint gate for staged or repo-wide files.
 */

import { ESLint } from 'eslint';

import { collectStagedFiles, isExecutedAsScript, resolveExplicitOrStagedFiles } from './shared.mjs';

function filterResults(results, { excludedRulePrefixes = [], rulePrefix = null } = {}) {
  if (!rulePrefix && excludedRulePrefixes.length === 0) {
    return results;
  }

  return results
    .map((result) => {
      const messages = result.messages.filter((message) => {
        if (rulePrefix && !message.ruleId?.startsWith(rulePrefix)) return false;
        return !excludedRulePrefixes.some((prefix) => message.ruleId?.startsWith(prefix));
      });
      const warningCount = messages.filter((message) => message.severity === 1).length;
      const errorCount = messages.filter((message) => message.severity === 2).length;

      return {
        ...result,
        messages,
        warningCount,
        errorCount,
        fatalErrorCount: messages.filter((message) => message.fatal).length,
        fixableWarningCount: messages.filter((message) => message.severity === 1 && message.fix)
          .length,
        fixableErrorCount: messages.filter((message) => message.severity === 2 && message.fix)
          .length,
      };
    })
    .filter((result) => result.warningCount > 0 || result.errorCount > 0);
}

async function summarizeEslintResultsWithInstance(
  eslint,
  results,
  { excludedRulePrefixes = [], quiet = false, rulePrefix = null, strict = false } = {}
) {
  const quietResults = quiet ? ESLint.getErrorResults(results) : results;
  const filteredResults = filterResults(quietResults, { excludedRulePrefixes, rulePrefix });
  const formatter = await eslint.loadFormatter('stylish');
  const output = formatter.format(filteredResults);
  const warningCount = filteredResults.reduce((count, result) => count + result.warningCount, 0);
  const errorCount = filteredResults.reduce((count, result) => count + result.errorCount, 0);

  return {
    failed: errorCount > 0 || (strict && warningCount > 0),
    warningCount,
    errorCount,
    output,
    results: filteredResults,
  };
}

export async function summarizeEslintResults(results, options = {}) {
  const eslint = new ESLint({ cache: true, cacheStrategy: 'content', cwd: process.cwd() });
  return summarizeEslintResultsWithInstance(eslint, results, options);
}

export async function lintWithEslint({
  excludedRulePrefixes = [],
  files = ['.'],
  overrideConfig = null,
  strict = false,
  quiet = false,
  rulePrefix = null,
} = {}) {
  const eslint = new ESLint({
    cache: true,
    cacheStrategy: 'content',
    cwd: process.cwd(),
    ...(overrideConfig ? { overrideConfig } : {}),
  });

  const lintResults = await eslint.lintFiles(files);
  return summarizeEslintResultsWithInstance(eslint, lintResults, {
    excludedRulePrefixes,
    quiet,
    rulePrefix,
    strict,
  });
}

if (isExecutedAsScript(import.meta.url)) {
  const argv = process.argv.slice(2);
  const { explicitFiles, files, useStagedFiles } = resolveExplicitOrStagedFiles(argv, {
    collectDefaultFiles: () => ['.'],
    collectStagedFiles,
  });
  const targetFiles =
    explicitFiles.length > 0 || useStagedFiles
      ? files.filter((file) => /\.(?:ts|tsx|js|mjs|cjs)$/.test(file))
      : files;

  if (targetFiles.length === 0) {
    process.stdout.write('ESLint skipped: no matching files\n');
    process.exit(0);
  }

  const { failed, output } = await lintWithEslint({
    files: targetFiles,
    strict: argv.includes('--strict'),
  });

  if (output) {
    process.stdout.write(output);
  }

  if (failed) {
    process.exit(1);
  }

  process.stdout.write('ESLint passed\n');
}
