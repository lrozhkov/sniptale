import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';

import { getBaselinePath } from './shared-baseline-path.mjs';
import { repoRoot } from './shared-paths.mjs';

function validateAllowance(allowance, index) {
  const location = `quality baseline allowance ${index + 1}`;
  if (
    typeof allowance?.debtId !== 'string' ||
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
}

export function loadBaseline() {
  const baselinePath = getBaselinePath(repoRoot);
  if (!fs.existsSync(baselinePath)) {
    throw new Error(`Required quality baseline is missing: ${baselinePath}`);
  }

  const parsed = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
  if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.allowances)) {
    throw new Error('Quality baseline requires schemaVersion 1 and an allowances array');
  }
  parsed.allowances.forEach(validateAllowance);
  return { allowances: parsed.allowances };
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
