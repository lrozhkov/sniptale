import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { expect, it } from 'vitest';
import {
  materializeInheritedFastProofEvidence,
  readFastProofAdmission,
} from './release-wrapper.mjs';
import { withCwd } from '../qa/test-support/test-helpers';

it('fails before release composition when Fast proof admission is absent', () => {
  const environment = { ...process.env };
  delete environment.SNIPTALE_FAST_PROOF_ADMISSION_PATH;
  delete environment.SNIPTALE_FAST_PROOF_PATH;
  const result = spawnSync(process.execPath, ['tooling/ci/release-wrapper.mjs'], {
    encoding: 'utf8',
    env: environment,
  });

  expect(result.status).not.toBe(0);
  expect(`${result.stdout}${result.stderr}`).toContain(
    'CI release prerequisite failed: Fast proof admission receipt is missing.'
  );
  expect(`${result.stdout}${result.stderr}`).not.toContain('[qa] CI release');
});

it('accepts an exact container-visible proof locator after host admission transport', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'release-admission-contract-'));
  const file = path.join(root, 'admission.json');
  const admission = {
    artifactKind: 'sniptale-fast-proof-admission',
    outcome: 'admitted',
    candidateTree: 'candidate-tree',
    commit: 'candidate-sha',
    executionEnvironment: {
      kind: 'locked-container',
      digest: `sha256:${'a'.repeat(64)}`,
    },
    proofRoot: '/opt/sniptale-fast-proof',
    workspaceMode: 'committed',
  };
  fs.writeFileSync(file, JSON.stringify(admission));
  const original = { ...process.env };
  Object.assign(process.env, {
    SNIPTALE_CANDIDATE_SHA: 'candidate-sha',
    SNIPTALE_CANDIDATE_TREE: 'candidate-tree',
    SNIPTALE_CI_CONTAINER_DIGEST: `sha256:${'a'.repeat(64)}`,
    SNIPTALE_CI_IN_CONTAINER: '1',
    SNIPTALE_FAST_PROOF_ADMISSION_PATH: file,
    SNIPTALE_FAST_PROOF_PATH: '/opt/sniptale-fast-proof',
    SNIPTALE_WORKSPACE_MODE: 'committed',
  });
  try {
    expect(readFastProofAdmission()).toEqual(admission);
  } finally {
    for (const name of Object.keys(process.env)) {
      if (!(name in original)) delete process.env[name];
    }
    Object.assign(process.env, original);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

it('replaces inherited coverage HTML instead of overlaying stale disposable files', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'release-coverage-materialization-'));
  const proofRoot = path.join(root, 'proof');
  for (const relative of [
    '.tmp/qa/unit-proof.json',
    '.tmp/qa/coverage-proof.json',
    '.tmp/coverage/canonical/coverage-final.json',
    '.tmp/coverage/canonical/coverage-summary.json',
    '.tmp/coverage/canonical/lcov.info',
    '.tmp/coverage/canonical/html/index.html',
  ]) {
    const file = path.join(proofRoot, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, relative);
  }
  fs.mkdirSync(path.join(root, '.tmp/coverage/canonical/html'), { recursive: true });
  fs.writeFileSync(path.join(root, '.tmp/coverage/canonical/html/stale.html'), 'stale');

  await withCwd(root, () => {
    materializeInheritedFastProofEvidence({ proofRoot });
    expect(fs.existsSync('.tmp/coverage/canonical/html/stale.html')).toBe(false);
    expect(fs.readFileSync('.tmp/coverage/canonical/html/index.html', 'utf8')).toContain(
      'index.html'
    );
  });
  fs.rmSync(root, { recursive: true, force: true });
});
