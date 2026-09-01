import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { repoRoot } from '../../analysis/repository/shared-paths.mjs';

function normalizePath(filePath) {
  return String(filePath ?? '').replaceAll('\\', '/');
}

function toDirectorySegments(filePath) {
  const normalized = normalizePath(filePath);
  const directory = normalized.includes('/')
    ? normalized.slice(0, normalized.lastIndexOf('/'))
    : normalized;
  return directory.split('/').filter(Boolean);
}

function toOwnerFamily(filePath) {
  const segments = toDirectorySegments(filePath);
  if (segments[0] === 'apps' && segments[1] === 'extension' && segments[2] === 'src') {
    if (segments[3] === 'offscreen' && segments[4] === 'project-export') {
      return segments.slice(0, Math.min(5, segments.length)).join('/');
    }
    return segments.slice(0, Math.min(6, segments.length)).join('/');
  }
  if (segments[0] === 'tooling') return segments.slice(0, Math.min(3, segments.length)).join('/');
  if (segments[0] === 'scripts') return segments.slice(0, Math.min(2, segments.length)).join('/');
  if (segments[0] === 'tests' || segments[0] === 'test') {
    return segments.slice(0, Math.min(3, segments.length)).join('/');
  }
  return segments.slice(0, Math.min(3, segments.length)).join('/');
}

function commonPrefix(left, right) {
  const prefix = [];
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    if (left[index] !== right[index]) break;
    prefix.push(left[index]);
  }
  return prefix;
}

function familyKey(entry) {
  const firstFamily = toOwnerFamily(entry.firstFile.path);
  const secondFamily = toOwnerFamily(entry.secondFile.path);
  if (firstFamily && firstFamily === secondFamily) return firstFamily;
  const prefix = commonPrefix(
    toDirectorySegments(entry.firstFile.path),
    toDirectorySegments(entry.secondFile.path)
  );
  const minimumOwnerDepth = Math.min(
    firstFamily.split('/').filter(Boolean).length,
    secondFamily.split('/').filter(Boolean).length
  );
  if (prefix.length >= minimumOwnerDepth) return prefix.join('/');
  return [firstFamily, secondFamily].filter(Boolean).sort().join(' <-> ');
}

function sampleFingerprint(samplePairs) {
  return crypto
    .createHash('sha256')
    .update([...samplePairs].sort().join('\0'))
    .digest('hex');
}

export function summarizeJscpdFamilies(findings) {
  const families = new Map();
  for (const finding of findings) {
    const family = familyKey(finding);
    const entry = families.get(family) ?? { family, count: 0, lines: 0, samplePairs: [] };
    entry.count += 1;
    entry.lines += finding.lines;
    entry.samplePairs.push(`${finding.firstFile.path} <-> ${finding.secondFile.path}`);
    families.set(family, entry);
  }
  return [...families.values()]
    .map((entry) => ({
      family: entry.family,
      count: entry.count,
      lines: entry.lines,
      sampleFingerprint: sampleFingerprint(entry.samplePairs),
    }))
    .sort(
      (left, right) =>
        right.count - left.count ||
        right.lines - left.lines ||
        left.family.localeCompare(right.family)
    );
}

