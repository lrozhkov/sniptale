import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const lane = process.argv[2];
if (!['release', 'security', 'coverage'].includes(lane)) {
  throw new Error('Usage: container.mjs <release|security|coverage>');
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
const environment = [
  'CI=1',
  'HUSKY=0',
  'HOME=/tmp/sniptale-ci-home',
  'SNIPTALE_CI_IN_CONTAINER=1',
  `SNIPTALE_CI_CONTAINER_DIGEST=${digest}`,
  `SNIPTALE_PROOF_SHA=${candidateSha}`,
  `GITHUB_SHA=${candidateSha}`,
];
if (trustedCiRoot) environment.push('SNIPTALE_TRUSTED_CI_ROOT=/opt/sniptale-trusted');
for (const name of ['GITHUB_RUN_ID', 'SNIPTALE_BASE_SHA', 'SNIPTALE_RELEASE_AUDIT']) {
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
  `${root}:/workspace`,
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
run(args);
