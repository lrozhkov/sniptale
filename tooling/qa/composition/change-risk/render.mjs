import { collectRiskReviews, resolveChangeRiskLevel } from './collector.mjs';

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

function formatReviewLines(findings) {
  const reviews = collectRiskReviews(findings);
  if (reviews.length === 0) return ['Review:', '- No architecture or security review indicated'];
  return [
    'Review:',
    ...reviews.map((review) => {
      const ids = findings
        .filter((finding) => finding.reviews.includes(review))
        .map((finding) => finding.id)
        .join(', ');
      return `- ${review === 'security' ? 'Security' : 'Architecture'} review required: ${ids}`;
    }),
  ];
}

export function formatCheckpointRiskSummary({ findings = [], steps = [] } = {}) {
  const visible = findings.slice(0, TERMINAL_RISK_LIMIT);
  const omitted = findings.length - visible.length;
  const coverage = collectCoverage(findings, steps);
  const lines = [
    `Change risk: ${resolveChangeRiskLevel(findings)}`,
    '',
    'Detected:',
    ...(visible.length === 0
      ? ['- No classified high-impact change seams']
      : visible.flatMap((finding) => [
          `- ${finding.id}`,
          ...finding.evidence
            .slice(0, TERMINAL_EVIDENCE_LIMIT)
            .map(({ detail, file }) => `  ${file}: ${detail}`),
        ])),
    ...(omitted > 0 ? [`- +${omitted} more risk families in the run log`] : []),
    '',
    'Covered by checkpoint:',
    ...(coverage.length === 0
      ? ['- No risk-specific checkpoint coverage selected']
      : coverage.map(
          ({ detail, label, status }) => `- ${label}: ${status}${detail ? ` (${detail})` : ''}`
        )),
    '',
    ...formatReviewLines(findings),
  ];
  return `${lines.join('\n')}\n`;
}

export function formatFullChangeRiskReport({ findings = [], steps = [] } = {}) {
  const coverage = collectCoverage(findings, steps);
  const lines = [
    `Change risk report: ${resolveChangeRiskLevel(findings)}`,
    '',
    'Risk findings:',
    ...(findings.length === 0
      ? ['- none']
      : findings.flatMap((finding) => [
          `- ${finding.id} (${finding.level})`,
          ...finding.evidence.map(({ detail, file }) => `  - ${file}: ${detail}`),
          `  owners: ${finding.owners.join(', ') || 'none'}`,
          `  controls: ${finding.controls.join(', ') || 'none'}`,
          `  review: ${finding.reviews.join(', ') || 'none'}`,
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
    ...formatReviewLines(findings),
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
