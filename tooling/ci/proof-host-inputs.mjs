import fs from 'node:fs';
import path from 'node:path';

function resolveHostPath(value, expectedKind, lstat) {
  if (!value) return null;
  const candidate = path.resolve(value);
  try {
    const stat = lstat(candidate);
    const matchesKind = expectedKind === 'file' ? stat.isFile() : stat.isDirectory();
    return matchesKind && !stat.isSymbolicLink() ? candidate : null;
  } catch {
    return null;
  }
}

function regularFile(value, lstat) {
  return resolveHostPath(value, 'file', lstat);
}

export function resolveReusableUnitProofHostPath(value, { lstat = fs.lstatSync } = {}) {
  return regularFile(value, lstat);
}

export function resolveReusableBuildProofHostPaths(
  { archivePath, proofPath } = {},
  { lstat = fs.lstatSync } = {}
) {
  const proof = regularFile(proofPath, lstat);
  const archive = regularFile(archivePath, lstat);
  return proof && archive ? { proof, archive } : null;
}

export function resolveReusableCodeqlProofHostPaths(
  { proofPath, sarifPath } = {},
  { lstat = fs.lstatSync } = {}
) {
  const proof = regularFile(proofPath, lstat);
  const sarif = regularFile(sarifPath, lstat);
  return proof && sarif ? { proof, sarif } : null;
}

export function resolveReusableCoverageProofHostPaths(
  { proofPath, reportsPath } = {},
  { lstat = fs.lstatSync } = {}
) {
  const proof = regularFile(proofPath, lstat);
  const reports = resolveHostPath(reportsPath, 'directory', lstat);
  return proof && reports ? { proof, reports } : null;
}
