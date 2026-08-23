import fs from 'node:fs';
import path from 'node:path';

function regularFile(value) {
  if (!value) return null;
  const resolved = path.resolve(value);
  try {
    const stat = fs.lstatSync(resolved);
    return stat.isFile() && !stat.isSymbolicLink() ? resolved : null;
  } catch {
    return null;
  }
}

export function resolveReusableBuildProofHostPaths({ archivePath, proofPath } = {}) {
  const proof = regularFile(proofPath);
  const archive = regularFile(archivePath);
  return proof && archive ? { proof, archive } : null;
}
