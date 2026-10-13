import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { createCandidateControlDigest } from './control-digest.mjs';
import {
  ensureLocalToolchain,
  resolveLocalExecutionEnvironmentIdentity,
} from './local-toolchain.mjs';
import { sealLaneArtifacts } from './seal-lane-artifacts.mjs';
import { prepareLocalFastProofAdmission } from './local-fast-proof-admission.mjs';
import { runObservedWrapper } from '../qa/wrappers/observed/runner.mjs';
import { acquireBlockingWrapperLock } from '../qa/runtime/locking/blocking-wrapper-lock.helpers.mjs';
import { acquireHostQaSlot, HOST_QUEUE_TICKET_ENV } from '../qa/runtime/locking/host-queue.mjs';
import {
  resolveQaReleaseResourceProfile,
  resolveQaResourceProfile,
} from '../qa/runtime/scheduling/resource-profile.mjs';

const lane = process.argv[2];
if (!['proof', 'release'].includes(lane)) {
  throw new Error('Usage: local.mjs <proof|release> [resource flags]');
}

const options = new Map([
  ['--cpu', 'SNIPTALE_QA_CPU_TOKENS'],
  ['--memory-mib', 'SNIPTALE_QA_MEMORY_MIB'],
  ['--workers', 'SNIPTALE_QA_VITEST_MAX_WORKERS'],
]);
const resourceEnvironment = {};
const rawArgs = process.argv.slice(3);
if (rawArgs.filter((value) => value === '--fresh-install').length > 1) {
  throw new Error('Duplicate local CI argument: --fresh-install');
}
const freshInstall = rawArgs.includes('--fresh-install');
const args = rawArgs.filter((value) => value !== '--fresh-install');
for (let index = 0; index < args.length; index += 2) {
  const name = options.get(args[index]);
  const value = args[index + 1];
  if (!name || !/^\d+$/u.test(value ?? '') || Number(value) < 1) {
    throw new Error(
      'Local CI flags are --fresh-install, --cpu N, --memory-mib N, and --workers N.'
    );
  }
  resourceEnvironment[name] = value;
}

