import { spawnSync } from 'node:child_process';

import { collectLaneArtifacts, finalizeCandidateReleaseArchive } from './artifacts.mjs';
import {
  resolveQaReleaseResourceProfile,
  resolveQaResourceProfile,
} from '../qa/runtime/resource-profile.mjs';

const lane = process.argv[2];
const trustedRoot = process.env.SNIPTALE_TRUSTED_CI_ROOT;
const wrapper = (name, ...args) => [
  'node',
  [
    ...(name === 'release' ? ['--max-old-space-size=8192'] : []),
    trustedRoot
      ? `/opt/sniptale-trusted/tooling/qa/wrappers/${name}.mjs`
      : `tooling/qa/wrappers/${name}.mjs`,
    ...args,
  ],
];
const licenseCommand = [
  'node',
  [
    trustedRoot
      ? '/opt/sniptale-trusted/tooling/qa/audits/licenses.mjs'
      : 'tooling/qa/audits/licenses.mjs',
  ],
];
const laneCommands = {
  release: [
    wrapper('release-harness'),
    wrapper('release'),
    ...(process.env.SNIPTALE_RELEASE_AUDIT === '1'
      ? [wrapper('audit', '--profile', 'release')]
      : []),
  ],
  'release-audit': [wrapper('audit', '--profile', 'release')],
  security: [wrapper('audit', '--profile', 'security'), licenseCommand],
  coverage: [wrapper('audit', '--profile', 'coverage')],
};
const installCommands = [
  ['install', ['npm', ['ci', '--ignore-scripts']]],
  ['provision-canvas', ['npm', ['rebuild', 'canvas']]],
  [
    'verify-canvas',
    [
      'node',
      [
        '-e',
        "const { createCanvas } = require('canvas'); if (!createCanvas(1, 1).getContext('2d')) process.exit(1);",
      ],
    ],
  ],
  ['provision-ast-grep', ['node', ['node_modules/@ast-grep/cli/postinstall.js']]],
  ['verify-ast-grep', ['node_modules/.bin/ast-grep', ['--version']]],
];
const candidatePhaseCommands = new Map([
  ...installCommands.map(([id, command]) => [`candidate-${id}`, command]),
  ['candidate-release-harness', wrapper('release-harness')],
  ['candidate-checkpoint', wrapper('checkpoint')],
  ['candidate-closeout', wrapper('closeout', '-m', 'ci: verify exact candidate tree')],
  ['candidate-release', wrapper('release')],
  ['candidate-pr-audit', wrapper('audit', '--profile', 'pr')],
  [
    'candidate-receipts',
    [
      'node',
      [
        trustedRoot
          ? '/opt/sniptale-trusted/tooling/ci/validate-coverage-proof.mjs'
          : 'tooling/ci/validate-coverage-proof.mjs',
      ],
    ],
  ],
  ['candidate-security', wrapper('audit', '--profile', 'security')],
  ['candidate-licenses', licenseCommand],
  ['candidate-coverage', wrapper('audit', '--profile', 'coverage')],
]);
const candidateFinalizeLane = 'candidate-release-artifact';
if (
  ![...Object.keys(laneCommands), ...candidatePhaseCommands.keys(), candidateFinalizeLane].includes(
    lane
  )
) {
  throw new Error('Usage: run-lane.mjs <release|release-audit|security|coverage|candidate-PHASE>');
}
if (process.env.SNIPTALE_CI_IN_CONTAINER !== '1') {
  throw new Error('Canonical lanes may only run inside the locked QA container.');
}

const startedAtMs = Date.now();
const phases = [];

