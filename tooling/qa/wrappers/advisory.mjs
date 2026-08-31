import { isExecutedAsScript } from '../runtime/process/shared-cli.mjs';
import { createOkStep } from '../composition/checkpoint/focused-qa-results.mjs';
import { collectAndPersistAdvisoryReport } from '../composition/advisory/advisory-report.helpers.mjs';
import { collectCurrentDiffContext } from '../runtime/scope/current-diff.helpers.mjs';
import { assertDiffOnlyAdvisoryRun } from '../composition/advisory/execution/state.mjs';
import { runObservedWrapper } from './observed/runner.mjs';
import { formatAdvisoryReport } from '../composition/advisory/execution/report.mjs';

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
        consoleOutput: formatAdvisoryReport(report),
        advisories: report.findings,
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
