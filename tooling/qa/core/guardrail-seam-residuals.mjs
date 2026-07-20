import { collectAiLimitReport } from './ai-limit-utils.mjs';
import { fileExists, isProductionCodeFile } from './guardrail-seam-audit-helpers.mjs';
import { collectResidualSeamEntries, formatResidualSeamEntry } from './residual-seams.helpers.mjs';
import { isProductSourcePath } from './src-production-targets.mjs';

export function collectResidualSeamHints(codeFiles) {
  const targetFiles = codeFiles.filter(
    (file) => isProductSourcePath(file) && isProductionCodeFile(file) && fileExists(file)
  );
  if (targetFiles.length === 0) {
    return [];
  }

  const report = collectAiLimitReport(targetFiles, ['lines', 'tokens']);

  return collectResidualSeamEntries({
    files: targetFiles,
    lineHotspots: report.lineHotspots,
    tokenHotspots: report.tokenHotspots,
    limit: 4,
  }).map(formatResidualSeamEntry);
}
