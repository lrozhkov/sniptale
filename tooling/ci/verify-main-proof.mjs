import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { isExecutedAsScript } from '../qa/runtime/process/shared-cli.mjs';
import { createProofSemanticDigest } from './artifacts.mjs';
import { createCandidateControlDigest } from './control-digest.mjs';

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function readGit(args, cwd = process.cwd()) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed.`);
  return result.stdout.trim();
}

function collectArtifactFiles(root) {
  const files = [];
  function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Unsafe main proof symlink: ${absolute}`);
      if (entry.isDirectory()) walk(absolute);
      else if (entry.isFile()) files.push(path.relative(root, absolute).replaceAll(path.sep, '/'));
      else throw new Error(`Unsafe main proof entry: ${absolute}`);
    }
  }
  walk(root);
  return files.sort();
}

function validateMainProofIdentity(manifest, { commit, controlDigest, expectedTree, lane }) {
  const expectedCapability =
    lane === 'release'
      ? { gateClaim: 'release-provenance', fullVitest: true, releaseReady: true }
      : { gateClaim: 'fast-pr-gate', fullVitest: true, releaseReady: false };
  if (
    manifest.schemaVersion !== 1 ||
    manifest.artifactKind !== 'sniptale-ci-proof' ||
    manifest.lane !== lane ||
    manifest.status !== 'passed' ||
    manifest.workspaceMode !== 'committed' ||
    manifest.commit !== commit ||
    manifest.candidateTree !== expectedTree ||
    manifest.trustedControlSha !== commit ||
    manifest.trustedControlDigest !== controlDigest ||
    manifest.controlDigest !== controlDigest ||
    manifest.controlAuthority !== 'trusted-base' ||
    manifest.controlsChanged !== false ||
    manifest.controlDisposition !== 'trusted-controls'
  ) {
    throw new Error(`${lane} proof identity does not match the release commit.`);
  }
  if (
    manifest.evidenceDisposition !== 'executed' ||
    manifest.gateClaim !== expectedCapability.gateClaim ||
    manifest.fullVitest !== expectedCapability.fullVitest ||
    manifest.releaseReady !== expectedCapability.releaseReady ||
    manifest.reuseCompatibility?.outcome !== 'compatible'
  ) {
    throw new Error(`${lane} proof capability does not match the release commit.`);
  }
  for (const value of [
    manifest.controlDigest,
    manifest.trustedControlDigest,
    manifest.gateInputDigest,
    manifest.containerDigest,
  ]) {
    if (!/^sha256:[a-f0-9]{64}$/u.test(value ?? '')) {
      throw new Error(`${lane} proof contains a malformed semantic digest.`);
    }
  }
}

function validateMainProofChecksums(root, manifest, manifestPath, sumsPath) {
  const expected = new Map(
    fs
      .readFileSync(sumsPath, 'utf8')
      .trim()
      .split('\n')
      .map((line) => {
        const match = /^([a-f0-9]{64}) {2}(.+)$/u.exec(line);
        if (!match) throw new Error(`Malformed main proof checksum: ${line}`);
        return [match[2], match[1]];
      })
  );
  const listed = new Set([...manifest.files.map(({ file }) => file), 'proof-manifest.json']);
  if (expected.size !== listed.size || [...listed].some((file) => !expected.has(file))) {
    throw new Error('Main proof checksum inventory does not match its manifest.');
  }
  for (const { file, sha256: digest } of manifest.files) {
    if (expected.get(file) !== digest)
      throw new Error(`Main proof manifest digest mismatch: ${file}`);
  }
  for (const [file, digest] of expected) {
    const absolute = path.resolve(root, file);
    const relative = path.relative(root, absolute).replaceAll(path.sep, '/');
    if (relative === '..' || relative.startsWith('../') || !fs.statSync(absolute).isFile()) {
      throw new Error(`Unsafe main proof file: ${file}`);
    }
    if (sha256(absolute) !== digest) throw new Error(`Main proof digest mismatch: ${file}`);
  }
  const admittedFiles = [...listed, 'SHA256SUMS'].sort();
  if (JSON.stringify(collectArtifactFiles(root)) !== JSON.stringify(admittedFiles)) {
    throw new Error('Main proof physical artifact inventory is not exact.');
  }
  return expected;
}

function verifyProof(root, commit, lane, { repositoryRoot = process.cwd() } = {}) {
  if (!/^[a-f0-9]{40}$/u.test(commit ?? '')) throw new Error('Expected a full main commit SHA.');
  const manifestPath = path.join(root, 'proof-manifest.json');
  const sumsPath = path.join(root, 'SHA256SUMS');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const expectedTree = readGit(['rev-parse', `${commit}^{tree}`], repositoryRoot);
  const controlDigest = createCandidateControlDigest({ cwd: repositoryRoot });
  validateMainProofIdentity(manifest, { commit, controlDigest, expectedTree, lane });
  const expectedSemanticDigest = createProofSemanticDigest({
    lane,
    commit,
    candidateTree: manifest.candidateTree,
    trustedControlSha: manifest.trustedControlSha,
    trustedControlDigest: manifest.trustedControlDigest,
    controlDigest: manifest.controlDigest,
    gateInputDigest: manifest.gateInputDigest,
    executionEnvironment: manifest.executionEnvironment,
  });
  if (manifest.proofSemanticDigest !== expectedSemanticDigest) {
    throw new Error(`${lane} proof semantic identity drifted.`);
  }
  const expected = validateMainProofChecksums(root, manifest, manifestPath, sumsPath);
  const zipFiles = [...expected.keys()].filter((file) => /^build\/sniptale_.+\.zip$/u.test(file));
  if (zipFiles.length !== 1) {
    throw new Error(`${lane} proof must contain exactly one release ZIP.`);
  }
  return { manifest, zipFile: zipFiles[0] };
}

export function verifyMainProof(root, commit, options) {
  return verifyProof(root, commit, 'proof', options);
}

export function verifyReleaseProof(root, commit, options) {
  const result = verifyProof(root, commit, 'release', options);
  const files = new Set(result.manifest.files.map(({ file }) => file));
  for (const required of [
    '.tmp/licenses/sbom.cdx.json',
    '.tmp/qa/codeql-proof.json',
    '.tmp/qa/coverage-proof.json',
    '.tmp/mutation/persistence',
    '.tmp/mutation/secrets',
  ]) {
    if (
      required.endsWith('/')
        ? ![...files].some((file) => file.startsWith(required))
        : required.includes('/mutation/')
          ? ![...files].some((file) => file.startsWith(`${required}/`))
          : !files.has(required)
    ) {
      throw new Error(`Release proof is missing required evidence: ${required}`);
    }
  }
  return result;
}

if (isExecutedAsScript(import.meta.url)) {
  const [first, second, third] = process.argv.slice(2);
  const releaseMode = first === 'release';
  const [root, commit] = releaseMode ? [second, third] : [first, second];
  if (!root || !commit) {
    throw new Error('Usage: verify-main-proof.mjs [release] <artifact-root> <commit>');
  }
  const result = releaseMode
    ? verifyReleaseProof(path.resolve(root), commit)
    : verifyMainProof(path.resolve(root), commit);
  process.stdout.write(`${JSON.stringify({ commit, zipFile: result.zipFile })}\n`);
}
