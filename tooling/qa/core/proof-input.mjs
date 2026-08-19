import crypto from 'node:crypto';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

export function sha256ProofInput(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, stableValue(nested)])
    );
  }
  return value;
}

export function stableStringify(value) {
  return JSON.stringify(stableValue(value));
}

export function readProofInput(filePath, encoding = null) {
  const descriptor = fs.openSync(filePath, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
  try {
    const stat = fs.fstatSync(descriptor);
    if (!stat.isFile()) throw new Error(`Unsafe proof input: ${filePath}`);
    return fs.readFileSync(descriptor, encoding === null ? undefined : encoding);
  } finally {
    fs.closeSync(descriptor);
  }
}

export function resolveProofCommit(cwd) {
  const configured = process.env.SNIPTALE_PROOF_SHA;
  if (/^[a-f0-9]{40}$/u.test(configured ?? '')) return configured;
  const result = spawnSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' });
  return result.status === 0 && /^[a-f0-9]{40}$/u.test(result.stdout.trim())
    ? result.stdout.trim()
    : null;
}
