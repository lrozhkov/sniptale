import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { listRegularProofFiles } from './proof-file-inventory.mjs';

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function validateFastProofIdentity(manifest, expected) {
  if (
    manifest.schemaVersion !== 1 ||
    manifest.artifactKind !== 'sniptale-ci-proof' ||
    manifest.lane !== 'proof' ||
    manifest.status !== 'passed' ||
    manifest.workspaceMode !== 'committed' ||
    manifest.commit !== expected.commit ||
    manifest.candidateTree !== expected.candidateTree ||
    manifest.trustedControlSha !== expected.trustedControlSha ||
    manifest.containerDigest !== expected.containerDigest ||
    manifest.controlAuthority !== 'trusted-base' ||
    manifest.controlsChanged !== false ||
    manifest.controlDisposition !== 'trusted-controls'
  ) {
    throw new Error('Fast proof identity does not match the release candidate.');
  }
  if (
    manifest.evidenceDisposition !== 'executed' ||
    manifest.gateClaim !== 'fast-pr-gate' ||
    manifest.fullVitest !== true ||
    manifest.releaseReady !== false ||
    manifest.reuseCompatibility?.outcome !== 'compatible' ||
    manifest.controlDigest !== expected.controlDigest ||
    manifest.trustedControlDigest !== expected.trustedControlDigest ||
    manifest.gateInputDigest !== expected.gateInputDigest
  ) {
    throw new Error('Fast proof capability does not match the release candidate.');
  }
}

function validateFastProofFiles(resolvedRoot, manifest, manifestPath, checksumsPath) {
  if (!Array.isArray(manifest.files)) throw new Error('Fast proof file inventory is missing.');
  const declared = manifest.files.map(({ file, sha256: digest }) => {
    if (
      typeof file !== 'string' ||
      file.length === 0 ||
      file === '..' ||
      file.startsWith('../') ||
      path.posix.isAbsolute(file) ||
      !/^[a-f0-9]{64}$/u.test(digest) ||
      path.posix.normalize(file) !== file
    ) {
      throw new Error(`Malformed fast proof file identity: ${String(file)}`);
    }
    if (sha256(path.join(resolvedRoot, file)) !== digest) {
      throw new Error(`Fast proof digest mismatch: ${file}`);
    }
    return file;
  });
  if (new Set(declared).size !== declared.length) {
    throw new Error('Fast proof file inventory contains duplicate paths.');
  }
  const expected = [...declared, 'SHA256SUMS', 'proof-manifest.json'].sort();
  if (
    JSON.stringify(listRegularProofFiles(resolvedRoot, 'Fast proof')) !== JSON.stringify(expected)
  ) {
    throw new Error('Fast proof physical artifact inventory is not exact.');
  }
  const expectedChecksums = [
    ...manifest.files.map(({ file, sha256: digest }) => `${digest}  ${file}`),
    `${sha256(manifestPath)}  proof-manifest.json`,
  ].join('\n');
  if (fs.readFileSync(checksumsPath, 'utf8') !== `${expectedChecksums}\n`) {
    throw new Error('Fast proof checksum manifest drifted.');
  }
  return declared;
}

export function verifyReusableFastProof(
  proofRoot,
  {
    commit,
    candidateTree,
    trustedControlSha,
    trustedControlDigest,
    containerDigest,
    controlDigest,
    gateInputDigest,
  }
) {
  const resolvedRoot = path.resolve(proofRoot);
  if (!fs.statSync(resolvedRoot).isDirectory())
    throw new Error('Fast proof root is not a directory.');
  const manifestPath = path.join(resolvedRoot, 'proof-manifest.json');
  const checksumsPath = path.join(resolvedRoot, 'SHA256SUMS');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  validateFastProofIdentity(manifest, {
    commit,
    candidateTree,
    trustedControlSha,
    trustedControlDigest,
    containerDigest,
    controlDigest,
    gateInputDigest,
  });
  if (
    !Array.isArray(manifest.phases) ||
    !['proof', 'non-gate-input-reuse'].includes(manifest.phases.at(-1)?.id)
  ) {
    throw new Error('Fast proof does not contain the canonical proof phase.');
  }
  if (manifest.phases.some(({ status }) => status !== 'passed')) {
    throw new Error('Fast proof contains an incomplete phase.');
  }
  const declared = validateFastProofFiles(resolvedRoot, manifest, manifestPath, checksumsPath);
  const buildProofPath = path.join(resolvedRoot, '.tmp/qa/build-proof.json');
  if (!fs.existsSync(buildProofPath)) throw new Error('Fast proof build receipt is missing.');
  const archives = declared.filter((file) => /^build\/sniptale_.+\.zip$/u.test(file));
  if (archives.length !== 1) throw new Error('Fast proof must contain exactly one release ZIP.');
  return {
    archivePath: path.join(resolvedRoot, archives[0]),
    buildProofPath,
    manifest,
    manifestPath,
  };
}

export function selectReusableFastProof(proofRoot, expected) {
  try {
    return verifyReusableFastProof(proofRoot, expected);
  } catch {
    return null;
  }
}
