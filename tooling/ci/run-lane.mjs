import { spawnSync } from 'node:child_process';

import { collectLaneArtifacts } from './artifacts.mjs';
import { verifyCandidateCloseout } from './candidate-workspace.mjs';
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
  ['provision-ast-grep', ['node', ['node_modules/@ast-grep/cli/postinstall.js']]],
  ['verify-ast-grep', ['node_modules/.bin/ast-grep', ['--version']]],
];
if (![...Object.keys(laneCommands), 'candidate'].includes(lane)) {
  throw new Error('Usage: run-lane.mjs <candidate|release|release-audit|security|coverage>');
}
if (process.env.SNIPTALE_CI_IN_CONTAINER !== '1') {
  throw new Error('Canonical lanes may only run inside the locked QA container.');
}

const startedAtMs = Date.now();
const phases = [];
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

function runCandidateLane() {
  const prerequisiteCommands = [
    ...installCommands,
    ['release-harness', wrapper('release-harness')],
    ['checkpoint', wrapper('checkpoint')],
    ['closeout', wrapper('closeout', '-m', 'ci: verify exact candidate tree')],
  ];
  let prerequisiteFailure = false;
  for (const [id, command] of prerequisiteCommands) {
    if (prerequisiteFailure) {
      blockPhase(id, 'earlier canonical prerequisite failed');
      continue;
    }
    prerequisiteFailure = runPhase(id, command) !== 0;
  }
  if (prerequisiteFailure) {
    for (const id of ['candidate-tree', 'release', 'security', 'licenses', 'coverage']) {
      blockPhase(id, 'canonical closeout did not complete');
    }
    return 1;
  }

  try {
    verifyCandidateCloseout({
      baseSha: process.env.SNIPTALE_BASE_SHA,
      candidateSha: process.env.GITHUB_SHA,
      candidateTree: process.env.SNIPTALE_CANDIDATE_TREE,
    });
    phases.push({
      id: 'candidate-tree',
      command: 'verify exact candidate tree',
      startedAt: null,
      finishedAt: new Date().toISOString(),
      status: 'passed',
      exitCode: 0,
    });
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    phases.push({
      id: 'candidate-tree',
      command: 'verify exact candidate tree',
      startedAt: null,
      finishedAt: new Date().toISOString(),
      status: 'failed',
      exitCode: 1,
    });
    for (const id of ['release', 'security', 'licenses', 'coverage']) {
      blockPhase(id, 'candidate tree identity failed');
    }
    return 1;
  }

  const releaseStatus = runPhase('release', wrapper('release'));
  const securityStatus = runPhase('security', wrapper('audit', '--profile', 'security'));
  const licenseStatus = securityStatus === 0 ? runPhase('licenses', licenseCommand) : 1;
  if (securityStatus !== 0) blockPhase('licenses', 'security audit failed');
  const coverageStatus = runPhase('coverage', wrapper('audit', '--profile', 'coverage'));
  return releaseStatus || securityStatus || licenseStatus || coverageStatus;
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
let status = lane === 'candidate' ? runCandidateLane() : runStandardLane();

if (lane !== 'candidate') {
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
