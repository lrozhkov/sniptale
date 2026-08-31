import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it } from 'vitest';

import { selectReusableFastProof, verifyReusableFastProof } from './fast-proof-reuse.mjs';

const roots: string[] = [];
const sha256 = (value: Buffer | string) => crypto.createHash('sha256').update(value).digest('hex');

function write(root: string, relative: string, contents: string) {
  const target = path.join(root, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, contents);
}

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sniptale-fast-proof-'));
  roots.push(root);
  const report = '.tmp/qa/unit-proof.json';
  write(root, report, '{}\n');
  const files = [report].map((file) => ({
    file,
    sha256: sha256(fs.readFileSync(path.join(root, file))),
  }));
  const identity = {
    commit: '1'.repeat(40),
    candidateTree: '2'.repeat(40),
    trustedControlSha: '3'.repeat(40),
    trustedControlDigest: '5'.repeat(64),
    containerDigest: `sha256:${'4'.repeat(64)}`,
    controlDigest: '5'.repeat(64),
    gateInputDigest: '6'.repeat(64),
  };
  const manifest = {
    schemaVersion: 1,
    artifactKind: 'sniptale-ci-proof',
    lane: 'proof',
    status: 'passed',
    workspaceMode: 'committed',
    controlAuthority: 'trusted-base',
    controlsChanged: false,
    controlDisposition: 'trusted-controls',
    evidenceDisposition: 'executed',
    gateClaim: 'fast-pr-gate',
    fullVitest: true,
    releaseReady: false,
    reuseCompatibility: { outcome: 'compatible' },
    phases: [{ id: 'proof', status: 'passed' }],
    files,
    ...identity,
  };
  write(root, 'proof-manifest.json', `${JSON.stringify(manifest, null, 2)}\n`);
  write(
    root,
    'SHA256SUMS',
    `${[
      ...files.map(({ file, sha256: digest }) => `${digest}  ${file}`),
      `${sha256(fs.readFileSync(path.join(root, 'proof-manifest.json')))}  proof-manifest.json`,
    ].join('\n')}\n`
  );
  return { identity, manifest, root };
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { force: true, recursive: true });
});

it('accepts only an exact content-addressed fast proof', () => {
  const value = fixture();
  expect(verifyReusableFastProof(value.root, value.identity)).toMatchObject({
    manifest: { gateClaim: 'fast-pr-gate', releaseReady: false },
  });
});

it('rejects a modified proof payload even when the manifest still claims success', () => {
  const value = fixture();
  write(value.root, '.tmp/qa/unit-proof.json', '{"modified":true}\n');
  expect(() => verifyReusableFastProof(value.root, value.identity)).toThrow(/digest mismatch/u);
});

it('treats an incompatible proof as unavailable so release can run its Fast prerequisite', () => {
  const value = fixture();
  expect(
    selectReusableFastProof(value.root, {
      ...value.identity,
      containerDigest: `sha256:${'7'.repeat(64)}`,
    })
  ).toBeNull();
});
