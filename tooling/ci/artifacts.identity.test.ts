import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it } from 'vitest';

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
    trustedControlDigest: `sha256:${'d'.repeat(64)}`,
    controlDigest: `sha256:${'d'.repeat(64)}`,
  });
});
