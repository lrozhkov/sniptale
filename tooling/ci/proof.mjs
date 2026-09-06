import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { assertProofAuthority } from './proof-authority.mjs';
import { admitCandidateProof } from './admit-candidate-proof.mjs';

function command(name, args, options = {}) {
  const result = spawnSync(name, args, { encoding: 'utf8', ...options });
  if (result.status !== 0) {
    process.stderr.write(result.stdout ?? '');
    process.stderr.write(result.stderr ?? '');
    process.exit(result.status ?? 1);
  }
  return result.stdout.trim();
}

const args = process.argv.slice(2);
const prIndex = args.indexOf('--pr');
const prNumber = prIndex >= 0 ? args[prIndex + 1] : null;
const reasonIndex = args.indexOf('--reason');
const bypassReason = reasonIndex >= 0 ? args[reasonIndex + 1]?.trim() : null;
const resourceOptions = [
  ['--cpu', 'SNIPTALE_QA_CPU_TOKENS'],
  ['--memory-mib', 'SNIPTALE_QA_MEMORY_MIB'],
  ['--workers', 'SNIPTALE_QA_VITEST_MAX_WORKERS'],
];
const resourceEnvironment = {};
const consumedArgumentIndexes = new Set();
const freshInstallIndex = args.indexOf('--fresh-install');
if (freshInstallIndex >= 0) {
  if (args.indexOf('--fresh-install', freshInstallIndex + 1) >= 0) {
    throw new Error('Duplicate ci:proof argument: --fresh-install');
  }
  consumedArgumentIndexes.add(freshInstallIndex);
}
for (const [flag, environmentName] of resourceOptions) {
  const index = args.indexOf(flag);
  if (index < 0) continue;
  if (args.indexOf(flag, index + 1) >= 0) throw new Error(`Duplicate ci:proof argument: ${flag}`);
  const value = args[index + 1];
  if (!/^\d+$/u.test(value ?? '') || Number(value) < 1) {
    throw new Error(`${flag} requires a positive integer.`);
  }
  consumedArgumentIndexes.add(index);
  consumedArgumentIndexes.add(index + 1);
  resourceEnvironment[environmentName] = value;
}
if (prIndex < 0) {
  const unknown = args.filter((_value, index) => !consumedArgumentIndexes.has(index));
  if (unknown.length > 0) throw new Error(`Unknown ci:proof arguments: ${unknown.join(', ')}`);
  const result = spawnSync(
    process.execPath,
    [
      path.join(process.cwd(), 'tooling/ci/local.mjs'),
      'proof',
      ...(freshInstallIndex >= 0 ? ['--fresh-install'] : []),
      ...Object.entries(resourceEnvironment).flatMap(([name, value]) => {
        const flag = resourceOptions.find(([, environmentName]) => environmentName === name)?.[0];
        return flag ? [flag, value] : [];
      }),
    ],
    { stdio: 'inherit' }
  );
  process.exit(result.status ?? 1);
}
if (!prNumber || !/^\d+$/u.test(prNumber)) {
  throw new Error(
    'Usage: npm run ci:proof -- --pr <number> --reason <audit note> [--cpu N] [--memory-mib N] [--workers N]'
  );
}
if (freshInstallIndex >= 0) {
  throw new Error('--fresh-install is available only for local ci:proof.');
}
consumedArgumentIndexes.add(prIndex);
consumedArgumentIndexes.add(prIndex + 1);
if (reasonIndex < 0 || !bypassReason) {
  throw new Error('PR bypass proof requires --reason <audit note>.');
}
if (bypassReason.length > 500 || /[\r\n\0]/u.test(bypassReason)) {
  throw new Error('PR bypass reason must be one line of at most 500 characters.');
}
if (args.indexOf('--reason', reasonIndex + 1) >= 0) {
  throw new Error('Duplicate ci:proof argument: --reason');
}
consumedArgumentIndexes.add(reasonIndex);
consumedArgumentIndexes.add(reasonIndex + 1);
const unknownPrArguments = args.filter((_value, index) => !consumedArgumentIndexes.has(index));
if (unknownPrArguments.length > 0) {
  throw new Error(`Unknown ci:proof arguments: ${unknownPrArguments.join(', ')}`);
}
const launcherRoot = process.cwd();
if (command('git', ['status', '--porcelain=v1']).length > 0) {
  throw new Error('ci:proof requires a clean worktree.');
}
const launcherSha = command('git', ['rev-parse', 'HEAD']);
const prFields = 'headRefOid,baseRefOid,url,author';
const pr = JSON.parse(command('gh', ['pr', 'view', prNumber, '--json', prFields]));
const policy = JSON.parse(fs.readFileSync('tooling/configs/ci/github-policy.json', 'utf8'));
if (pr.author?.login !== policy.releasePublisher) {
  throw new Error(`ci:proof only accepts PRs authored by ${policy.releasePublisher}.`);
}
command('git', ['fetch', '--no-tags', 'origin', 'main']);
const trustedMainSha = command('git', ['rev-parse', 'origin/main']);
if (launcherSha !== trustedMainSha) {
  throw new Error('ci:proof launcher must run from the clean origin/main commit.');
}

