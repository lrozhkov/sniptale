import { isExecutedAsScript } from '../core/shared.mjs';
import { createOkStep } from '../core/focused-qa-results.mjs';
import { collectAndPersistAdvisoryReport } from '../core/advisory-report.helpers.mjs';
import { collectCurrentDiffContext } from '../runtime/current-diff.helpers.mjs';
import { assertDiffOnlyAdvisoryRun } from '../core/verify-advisory.state.helpers.mjs';
import { runObservedWrapper } from './observed/runner.mjs';

export function runAdvisoryVerification({ files = [] } = {}) {
  assertDiffOnlyAdvisoryRun(files);
  return collectCurrentDiffContext();
}

export function runAdvisoryWrapper({ producerRunId } = {}) {
  const context = runAdvisoryVerification();
  const report = collectAndPersistAdvisoryReport(context, {
    printReport: false,
    producerRunId,
  });
  const attentionCount = report.findings.filter(
    (finding) => finding.severity === 'attention'
  ).length;
  const watchCount = report.findings.length - attentionCount;
  return {
    context,
    skipped: context.targetFiles.length === 0,
    steps: [
      {
        ...createOkStep('Advisory report', `attention=${attentionCount}, watch=${watchCount}`),
        stdout: `${JSON.stringify(report, null, 2)}\n`,
      },
    ],
  };
}

if (isExecutedAsScript(import.meta.url)) {
  const outcome = await runObservedWrapper({
    wrapperId: 'qa:advisory',
    label: 'QA advisory',
    execute: async ({ session }) => runAdvisoryWrapper({ producerRunId: session.runId }),
  });
  process.exitCode = outcome.exitCode;
}
