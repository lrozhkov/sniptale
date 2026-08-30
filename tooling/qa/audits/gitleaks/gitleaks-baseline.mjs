import fs from 'node:fs';
import path from 'node:path';

import { fromRelativePath, repoRoot } from '../../analysis/repository/shared-paths.mjs';
import { collectTechnicalDebtLinkViolations } from '../../policy/technical-debt/technical-debt-registry.mjs';
import { parseToolJson } from '../../tools/tool-cli.mjs';

export const GITLEAKS_BASELINE_SCHEMA_VERSION = 1;
export const GITLEAKS_NORMALIZATION_SCHEMA = 'gitleaks-history-v1';

const BASELINE_FINDING_KEYS = [
  'Commit',
  'File',
  'Fingerprint',
  'RuleID',
  'SniptaleDebtId',
  'SniptaleScope',
  'StartLine',
];

function normalizeRepositoryPath(filePath) {
  if (typeof filePath !== 'string' || filePath.length === 0 || path.isAbsolute(filePath)) {
    throw new TypeError('Gitleaks finding file must be repository-relative');
  }
  const normalized = filePath.replaceAll('\\', '/').replace(/^\.\//u, '');
  if (
    !normalized ||
    normalized === '..' ||
    normalized.startsWith('../') ||
    normalized.includes('/../')
  ) {
    throw new TypeError('Gitleaks finding file must be repository-relative');
  }
  return normalized;
}

export function gitleaksHistoryFingerprint(finding) {
  return [finding.Commit, finding.File, finding.RuleID, finding.StartLine].join(':');
}

function gitleaksHistoryKey(finding) {
  return [
    finding.Commit,
    finding.File,
    finding.RuleID,
    finding.StartLine,
    finding.Fingerprint,
  ].join('\0');
}

function compareHistoryFindings(left, right) {
  return (
    left.Commit.localeCompare(right.Commit) ||
    left.File.localeCompare(right.File) ||
    left.RuleID.localeCompare(right.RuleID) ||
    left.StartLine - right.StartLine ||
    left.Fingerprint.localeCompare(right.Fingerprint)
  );
}

export function normalizeGitleaksFinding(finding, { scope }) {
  if (
    !finding ||
    typeof finding !== 'object' ||
    Array.isArray(finding) ||
    typeof finding.RuleID !== 'string' ||
    finding.RuleID.length === 0 ||
    !Number.isInteger(finding.StartLine) ||
    finding.StartLine < 1 ||
    typeof finding.Fingerprint !== 'string' ||
    finding.Fingerprint.length === 0
  ) {
    throw new TypeError(
      'Gitleaks finding requires RuleID, File, positive StartLine, and Fingerprint'
    );
  }
  const normalized = {
    RuleID: finding.RuleID,
    Description:
      typeof finding.Description === 'string' && finding.Description.length > 0
        ? finding.Description
        : 'secret finding',
    File: normalizeRepositoryPath(finding.File),
    StartLine: finding.StartLine,
    Fingerprint: finding.Fingerprint,
  };
  if (scope === 'history') {
    if (!/^[0-9a-f]{40}$/u.test(finding.Commit ?? '')) {
      throw new TypeError('Gitleaks history finding requires a 40-character Commit');
    }
    normalized.Commit = finding.Commit;
    if (normalized.Fingerprint !== gitleaksHistoryFingerprint(normalized)) {
      throw new TypeError('Gitleaks history finding fingerprint does not match its complete tuple');
    }
  }
  return normalized;
}

function normalizeBaselineFinding(finding) {
  if (
    !finding ||
    typeof finding !== 'object' ||
    Array.isArray(finding) ||
    Object.keys(finding).sort().join(',') !== [...BASELINE_FINDING_KEYS].sort().join(',') ||
    finding.SniptaleScope !== 'history' ||
    typeof finding.SniptaleDebtId !== 'string' ||
    finding.SniptaleDebtId.length === 0
  ) {
    throw new TypeError('Gitleaks baseline requires exact history finding metadata and debt ID');
  }
  return {
    ...normalizeGitleaksFinding(finding, { scope: 'history' }),
    SniptaleDebtId: finding.SniptaleDebtId,
    SniptaleScope: 'history',
  };
}

function readGitleaksBaseline(baselinePath, { root = repoRoot, validateDebtLinks = true } = {}) {
  const resolved = path.isAbsolute(baselinePath) ? baselinePath : fromRelativePath(baselinePath);
  const baseline = parseToolJson(fs.readFileSync(resolved, 'utf8'), null);
  if (
    !baseline ||
    typeof baseline !== 'object' ||
    Array.isArray(baseline) ||
    Object.keys(baseline).sort().join(',') !==
      'findings,normalizationSchemaVersion,schemaVersion' ||
    baseline.schemaVersion !== GITLEAKS_BASELINE_SCHEMA_VERSION ||
    baseline.normalizationSchemaVersion !== GITLEAKS_NORMALIZATION_SCHEMA ||
    !Array.isArray(baseline.findings)
  ) {
    throw new TypeError('Gitleaks baseline must use the exact versioned history schema');
  }
  const findings = baseline.findings.map(normalizeBaselineFinding);
  const keys = findings.map(gitleaksHistoryKey);
  const fingerprints = findings.map((finding) => finding.Fingerprint);
  const debtIds = findings.map((finding) => finding.SniptaleDebtId);
  if (
    new Set(keys).size !== keys.length ||
    new Set(fingerprints).size !== fingerprints.length ||
    new Set(debtIds).size !== debtIds.length ||
    findings.some((finding, index) => finding !== [...findings].sort(compareHistoryFindings)[index])
  ) {
    throw new TypeError('Gitleaks baseline findings and debt claims must be unique and sorted');
  }
  if (validateDebtLinks) {
    const linkViolations = collectTechnicalDebtLinkViolations({
      root,
      links: findings.map((finding) => ({
        classification: 'tool-noise',
        debtId: finding.SniptaleDebtId,
        file: resolved,
        sourceKind: 'gitleaks',
        sourceKey: finding.Fingerprint,
        scope: {
          commit: finding.Commit,
          file: finding.File,
          fingerprint: finding.Fingerprint,
          line: finding.StartLine,
          rule: finding.RuleID,
        },
      })),
    });
    if (linkViolations.length > 0) {
      throw new TypeError(
        `Gitleaks baseline debt linkage is invalid: ${linkViolations[0].message}`
      );
    }
  }
  return findings;
}

function toGitleaksViolation(finding, scope) {
  return {
    rule: finding.RuleID,
    file: finding.File,
    line: finding.StartLine,
    message: `[${scope}] ${finding.Description}`,
  };
}

function partitionFindings(scopedFindings, baseline, scopes) {
  const reviewed = new Set(baseline.map(gitleaksHistoryKey));
  const history = scopedFindings
    .filter(({ scope }) => scope === 'history')
    .flatMap(({ findings }) => findings);
  const observed = new Set(history.map(gitleaksHistoryKey));
  const unexpected = scopedFindings.flatMap(({ findings, scope }) =>
    findings
      .filter((finding) => scope !== 'history' || !reviewed.has(gitleaksHistoryKey(finding)))
      .map((finding) => ({ finding, scope }))
  );
  const stale = scopes.includes('history')
    ? baseline.filter((finding) => !observed.has(gitleaksHistoryKey(finding)))
    : [];
  const unexpectedHistory = unexpected.filter(({ scope }) => scope === 'history').length;
  return { matchedCount: history.length - unexpectedHistory, stale, unexpected };
}

function staleBaselineViolation(finding) {
  return {
    rule: 'gitleaks-baseline-stale',
    file: finding.File,
    line: finding.StartLine,
    message: [
      `[history] Reviewed finding disappeared: ${finding.Fingerprint}.`,
      'Burn down the baseline and linked debt entry.',
    ].join(' '),
  };
}

export function applyGitleaksBaseline({
  baselinePath,
  scopedFindings,
  scopes,
  root = repoRoot,
  validateDebtLinks = true,
}) {
  const baseline = readGitleaksBaseline(baselinePath, { root, validateDebtLinks });
  const partitioned = partitionFindings(scopedFindings, baseline, scopes);
  return {
    summaryText: [
      `Secret scan scopes: ${scopes.join(', ')}`,
      ...(scopes.includes('history')
        ? [`Reviewed history baseline: ${partitioned.matchedCount}/${baseline.length} matched`]
        : []),
    ].join('\n'),
    violations: [
      ...partitioned.unexpected.map(({ finding, scope }) => toGitleaksViolation(finding, scope)),
      ...partitioned.stale.map(staleBaselineViolation),
    ],
  };
}
