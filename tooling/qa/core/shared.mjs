/**
 * Shared facade for deterministic quality gate helpers.
 */

export { filterAllowedViolations, isAllowedViolation, loadBaseline } from './shared-baseline.mjs';
export {
  emitCommandResult,
  getOptionValue,
  isExecutedAsScript,
  parseFilesArgument,
  printViolations,
  resolveExplicitOrStagedFiles,
} from './shared-cli.mjs';
export { collectCodeFiles, collectFormattableFiles } from './shared-files.mjs';
export { collectStagedFiles, runCommand, runNpm, runRepoNodeEntry } from './shared-process.mjs';
export {
  fromRelativePath,
  isCodeFile,
  isDataCarrierFile,
  isFormattableFile,
  isIgnoredRelativePath,
  isTokenBudgetFile,
  matchesAny,
  readText,
  repoRoot,
  splitLines,
  toRelativePath,
} from './shared-paths.mjs';
