import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { selectelInfrastructureFromEnvironment } from './artifacts.mjs';
import {
  appendCandidatePhaseInvocation,
  createTrustedPhaseCommands,
} from './container-command.mjs';
import { createCandidateControlDigest } from './control-digest.mjs';
import { sealLaneArtifacts } from './seal-lane-artifacts.mjs';
import {
  resolveQaReleaseResourceProfile,
  resolveQaResourceProfile,
} from '../qa/runtime/resource-profile.mjs';

const lane = process.argv[2];
if (!['proof', 'release'].includes(lane)) {
  throw new Error('Usage: run-lane.mjs <proof|release>');
}
if (process.env.SNIPTALE_CI_TRUSTED_HOST !== '1') {
  throw new Error('Canonical CI phase dispatch may only run from the trusted runner host.');
}

const trustedRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const commands = createTrustedPhaseCommands(lane);
const dockerArgs = JSON.parse(process.env.SNIPTALE_CI_DOCKER_ARGS_JSON ?? 'null');
const image = process.env.SNIPTALE_CI_IMAGE;
if (!Array.isArray(dockerArgs) || typeof image !== 'string' || image.length === 0) {
  throw new Error('Trusted runner host did not provide a sealed candidate container plan.');
}

const startedAtMs = Date.now();
const phases = [];
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
  const invocation = appendCandidatePhaseInvocation(dockerArgs, { args, executable, image });
  const result = spawnSync('docker', invocation, { stdio: 'inherit' });
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

const artifactSealed = sealLaneArtifacts({
  lane,
  phases,
  startedAtMs,
  label: `CI ${lane}`,
  artifactInput: {
    status: status === 0 ? 'passed' : 'failed',
    command: commands.map(([, executable, args]) => [executable, ...args].join(' ')),
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
  },
});
if (!artifactSealed) status ||= 1;

process.exit(status);
