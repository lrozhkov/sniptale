import { createHash } from 'node:crypto';

import { HARNESS_QA_GUIDANCE, hasHarnessVerificationQaTargets } from '../core/qa-scope.mjs';

const MAXIMUM_LIST_ITEMS = 16;
const HEAD_LIST_ITEMS = 10;
const TAIL_LIST_ITEMS = 4;
const MAXIMUM_INLINE_LIST_CHARACTERS = 1200;
const INVENTORY_ONLY_SCOPE_GUIDANCE = [
  'No product targets detected; data-only harness inventories use checkpoint owner validators',
  'without a fresh release-harness stamp. qa:build still requires that fresh checkpoint.',
].join(' ');

function digestList(values) {
  return createHash('sha256').update(JSON.stringify(values)).digest('hex');
}

function summarizeList(values) {
  if (values.length <= MAXIMUM_LIST_ITEMS) return values;
  const omitted = values.length - HEAD_LIST_ITEMS - TAIL_LIST_ITEMS;
  return [
    ...values.slice(0, HEAD_LIST_ITEMS),
    `… ${omitted} omitted; full-list-sha256=${digestList(values)}`,
    ...values.slice(-TAIL_LIST_ITEMS),
  ];
}

function summarizeInlineList(value) {
  if (value.length <= MAXIMUM_INLINE_LIST_CHARACTERS) return value;
  const separatorIndex = value.indexOf(': ');
  if (separatorIndex === -1) return value;
  const prefix = value.slice(0, separatorIndex);
  const values = value.slice(separatorIndex + 2).split(', ');
  if (values.length <= MAXIMUM_LIST_ITEMS) return value;
  return `${prefix}: ${summarizeList(values).join(', ')}`;
}

function formatList(values, emptyText = 'none') {
  return values.length === 0
    ? [emptyText]
    : summarizeList(values).map((value) => `- ${summarizeInlineList(value)}`);
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
      ? [
          hasHarnessVerificationQaTargets(context)
            ? `No product targets detected; ${HARNESS_QA_GUIDANCE}.`
            : INVENTORY_ONLY_SCOPE_GUIDANCE,
        ]
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
