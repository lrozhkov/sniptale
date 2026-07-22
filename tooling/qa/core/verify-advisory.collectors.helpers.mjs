import { compareAdvisoryFindings, createAdvisoryFinding } from './advisory-catalog.data.mjs';
import { collectDetachedThisMethodViolations } from './verify-detached-this-methods.mjs';
import {
  collectCapabilityLossHints,
  collectVisualProofHints,
} from './product-proof-risk-hints.mjs';
import { printAdvisoryReport } from './verify-advisory.report.helpers.mjs';
import { runStructuralRiskCheck } from './verify-structural-risk.mjs';

export { printAdvisoryReport };

const TEST_FILE_PATTERN = /\.(?:test|spec)\.(?:ts|tsx)$/u;
const EXTENSION_UI_FILE_PATTERN =
  /^apps\/extension\/src\/(?:popup|settings|gallery|design-system|editor|video-editor|scenario-editor|web-snapshot-viewer|camera-recorder|content\/(?:overlay|selection)|ui)\//u;
const UI_CONTROLLER_PATTERN = /(?:controller|toolbar|floating|popover|panel|layers|inspector)/u;

function isUiFile(file) {
  return EXTENSION_UI_FILE_PATTERN.test(file);
}

export function collectAdvisoryFindings({ codeFiles = [], targetFiles = [] } = {}) {
  const findings = [
    ...collectStructuralFindings(codeFiles),
    ...collectUiProofGapFindings({ codeFiles, targetFiles }),
    ...collectDetachedThisMethodFindings(codeFiles),
  ];

  return findings.sort(compareAdvisoryFindings);
}

function collectStructuralFindings(codeFiles) {
  if (codeFiles.length === 0) return [];
  const report = runStructuralRiskCheck({
    files: codeFiles,
    reportScope: 'current-diff',
    enforce: true,
  }).report;
  return [...report.violations, ...report.advisories].map((finding) =>
    createAdvisoryFinding({
      id:
        finding.rule === 'structural-file-risk'
          ? 'advisory.structural-file'
          : 'advisory.structural-function',
      file: finding.file,
      line: finding.line,
      symbol: finding.symbol,
      reason: finding.reason,
      hint: finding.remediationHint,
      severity: finding.severity,
    })
  );
}

function collectWideUiReason({ codeFiles, targetFiles }) {
  const uiFiles = codeFiles.filter((file) => isUiFile(file) && UI_CONTROLLER_PATTERN.test(file));
  const testCount = targetFiles.filter((file) => TEST_FILE_PATTERN.test(file)).length;
  if (uiFiles.length < 6 || testCount >= Math.max(2, Math.ceil(uiFiles.length / 4))) {
    return null;
  }
  return `${uiFiles.length} UI/controller files changed with ${testCount} changed test file(s).`;
}

function collectUiProofGapFindings({ codeFiles, targetFiles }) {
  const reasons = [
    collectWideUiReason({ codeFiles, targetFiles }),
    ...collectVisualProofHints({ codeFiles }),
    ...collectCapabilityLossHints({ codeFiles, targetFiles }),
  ].filter(Boolean);
  return reasons.map((reason) =>
    createAdvisoryFinding({
      id: 'advisory.ui-proof-gap',
      file: codeFiles.find(isUiFile) ?? 'current diff',
      reason,
      severity:
        reason.includes('changed with') || reason.toLowerCase().includes('capability')
          ? 'attention'
          : 'watch',
    })
  );
}

function collectDetachedThisMethodFindings(codeFiles) {
  return collectDetachedThisMethodViolations(codeFiles).map((violation) =>
    createAdvisoryFinding({
      id: 'advisory.detached-this-method',
      file: violation.file,
      line: violation.line ?? null,
      reason: violation.message,
      hint: 'Wrap this-sensitive methods in closures or bind them before callback handoff.',
      severity: 'attention',
    })
  );
}