const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sniptale-proof-'));
process.on('exit', () => fs.rmSync(temporaryRoot, { recursive: true, force: true }));
const proofWorkspace = path.join(temporaryRoot, 'workspace');
fs.mkdirSync(proofWorkspace);
command('git', ['init', '--quiet'], { cwd: proofWorkspace });
command(
  'git',
  [
    'fetch',
    '--quiet',
    '--no-tags',
    '--depth=1',
    `https://github.com/${policy.repository}.git`,
    `pull/${prNumber}/head:refs/sniptale/candidate`,
  ],
  { cwd: proofWorkspace }
);
const fetchedCandidate = command('git', ['rev-parse', 'refs/sniptale/candidate'], {
  cwd: proofWorkspace,
});
if (fetchedCandidate !== pr.headRefOid) {
  throw new Error('Fetched PR commit does not match GitHub PR authority.');
}
command(
  'git',
  [
    'fetch',
    '--quiet',
    '--no-tags',
    '--depth=1',
    `https://github.com/${policy.repository}.git`,
    `${pr.baseRefOid}:refs/sniptale/base`,
  ],
  { cwd: proofWorkspace }
);
command('git', ['cat-file', '-e', `${pr.headRefOid}^{commit}`], { cwd: proofWorkspace });
command('git', ['checkout', '--quiet', '--detach', pr.headRefOid], { cwd: proofWorkspace });
for (const candidateMetadata of ['FETCH_HEAD', 'ORIG_HEAD']) {
  fs.rmSync(path.join(proofWorkspace, '.git', candidateMetadata), { force: true });
}
const env = {
  ...process.env,
  ...resourceEnvironment,
  SNIPTALE_PROOF_SHA: pr.headRefOid,
  SNIPTALE_BASE_SHA: pr.baseRefOid,
  SNIPTALE_TRUSTED_CONTROL_SHA: launcherSha,
};
const result = spawnSync(
  process.execPath,
  [path.join(launcherRoot, 'tooling/ci/container.mjs'), 'proof'],
  { cwd: proofWorkspace, env, stdio: 'inherit' }
);
if (result.status !== 0) process.exit(result.status ?? 1);
const artifactRoot = path.join(proofWorkspace, 'build/ci-artifacts');
const created = fs
  .readdirSync(artifactRoot)
  .filter((entry) => entry.startsWith(`proof-${pr.headRefOid}-`))
  .sort();
if (created.length !== 1)
  throw new Error(`Expected one canonical proof bundle, found ${created.length}.`);
const manifests = created.map((directory) => {
  const manifestPath = path.join(artifactRoot, directory, 'proof-manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (
    manifest.status !== 'passed' ||
    manifest.commit !== pr.headRefOid ||
    manifest.baseSha !== pr.baseRefOid ||
    manifest.trustedControlSha !== launcherSha ||
    manifest.controlAuthority !== 'trusted-base' ||
    manifest.candidateTree !==
      command('git', ['rev-parse', `${pr.headRefOid}^{tree}`], {
        cwd: proofWorkspace,
      }) ||
    !manifest.containerDigest
  ) {
    throw new Error(`Incomplete proof manifest: ${manifestPath}`);
  }
  const admission = admitCandidateProof({
    artifactRoot: path.join(artifactRoot, directory),
    baseSha: pr.baseRefOid,
    candidateRoot: proofWorkspace,
    commit: pr.headRefOid,
    expectedContainerDigest: manifest.containerDigest,
    expectedTrustedControlSha: launcherSha,
    lane: 'proof',
    trustedRoot: launcherRoot,
  });
  return {
    directory,
    manifest,
    admission,
    digest: crypto.createHash('sha256').update(fs.readFileSync(manifestPath)).digest('hex'),
  };
});
const currentAuthority = {
  worktreeStatus: command('git', ['status', '--porcelain=v1']),
  localSha: command('git', ['rev-parse', 'HEAD']),
  pr: JSON.parse(command('gh', ['pr', 'view', prNumber, '--json', prFields])),
};
assertProofAuthority({ localSha: launcherSha, pr }, currentAuthority);

fs.mkdirSync('build/ci-artifacts', { recursive: true });
for (const { directory } of manifests) {
  fs.cpSync(path.join(artifactRoot, directory), path.join('build/ci-artifacts', directory), {
    recursive: true,
    errorOnExist: true,
    force: false,
  });
}
const proofDirectory = `build/ci-artifacts/proof-${pr.headRefOid}-${Date.now()}`;
fs.mkdirSync(proofDirectory);
const proof = {
  schemaVersion: 1,
  artifactKind: 'sniptale-local-proof',
  pr: Number(prNumber),
  prUrl: pr.url,
  commit: pr.headRefOid,
  baseSha: pr.baseRefOid,
  launcherCommit: launcherSha,
  bypassReason,
  containerDigest: manifests[0].manifest.containerDigest,
  bundles: manifests.map(({ admission, directory, manifest, digest }) => ({
    directory,
    lane: manifest.lane,
    digest,
    trustedAdmission: admission,
  })),
};
fs.writeFileSync(
  path.join(proofDirectory, 'proof-manifest.json'),
  `${JSON.stringify(proof, null, 2)}\n`,
  { flag: 'wx' }
);
const proofDigest = crypto
  .createHash('sha256')
  .update(fs.readFileSync(path.join(proofDirectory, 'proof-manifest.json')))
  .digest('hex');
const comment = [
  `Canonical local proof passed for \`${pr.headRefOid}\`.`,
  '',
  `Trusted launcher: \`${launcherSha}\``,
  `Container: \`${proof.containerDigest}\``,
  `Proof manifest SHA-256: \`${proofDigest}\``,
  `Bypass reason: ${bypassReason}`,
  '',
  'Merge remains a manual native GitHub ruleset bypass.',
].join('\n');
command('gh', ['pr', 'comment', prNumber, '--body', comment]);
process.stdout.write(`Local proof passed: ${proofDirectory}\n`);
