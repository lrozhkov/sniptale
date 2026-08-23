import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { collectLaneArtifacts, selectelInfrastructureFromEnvironment } from './artifacts.mjs';
import { createCandidateControlDigest } from './control-digest.mjs';
import {
  resolveQaReleaseResourceProfile,
  resolveQaResourceProfile,
} from '../qa/runtime/resource-profile.mjs';

const lane = process.argv[2];
if (!['proof', 'release'].includes(lane)) {
  throw new Error('Usage: run-lane.mjs <proof|release>');
}
if (process.env.SNIPTALE_CI_IN_CONTAINER !== '1') {
  throw new Error('Canonical CI lanes may only run inside the locked QA container.');
}

const commands = [
  ['install', 'npm', ['ci', '--ignore-scripts']],
  ['provision-canvas', 'npm', ['rebuild', 'canvas']],
  [
    'verify-canvas',
    'node',
    [
      '-e',
      "const { createCanvas } = require('canvas'); if (!createCanvas(1, 1).getContext('2d')) process.exit(1);",
    ],
  ],
  ['provision-ast-grep', 'node', ['node_modules/@ast-grep/cli/postinstall.js']],
  ['verify-ast-grep', 'node_modules/.bin/ast-grep', ['--version']],
  [
    lane,
    'node',
    [
      ...(lane === 'proof' ? ['--max-old-space-size=8192'] : ['--max-old-space-size=12288']),
      `tooling/ci/${lane}-wrapper.mjs`,
    ],
  ],
];

const startedAtMs = Date.now();
const phases = [];
const trustedRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const candidateControlDigest = createCandidateControlDigest();
const trustedControlDigest = createCandidateControlDigest({ cwd: trustedRoot });
const assertedCandidateControlDigest = process.env.SNIPTALE_TRUSTED_CANDIDATE_CONTROL_DIGEST;
const assertedTrustedControlDigest = process.env.SNIPTALE_TRUSTED_CONTROL_DIGEST;
if (!assertedCandidateControlDigest || !assertedTrustedControlDigest) {
  throw new Error('Trusted launcher did not seal both control digests.');
}
if (
  assertedCandidateControlDigest !== candidateControlDigest ||
  assertedTrustedControlDigest !== trustedControlDigest
) {
  throw new Error('Trusted launcher control digests do not match the mounted workspaces.');
}
if (candidateControlDigest !== trustedControlDigest) {
  throw new Error('Candidate controls differ from trusted base and require bootstrap bypass.');
}
let status = 0;
for (const [id, executable, args] of commands) {
  if (status !== 0) {
    phases.push({
      id,
      command: null,
      startedAt: null,
      finishedAt: null,
      status: 'blocked',
      reason: 'earlier canonical phase failed',
    });
    continue;
  }
  const startedAt = new Date().toISOString();
  process.stdout.write(`[ci:phase] start ${id}\n`);
  const result = spawnSync(executable, args, { stdio: 'inherit', env: process.env });
  status = result.status ?? 1;
  phases.push({
    id,
    command: [executable, ...args].join(' '),
    startedAt,
    finishedAt: new Date().toISOString(),
    status: status === 0 ? 'passed' : 'failed',
    exitCode: status,
  });
  process.stdout.write(`[ci:phase] ${status === 0 ? 'passed' : 'failed'} ${id}\n`);
}

try {
  const artifactPath = collectLaneArtifacts({
    lane,
    startedAtMs,
    status: status === 0 ? 'passed' : 'failed',
    command: commands.map(([, executable, args]) => [executable, ...args].join(' ')),
    phases,
    executionEnvironment: {
      kind: 'locked-container',
      digest: process.env.SNIPTALE_CI_CONTAINER_DIGEST,
    },
    candidateTree: process.env.SNIPTALE_CANDIDATE_TREE ?? null,
    workspaceMode: process.env.SNIPTALE_WORKSPACE_MODE ?? 'committed',
    trustedControlSha: process.env.SNIPTALE_TRUSTED_CONTROL_SHA ?? null,
    trustedControlDigest,
    controlDigest: candidateControlDigest,
    resourceProfiles: {
      bounded: resolveQaResourceProfile(),
      release: resolveQaReleaseResourceProfile(),
    },
    infrastructure: selectelInfrastructureFromEnvironment(),
  });
  process.stdout.write(`SNIPTALE_ARTIFACT_PATH=${artifactPath}\n`);
} catch (error) {
  process.stderr.write(
    `Artifact collection failed: ${error instanceof Error ? error.message : String(error)}\n`
  );
  status ||= 1;
}

process.exit(status);
