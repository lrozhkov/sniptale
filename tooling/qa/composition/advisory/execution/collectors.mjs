import fs from 'node:fs';

import { compareAdvisoryFindings, createAdvisoryFinding } from '../advisory-catalog.data.mjs';
import {
  collectCapabilityLossHints,
  collectVisualProofHints,
} from '../../../proof/contracts/product-proof-risk-hints.mjs';
import { printAdvisoryReport } from './report.mjs';
import { runStructuralRiskCheck } from '../../../analysis/structural-risk/check.mjs';
import { collectRootScatterViolations } from '../../../guards/quality/root-scatter/check.mjs';
import {
  collectDocumentationProseAdvisories,
  DOCUMENTATION_FACTS_POLICY,
} from '../../../policy/documentation/documentation-facts/check.mjs';
import { collectOversizedInlineLiteralViolations } from '../../../guards/quality/readability/inline-literals/check.mjs';
import { readText } from '../../../analysis/repository/shared-paths.mjs';

export { printAdvisoryReport };

const TEST_FILE_PATTERN = /\.(?:test|spec)\.[cm]?[jt]sx?$/u;
const EXTENSION_UI_FILE_PATTERN =
  /^apps\/extension\/src\/(?:popup|settings|gallery|design-system|editor|video-editor|scenario-editor|web-snapshot-viewer|camera-recorder|content\/(?:overlay|selection)|ui)\//u;
const UI_CONTROLLER_PATTERN = /(?:controller|toolbar|floating|popover|panel|layers|inspector)/u;

function isUiFile(file) {
  return !TEST_FILE_PATTERN.test(file) && EXTENSION_UI_FILE_PATTERN.test(file);
}

export function collectAdvisoryFindings({
  codeFiles = [],
  targetFiles = [],
  structuralReport = null,
} = {}) {
  const findings = [
    ...collectStructuralFindings(codeFiles, structuralReport),
    ...collectRootScatterFindings(targetFiles),
    ...collectDocumentationProseFindings(targetFiles),
    ...collectOversizedInlineLiteralFindings(codeFiles),
    ...collectUiProofGapFindings({ codeFiles, targetFiles }),
  ];

  return findings.sort(compareAdvisoryFindings);
}

function collectOversizedInlineLiteralFindings(codeFiles) {
  return codeFiles
    .filter((file) => fs.existsSync(file))
    .flatMap((file) =>
      collectOversizedInlineLiteralViolations(file, readText(file)).map((violation) =>
        createAdvisoryFinding({
          id: 'advisory.oversized-inline-literal',
          file: violation.file,
          line: violation.line,
          reason: violation.message,
          severity: 'watch',
        })
      )
    );
}

function collectDocumentationProseFindings(targetFiles) {
  if (
    !targetFiles.some((file) => file.endsWith('.md')) ||
    !fs.existsSync(DOCUMENTATION_FACTS_POLICY)
  ) {
    return [];
  }
  return collectDocumentationProseAdvisories({ targetFiles }).map((advisory) =>
    createAdvisoryFinding({
      id: 'advisory.documentation-prose',
      file: advisory.file,
      reason: advisory.message,
      severity: 'watch',
    })
  );
}

function collectRootScatterFindings(targetFiles) {
  return collectRootScatterViolations(targetFiles).map((violation) =>
    createAdvisoryFinding({
      id: 'advisory.root-scatter',
      file: violation.file,
      reason: violation.message,
      severity: 'watch',
    })
  );
}

function collectStructuralFindings(codeFiles, structuralReport) {
  if (codeFiles.length === 0) return [];
  const report =
    structuralReport ??
    runStructuralRiskCheck({
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
  const testCount = targetFiles.filter(
    (file) => TEST_FILE_PATTERN.test(file) && fs.existsSync(file)
  ).length;
  if (uiFiles.length < 6 || testCount >= Math.max(2, Math.ceil(uiFiles.length / 4))) {
    return null;
  }
  return `${uiFiles.length} UI/controller files changed with ${testCount} changed test file(s).`;
}

function collectUiProofGapFindings({ codeFiles, targetFiles }) {
  const visualReasons = collectVisualProofHints({ codeFiles });
  const wideReason = collectWideUiReason({ codeFiles, targetFiles });
  const findings = [
    ...(wideReason
      ? [
          {
            hint:
              visualReasons.length > 0
                ? 'Add a behavior/proof matrix and representative visual states before closeout.'
                : 'Prove state, action, and lifecycle bindings behaviorally before closeout.',
            reason: wideReason,
            severity: 'attention',
          },
        ]
      : []),
    ...visualReasons.map((reason) => ({ reason, severity: 'watch' })),
    ...collectCapabilityLossHints({ codeFiles, targetFiles }).map((reason) => ({
      hint: 'Add a capability/proof matrix covering retained commands and failure paths.',
      reason,
      severity: 'attention',
    })),
  ];
  return findings.map(({ hint, reason, severity }) =>
    createAdvisoryFinding({
      id: 'advisory.ui-proof-gap',
      file: codeFiles.find(isUiFile) ?? 'current diff',
      hint,
      reason,
      severity,
    })
  );
}
