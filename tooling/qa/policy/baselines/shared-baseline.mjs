import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';

import { getBaselinePath } from './shared-baseline-path.mjs';
import { repoRoot } from '../../analysis/repository/shared-paths.mjs';

function validateNoiseRationale(rationale, index) {
  const location = `quality baseline rationale ${index + 1}`;
  if (
    rationale?.classification !== 'tool-noise' ||
    typeof rationale.id !== 'string' ||
    typeof rationale.owner !== 'string' ||
    typeof rationale.reason !== 'string' ||
    typeof rationale.removalCondition !== 'string'
  ) {
    throw new Error(
      `${location} requires id, tool-noise classification, owner, reason, and removalCondition`
    );
  }
  const expectedKeys = ['classification', 'id', 'owner', 'reason', 'removalCondition'].sort();
  if (
    JSON.stringify(Object.keys(rationale).sort()) !== JSON.stringify(expectedKeys) ||
    [rationale.id, rationale.owner, rationale.reason, rationale.removalCondition].some(
      (value) => value.trim().length === 0
    )
  ) {
    throw new Error(`${location} has an invalid field population`);
  }
}

function validateAllowance(allowance, index, rationaleIds) {
  const location = `quality baseline allowance ${index + 1}`;
  if (
    typeof allowance?.noiseId !== 'string' ||
    !rationaleIds.has(allowance.noiseId) ||
    typeof allowance?.rule !== 'string' ||
    typeof allowance?.file !== 'string'
  ) {
    throw new Error(`${location} requires debtId, rule, and file`);
  }
  if (allowance.startLine != null || allowance.endLine != null) {
    throw new Error(`${location} cannot use a line range; use one exact line or contentHash`);
  }
  const hasExactLine = Number.isInteger(allowance.line) && allowance.line > 0;
  const hasContentHash = /^[a-f0-9]{64}$/u.test(allowance.contentHash ?? '');
  if (hasExactLine === hasContentHash) {
    throw new Error(`${location} requires exactly one of line or contentHash`);
  }
  const expectedKeys = ['noiseId', 'file', 'rule', hasExactLine ? 'line' : 'contentHash'].sort();
  if (JSON.stringify(Object.keys(allowance).sort()) !== JSON.stringify(expectedKeys)) {
    throw new Error(`${location} has an invalid field population`);
  }
}

export function parseQualityBaseline(value) {
  const legacyEmptyWorkerValue =
    value != null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    JSON.stringify(Object.keys(value).sort()) === JSON.stringify(['allowances']) &&
    Array.isArray(value.allowances) &&
    value.allowances.length === 0;
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    (!legacyEmptyWorkerValue &&
      JSON.stringify(Object.keys(value).sort()) !== JSON.stringify(['allowances', 'rationales'])) ||
    !Array.isArray(value.allowances) ||
    (!legacyEmptyWorkerValue && !Array.isArray(value.rationales))
  ) {
    throw new Error('Quality baseline worker contract requires rationales and allowances arrays');
  }
  const rationales = value.rationales ?? [];
  rationales.forEach(validateNoiseRationale);
  const rationaleIds = new Set(rationales.map(({ id }) => id));
  if (rationaleIds.size !== rationales.length) {
    throw new Error('Quality baseline rationale ids must be unique');
  }
  value.allowances.forEach((allowance, index) => validateAllowance(allowance, index, rationaleIds));
  return {
    rationales: rationales.map((rationale) => ({ ...rationale })),
    allowances: value.allowances.map((allowance) => ({ ...allowance })),
  };
}

export function loadBaseline() {
  const baselinePath = getBaselinePath(repoRoot);
  if (!fs.existsSync(baselinePath)) {
    throw new Error(`Required quality baseline is missing: ${baselinePath}`);
  }

  const parsed = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
  if (
    parsed.schemaVersion !== 2 ||
    !Array.isArray(parsed.rationales) ||
    !Array.isArray(parsed.allowances)
  ) {
    throw new Error('Quality baseline requires schemaVersion 2 with rationales and allowances');
  }
  return parseQualityBaseline({ rationales: parsed.rationales, allowances: parsed.allowances });
}

export function isAllowedViolation(baseline, violation) {
  return baseline.allowances.some((allowance) => {
    if (allowance.rule !== violation.rule || allowance.file !== violation.file) {
      return false;
    }
    if (allowance.contentHash != null) {
      const currentContentHash = getFileContentHash(allowance.file);
      if (currentContentHash !== allowance.contentHash) {
        return false;
      }
    }
    if (allowance.line != null && allowance.line !== violation.line) {
      return false;
    }
    return true;
  });
}

export function filterAllowedViolations(violations, baseline) {
  return violations.filter((violation) => !isAllowedViolation(baseline, violation));
}

function getFileContentHash(filePath) {
  const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(repoRoot, filePath);
  if (!fs.existsSync(absolutePath)) {
    return null;
  }

  return crypto.createHash('sha256').update(fs.readFileSync(absolutePath)).digest('hex');
}
