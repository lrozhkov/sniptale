import fs from 'node:fs';
import path from 'node:path';

export function resolveReusableUnitProofHostPath(value, { lstat = fs.lstatSync } = {}) {
  if (!value) return null;
  const candidate = path.resolve(value);
  try {
    const stat = lstat(candidate);
    return stat.isFile() && !stat.isSymbolicLink() ? candidate : null;
  } catch {
    return null;
  }
}
