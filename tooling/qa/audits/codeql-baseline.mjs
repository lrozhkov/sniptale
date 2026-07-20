import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { repoRoot } from '../core/shared.mjs';
import { isExternalAuditTestLikeFile } from '../policy/index.mjs';
import { parseToolJson } from '../tools/tool-cli.mjs';

const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const FINDING_KEYS = new Set(['contentHash', 'debtId', 'file', 'line', 'messageHash', 'rule']);

function toBaselineKey(violation) {
  const messageHash =
    violation.messageHash ??
    createHash('sha256')
      .update(violation.message ?? '')
      .digest('hex');
  return [violation.rule, violation.file, violation.line ?? '', messageHash].join('\0');
}

function validateBaseline(baseline) {
  if (!baseline || typeof baseline !== 'object' || !Array.isArray(baseline.findings)) {
    throw new Error('CodeQL baseline requires a findings array');
  }
  const keys = new Set();
  for (const finding of baseline.findings) {
    if (
      !finding ||
      typeof finding !== 'object' ||
      Array.isArray(finding) ||
      typeof finding.debtId !== 'string' ||
      finding.debtId.length === 0 ||
      typeof finding.rule !== 'string' ||
      finding.rule.length === 0 ||
      typeof finding.file !== 'string' ||
      finding.file.length === 0 ||
      !Number.isInteger(finding.line) ||
      !SHA256_PATTERN.test(finding.contentHash ?? '') ||
      !SHA256_PATTERN.test(finding.messageHash ?? '')
    ) {
      throw new Error('CodeQL baseline entries require debtId, exact location, and valid hashes');
    }
    const extraKeys = Object.keys(finding).filter((key) => !FINDING_KEYS.has(key));
    if (extraKeys.length > 0) {
      throw new Error(
        `CodeQL baseline metadata belongs in the technical-debt registry: ${extraKeys.join(', ')}`
      );
    }
    const key = toBaselineKey(finding);
    if (keys.has(key)) {
      throw new Error(
        `CodeQL baseline contains a duplicate finding: ${finding.rule}:${finding.file}`
      );
    }
    keys.add(key);
  }
}

function readBaseline(baselinePath) {
  if (!baselinePath) return null;
  const absolutePath = path.isAbsolute(baselinePath)
    ? baselinePath
    : path.join(repoRoot, baselinePath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Required CodeQL baseline is missing: ${absolutePath}`);
  }
  const baseline = parseToolJson(fs.readFileSync(absolutePath, 'utf8'), { findings: [] });
  validateBaseline(baseline);
  return baseline;
}

function sourceContentHash(file, sourceRoot) {
  const absolutePath = path.isAbsolute(file) ? file : path.join(sourceRoot, file);
  return fs.existsSync(absolutePath)
    ? createHash('sha256').update(fs.readFileSync(absolutePath)).digest('hex')
    : null;
}

function baselineViolation(rule, finding, message) {
  return { rule, file: finding.file, line: finding.line, message };
}

function findUnclaimedIndex(violations, claimed, key) {
  return violations.findIndex(
    (violation, index) => !claimed.has(index) && toBaselineKey(violation) === key
  );
}

function partitionViolations(violations, baseline, sourceRoot) {
  const claimed = new Set();
  const baselineViolations = [];
  let baselineCount = 0;
  for (const finding of baseline.findings) {
    const observedIndex = findUnclaimedIndex(violations, claimed, toBaselineKey(finding));
    const contentHash = sourceContentHash(finding.file, sourceRoot);
    if (contentHash !== finding.contentHash) {
      baselineViolations.push(
        baselineViolation(
          'codeql-baseline-content-drift',
          finding,
          `Reviewed finding source content changed for debt ${finding.debtId}.`
        )
      );
    }
    if (observedIndex < 0) {
      baselineViolations.push(
        baselineViolation(
          'codeql-baseline-stale',
          finding,
          `Reviewed finding disappeared for debt ${finding.debtId}; remove its baseline and registry entry.`
        )
      );
      continue;
    }
    claimed.add(observedIndex);
    if (contentHash === finding.contentHash) baselineCount += 1;
  }
  return {
    baselineCount,
    violations: [
      ...baselineViolations,
      ...violations.filter((_violation, index) => !claimed.has(index)),
    ],
  };
}

export function applyCodeqlBaseline({ baselinePath, sourceRoot, violations }) {
  const filtered = violations.filter((violation) => !isExternalAuditTestLikeFile(violation.file));
  const baseline = readBaseline(baselinePath);
  const partitioned = baseline
    ? partitionViolations(filtered, baseline, sourceRoot)
    : { baselineCount: 0, violations: filtered };
  return {
    ...partitioned,
    testLikeCount: violations.length - filtered.length,
  };
}

export function formatCodeqlBaselineSummary({ baselineCount, testLikeCount }) {
  const lines = [];
  if (testLikeCount > 0) lines.push(`Filtered test-like findings: ${testLikeCount}`);
  if (baselineCount > 0) lines.push(`Constrained baseline findings: ${baselineCount}`);
  return lines.join('\n');
}
