import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it } from 'vitest';

import {
  createBuildProofInputs,
  materializeReusableBuildArchive,
  recordSuccessfulBuildProof,
  resolveReusableBuildProof,
} from './build-proof.mjs';

const roots: string[] = [];
const inheritedControlDigest = process.env.SNIPTALE_CANDIDATE_CONTROL_DIGEST;

beforeEach(() => {
  process.env.SNIPTALE_CANDIDATE_CONTROL_DIGEST = `sha256:${'a'.repeat(64)}`;
});

function createRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sniptale-build-proof-'));
  roots.push(root);
  for (const directory of [
    'apps/extension/src',
    'apps/extension/build',
    'apps/extension/public',
    'packages/example',
    'tooling/release',
    'tooling/configs/qa',
    'build',
  ]) {
    fs.mkdirSync(path.join(root, directory), { recursive: true });
  }
  const policy = JSON.parse(
    fs.readFileSync('tooling/configs/qa/build-proof-reuse.data.json', 'utf8')
  );
  fs.writeFileSync(
    path.join(root, 'tooling/configs/qa/build-proof-reuse.data.json'),
    `${JSON.stringify(policy)}\n`
  );
  for (const file of policy.configFiles.filter(
    (value: string) => value !== 'tooling/configs/qa/build-proof-reuse.data.json'
  )) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), `${file}\n`);
  }
  fs.writeFileSync(path.join(root, 'apps/extension/src/index.ts'), 'export const value = 1;\n');
  fs.writeFileSync(path.join(root, 'apps/extension/public/icon.txt'), 'icon\n');
  fs.writeFileSync(path.join(root, 'packages/example/index.ts'), 'export {};\n');
  fs.writeFileSync(path.join(root, 'tooling/release/package.mjs'), 'export {};\n');
  return root;
}

afterEach(() => {
  delete process.env.SNIPTALE_BUILD_PROOF_PATH;
  delete process.env.SNIPTALE_BUILD_ARCHIVE_PATH;
  if (inheritedControlDigest == null) delete process.env.SNIPTALE_CANDIDATE_CONTROL_DIGEST;
  else process.env.SNIPTALE_CANDIDATE_CONTROL_DIGEST = inheritedControlDigest;
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

it('rejects build reuse across candidate control digests', () => {
  const root = createRoot();
  const archive = path.join(root, 'build/sniptale_0.3.3_2026-08-23.zip');
  fs.writeFileSync(archive, 'verified archive');
  recordSuccessfulBuildProof({
    archivePath: archive,
    cwd: root,
    producerId: 'qa-release-archive-owner',
  });
  process.env.SNIPTALE_CANDIDATE_CONTROL_DIGEST = `sha256:${'b'.repeat(64)}`;
  expect(resolveReusableBuildProof({ cwd: root })).toMatchObject({
    matched: false,
    reason: 'build proof control digest changed',
  });
});

it('reuses a build and ZIP only while every canonical input and archive digest matches', () => {
  const root = createRoot();
  const archive = path.join(root, 'build/sniptale_0.3.3_2026-08-23.zip');
  fs.writeFileSync(archive, 'verified archive');
  const proof = recordSuccessfulBuildProof({
    archivePath: archive,
    cwd: root,
    producerId: 'qa-release-archive-owner',
  });

  expect(resolveReusableBuildProof({ cwd: root })).toMatchObject({ matched: true });
  fs.appendFileSync(path.join(root, 'apps/extension/src/index.ts'), '// changed\n');
  expect(resolveReusableBuildProof({ cwd: root })).toMatchObject({
    matched: false,
    reason: 'build proof inputs changed',
  });
  fs.writeFileSync(path.join(root, 'apps/extension/src/index.ts'), 'export const value = 1;\n');
  fs.appendFileSync(archive, ' changed');
  expect(resolveReusableBuildProof({ cwd: root })).toMatchObject({
    matched: false,
    reason: 'build proof archive changed',
  });
  expect(proof.archive.sha256).toBe(
    crypto.createHash('sha256').update('verified archive').digest('hex')
  );
});

it('materializes an externally verified archive without accepting a ci:build output', () => {
  const sourceRoot = createRoot();
  const candidateRoot = createRoot();
  const sourceArchive = path.join(sourceRoot, 'build/sniptale_0.3.3_2026-08-23.zip');
  fs.writeFileSync(sourceArchive, 'verified archive');
  recordSuccessfulBuildProof({
    archivePath: sourceArchive,
    cwd: sourceRoot,
    producerId: 'qa-release-archive-owner',
  });
  process.env.SNIPTALE_BUILD_PROOF_PATH = path.join(sourceRoot, '.tmp/qa/build-proof.json');
  process.env.SNIPTALE_BUILD_ARCHIVE_PATH = sourceArchive;

  const reusable = resolveReusableBuildProof({ cwd: candidateRoot });
  expect(reusable).toMatchObject({ matched: true, authority: 'external' });
  const materialized = materializeReusableBuildArchive(reusable, { cwd: candidateRoot });
  expect(fs.readFileSync(materialized, 'utf8')).toBe('verified archive');
  expect(createBuildProofInputs({ cwd: candidateRoot }).inputDigest).toBe(
    createBuildProofInputs({ cwd: sourceRoot }).inputDigest
  );
});

it('refuses to mint provenance without the canonical release-archive owner', () => {
  const root = createRoot();
  const archive = path.join(root, 'build/sniptale_0.3.3_2026-08-23.zip');
  fs.writeFileSync(archive, 'non-canonical build output');
  expect(() => recordSuccessfulBuildProof({ archivePath: archive, cwd: root })).toThrow(
    /canonical release-archive owner/u
  );
  expect(fs.existsSync(path.join(root, '.tmp/qa/build-proof.json'))).toBe(false);
});
