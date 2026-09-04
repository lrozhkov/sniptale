import { resolveChangeRiskLevel } from './collector.mjs';

const TERMINAL_RISK_LIMIT = 5;
const TERMINAL_EVIDENCE_LIMIT = 2;

function stepStatusByLabel(steps) {
  return new Map(steps.map((step) => [step.label, step]));
}

function formatCoverageStatus(status) {
  if (status === 'ok') return 'passed';
  if (status === 'failed' || status === 'blocked') return 'failed';
  if (status === 'skipped') return 'not selected';
  return 'not emitted';
}

function collectCoverage(findings, steps) {
  const stepsByLabel = stepStatusByLabel(steps);
  const labels = [...new Set(findings.flatMap((finding) => finding.controls))].sort();
  return labels.map((label) => {
    const step = stepsByLabel.get(label);
    return {
      label,
      status: formatCoverageStatus(step?.status),
      detail: step?.detail ?? '',
    };
  });
}

const EXECUTOR_ASSESSMENT =
  'Inspect the implementation against architecture and security review triggers; ' +
  'run applicable reviews or record an implementation-specific reason why not required';

export function collectRiskRequirements(findings) {
  return [
    ...new Set([...findings.flatMap((finding) => finding.requirements), EXECUTOR_ASSESSMENT]),
  ];
}

export function createChangeRiskAnalysis(findings) {
  return {
    level: resolveChangeRiskLevel(findings),
    seams: findings.map(({ id, level, evidence, requirements, reviews }) => ({
      id,
      level,
      evidence,
      requirements,
      reviews,
    })),
    requirements: collectRiskRequirements(findings),
  };
}

function formatRiskHeading(prefix, findings) {
  const level = resolveChangeRiskLevel(findings);
  return level === null ? `${prefix}: No classified change seams detected` : `${prefix}: ${level}`;
}

export function formatCheckpointRiskSummary({ findings = [], steps = [] } = {}) {
  const visible = findings.slice(0, TERMINAL_RISK_LIMIT);
  const omitted = findings.length - visible.length;
  const coverage = collectCoverage(findings, steps);
  const lines = [
    formatRiskHeading('Change risk', findings),
    ...(visible.length === 0
      ? []
      : [
          '',
          'Detected:',
          ...visible.flatMap((finding) => [
            `- ${finding.id}`,
            ...finding.evidence
              .slice(0, TERMINAL_EVIDENCE_LIMIT)
              .map(({ detail, file }) => `  ${file}: ${detail}`),
          ]),
          ...(omitted > 0 ? [`- +${omitted} more risk families in the run log`] : []),
        ]),
    '',
    'Required:',
    ...collectRiskRequirements(findings).map((requirement) => `- ${requirement}`),
    ...(coverage.length === 0
      ? []
      : [
          '',
          'Checkpoint coverage:',
          ...coverage.map(
            ({ detail, label, status }) => `- ${label}: ${status}${detail ? ` (${detail})` : ''}`
          ),
        ]),
  ];
  return `${lines.join('\n')}\n`;
}

export function formatFullChangeRiskReport({ findings = [], steps = [] } = {}) {
  const coverage = collectCoverage(findings, steps);
  const lines = [
    formatRiskHeading('Change risk report', findings),
    '',
    'Risk findings:',
    ...(findings.length === 0
      ? ['- none']
      : findings.flatMap((finding) => [
          `- ${finding.id} (${finding.level})`,
          ...finding.evidence.map(({ detail, file }) => `  - ${file}: ${detail}`),
          `  owners: ${finding.owners.join(', ') || 'none'}`,
          `  controls: ${finding.controls.join(', ') || 'none'}`,
          `  requirements: ${finding.requirements.join(', ')}`,
          `  docs: ${finding.docs.join(', ') || 'none'}`,
        ])),
    '',
    'Checkpoint coverage:',
    ...(coverage.length === 0
      ? ['- none']
      : coverage.map(
          ({ detail, label, status }) => `- ${label}: ${status}${detail ? ` (${detail})` : ''}`
        )),
    '',
    'Required:',
    ...collectRiskRequirements(findings).map((requirement) => `- ${requirement}`),
  ];
  return `${lines.join('\n')}\n`;
}

export function formatPreflightRiskSummary(findings = []) {
  const visible = findings.slice(0, TERMINAL_RISK_LIMIT);
  return [
    'Likely risk areas:',
    ...(visible.length === 0
      ? ['- none detected for the selected files']
      : visible.map((finding) => `- ${finding.id}`)),
    ...(findings.length > visible.length
      ? [`- +${findings.length - visible.length} more in the run log`]
      : []),
  ];
}
