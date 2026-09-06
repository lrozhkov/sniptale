import crypto from 'node:crypto';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createCandidateControlDigest } from '../../../ci/control-digest.mjs';

function digestFiles(files) {
  const hash = crypto.createHash('sha256');
  for (const file of [...new Set(files)].sort()) {
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) continue;
    const bytes = fs.readFileSync(file);
    hash.update(`${file}\0${bytes.length}\0`);
    hash.update(bytes);
    hash.update('\0');
  }
  return `sha256:${hash.digest('hex')}`;
}

function resolveNpmVersion() {
  const userAgent = process.env.npm_config_user_agent ?? '';
  const match = /(?:^|\s)npm\/([^\s]+)/u.exec(userAgent);
  if (match) return match[1];
  const result = spawnSync('npm', ['--version'], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error('Cannot resolve npm version for QA proof state.');
  return result.stdout.trim();
}

export function createQaProofRuntimeIdentity() {
  return {
    controlDigest: createCandidateControlDigest(),
    toolchainLockDigest: digestFiles([
      'package-lock.json',
      'tooling/configs/ci/toolchain.lock.json',
    ]),
    nodeVersion: process.version,
    npmVersion: resolveNpmVersion(),
  };
}

export function resolveQaProofRuntimeIdentityMismatch(state, expected) {
  for (const field of ['controlDigest', 'toolchainLockDigest', 'nodeVersion', 'npmVersion']) {
    if (state?.[field] !== expected[field]) return `${field} changed`;
  }
  return null;
}
