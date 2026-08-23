import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { expect, it } from 'vitest';

import { createTempRoot } from '../qa/core/test-helpers';
import { resolveCiArtifactSession } from './artifact-observability.mjs';

it.each(['run-lane.mjs', 'local.mjs'])(
  'routes %s failure artifact collection through the shared CI lifecycle owner',
  (file) => {
    const source = fs.readFileSync(path.join('tooling/ci', file), 'utf8');
    expect(source).toContain(
      "import { resolveCiArtifactSession } from './artifact-observability.mjs'"
    );
    expect(source).toContain('resolveCiArtifactSession({ lane, phases, startedAtMs })');
  }
);

it('seals canonical failure evidence when a prerequisite fails before the CI wrapper starts', () => {
  const root = createTempRoot('ci-prerequisite-evidence-');
  const policyDestination = path.join(root, 'tooling/configs/ci/proof-semantics.json');
  fs.mkdirSync(path.dirname(policyDestination), { recursive: true });
  fs.copyFileSync('tooling/configs/ci/proof-semantics.json', policyDestination);
  const observabilityUrl = new URL('./artifact-observability.mjs', import.meta.url).href;
  const artifactsUrl = new URL('./artifacts.mjs', import.meta.url).href;
  const script = [
    `import { resolveCiArtifactSession } from ${JSON.stringify(observabilityUrl)};`,
    `import { collectLaneArtifacts } from ${JSON.stringify(artifactsUrl)};`,
    'const startedAtMs = Date.now() - 1000;',
    'const phases = [{ id: "install", command: "npm ci --ignore-scripts",',
    'startedAt: new Date(startedAtMs).toISOString(), finishedAt: new Date().toISOString(),',
    'status: "failed", exitCode: 1 },',
    '{ id: "proof", command: null, startedAt: null, finishedAt: null,',
    'status: "blocked", reason: "earlier canonical phase failed" }];',
    'const session = resolveCiArtifactSession({ lane: "proof", phases, startedAtMs });',
    'session.recordActivityTransition({ activityId: "artifact-collection",',
    'kind: "artifact-collection", state: "queued" });',
    'session.recordActivityTransition({ activityId: "artifact-collection",',
    'kind: "artifact-collection", state: "started" });',
    'collectLaneArtifacts({ lane: "proof", startedAtMs, status: "failed", command: [], phases,',
    `containerDigest: "sha256:${'a'.repeat(64)}",`,
    `trustedControlDigest: "sha256:${'b'.repeat(64)}",`,
    `controlDigest: "sha256:${'b'.repeat(64)}",`,
    `gateInputDigest: "sha256:${'c'.repeat(64)}",`,
    'beforeCollectRunRecords: () => {',
    'session.recordActivityTransition({ activityId: "artifact-collection",',
    'kind: "artifact-collection", state: "completed" });',
    'session.finalize(); }, });',
  ].join(' ');
  const result = spawnSync(process.execPath, ['--input-type=module', '--eval', script], {
    cwd: root,
    env: {
      ...process.env,
      GITHUB_RUN_ATTEMPT: '3',
      GITHUB_RUN_ID: '42',
      SNIPTALE_CANDIDATE_SHA: 'd'.repeat(40),
    },
    encoding: 'utf8',
  });

  expect(result.status, result.stderr).toBe(0);
  const artifactRoot = path.join(root, `build/ci-artifacts/proof-${'d'.repeat(40)}-42-3`);
  expect(
    JSON.parse(fs.readFileSync(path.join(artifactRoot, 'proof-manifest.json'), 'utf8'))
  ).toMatchObject({
    status: 'failed',
    phases: expect.arrayContaining([expect.objectContaining({ id: 'install', status: 'failed' })]),
  });
  const runRecordPath = fs
    .readdirSync(path.join(artifactRoot, '.tmp/qa-observability/runs'), { recursive: true })
    .find((entry) => String(entry).endsWith('.json'));
  expect(runRecordPath).toBeDefined();
  const record = JSON.parse(
    fs.readFileSync(
      path.join(artifactRoot, '.tmp/qa-observability/runs', String(runRecordPath)),
      'utf8'
    )
  );
  expect(record).toMatchObject({
    wrapperId: 'ci:proof',
    status: 'problems-found',
    repository: { mode: 'ci-prerequisite-failure' },
    summary: { errors: 1, problemIds: ['ci.prerequisite-phase.failed'] },
  });
});

it('fails closed when successful prerequisites lead to a recordless canonical wrapper failure', () => {
  const root = createTempRoot('ci-recordless-wrapper-');
  const startedAtMs = Date.now() - 1000;
  const phases = [
    { id: 'install', status: 'passed' },
    { id: 'verify-project-toolchain', status: 'passed' },
    { id: 'proof', status: 'failed', exitCode: 1 },
  ];

  expect(() =>
    resolveCiArtifactSession({
      lane: 'proof',
      phases,
      startedAtMs,
      repositoryRoot: root,
      storageRoot: root,
    })
  ).toThrow('Expected a resumable ci:proof run after successful CI prerequisites.');
  expect(fs.existsSync(path.join(root, '.tmp/qa-observability/runs'))).toBe(false);
});
