import { HARNESS_QA_GUIDANCE } from '../core/qa-scope.mjs';

function formatList(values, emptyText) {
  if (values.length === 0) {
    return [emptyText];
  }

  return values.map((value) => `- ${value}`);
}

function formatAdvisoryFindings(findings) {
  if (findings.length === 0) {
    return ['none'];
  }

  return findings.map((finding) => {
    const line = finding.line == null ? '' : `:${finding.line}`;
    return `- ${finding.file}${line} ${finding.family}: ${finding.reason}`;
  });
}

function formatPreflightHints(guardrailReport) {
  return formatList(
    [
      ...guardrailReport.hints,
      ...guardrailReport.residualSeams,
      ...guardrailReport.deletedInternalAggregates,
      ...guardrailReport.thinShells,
      ...guardrailReport.falsePublicSeams,
      ...guardrailReport.pathAudits,
    ],
    'none'
  );
}

function collectTargetLines(context) {
  return [
    `Target files (${context.targetFiles.length}):`,
    ...formatList(context.targetFiles, 'none'),
    '',
    `Excluded harness files (${(context.harnessTargetFiles ?? []).length}):`,
    ...formatList(context.harnessTargetFiles ?? [], 'none'),
    ...(context.targetFiles.length === 0 && (context.harnessTargetFiles ?? []).length > 0
      ? ['', `No product targets detected; ${HARNESS_QA_GUIDANCE}.`]
      : []),
  ];
}

function collectContractLines(report) {
  return [
    'Contract checklist:',
    ...formatList(report.contractChecklist ?? [], 'not required for current targets'),
    '',
    'Transitive consumers:',
    ...formatList(report.transitiveConsumerHints ?? [], 'none'),
    '',
    'Likely typecheck blast radius:',
    ...formatList(report.typecheckBlastRadius ?? [], 'none'),
    '',
    'Target test size warnings:',
    ...formatList(report.targetTestSizeWarnings ?? [], 'none'),
  ];
}

function collectGuardrailLines(report, guardrailReport) {
  const budgetRisks = report.budgetRisks ?? [];
  const buildScopeBudgetRisks = guardrailReport.buildScopeBudgetRisks ?? [];
  const buildScopeForecast = guardrailReport.buildScopeForecast ?? [];
  return [
    'Topology first questions:',
    ...formatList(guardrailReport.topologyQuestions ?? [], 'none'),
    '',
    'Preflight hints:',
    ...formatPreflightHints(guardrailReport),
    '',
    'Budget signals:',
    ...formatList([...budgetRisks, ...buildScopeBudgetRisks], 'none'),
    '',
    'Build scope forecast:',
    ...formatList(buildScopeForecast, 'none'),
  ];
}

export function collectPreflightReportLines(report, context, guardrailReport) {
  return [
    'QA preflight: read-only context',
    '',
    ...collectTargetLines(context),
    '',
    'Relevant docs:',
    ...formatList(report.relevantDocs, 'none'),
    '',
    'Seam clusters:',
    ...formatList(guardrailReport.clusters, 'none'),
    '',
    ...collectContractLines(report),
    '',
    ...collectGuardrailLines(report, guardrailReport),
    '',
    'Advisory findings:',
    ...formatAdvisoryFindings(report.advisoryFindings),
    '',
    'Likely proof:',
    ...formatList(report.proofHints, 'none'),
  ];
}
