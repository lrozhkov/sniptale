import {
  collectAdvisoryFindings,
  printAdvisoryReport,
} from './verify-advisory.collectors.helpers.mjs';
import { createAdvisoryState, writeAdvisoryState } from './verify-advisory.state.helpers.mjs';

export function collectAndPersistAdvisoryReport(
  context,
  { printReport = true, producerRunId } = {}
) {
  try {
    const targetFiles = context.qualityTargetFiles ?? context.targetFiles;
    const codeFiles = context.qualityCodeFiles ?? context.codeFiles;
    const findings = collectAdvisoryFindings({
      codeFiles,
      targetFiles,
    });

    if (printReport) {
      printAdvisoryReport({ findings });
    }
    writeAdvisoryState(
      createAdvisoryState({
        context,
        findings,
        success: true,
        skipped: context.targetFiles.length === 0,
        producerRunId,
      })
    );
    return { findings };
  } catch (error) {
    writeAdvisoryState(
      createAdvisoryState({
        context,
        findings: [],
        success: false,
        errorMessage: error instanceof Error ? error.message : String(error),
        producerRunId,
      })
    );
    throw error;
  }
}