function selectelInfrastructure() {
  if (process.env.SNIPTALE_SELECTEL_ATTEMPT === undefined) return null;
  return {
    provider: 'selectel',
    selectedProfileIndex: Number(process.env.SNIPTALE_SELECTEL_ATTEMPT),
    profilesDigest: process.env.SNIPTALE_SELECTEL_PROFILES_DIGEST,
    serverId: process.env.SNIPTALE_SELECTEL_SERVER_ID,
    availabilityZone: process.env.SNIPTALE_SELECTEL_AVAILABILITY_ZONE,
    imageReference: process.env.SNIPTALE_CI_IMAGE,
    resourceProfile: {
      cpuTokens: Number(process.env.SNIPTALE_QA_CPU_TOKENS),
      memoryMiB: Number(process.env.SNIPTALE_QA_MEMORY_MIB),
      vitestWorkers: Number(process.env.SNIPTALE_QA_VITEST_MAX_WORKERS),
      playwrightWorkers: Number(process.env.SNIPTALE_QA_PLAYWRIGHT_WORKERS),
      securityWorkers: Number(process.env.SNIPTALE_QA_SECURITY_WORKERS),
    },
  };
}

function runPhase(id, command) {
  const startedAt = new Date().toISOString();
  const result = spawnSync(command[0], command[1], { stdio: 'inherit', env: process.env });
  const status = result.status ?? 1;
  phases.push({
    id,
    command: [command[0], ...command[1]].join(' '),
    startedAt,
    finishedAt: new Date().toISOString(),
    status: status === 0 ? 'passed' : 'failed',
    exitCode: status,
  });
  return status;
}

function blockPhase(id, reason) {
  phases.push({ id, command: null, startedAt: null, finishedAt: null, status: 'blocked', reason });
}

function runStandardLane() {
  let standardStatus = 0;
  for (const [id, command] of installCommands) {
    if (standardStatus !== 0) {
      blockPhase(id, 'earlier install phase failed');
      continue;
    }
    standardStatus = runPhase(id, command);
  }
  for (const [index, command] of laneCommands[lane].entries()) {
    if (standardStatus !== 0) {
      blockPhase(`${lane}-${index + 1}`, 'earlier lane command failed');
      continue;
    }
    standardStatus = runPhase(`${lane}-${index + 1}`, command);
  }
  return standardStatus;
}
const candidatePhaseCommand = candidatePhaseCommands.get(lane);
let status;
if (lane === candidateFinalizeLane) {
  const startedAtMs = Number(process.env.SNIPTALE_CANDIDATE_STARTED_AT_MS);
  if (!Number.isSafeInteger(startedAtMs) || startedAtMs <= 0) {
    throw new Error('Candidate artifact finalization requires a valid lane start time.');
  }
  try {
    await finalizeCandidateReleaseArchive({
      candidateRoot: process.cwd(),
      startedAtMs,
      temporaryParent: '/tmp',
    });
    status = 0;
  } catch (error) {
    process.stderr.write(
      `Candidate release artifact finalization failed: ${error instanceof Error ? error.message : String(error)}\n`
    );
    status = 1;
  }
} else {
  status = candidatePhaseCommand
    ? runPhase(lane.slice('candidate-'.length), candidatePhaseCommand)
    : runStandardLane();
}

if (!candidatePhaseCommand && lane !== candidateFinalizeLane) {
  try {
    const artifactPath = collectLaneArtifacts({
      lane,
      startedAtMs,
      status: status === 0 ? 'passed' : 'failed',
      command: phases.filter(({ command }) => command).map(({ command }) => command),
      phases,
      containerDigest: process.env.SNIPTALE_CI_CONTAINER_DIGEST,
      candidateTree: process.env.SNIPTALE_CANDIDATE_TREE ?? null,
      trustedControlSha: process.env.SNIPTALE_TRUSTED_CONTROL_SHA ?? null,
      resourceProfiles: {
        bounded: resolveQaResourceProfile(),
        release: resolveQaReleaseResourceProfile(),
      },
      infrastructure: selectelInfrastructure(),
    });
    process.stdout.write(`SNIPTALE_ARTIFACT_PATH=${artifactPath}\n`);
  } catch (error) {
    process.stderr.write(
      `Artifact collection failed: ${error instanceof Error ? error.message : String(error)}\n`
    );
    status ||= 1;
  }
}
process.exit(status);
