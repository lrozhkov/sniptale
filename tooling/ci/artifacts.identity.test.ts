import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it } from 'vitest';

import { copyAdmittedReleaseInput, copyFreshLaneReport } from './artifacts.mjs';

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

it('keeps release signature evidence fresh instead of copying the Fast report', () => {
  const source = fs.readFileSync('tooling/ci/artifacts.mjs', 'utf8');
  expect(source).not.toContain('REUSABLE_FAST_REPORTS');
  expect(source).not.toContain('copyReusableFastReport');
  expect(source).toContain("'.tmp/npm-audit/signatures.json'");

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-fresh-release-signatures-'));
  temporaryRoots.push(root);
  const destinationRoot = path.join(root, 'artifact');
  const relative = '.tmp/npm-audit/signatures.json';
  fs.mkdirSync(path.join(root, '.tmp/npm-audit'), { recursive: true });
  fs.mkdirSync(destinationRoot);
  fs.writeFileSync(path.join(root, relative), '{"authority":"release"}\n');
  expect(
    copyFreshLaneReport({
      destinationRoot,
      file: relative,
      notBeforeMs: 0,
      repositoryRoot: root,
      required: true,
    })
  ).toBe(true);
  expect(fs.readFileSync(path.join(destinationRoot, relative), 'utf8')).toBe(
    '{"authority":"release"}\n'
  );
});

it('seals an exact admitted prerequisite without misclassifying its pre-lane timestamp', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-admitted-release-input-'));
  temporaryRoots.push(root);
  const destinationRoot = path.join(root, 'artifact');
  const relative = '.tmp/ci/fast-proof-admission.json';
  const environment = {
    SNIPTALE_CANDIDATE_SHA: 'candidate-sha',
    SNIPTALE_CANDIDATE_TREE: 'candidate-tree',
    SNIPTALE_CI_EXECUTION_ENVIRONMENT_DIGEST: `sha256:${'a'.repeat(64)}`,
    SNIPTALE_FAST_PROOF_PATH: '/proof',
    SNIPTALE_WORKSPACE_MODE: 'local-workspace',
  };
  const source = path.join(root, relative);
  fs.mkdirSync(path.dirname(source), { recursive: true });
  fs.mkdirSync(destinationRoot);
  fs.writeFileSync(
    source,
    `${JSON.stringify({
      artifactKind: 'sniptale-fast-proof-admission',
      outcome: 'admitted',
      candidateTree: environment.SNIPTALE_CANDIDATE_TREE,
      commit: environment.SNIPTALE_CANDIDATE_SHA,
      executionEnvironment: {
        kind: 'host-wsl',
        digest: environment.SNIPTALE_CI_EXECUTION_ENVIRONMENT_DIGEST,
      },
      proofRoot: environment.SNIPTALE_FAST_PROOF_PATH,
      workspaceMode: environment.SNIPTALE_WORKSPACE_MODE,
    })}\n`
  );
  fs.utimesSync(source, new Date(0), new Date(0));

  expect(
    copyAdmittedReleaseInput({ destinationRoot, environment, file: relative, repositoryRoot: root })
  ).toBe(true);
  expect(JSON.parse(fs.readFileSync(path.join(destinationRoot, relative), 'utf8'))).toMatchObject({
    outcome: 'admitted',
    candidateTree: 'candidate-tree',
  });
});
