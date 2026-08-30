import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it } from 'vitest';

import { collectMutationEvidence, copyReusableFastReport } from './artifacts.mjs';

const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

it('binds pull-request proof paths and manifests to the candidate rather than the event SHA', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-artifact-candidate-identity-'));
  temporaryRoots.push(root);
  const policyDestination = path.join(root, 'tooling/configs/ci/proof-semantics.json');
  fs.mkdirSync(path.dirname(policyDestination), { recursive: true });
  fs.copyFileSync('tooling/configs/ci/proof-semantics.json', policyDestination);
  const moduleUrl = new URL('./artifacts.mjs', import.meta.url).href;
  const script = [
    `import { collectLaneArtifacts } from ${JSON.stringify(moduleUrl)};`,
    'collectLaneArtifacts({ lane: "proof", startedAtMs: 0, status: "failed", command: [],',
    `containerDigest: "sha256:${'a'.repeat(64)}", trustedControlDigest: "sha256:${'d'.repeat(64)}", controlDigest: "sha256:${'d'.repeat(64)}",`,
    `gateInputDigest: "sha256:${'e'.repeat(64)}" });`,
  ].join(' ');
  const result = spawnSync(process.execPath, ['--input-type=module', '--eval', script], {
    cwd: root,
    env: {
      ...process.env,
      GITHUB_SHA: 'b'.repeat(40),
      GITHUB_RUN_ID: '24',
      GITHUB_RUN_ATTEMPT: '2',
      SNIPTALE_CANDIDATE_SHA: 'c'.repeat(40),
    },
    encoding: 'utf8',
  });

  expect(result.status, result.stderr).toBe(0);
  const bundle = path.join(
    root,
    `build/ci-artifacts/proof-${'c'.repeat(40)}-24-2/proof-manifest.json`
  );
  expect(JSON.parse(fs.readFileSync(bundle, 'utf8'))).toMatchObject({
    commit: 'c'.repeat(40),
    controlAuthority: 'trusted-base',
    controlsChanged: false,
    controlDisposition: 'trusted-controls',
    trustedControlDigest: `sha256:${'d'.repeat(64)}`,
    controlDigest: `sha256:${'d'.repeat(64)}`,
  });
});

it('collects only the current mutation run label and ignores stale sibling evidence', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-mutation-evidence-'));
  temporaryRoots.push(root);
  const destinationRoot = path.join(root, 'artifact');
  fs.mkdirSync(destinationRoot);
  const startedAtMs = Date.now() - 1000;
  for (const profile of ['persistence', 'secrets']) {
    for (const file of ['stryker-report.json', 'summary.json']) {
      const current = path.join(root, '.tmp/mutation', profile, '42', file);
      fs.mkdirSync(path.dirname(current), { recursive: true });
      fs.writeFileSync(current, '{}\n');
    }
    const stale = path.join(root, '.tmp/mutation', profile, 'after', 'summary.json');
    fs.mkdirSync(path.dirname(stale), { recursive: true });
    fs.writeFileSync(stale, 'stale\n');
    fs.utimesSync(stale, new Date(0), new Date(0));
  }

  expect(
    collectMutationEvidence({
      destinationRoot,
      environment: { GITHUB_RUN_ID: '42' },
      notBeforeMs: startedAtMs,
      repositoryRoot: root,
      required: true,
    })
  ).toBe(4);
  expect(fs.existsSync(path.join(destinationRoot, '.tmp/mutation/persistence/after'))).toBe(false);
  expect(
    fs.existsSync(path.join(destinationRoot, '.tmp/mutation/secrets/42/stryker-report.json'))
  ).toBe(true);
});

it('rejects mutation evidence below a symlinked ancestor directory', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-mutation-symlink-'));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-mutation-outside-'));
  temporaryRoots.push(root, outside);
  const destinationRoot = path.join(root, 'artifact');
  fs.mkdirSync(destinationRoot);
  for (const file of ['stryker-report.json', 'summary.json']) {
    const source = path.join(outside, file);
    fs.writeFileSync(source, '{}\n');
  }
  const profileRoot = path.join(root, '.tmp/mutation/persistence');
  fs.mkdirSync(profileRoot, { recursive: true });
  fs.symlinkSync(outside, path.join(profileRoot, '42'), 'dir');

  expect(() =>
    collectMutationEvidence({
      destinationRoot,
      environment: { GITHUB_RUN_ID: '42' },
      notBeforeMs: Date.now() - 1000,
      repositoryRoot: root,
      required: true,
    })
  ).toThrow('Unsafe artifact symlink: .tmp/mutation/persistence/42/stryker-report.json');
  expect(fs.readdirSync(destinationRoot)).toEqual([]);
});

it('copies Fast audit evidence only when the sealed manifest and bytes agree', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-fast-audit-reuse-'));
  temporaryRoots.push(root);
  const proofRoot = path.join(root, 'proof');
  const destinationRoot = path.join(root, 'release');
  const relative = '.tmp/npm-audit/signatures.json';
  const source = path.join(proofRoot, relative);
  fs.mkdirSync(path.dirname(source), { recursive: true });
  fs.mkdirSync(destinationRoot);
  fs.writeFileSync(source, '{"results":[]}\n');
  const digest = crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex');
  fs.writeFileSync(
    path.join(proofRoot, 'proof-manifest.json'),
    `${JSON.stringify({ files: [{ file: relative, sha256: digest }] })}\n`
  );

  expect(copyReusableFastReport(relative, destinationRoot, proofRoot)).toBe(true);
  expect(fs.readFileSync(path.join(destinationRoot, relative), 'utf8')).toBe('{"results":[]}\n');

  fs.writeFileSync(source, '{"results":["tampered"]}\n');
  expect(() => copyReusableFastReport(relative, destinationRoot, proofRoot)).toThrow(
    'Reusable Fast proof report digest mismatch'
  );
});
