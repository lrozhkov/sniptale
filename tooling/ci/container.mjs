import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { collectLaneArtifacts, finalizeCandidateReleaseArchive } from './artifacts.mjs';
import {
  materializeCandidateWorkspace,
  restoreCandidateCommit,
  restoreCandidateDiff,
  verifyCandidateCloseout,
  verifyCandidateFinalState,
} from './candidate-workspace.mjs';
import {
  resolveQaReleaseResourceProfile,
  resolveQaResourceProfile,
} from '../qa/runtime/resource-profile.mjs';
import { prepareTrustedControlDependencyMount } from './trusted-control-dependencies.mjs';
import { resolveReusableUnitProofHostPath } from './unit-proof-host.mjs';

const lane = process.argv[2];
if (!['candidate', 'release', 'release-audit', 'security', 'coverage'].includes(lane)) {
  throw new Error('Usage: container.mjs <candidate|release|release-audit|security|coverage>');
}
const root = process.cwd();
const trustedCiRoot = process.env.SNIPTALE_TRUSTED_CI_ROOT;
const controlRoot = trustedCiRoot ? path.resolve(trustedCiRoot) : root;
if (trustedCiRoot && !fs.statSync(controlRoot).isDirectory()) {
  throw new Error('Trusted CI root must be a materialized directory.');
}
const lockBytes = fs.readFileSync(path.join(controlRoot, 'tooling/configs/ci/toolchain.lock.json'));
const lockDigest = crypto.createHash('sha256').update(lockBytes).digest('hex');
const image = process.env.SNIPTALE_CI_IMAGE ?? `sniptale-qa:${lockDigest.slice(0, 16)}`;

