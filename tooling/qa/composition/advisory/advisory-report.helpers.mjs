import { collectAdvisoryFindings, printAdvisoryReport } from './execution/collectors.mjs';
import { createAdvisoryState, writeAdvisoryState } from './execution/state.mjs';
import { classifyAdvisoryFindings } from './advisory-catalog.data.mjs';

export function collectAndPersistAdvisoryReport(
  context,
  { printReport = true, producerRunId, structuralReport = null } = {}
) {
  try {
    const targetFiles = context.qualityTargetFiles ?? context.targetFiles;
    const codeFiles = context.qualityCodeFiles ?? context.codeFiles;
    const findings = collectAdvisoryFindings({
      codeFiles,
      targetFiles,
      structuralReport,
    });

    const buckets = classifyAdvisoryFindings(findings, { mode: 'checkpoint' });
    if (printReport) {
      printAdvisoryReport({ buckets });
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
    return { buckets, findings };
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
