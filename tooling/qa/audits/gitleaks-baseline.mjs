import fs from 'node:fs';

import { fromRelativePath } from '../core/shared.mjs';
import { parseToolJson } from '../tools/tool-cli.mjs';

export function gitleaksHistoryFingerprint(finding) {
  return [finding.Commit, finding.File, finding.RuleID, finding.StartLine].join(':');
}

export function gitleaksHistoryKey(finding) {
  return [
    finding.Commit,
    finding.File,
    finding.RuleID,
    finding.StartLine,
    finding.Fingerprint,
  ].join('\0');
}

function readGitleaksBaseline(baselinePath) {
  const resolved = baselinePath.startsWith('/') ? baselinePath : fromRelativePath(baselinePath);
  const baseline = parseToolJson(fs.readFileSync(resolved, 'utf8'), null);
  if (!Array.isArray(baseline)) throw new TypeError('Gitleaks baseline must be an array');
  const fingerprints = new Set();
  for (const finding of baseline) {
    if (
      finding.SniptaleScope !== 'history' ||
      typeof finding.SniptaleDebtId !== 'string' ||
      !/^[0-9a-f]{40}$/u.test(finding.Commit ?? '') ||
      typeof finding.Fingerprint !== 'string' ||
      typeof finding.File !== 'string' ||
      typeof finding.RuleID !== 'string' ||
      !Number.isInteger(finding.StartLine)
    ) {
      throw new TypeError('Gitleaks baseline requires exact history finding metadata and debt ID');
    }
    if (fingerprints.has(finding.Fingerprint)) {
      throw new TypeError(`Duplicate Gitleaks baseline fingerprint: ${finding.Fingerprint}`);
    }
    const expectedFingerprint = gitleaksHistoryFingerprint(finding);
    if (finding.Fingerprint !== expectedFingerprint) {
      throw new TypeError(
        `Gitleaks baseline fingerprint does not match finding metadata: ${finding.Fingerprint}`
      );
    }
    fingerprints.add(finding.Fingerprint);
  }
  return baseline;
}

function toGitleaksViolation(finding, scope) {
  const rule = finding.RuleID ?? finding.RuleId ?? finding.ruleID ?? 'gitleaks-secret';
  const file = finding.File ?? finding.file ?? '<unknown>';
  const line = finding.StartLine ?? finding.Line ?? finding.line;
  const description = finding.Description ?? finding.description ?? 'secret finding';
  return { rule, file, line, message: scope ? `[${scope}] ${description}` : description };
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

export function applyGitleaksBaseline({ baselinePath, scopedFindings, scopes }) {
  const baseline = readGitleaksBaseline(baselinePath);
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
