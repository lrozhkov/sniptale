import fs from 'node:fs';

import { selectelInfrastructureFromEnvironment } from './artifacts.mjs';
import {
  resolveQaReleaseResourceProfile,
  resolveQaResourceProfile,
} from '../qa/runtime/resource-profile.mjs';
import { sealLaneArtifacts } from './seal-lane-artifacts.mjs';
import { parseTrustedPhaseReceipt } from './trusted-phase-receipt.mjs';

if (
  process.env.SNIPTALE_CI_IN_CONTAINER !== '1' ||
  process.env.SNIPTALE_CI_TRUSTED_PHASE_SEAL !== '1'
) {
  throw new Error('Trusted phase sealing may only run inside the canonical QA container.');
}

const receiptPath = process.argv[2];
if (!receiptPath) throw new Error('Trusted phase receipt path is required.');
const { commands, lane, phases, startedAtMs, status } = parseTrustedPhaseReceipt(
  JSON.parse(fs.readFileSync(receiptPath, 'utf8'))
);
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
    trustedControlDigest: process.env.SNIPTALE_TRUSTED_CONTROL_DIGEST ?? null,
    controlDigest: process.env.SNIPTALE_TRUSTED_CANDIDATE_CONTROL_DIGEST ?? null,
    resourceProfiles: {
      bounded: resolveQaResourceProfile(),
      release: resolveQaReleaseResourceProfile(),
    },
    infrastructure: selectelInfrastructureFromEnvironment(),
  },
});
if (!artifactSealed) process.exitCode = 1;
