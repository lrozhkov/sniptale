import { collectFocusedGuardrailReport } from './guardrail-preflight-report.mjs';
import {
  collectAdvisoryFindings,
  printAdvisoryReport,
} from './verify-advisory.collectors.helpers.mjs';
import { createAdvisoryState, writeAdvisoryState } from './verify-advisory.state.helpers.mjs';

export function collectAndPersistAdvisoryReport(
  context,
  { printReport = true, producerRunId } = {}
) {
  const targetFiles = context.qualityTargetFiles ?? context.targetFiles;
  const codeFiles = context.qualityCodeFiles ?? context.codeFiles;
  const jsLikeFiles = context.qualityJsLikeFiles ?? context.jsLikeFiles;
  const preflightReport = collectFocusedGuardrailReport({
    targetFiles,
    codeFiles,
    addedFiles: context.addedFiles,
    jsLikeFiles,
    untrackedFiles: context.untrackedFiles,
  });
  const findings = collectAdvisoryFindings({
    codeFiles,
    targetFiles,
  });

  if (printReport) {
    printAdvisoryReport({ preflightReport, findings });
  }
  writeAdvisoryState(
    createAdvisoryState({
      context,
      success: true,
      skipped: context.targetFiles.length === 0,
      producerRunId,
    })
  );
  return { findings, preflightReport };
}
