import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { createCandidateControlDigest } from './control-digest.mjs';
import { ensureLocalToolchain } from './local-toolchain.mjs';
import { sealLaneArtifacts } from './seal-lane-artifacts.mjs';
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
const localToolchain = await ensureLocalToolchain({ lane });
const environment = {
  ...localToolchain.environment,
  npm_config_cache: path.resolve('.tmp/npm-cache'),
  PLAYWRIGHT_BROWSERS_PATH:
    process.env.PLAYWRIGHT_BROWSERS_PATH ?? path.resolve('.playwright-browsers'),
  SNIPTALE_WORKSPACE_MODE: 'local-workspace',
};
const args = process.argv.slice(3);
for (let index = 0; index < args.length; index += 2) {
  const name = options.get(args[index]);
  const value = args[index + 1];
  if (!name || !/^\d+$/u.test(value ?? '') || Number(value) < 1) {
    throw new Error('Resource flags are --cpu N, --memory-mib N, and --workers N.');
  }
  environment[name] = value;
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

const commit = command(['rev-parse', 'HEAD']);
const initialTree = workspaceTree();
const localControlDigest = createCandidateControlDigest();
Object.assign(environment, {
  SNIPTALE_CANDIDATE_SHA: commit,
  SNIPTALE_CANDIDATE_TREE: initialTree,
  SNIPTALE_TRUSTED_CONTROL_SHA: commit,
  SNIPTALE_CANDIDATE_CONTROL_DIGEST: localControlDigest,
  SNIPTALE_PROOF_SHA: commit,
});
Object.assign(process.env, environment);
const runtimeIdentity = {
  kind: 'host-wsl',
  digest: `sha256:${crypto
    .createHash('sha256')
    .update(
      JSON.stringify({
        node: process.version,
        platform: process.platform,
        architecture: process.arch,
        toolchain: localToolchain.lockDigest,
      })
    )
    .digest('hex')}`,
};
const startedAtMs = Date.now();
const commands = [
  ['install', 'npm', ['ci', '--ignore-scripts']],
  [
    'verify-project-toolchain',
    process.execPath,
    [path.join(process.cwd(), 'tooling/ci/verify-project-toolchain.mjs')],
  ],
  [
    'validate-workflows',
    process.execPath,
    [path.join(process.cwd(), 'tooling/ci/validate-workflows.mjs'), 'actionlint'],
  ],
  ['provision-canvas', 'npm', ['rebuild', 'canvas']],
  ['provision-ast-grep', process.execPath, ['node_modules/@ast-grep/cli/postinstall.js']],
  ['playwright-smoke', process.execPath, ['tooling/ci/local-playwright-smoke.mjs']],
  [lane, process.execPath, [path.join(process.cwd(), `tooling/ci/${lane}-wrapper.mjs`)]],
];
const phases = [];
let status = 0;
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
process.exit(status);