export function readJscpdBaseline(baselinePath, { root = repoRoot } = {}) {
  if (baselinePath === null) return null;
  const absolutePath = path.isAbsolute(baselinePath) ? baselinePath : path.join(root, baselinePath);
  let baseline;
  try {
    baseline = JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
  } catch (error) {
    throw new Error(`Required jscpd baseline is malformed: ${absolutePath}`, { cause: error });
  }
  if (baseline?.version !== 4 || !Array.isArray(baseline.allowances)) {
    throw new Error('Required jscpd baseline must contain version 4 exact tool-noise allowances');
  }
  const allowedRootKeys = new Set(['$comment', 'allowances', 'description', 'version']);
  if (Object.keys(baseline).some((key) => !allowedRootKeys.has(key))) {
    throw new Error('Required jscpd baseline contains unsupported root metadata');
  }
  const ids = new Set();
  for (const allowance of baseline.allowances) {
    const keys = Object.keys(allowance ?? {})
      .sort()
      .join(',');
    const requiredKeys =
      'classification,firstFile,id,owner,reason,removalCondition,reviewBy,secondFile';
    if (
      (keys !== requiredKeys && keys !== `${requiredKeys},targetAction`) ||
      allowance.classification !== 'tool-noise' ||
      !/^[a-f0-9]{64}$/u.test(allowance.id ?? '') ||
      !isNonEmptyString(allowance.owner) ||
      !isNonEmptyString(allowance.reason) ||
      !isNonEmptyString(allowance.removalCondition) ||
      !isReviewDate(allowance.reviewBy) ||
      (allowance.targetAction !== undefined && !isNonEmptyString(allowance.targetAction)) ||
      !isBaselineEndpoint(allowance.firstFile) ||
      !isBaselineEndpoint(allowance.secondFile)
    ) {
      throw new Error('Required jscpd baseline contains a malformed tool-noise allowance');
    }
    if (ids.has(allowance.id)) {
      throw new Error(`Required jscpd baseline contains duplicate finding id: ${allowance.id}`);
    }
    ids.add(allowance.id);
  }
  return baseline;
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isReviewDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value ?? '')) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function isBaselineEndpoint(value) {
  return (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).sort().join(',') === 'end,path,start' &&
    isNonEmptyString(value.path) &&
    !path.isAbsolute(value.path) &&
    !value.path.replaceAll('\\', '/').split('/').includes('..') &&
    Number.isInteger(value.start) &&
    value.start > 0 &&
    Number.isInteger(value.end) &&
    value.end >= value.start
  );
}

function findingFile(entry) {
  return `${entry.firstFile.path}:${entry.firstFile.start} <-> ${entry.secondFile.path}:${entry.secondFile.start}`;
}

function compactEndpoint(endpoint) {
  return { path: endpoint.path, start: endpoint.start, end: endpoint.end };
}

function allowanceMatchesFinding(allowance, finding) {
  return (
    endpointMatches(allowance.firstFile, finding.firstFile) &&
    endpointMatches(allowance.secondFile, finding.secondFile)
  );
}

function endpointMatches(allowanceEndpoint, findingEndpoint) {
  const finding = compactEndpoint(findingEndpoint);
  return (
    allowanceEndpoint.path === finding.path &&
    allowanceEndpoint.start === finding.start &&
    allowanceEndpoint.end === finding.end
  );
}

export function collectJscpdBaselineViolations(
  findings,
  baseline,
  { today = new Date().toISOString().slice(0, 10) } = {}
) {
  if (!baseline) {
    return findings.map((entry) => ({
      rule: 'jscpd-duplicate',
      file: findingFile(entry),
      message: `${entry.lines} duplicated lines`,
    }));
  }
  const expected = new Map(baseline.allowances.map((entry) => [entry.id, entry]));
  const live = new Set(findings.map((entry) => entry.id));
  const violations = [];
  for (const finding of findings) {
    const allowance = expected.get(finding.id);
    if (!allowance) {
      violations.push({
        rule: 'jscpd-unreviewed-clone',
        file: findingFile(finding),
        message: `${finding.lines} duplicated lines are not reviewed as tool noise`,
      });
    } else if (!allowanceMatchesFinding(allowance, finding)) {
      violations.push({
        rule: 'jscpd-baseline-identity-drift',
        file: findingFile(finding),
        message: `Reviewed endpoints do not match normalized finding ${finding.id}`,
      });
    }
  }
  for (const allowance of baseline.allowances) {
    if (!live.has(allowance.id)) {
      violations.push({
        rule: 'jscpd-baseline-stale',
        file: `${allowance.firstFile.path}:${allowance.firstFile.start}`,
        message: `Reviewed tool noise ${allowance.id} is absent from the current report`,
      });
    }
    if (allowance.reviewBy < today) {
      violations.push({
        rule: 'jscpd-baseline-review-expired',
        file: `${allowance.firstFile.path}:${allowance.firstFile.start}`,
        message: `Tool-noise review expired on ${allowance.reviewBy}`,
      });
    }
  }
  return violations;
}

export function formatJscpdBaselineSummary(familySummary, violations) {
  const cloneCount = familySummary.reduce((total, entry) => total + entry.count, 0);
  const lineCount = familySummary.reduce((total, entry) => total + entry.lines, 0);
  return [
    `Baseline: ${cloneCount} clone(s) / ${lineCount} duplicated lines across ${familySummary.length} families`,
    violations.length > 0 ? `Baseline violations: ${violations.length}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}
