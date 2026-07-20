import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { repoRoot } from '../core/shared.mjs';
import { parseToolJson } from '../tools/tool-cli.mjs';
import {
  collectJscpdContractViolations,
  summarizeJscpdClassifications,
} from './jscpd-registry.mjs';

export { JSCPD_DEBT_REGISTRY_PATH, readJscpdDebtRegistry } from './jscpd-registry.mjs';

function resolveOptionalPolicyPath(policyPath) {
  if (!policyPath) {
    return null;
  }

  return path.isAbsolute(policyPath) ? policyPath : path.join(repoRoot, policyPath);
}

export function readJscpdBaseline(baselinePath) {
  const absoluteBaselinePath = resolveOptionalPolicyPath(baselinePath);
  if (!absoluteBaselinePath) {
    return null;
  }
  if (!fs.existsSync(absoluteBaselinePath)) {
    throw new Error(`Required jscpd baseline is missing: ${absoluteBaselinePath}`);
  }

  return parseToolJson(fs.readFileSync(absoluteBaselinePath, 'utf8'), { families: [] });
}

function createBaselineViolation(entry, rule, message) {
  return {
    rule,
    file: entry.samplePairs[0]?.split(' <-> ')[0] ?? entry.family,
    message,
  };
}

function createStaleBaselineViolation(entry) {
  return {
    rule: 'jscpd-baseline-stale',
    file: entry.family,
    message: `${entry.family} is in the jscpd baseline but is absent from the current report`,
  };
}

function validateBaselineEntry(entry, expected) {
  if (entry.count === expected.count && entry.lines === expected.lines) {
    const sampleFingerprint = createJscpdSampleFingerprint(entry.samplePairs);
    return sampleFingerprint === expected.sampleFingerprint
      ? null
      : createBaselineViolation(
          entry,
          'jscpd-baseline-sample-drift',
          `${entry.family} retained aggregate counts but its exact duplicate-pair population changed`
        );
  }

  if (entry.count < expected.count || entry.lines < expected.lines) {
    return createBaselineViolation(
      entry,
      'jscpd-baseline-headroom',
      [
        `${entry.family} improved to count=${entry.count}, lines=${entry.lines};`,
        'reduce the baseline to the current measured scope',
      ].join(' ')
    );
  }

  const expectedLabel = `baseline count=${expected.count}, lines=${expected.lines}`;
  return createBaselineViolation(
    entry,
    'jscpd-baseline-growth',
    `${entry.family} grew to count=${entry.count}, lines=${entry.lines} (${expectedLabel})`
  );
}

export function createJscpdSampleFingerprint(samplePairs = []) {
  return crypto
    .createHash('sha256')
    .update([...samplePairs].sort().join('\0'))
    .digest('hex');
}

export function collectJscpdBaselineViolations(familySummary, baseline, registry) {
  if (!baseline) {
    return null;
  }

  const baselineFamilies = new Map((baseline.families ?? []).map((entry) => [entry.family, entry]));
  const liveFamilies = new Set(familySummary.map((entry) => entry.family));
  const liveViolations = familySummary.flatMap((entry) => {
    const expected = baselineFamilies.get(entry.family);
    if (!expected) {
      return [
        createBaselineViolation(
          entry,
          'jscpd-baseline-growth',
          `${entry.family} is not in the triaged baseline`
        ),
      ];
    }

    const violation = validateBaselineEntry(entry, expected);
    return violation ? [violation] : [];
  });
  const staleViolations = (baseline.families ?? [])
    .filter((entry) => !liveFamilies.has(entry.family))
    .map(createStaleBaselineViolation);
  return [
    ...collectJscpdContractViolations(baseline, registry),
    ...liveViolations,
    ...staleViolations,
  ];
}

export function formatJscpdBaselineSummary({
  baseline,
  familySummary,
  formatFamilySummary,
  registry,
  violations,
}) {
  if (!baseline) {
    return formatFamilySummary(familySummary);
  }

  const duplicateCount = familySummary.reduce((total, entry) => total + entry.count, 0);
  const lineCount = familySummary.reduce((total, entry) => total + entry.lines, 0);
  const familyCount = familySummary.length;
  const staleFamilyCount = (baseline.families ?? []).filter(
    (entry) => !familySummary.some((family) => family.family === entry.family)
  ).length;
  const lines = [
    `Baseline: ${duplicateCount} duplicate blocks / ${lineCount} lines`,
    `constrained across ${familyCount} families`,
  ];
  if (staleFamilyCount > 0) {
    lines.push(`Stale baseline families: ${staleFamilyCount}`);
  }
  const classificationSummary = summarizeJscpdClassifications(baseline, familySummary, registry);
  if (classificationSummary) {
    lines.push(`Triage: ${classificationSummary}`);
  }
  if (violations.length > 0) {
    lines.push('', formatFamilySummary(familySummary));
  }

  return lines.filter(Boolean).join('\n');
}