function readGit(args, cwd = root) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${(result.stderr ?? '').trim()}`);
  }
  return result.stdout.trim();
}

function run(args, options = {}) {
  const result = spawnSync('docker', args, { stdio: 'inherit', ...options });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (process.env.SNIPTALE_CI_SKIP_BUILD !== '1') {
  run([
    'build',
    '--platform',
    'linux/amd64',
    '--file',
    path.join(controlRoot, 'tooling/ci/Dockerfile'),
    '--tag',
    image,
    controlRoot,
  ]);
}
const inspect = spawnSync('docker', ['image', 'inspect', '--format={{.Id}}', image], {
  encoding: 'utf8',
});
if (inspect.status !== 0 || !/^sha256:[a-f0-9]{64}$/u.test(inspect.stdout.trim())) {
  throw new Error(`Unable to resolve immutable container digest for ${image}.`);
}
const digest = inspect.stdout.trim();
const candidateSha =
  process.env.SNIPTALE_CANDIDATE_SHA ??
  process.env.GITHUB_SHA ??
  process.env.SNIPTALE_PROOF_SHA ??
  'local';
const candidateWorkspace =
  lane === 'candidate'
    ? materializeCandidateWorkspace({
        root,
        baseSha: process.env.SNIPTALE_BASE_SHA || readGit(['rev-parse', `${candidateSha}^`]),
        candidateSha,
      })
    : null;
const unitProofHostPath = resolveReusableUnitProofHostPath(process.env.SNIPTALE_UNIT_PROOF_PATH);
if (process.env.SNIPTALE_UNIT_PROOF_PATH && !unitProofHostPath) {
  process.stderr.write('Reusable unit proof is unavailable; running the complete unit suite.\n');
}
const executionRoot = candidateWorkspace?.workspace ?? root;
const trustedControlSha =
  process.env.SNIPTALE_TRUSTED_CONTROL_SHA ??
  (trustedCiRoot ? null : readGit(['rev-parse', 'HEAD'], controlRoot));
if (lane === 'candidate' && !/^[a-f0-9]{40}$/u.test(trustedControlSha ?? '')) {
  throw new Error('Canonical candidate proof requires a trusted control commit SHA.');
}
const environment = [
  'CI=1',
  'HUSKY=0',
  'HOME=/tmp/sniptale-ci-home',
  'SNIPTALE_CI_IN_CONTAINER=1',
  `SNIPTALE_CI_CONTAINER_DIGEST=${digest}`,
  `SNIPTALE_PROOF_SHA=${candidateSha}`,
  `GITHUB_SHA=${candidateSha}`,
];
if (candidateWorkspace) {
  environment.push(
    `SNIPTALE_BASE_SHA=${candidateWorkspace.baseSha}`,
    `SNIPTALE_CANDIDATE_TREE=${candidateWorkspace.candidateTree}`,
    `SNIPTALE_TRUSTED_CONTROL_SHA=${trustedControlSha}`,
    'SNIPTALE_UNIT_PROOF_AUTHORITY=external-only'
  );
}
if (unitProofHostPath) environment.push('SNIPTALE_UNIT_PROOF_PATH=/opt/sniptale-unit-proof.json');
if (trustedCiRoot) environment.push('SNIPTALE_TRUSTED_CI_ROOT=/opt/sniptale-trusted');
for (const name of [
  'GITHUB_RUN_ID',
  'SNIPTALE_BASE_SHA',
  'SNIPTALE_RELEASE_AUDIT',
  'SNIPTALE_QA_CPU_TOKENS',
  'SNIPTALE_QA_MEMORY_MIB',
  'SNIPTALE_QA_VITEST_MAX_WORKERS',
  'SNIPTALE_QA_PLAYWRIGHT_WORKERS',
  'SNIPTALE_QA_SECURITY_WORKERS',
  'SNIPTALE_SELECTEL_ATTEMPT',
  'SNIPTALE_SELECTEL_SERVER_ID',
  'SNIPTALE_SELECTEL_AVAILABILITY_ZONE',
]) {
  if (process.env[name]) environment.push(`${name}=${process.env[name]}`);
}
const baseContainerArgs = [
  'run',
  '--rm',
  '--platform',
  'linux/amd64',
  '--cap-drop=ALL',
  '--security-opt=no-new-privileges',
  '--user',
  `${process.getuid?.() ?? 1000}:${process.getgid?.() ?? 1000}`,
  '--shm-size=2g',
  '--tmpfs',
  '/tmp:rw,exec,nosuid,nodev,size=4g',
  '--volume',
  `${executionRoot}:/workspace`,
];
if (trustedCiRoot) {
  baseContainerArgs.push(
    '--volume',
    `${controlRoot}:/opt/sniptale-trusted:ro`,
    ...prepareTrustedControlDependencyMount({ controlRoot, executionRoot, trustedCiRoot })
  );
}
if (unitProofHostPath) {
  baseContainerArgs.push('--volume', `${unitProofHostPath}:/opt/sniptale-unit-proof.json:ro`);
}
for (const value of environment) baseContainerArgs.push('--env', value);

function runContainer(containerLane) {
  return spawnSync(
    'docker',
    [
      ...baseContainerArgs,
      image,
      'bash',
      '-c',
      trustedCiRoot
        ? 'mkdir -p "$HOME" && exec node /opt/sniptale-trusted/tooling/ci/run-lane.mjs "$1"'
        : 'mkdir -p "$HOME" && exec node tooling/ci/run-lane.mjs "$1"',
      'sniptale-ci',
      containerLane,
    ],
    { stdio: 'inherit' }
  );
}

const candidatePhaseDefinitions = [
  { id: 'install', command: 'npm ci --ignore-scripts' },
  { id: 'provision-canvas', command: 'npm rebuild canvas' },
  { id: 'verify-canvas', command: 'canvas 2d context smoke' },
  { id: 'provision-ast-grep', command: 'node node_modules/@ast-grep/cli/postinstall.js' },
  { id: 'verify-ast-grep', command: 'node_modules/.bin/ast-grep --version' },
  { id: 'release-harness', command: 'qa:release-harness', authority: 'diff' },
  { id: 'checkpoint', command: 'qa:checkpoint', authority: 'diff' },
  { id: 'closeout', command: 'qa:closeout', authority: 'diff' },
  {
    id: 'candidate-tree',
    command: 'verify closeout tree and restore trusted candidate Git authority',
    authority: 'closeout',
  },
  { id: 'release', command: 'qa:release', authority: 'commit' },
  { id: 'security', command: 'qa:audit --profile security', authority: 'commit' },
  { id: 'licenses', command: 'license audit', authority: 'commit' },
  { id: 'coverage', command: 'qa:audit --profile coverage', authority: 'commit' },
];

function restoreCandidateAuthority(mode) {
  const input = { ...candidateWorkspace, cwd: candidateWorkspace.workspace };
  if (mode === 'diff') return restoreCandidateDiff(input);
  if (mode === 'commit') return restoreCandidateCommit(input);
  if (mode === 'closeout') {
    verifyCandidateCloseout(input);
    return restoreCandidateCommit(input);
  }
  return null;
}

function runCandidatePhases() {
  const phases = [];
  let failed = false;
  for (const phase of candidatePhaseDefinitions) {
    if (failed) {
      phases.push({
        id: phase.id,
        command: null,
        startedAt: null,
        finishedAt: null,
        status: 'blocked',
        reason: 'earlier canonical candidate phase failed',
      });
      continue;
    }
    const startedAt = new Date().toISOString();
    process.stdout.write(`[ci:phase] start ${phase.id}\n`);
    try {
      if (phase.authority) restoreCandidateAuthority(phase.authority);
      const result =
        phase.id === 'candidate-tree' ? { status: 0 } : runContainer(`candidate-${phase.id}`);
      const status = result.status ?? 1;
      phases.push({
        id: phase.id,
        command: phase.command,
        startedAt,
        finishedAt: new Date().toISOString(),
        status: status === 0 ? 'passed' : 'failed',
        exitCode: status,
      });
      failed = status !== 0;
      process.stdout.write(`[ci:phase] ${status === 0 ? 'passed' : 'failed'} ${phase.id}\n`);
    } catch (error) {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      phases.push({
        id: phase.id,
        command: phase.command,
        startedAt,
        finishedAt: new Date().toISOString(),
        status: 'failed',
        exitCode: 1,
      });
      failed = true;
      process.stdout.write(`[ci:phase] failed ${phase.id}\n`);
    }
  }
  return { phases, status: failed ? 1 : 0 };
}

const candidateStartedAtMs = Date.now();
const candidateResult = candidateWorkspace ? runCandidatePhases() : null;
const standardResult = candidateWorkspace ? null : runContainer(lane);
try {
  if (candidateWorkspace) {
    const passed = candidateResult.status === 0;
    if (passed) {
      verifyCandidateFinalState({ ...candidateWorkspace, cwd: candidateWorkspace.workspace });
      await finalizeCandidateReleaseArchive({
        candidateRoot: candidateWorkspace.workspace,
        startedAtMs: candidateStartedAtMs,
      });
    }
    const selectelInfrastructure = process.env.SNIPTALE_SELECTEL_ATTEMPT
      ? {
          provider: 'selectel',
          attempt: Number(process.env.SNIPTALE_SELECTEL_ATTEMPT),
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
        }
      : null;
    collectLaneArtifacts({
      lane: 'candidate',
      startedAtMs: candidateStartedAtMs,
      status: passed ? 'passed' : 'failed',
      command: ['qa:release-harness', 'qa:checkpoint', 'qa:closeout', 'qa:release', 'qa:audit'],
      phases: candidateResult.phases,
      containerDigest: digest,
      candidateTree: candidateWorkspace.candidateTree,
      trustedControlSha,
      resourceProfiles: {
        bounded: resolveQaResourceProfile(),
        release: resolveQaReleaseResourceProfile(),
      },
      infrastructure: selectelInfrastructure,
      repositoryRoot: candidateWorkspace.workspace,
    });
    const artifactRoot = path.join(candidateWorkspace.workspace, 'build/ci-artifacts');
    const matches = fs.existsSync(artifactRoot)
      ? fs
          .readdirSync(artifactRoot)
          .filter((entry) => entry.startsWith(`candidate-${candidateSha}-`))
      : [];
    if (matches.length !== 1) {
      throw new Error(`Expected exactly one candidate proof bundle, found ${matches.length}.`);
    }
    const destinationRoot = path.join(root, 'build/ci-artifacts');
    fs.mkdirSync(destinationRoot, { recursive: true });
    fs.cpSync(path.join(artifactRoot, matches[0]), path.join(destinationRoot, matches[0]), {
      recursive: true,
      errorOnExist: true,
      force: false,
    });
  }
} finally {
  if (candidateWorkspace) {
    fs.rmSync(candidateWorkspace.temporaryRoot, { recursive: true, force: true });
  }
}
if ((candidateResult?.status ?? standardResult?.status ?? 1) !== 0) {
  process.exit(candidateResult?.status ?? standardResult?.status ?? 1);
}
