import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveReusableCodeqlProofHostPaths } from './codeql-proof-host.mjs';
import { resolveReusableCoverageProofHostPaths } from './coverage-proof-host.mjs';
import { selectReusableFastProof } from './fast-proof-reuse.mjs';
import { resolveReusableUnitProofHostPath } from './unit-proof-host.mjs';
import { resolveReusableBuildProofHostPaths } from './build-proof-host.mjs';
import { createCandidateControlDigest } from './control-digest.mjs';
import { validateCandidateImageEnvironment } from './container-command.mjs';
import { createFastGateInputDigest } from './fast-gate-inputs.mjs';
import {
  resolveContainerDigest,
  resolveGithubRunIdentityEnvironment,
} from './container-identity.mjs';

const lane = process.argv[2];
if (!['proof', 'release'].includes(lane)) {
  throw new Error('Usage: container.mjs <proof|release>');
}

const root = process.cwd();
const trustedRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
if (!fs.statSync(trustedRoot).isDirectory()) throw new Error('Trusted CI root is unavailable.');
const lockBytes = fs.readFileSync(path.join(root, 'tooling/configs/ci/toolchain.lock.json'));
const lockDigest = crypto.createHash('sha256').update(lockBytes).digest('hex');
const image = process.env.SNIPTALE_CI_IMAGE ?? `sniptale-qa:${lockDigest.slice(0, 16)}`;

function command(executable, args, options = {}) {
  const result = spawnSync(executable, args, { encoding: 'utf8', ...options });
  if (result.status !== 0) {
    throw new Error(
      `${executable} ${args.join(' ')} failed: ${[result.stdout, result.stderr]
        .filter(Boolean)
        .join('\n')
        .trim()}`
    );
  }
  return result.stdout.trim();
}

