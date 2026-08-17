import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { assertProofAuthority } from './proof-authority.mjs';

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
if (!prNumber || !/^\d+$/u.test(prNumber)) {
  throw new Error('Usage: npm run ci:proof -- --pr <number>');
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
const trustedWorkspace = path.join(temporaryRoot, 'trusted');
function materializeTrustedCommit(commit, destination) {
  const name = 'trusted';
  const archivePath = path.join(temporaryRoot, `${name}.tar`);
  fs.mkdirSync(destination);
  command('git', ['archive', '--format=tar', '--output', archivePath, commit]);
  command('tar', ['-xf', archivePath, '-C', destination]);
  fs.rmSync(archivePath);
}
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
    `pull/${prNumber}/head`,
  ],
  { cwd: proofWorkspace }
);
const fetchedCandidate = command('git', ['rev-parse', 'FETCH_HEAD'], { cwd: proofWorkspace });
if (fetchedCandidate !== pr.headRefOid) {
  throw new Error('Fetched PR commit does not match GitHub PR authority.');
}
command('git', ['checkout', '--quiet', '--detach', pr.headRefOid], { cwd: proofWorkspace });
for (const candidateMetadata of ['FETCH_HEAD', 'ORIG_HEAD']) {
  fs.rmSync(path.join(proofWorkspace, '.git', candidateMetadata), { force: true });
}
materializeTrustedCommit(launcherSha, trustedWorkspace);

for (const [index, lane] of ['release', 'security', 'coverage'].entries()) {
  const env = {
    ...process.env,
    SNIPTALE_PROOF_SHA: pr.headRefOid,
    SNIPTALE_BASE_SHA: pr.baseRefOid,
    SNIPTALE_TRUSTED_CI_ROOT: trustedWorkspace,
    ...(index > 0 ? { SNIPTALE_CI_SKIP_BUILD: '1' } : {}),
  };
  const result = spawnSync(
    process.execPath,
    [path.join(launcherRoot, 'tooling/ci/container.mjs'), lane],
    { cwd: proofWorkspace, env, stdio: 'inherit' }
  );
  if (result.status !== 0) process.exit(result.status ?? 1);
}
const artifactRoot = path.join(proofWorkspace, 'build/ci-artifacts');
const created = fs
  .readdirSync(artifactRoot)
  .filter((entry) => /^(release|security|coverage)-/u.test(entry))
  .sort();
if (created.length !== 3) throw new Error(`Expected three proof lanes, found ${created.length}.`);
const manifests = created.map((directory) => {
  const manifestPath = path.join(artifactRoot, directory, 'proof-manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (
    manifest.status !== 'passed' ||
    manifest.commit !== pr.headRefOid ||
    !manifest.containerDigest
  ) {
    throw new Error(`Incomplete proof manifest: ${manifestPath}`);
  }
  return {
    directory,
    manifest,
    digest: crypto.createHash('sha256').update(fs.readFileSync(manifestPath)).digest('hex'),
  };
});
if (new Set(manifests.map(({ manifest }) => manifest.containerDigest)).size !== 1) {
  throw new Error('Proof lanes used different container digests.');
}
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
  containerDigest: manifests[0].manifest.containerDigest,
  lanes: manifests.map(({ directory, manifest, digest }) => ({
    directory,
    lane: manifest.lane,
    digest,
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
  '',
  'Merge remains a manual native GitHub ruleset bypass.',
].join('\n');
command('gh', ['pr', 'comment', prNumber, '--body', comment]);
process.stdout.write(`Local proof passed: ${proofDirectory}\n`);
