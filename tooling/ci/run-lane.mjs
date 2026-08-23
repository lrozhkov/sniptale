import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { collectLaneArtifacts, selectelInfrastructureFromEnvironment } from './artifacts.mjs';
import { resolveCiArtifactSession } from './artifact-observability.mjs';
import {
  appendCandidatePhaseInvocation,
  createTrustedPhaseCommands,
} from './container-command.mjs';
import { createCandidateControlDigest } from './control-digest.mjs';
import { formatObservedRunSummary } from '../qa/wrappers/observed/runner.mjs';
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

let artifactSession = null;
let artifactSessionFinalized = false;
let artifactFinalRecord = null;
try {
  artifactSession = resolveCiArtifactSession({ lane, phases, startedAtMs });
  artifactSession.recordActivityTransition({
    activityId: 'artifact-collection',
    kind: 'artifact-collection',
    state: 'queued',
  });
  artifactSession.recordActivityTransition({
    activityId: 'artifact-collection',
    kind: 'artifact-collection',
    state: 'started',
  });
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
    beforeCollectRunRecords: () => {
      artifactSession.recordActivityTransition({
        activityId: 'artifact-collection',
        kind: 'artifact-collection',
        state: 'completed',
      });
      artifactFinalRecord = artifactSession.finalize();
      artifactSessionFinalized = true;
    },
  });
  process.stdout.write(
    `[ci:final-summary]\n${formatObservedRunSummary({
      label: `CI ${lane}`,
      record: artifactFinalRecord,
      runPath: path.relative(process.cwd(), artifactSession.runPath).replaceAll(path.sep, '/'),
    })}`
  );
  process.stdout.write(`SNIPTALE_ARTIFACT_PATH=${artifactPath}\n`);
} catch (error) {
  if (artifactSession && !artifactSessionFinalized) {
    artifactSession.recordActivityTransition({
      activityId: 'artifact-collection',
      kind: 'artifact-collection',
      state: 'failed',
    });
    artifactSession.fail(error, {
      stepId: 'wrapper.lifecycle',
      problemId: 'artifact.collection.failed',
    });
  } else if (artifactSession) {
    artifactSession.resume();
    artifactSession.recordActivityTransition({
      activityId: 'artifact-sealing',
      kind: 'artifact-sealing',
      state: 'queued',
    });
    artifactSession.recordActivityTransition({
      activityId: 'artifact-sealing',
      kind: 'artifact-sealing',
      state: 'started',
    });
    artifactSession.recordActivityTransition({
      activityId: 'artifact-sealing',
      kind: 'artifact-sealing',
      state: 'failed',
    });
    artifactSession.fail(error, {
      stepId: 'wrapper.lifecycle',
      problemId: 'artifact.sealing.failed',
    });
  }
  process.stderr.write(
    `Artifact collection failed: ${error instanceof Error ? error.message : String(error)}\n`
  );
  status ||= 1;
}

process.exit(status);