function runDocker(args, options = {}) {
  const result = spawnSync('docker', args, { stdio: 'inherit', ...options });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function assertCleanCommit(expectedSha) {
  const head = command('git', ['rev-parse', 'HEAD']);
  if (expectedSha !== 'local' && head !== expectedSha) {
    throw new Error(`Candidate HEAD mismatch: expected ${expectedSha}, observed ${head}.`);
  }
  command('git', ['diff', '--quiet']);
  command('git', ['diff', '--cached', '--quiet']);
  return { head, tree: command('git', ['rev-parse', 'HEAD^{tree}']) };
}

function materializeWorkspaceTree() {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sniptale-ci-index-'));
  const indexPath = path.join(temporaryRoot, 'index');
  const environment = { ...process.env, GIT_INDEX_FILE: indexPath };
  try {
    command('git', ['read-tree', 'HEAD'], { env: environment });
    command('git', ['add', '--all', '--', '.'], { env: environment });
    return command('git', ['write-tree'], { env: environment });
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

function resolveCandidateIdentity(expectedSha) {
  if (process.env.SNIPTALE_LOCAL_WORKSPACE === '1') {
    return {
      head: command('git', ['rev-parse', 'HEAD']),
      tree: materializeWorkspaceTree(),
      workspaceMode: 'local-workspace',
    };
  }
  return { ...assertCleanCommit(expectedSha), workspaceMode: 'committed' };
}

const candidateSha =
  process.env.SNIPTALE_CANDIDATE_SHA ??
  process.env.GITHUB_SHA ??
  process.env.SNIPTALE_PROOF_SHA ??
  'local';
const candidateIdentity = resolveCandidateIdentity(candidateSha);
const candidateControlDigest = createCandidateControlDigest();
const trustedControlDigest = createCandidateControlDigest({ cwd: trustedRoot });
const controlsChanged = candidateControlDigest !== trustedControlDigest;
const gateInputDigest = createFastGateInputDigest();

if (process.env.SNIPTALE_CI_SKIP_BUILD !== '1') {
  runDocker([
    'build',
    '--platform',
    'linux/amd64',
    '--file',
    path.join(root, 'tooling/ci/Dockerfile'),
    '--tag',
    image,
    root,
  ]);
} else {
  const inspect = spawnSync('docker', ['image', 'inspect', image], { stdio: 'ignore' });
  if (inspect.status !== 0) runDocker(['pull', image]);
}
const digest = resolveContainerDigest(image, () =>
  command('docker', ['image', 'inspect', '--format={{.Id}}', image])
);
validateCandidateImageEnvironment(
  JSON.parse(command('docker', ['image', 'inspect', '--format={{json .Config.Env}}', image]))
);

const trustedControlSha = process.env.SNIPTALE_TRUSTED_CONTROL_SHA ?? candidateIdentity.head;
if (!/^[a-f0-9]{40}$/u.test(trustedControlSha ?? '')) {
  throw new Error('Canonical CI proof requires a trusted control commit SHA.');
}
if (lane === 'release' && (controlsChanged || trustedControlSha !== candidateIdentity.head)) {
  throw new Error('Release provenance requires QA controls already trusted by the main commit.');
}

const reuseAllowed = !controlsChanged;
const requestedReuse = [
  'SNIPTALE_FAST_PROOF_PATH',
  'SNIPTALE_UNIT_PROOF_PATH',
  'SNIPTALE_BUILD_PROOF_PATH',
  'SNIPTALE_BUILD_ARCHIVE_PATH',
  'SNIPTALE_CODEQL_PROOF_PATH',
  'SNIPTALE_CODEQL_SARIF_PATH',
  'SNIPTALE_COVERAGE_PROOF_PATH',
  'SNIPTALE_COVERAGE_REPORTS_PATH',
].some((name) => process.env[name]);
if (!reuseAllowed && requestedReuse) {
  process.stderr.write('QA controls changed; all reusable proof inputs are disabled.\n');
}

const reusableFastProof =
  reuseAllowed && process.env.SNIPTALE_FAST_PROOF_PATH
    ? selectReusableFastProof(process.env.SNIPTALE_FAST_PROOF_PATH, {
        commit: candidateIdentity.head,
        candidateTree: candidateIdentity.tree,
        trustedControlSha,
        trustedControlDigest,
        containerDigest: digest,
        controlDigest: candidateControlDigest,
        gateInputDigest,
      })
    : null;
if (reuseAllowed && process.env.SNIPTALE_FAST_PROOF_PATH && !reusableFastProof) {
  process.stderr.write(
    'Reusable Fast proof is incompatible; running the complete Fast prerequisite on this runner.\n'
  );
}
if (reusableFastProof) {
  const destination = path.join(root, 'build', path.basename(reusableFastProof.archivePath));
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(reusableFastProof.archivePath, destination, fs.constants.COPYFILE_EXCL);
}

const unitProofHostPath = reuseAllowed
  ? resolveReusableUnitProofHostPath(process.env.SNIPTALE_UNIT_PROOF_PATH)
  : null;
const buildProofHostPaths = reusableFastProof
  ? {
      proof: reusableFastProof.buildProofPath,
      archive: reusableFastProof.archivePath,
    }
  : reuseAllowed
    ? resolveReusableBuildProofHostPaths({
        proofPath: process.env.SNIPTALE_BUILD_PROOF_PATH,
        archivePath: process.env.SNIPTALE_BUILD_ARCHIVE_PATH,
      })
    : null;
const codeqlProofHostPaths = reuseAllowed
  ? resolveReusableCodeqlProofHostPaths({
      proofPath: process.env.SNIPTALE_CODEQL_PROOF_PATH,
      sarifPath: process.env.SNIPTALE_CODEQL_SARIF_PATH,
    })
  : null;
const coverageProofHostPaths = reuseAllowed
  ? resolveReusableCoverageProofHostPaths({
      proofPath: process.env.SNIPTALE_COVERAGE_PROOF_PATH,
      reportsPath: process.env.SNIPTALE_COVERAGE_REPORTS_PATH,
    })
  : null;
if (reuseAllowed && process.env.SNIPTALE_UNIT_PROOF_PATH && !unitProofHostPath) {
  process.stderr.write('Reusable unit proof is unavailable; running the complete unit suite.\n');
}
if (
  reuseAllowed &&
  (process.env.SNIPTALE_CODEQL_PROOF_PATH || process.env.SNIPTALE_CODEQL_SARIF_PATH) &&
  !codeqlProofHostPaths
) {
  process.stderr.write('Reusable CodeQL proof is unavailable; running complete CodeQL.\n');
}
if (
  reuseAllowed &&
  (process.env.SNIPTALE_COVERAGE_PROOF_PATH || process.env.SNIPTALE_COVERAGE_REPORTS_PATH) &&
  !coverageProofHostPaths
) {
  process.stderr.write('Reusable coverage proof is unavailable; running complete coverage.\n');
}

const environment = [
  'CI=1',
  'HUSKY=0',
  'HOME=/workspace/.tmp/ci-home',
  'SNIPTALE_CI_IN_CONTAINER=1',
  `SNIPTALE_CI_CONTAINER_DIGEST=${digest}`,
  `SNIPTALE_PROOF_SHA=${candidateIdentity.head}`,
  `SNIPTALE_CANDIDATE_SHA=${candidateIdentity.head}`,
  `SNIPTALE_CANDIDATE_TREE=${candidateIdentity.tree}`,
  `SNIPTALE_WORKSPACE_MODE=${candidateIdentity.workspaceMode}`,
  `SNIPTALE_TRUSTED_CONTROL_SHA=${trustedControlSha}`,
  `SNIPTALE_TRUSTED_CONTROL_DIGEST=${trustedControlDigest}`,
  `SNIPTALE_TRUSTED_CANDIDATE_CONTROL_DIGEST=${candidateControlDigest}`,
  `SNIPTALE_CANDIDATE_CONTROL_DIGEST=${candidateControlDigest}`,
  'SNIPTALE_UNIT_PROOF_AUTHORITY=external-only',
  'SNIPTALE_CODEQL_PROOF_AUTHORITY=external-only',
  'SNIPTALE_COVERAGE_PROOF_AUTHORITY=external-only',
  'SNIPTALE_BUILD_PROOF_AUTHORITY=external-only',
  'SNIPTALE_MUTATION_CLI=/opt/sniptale-mutation/node_modules/@stryker-mutator/core/bin/stryker.js',
];
if (unitProofHostPath) environment.push('SNIPTALE_UNIT_PROOF_PATH=/opt/sniptale-unit-proof.json');
if (codeqlProofHostPaths) {
  environment.push(
    'SNIPTALE_CODEQL_PROOF_PATH=/opt/sniptale-codeql-proof.json',
    'SNIPTALE_CODEQL_SARIF_PATH=/opt/sniptale-codeql-results.sarif'
  );
}
if (coverageProofHostPaths) {
  environment.push(
    'SNIPTALE_COVERAGE_PROOF_PATH=/opt/sniptale-coverage-proof.json',
    'SNIPTALE_COVERAGE_REPORTS_PATH=/opt/sniptale-coverage-reports'
  );
}
if (buildProofHostPaths) {
  environment.push(
    'SNIPTALE_BUILD_PROOF_PATH=/opt/sniptale-build-proof.json',
    'SNIPTALE_BUILD_ARCHIVE_PATH=/opt/sniptale-build-archive.zip'
  );
}
if (reusableFastProof) {
  environment.push(
    'SNIPTALE_REUSE_FAST_PROOF=1',
    'SNIPTALE_FAST_PROOF_PATH=/opt/sniptale-fast-proof'
  );
}
environment.push(...resolveGithubRunIdentityEnvironment());
for (const name of [
  'SNIPTALE_BASE_SHA',
  'SNIPTALE_QA_CPU_TOKENS',
  'SNIPTALE_QA_MEMORY_MIB',
  'SNIPTALE_QA_VITEST_MAX_WORKERS',
  'SNIPTALE_QA_PLAYWRIGHT_WORKERS',
  'SNIPTALE_QA_SECURITY_WORKERS',
  'SNIPTALE_SELECTEL_ATTEMPT',
  'SNIPTALE_SELECTEL_SERVER_ID',
  'SNIPTALE_SELECTEL_AVAILABILITY_ZONE',
  'SNIPTALE_SELECTEL_PROFILES_DIGEST',
]) {
  if (process.env[name]) environment.push(`${name}=${process.env[name]}`);
}
const dockerArgs = [
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
  `${root}:/workspace`,
  '--volume',
  `${path.join(root, '.git')}:/workspace/.git:ro`,
  '--volume',
  `${trustedRoot}:/opt/sniptale-trusted:ro`,
];
if (unitProofHostPath) {
  dockerArgs.push('--volume', `${unitProofHostPath}:/opt/sniptale-unit-proof.json:ro`);
}
if (codeqlProofHostPaths) {
  dockerArgs.push(
    '--volume',
    `${codeqlProofHostPaths.proof}:/opt/sniptale-codeql-proof.json:ro`,
    '--volume',
    `${codeqlProofHostPaths.sarif}:/opt/sniptale-codeql-results.sarif:ro`
  );
}
if (coverageProofHostPaths) {
  dockerArgs.push(
    '--volume',
    `${coverageProofHostPaths.proof}:/opt/sniptale-coverage-proof.json:ro`,
    '--volume',
    `${coverageProofHostPaths.reports}:/opt/sniptale-coverage-reports:ro`
  );
}
if (buildProofHostPaths) {
  dockerArgs.push(
    '--volume',
    `${buildProofHostPaths.proof}:/opt/sniptale-build-proof.json:ro`,
    '--volume',
    `${buildProofHostPaths.archive}:/opt/sniptale-build-archive.zip:ro`
  );
}
if (reusableFastProof) {
  dockerArgs.push(
    '--volume',
    `${path.resolve(process.env.SNIPTALE_FAST_PROOF_PATH)}:/opt/sniptale-fast-proof:ro`
  );
}
for (const value of environment) dockerArgs.push('--env', value);
fs.mkdirSync(path.join(root, '.tmp/ci-home'), { recursive: true });
const trustedIdentityEnvironment = Object.fromEntries(
  environment
    .map((value) => {
      const separator = value.indexOf('=');
      return [value.slice(0, separator), value.slice(separator + 1)];
    })
    .filter(([name]) => name.startsWith('SNIPTALE_'))
);
const trustedHostEnvironment = {
  ...process.env,
  ...trustedIdentityEnvironment,
  SNIPTALE_CI_TRUSTED_HOST: '1',
  SNIPTALE_CI_DOCKER_ARGS_JSON: JSON.stringify(dockerArgs),
  SNIPTALE_CI_IMAGE: image,
};

const result = spawnSync(
  process.execPath,
  [path.join(trustedRoot, 'tooling/ci/run-lane.mjs'), lane],
  { stdio: 'inherit', env: trustedHostEnvironment }
);
const finalIdentity = resolveCandidateIdentity(candidateIdentity.head);
if (finalIdentity.tree !== candidateIdentity.tree) {
  throw new Error('Canonical CI worktree changed the candidate tree.');
}
process.exit(result.status ?? 1);
