import { HARNESS_QA_GUIDANCE } from '../core/qa-scope.mjs';

function formatList(values, emptyText = 'none') {
  return values.length === 0 ? [emptyText] : values.map((value) => `- ${value}`);
}

function formatAdvisoryFindings(findings) {
  const attention = findings.filter((finding) => finding.severity === 'attention').length;
  const watch = findings.length - attention;
  return findings.length === 0
    ? ['attention=0, watch=0']
    : [
        `attention=${attention}, watch=${watch}`,
        ...findings.map((finding) => {
          const line = finding.line == null ? '' : `:${finding.line}`;
          return `- ${finding.file}${line} [${finding.id}] ${finding.reason}`;
        }),
      ];
}

function collectScopeLines(context) {
  return [
    `Mode: ${context.mode ?? (context.fingerprint ? 'current-diff' : 'explicit-files')}`,
    `Target files (${context.targetFiles.length}):`,
    ...formatList(context.targetFiles),
    `Excluded harness files (${(context.harnessTargetFiles ?? []).length}):`,
    ...formatList(context.harnessTargetFiles ?? []),
    ...(context.targetFiles.length === 0 && (context.harnessTargetFiles ?? []).length > 0
      ? [`No product targets detected; ${HARNESS_QA_GUIDANCE}.`]
      : []),
  ];
}

function collectContractLines(report) {
  const lines = [
    ...(report.contractChecklist ?? []),
    ...(report.transitiveConsumerHints ?? []),
    ...(report.typecheckBlastRadius ?? []),
  ];
  return [
    'Contracts and consumers:',
    ...formatList([...new Set(lines)], 'not required for current targets'),
  ];
}

export function collectPreflightReportLines(report, context, guardrailReport) {
  return [
    'QA preflight: read-only context',
    '',
    'Scope:',
    ...collectScopeLines(context),
    '',
    'Owner/runtime:',
    ...formatList(report.ownerRuntime ?? []),
    '',
    'Relevant docs:',
    ...formatList(report.relevantDocs),
    '',
    'Structural pressure:',
    ...formatList(report.structuralPressure ?? []),
    '',
    ...collectContractLines(report),
    '',
    'Proof:',
    ...formatList([...new Set(report.proofHints)]),
    '',
    'Build forecast:',
    ...formatList([...new Set(guardrailReport.buildScopeForecast ?? [])]),
    '',
    'Advisory:',
    ...formatAdvisoryFindings(report.advisoryFindings ?? []),
  ];
}