function command(args, commandEnvironment = process.env) {
  const result = spawnSync('git', args, { encoding: 'utf8', env: commandEnvironment });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed.`);
  return result.stdout.trim();
}

function workspaceTree() {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sniptale-local-ci-index-'));
  const gitEnvironment = { ...process.env, GIT_INDEX_FILE: path.join(temporaryRoot, 'index') };
  try {
    command(['read-tree', 'HEAD'], gitEnvironment);
    command(['add', '--all', '--', '.'], gitEnvironment);
    return command(['write-tree'], gitEnvironment);
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

let environment;
let commit;
let initialTree;
let localControlDigest;
let runtimeIdentity;
const commands = [
  [
    'install',
    process.execPath,
    [
      path.join(process.cwd(), 'tooling/ci/local-project-bootstrap.mjs'),
      'install',
      ...(freshInstall ? ['--fresh'] : []),
    ],
  ],
  [
    'verify-project-toolchain',
    process.execPath,
    [path.join(process.cwd(), 'tooling/ci/verify-project-toolchain.mjs')],
  ],
  [
    'validate-workflows',
    process.execPath,
    [path.join(process.cwd(), 'tooling/ci/local-workflow-validation.mjs')],
  ],
  [
    'provision-canvas',
    process.execPath,
    [path.join(process.cwd(), 'tooling/ci/local-project-bootstrap.mjs'), 'canvas'],
  ],
  [
    'provision-ast-grep',
    process.execPath,
    [path.join(process.cwd(), 'tooling/ci/local-project-bootstrap.mjs'), 'ast-grep'],
  ],
  [lane, process.execPath, [path.join(process.cwd(), `tooling/ci/${lane}-wrapper.mjs`)]],
];
const phases = [];
let status = 0;
let canonicalPhase = null;
const startedAtMs = Date.now();
let repositoryLock;
let hostSlot;
const previousTicket = process.env[HOST_QUEUE_TICKET_ENV];

function releaseResources() {
  if (previousTicket === undefined) delete process.env[HOST_QUEUE_TICKET_ENV];
  else process.env[HOST_QUEUE_TICKET_ENV] = previousTicket;
  try {
    hostSlot?.release();
  } finally {
    repositoryLock?.release();
  }
}

async function executeLocalCi({ session }) {
  const localToolchain = await ensureLocalToolchain({ lane });
  environment = {
    ...localToolchain.environment,
    ...resourceEnvironment,
    npm_config_cache: path.resolve('.tmp/npm-cache'),
    PLAYWRIGHT_BROWSERS_PATH:
      process.env.PLAYWRIGHT_BROWSERS_PATH ?? path.resolve('.playwright-browsers'),
    SNIPTALE_WORKSPACE_MODE: 'local-workspace',
    SNIPTALE_LOCAL_CI_LANE: lane,
  };
  commit = command(['rev-parse', 'HEAD']);
  initialTree = workspaceTree();
  localControlDigest = createCandidateControlDigest();
  Object.assign(environment, {
    SNIPTALE_CANDIDATE_SHA: commit,
    SNIPTALE_CANDIDATE_TREE: initialTree,
    SNIPTALE_TRUSTED_CONTROL_SHA: commit,
    SNIPTALE_CANDIDATE_CONTROL_DIGEST: localControlDigest,
    SNIPTALE_PROOF_SHA: commit,
  });
  Object.assign(process.env, environment);
  runtimeIdentity = resolveLocalExecutionEnvironmentIdentity();
  if (lane === 'release') {
    const { admission, admissionPath } = prepareLocalFastProofAdmission({
      candidateTree: initialTree,
      expectedExecutionEnvironmentDigest: runtimeIdentity.digest,
    });
    const inherited = {
      SNIPTALE_FAST_PROOF_ADMISSION_PATH: admissionPath,
      SNIPTALE_FAST_PROOF_PATH: admission.proofRoot,
      SNIPTALE_REUSE_FAST_PROOF: '1',
      SNIPTALE_CI_EXECUTION_ENVIRONMENT_DIGEST: runtimeIdentity.digest,
      SNIPTALE_WORKSPACE_MODE: admission.workspaceMode,
    };
    Object.assign(environment, inherited);
    Object.assign(process.env, inherited);
  }
  for (const [id, executable, commandArguments] of commands) {
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
    const phaseStartedAt = new Date().toISOString();
    if (id === lane) {
      canonicalPhase = {
        id,
        command: `internal:tooling/ci/${lane}-wrapper.mjs`,
        startedAt: phaseStartedAt,
        finishedAt: null,
        status: 'running',
        exitCode: null,
      };
      phases.push(canonicalPhase);
      process.stdout.write(`[ci:phase] start ${id}\n`);
      if (lane === 'proof') {
        const { collectProofWrapperResults } = await import('./proof-wrapper.mjs');
        return collectProofWrapperResults({ session });
      }
      const { collectReleaseWrapperResults } = await import('./release-wrapper.mjs');
      return collectReleaseWrapperResults({ session });
    }
    process.stdout.write(`[ci:phase] start ${id}\n`);
    const result = spawnSync(executable, commandArguments, {
      env: environment,
      stdio: 'inherit',
    });
    status = result.status ?? 1;
    phases.push({
      id,
      command: [executable, ...commandArguments].join(' '),
      startedAt: phaseStartedAt,
      finishedAt: new Date().toISOString(),
      status: status === 0 ? 'passed' : 'failed',
      exitCode: status,
    });
    process.stdout.write(`[ci:phase] ${status === 0 ? 'passed' : 'failed'} ${id}\n`);
  }

  throw new Error('Local CI prerequisite phase failed.');
}

process.once('exit', releaseResources);
try {
  const outcome = await runObservedWrapper({
    wrapperId: `ci:${lane}`,
    label: `CI ${lane}`,
    argv: [],
    blocking: true,
    lockFactory: (wrapperId, options) => {
      repositoryLock = acquireBlockingWrapperLock(wrapperId, options);
      return { release() {} };
    },
    hostSlotFactory: async (wrapperId, options) => {
      hostSlot = await acquireHostQaSlot(wrapperId, options);
      return { ticketName: hostSlot.ticketName, release() {} };
    },
    execute: executeLocalCi,
  });
  status = outcome.exitCode;
  if (hostSlot?.ticketName) process.env[HOST_QUEUE_TICKET_ENV] = hostSlot.ticketName;
  if (canonicalPhase) {
    canonicalPhase.finishedAt = new Date().toISOString();
    canonicalPhase.status = status === 0 ? 'passed' : 'failed';
    canonicalPhase.exitCode = status;
    process.stdout.write(`[ci:phase] ${canonicalPhase.status} ${lane}\n`);
  }
  if (commands && runtimeIdentity) {
    const finalTree = workspaceTree();
    if (finalTree !== initialTree) {
      process.stderr.write('Local CI gate changed tracked workspace content.\n');
      status = 1;
    }
    const artifactSealed = sealLaneArtifacts({
      lane,
      phases,
      startedAtMs,
      label: `CI ${lane}`,
      artifactInput: {
        status: status === 0 ? 'passed' : 'failed',
        command: commands.map(([, executable, commandArguments]) =>
          [executable, ...commandArguments].join(' ')
        ),
        executionEnvironment: runtimeIdentity,
        candidateTree: initialTree,
        workspaceMode: 'local-workspace',
        trustedControlSha: commit,
        trustedControlDigest: localControlDigest,
        controlDigest: localControlDigest,
        resourceProfiles: {
          bounded: resolveQaResourceProfile({ env: environment }),
          release: resolveQaReleaseResourceProfile({ env: environment }),
        },
      },
    });
    if (!artifactSealed) status ||= 1;
  }
  process.exitCode = status;
} finally {
  process.off('exit', releaseResources);
  releaseResources();
}
