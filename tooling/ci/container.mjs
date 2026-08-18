import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { collectLaneArtifacts, finalizeCandidateReleaseArchive } from './artifacts.mjs';
import {
  materializeCandidateWorkspace,
  verifyCandidateFinalState,
} from './candidate-workspace.mjs';
import {
  resolveQaReleaseResourceProfile,
  resolveQaResourceProfile,
} from '../qa/runtime/resource-profile.mjs';

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
    `SNIPTALE_TRUSTED_CONTROL_SHA=${trustedControlSha}`
  );
}
if (trustedCiRoot) environment.push('SNIPTALE_TRUSTED_CI_ROOT=/opt/sniptale-trusted');
for (const name of [
  'GITHUB_RUN_ID',
  'SNIPTALE_BASE_SHA',
  'SNIPTALE_RELEASE_AUDIT',
  'SNIPTALE_QA_CPU_TOKENS',
  'SNIPTALE_QA_MEMORY_MIB',
  'SNIPTALE_QA_VITEST_MAX_WORKERS',
]) {
  if (process.env[name]) environment.push(`${name}=${process.env[name]}`);
}
const args = [
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
  args.push('--volume', `${controlRoot}:/opt/sniptale-trusted:ro`);
}
for (const value of environment) args.push('--env', value);
args.push(
  image,
  'bash',
  '-c',
  trustedCiRoot
    ? 'mkdir -p "$HOME" && exec node /opt/sniptale-trusted/tooling/ci/run-lane.mjs "$1"'
    : 'mkdir -p "$HOME" && exec node tooling/ci/run-lane.mjs "$1"',
  'sniptale-ci',
  lane
);
const candidateStartedAtMs = Date.now();
const result = spawnSync('docker', args, { stdio: 'inherit' });
try {
  if (candidateWorkspace) {
    const passed = result.status === 0;
    if (passed) {
      verifyCandidateFinalState({ ...candidateWorkspace, cwd: candidateWorkspace.workspace });
      await finalizeCandidateReleaseArchive({
        candidateRoot: candidateWorkspace.workspace,
        startedAtMs: candidateStartedAtMs,
      });
    }
    const phaseIds = [
      'install',
      'provision-ast-grep',
      'verify-ast-grep',
      'release-harness',
      'checkpoint',
      'closeout',
      'candidate-tree',
      'release',
      'security',
      'licenses',
      'coverage',
    ];
    collectLaneArtifacts({
      lane: 'candidate',
      startedAtMs: candidateStartedAtMs,
      status: passed ? 'passed' : 'failed',
      command: ['qa:release-harness', 'qa:checkpoint', 'qa:closeout', 'qa:release', 'qa:audit'],
      phases: passed
        ? phaseIds.map((id) => ({ id, status: 'passed', exitCode: 0 }))
        : [{ id: 'candidate-lane', status: 'failed', exitCode: result.status ?? 1 }],
      containerDigest: digest,
      candidateTree: candidateWorkspace.candidateTree,
      trustedControlSha,
      resourceProfiles: {
        bounded: resolveQaResourceProfile(),
        release: resolveQaReleaseResourceProfile(),
      },
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
if (result.status !== 0) process.exit(result.status ?? 1);
