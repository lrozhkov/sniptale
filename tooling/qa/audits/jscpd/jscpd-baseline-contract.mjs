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
  if (
    baseline?.version !== 3 ||
    !Array.isArray(baseline.families) ||
    baseline.families.some(
      (entry) =>
        typeof entry?.family !== 'string' ||
        !Number.isInteger(entry.count) ||
        !Number.isInteger(entry.lines) ||
        !/^[a-f0-9]{64}$/u.test(entry.sampleFingerprint)
    )
  ) {
    throw new Error('Required jscpd baseline must contain the complete version 3 family inventory');
  }
  return baseline;
}

function violation(entry, rule, message) {
  return { rule, file: entry.family, message };
}

export function collectJscpdBaselineViolations(familySummary, baseline) {
  if (!baseline) {
    return familySummary.map((entry) =>
      violation(
        entry,
        'jscpd-duplicate',
        `${entry.count} clone(s), ${entry.lines} duplicated lines`
      )
    );
  }
  const expected = new Map(baseline.families.map((entry) => [entry.family, entry]));
  const live = new Set(familySummary.map((entry) => entry.family));
  const violations = familySummary.flatMap((entry) => {
    const admitted = expected.get(entry.family);
    if (!admitted) {
      return [violation(entry, 'jscpd-baseline-growth', `${entry.family} is not in the baseline`)];
    }
    if (entry.count !== admitted.count || entry.lines !== admitted.lines) {
      const direction =
        entry.count < admitted.count || entry.lines < admitted.lines
          ? 'jscpd-baseline-headroom'
          : 'jscpd-baseline-growth';
      return [
        violation(
          entry,
          direction,
          `${entry.family} measured count=${entry.count}, lines=${entry.lines}; baseline count=${admitted.count}, lines=${admitted.lines}`
        ),
      ];
    }
    return entry.sampleFingerprint === admitted.sampleFingerprint
      ? []
      : [
          violation(
            entry,
            'jscpd-baseline-sample-drift',
            `${entry.family} retained aggregate counts but changed its clone population`
          ),
        ];
  });
  for (const entry of baseline.families) {
    if (!live.has(entry.family)) {
      violations.push(
        violation(
          entry,
          'jscpd-baseline-stale',
          `${entry.family} is absent from the current report`
        )
      );
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
