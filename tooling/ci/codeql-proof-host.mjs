import fs from 'node:fs';
import path from 'node:path';

function resolveRegularFile(value, lstat) {
  if (!value) return null;
  const candidate = path.resolve(value);
  try {
    const stat = lstat(candidate);
    return stat.isFile() && !stat.isSymbolicLink() ? candidate : null;
  } catch {
    return null;
  }
}

export function resolveReusableCodeqlProofHostPaths(
  { proofPath, sarifPath },
  { lstat = fs.lstatSync } = {}
) {
  const proof = resolveRegularFile(proofPath, lstat);
  const sarif = resolveRegularFile(sarifPath, lstat);
  return proof && sarif ? { proof, sarif } : null;
}
