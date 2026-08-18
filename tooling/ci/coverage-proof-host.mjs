import fs from 'node:fs';
import path from 'node:path';

export function resolveReusableCoverageProofHostPaths({ proofPath, reportsPath }) {
  if (!proofPath || !reportsPath) return null;
  try {
    const proof = path.resolve(proofPath);
    const reports = path.resolve(reportsPath);
    const proofStat = fs.lstatSync(proof);
    const reportsStat = fs.lstatSync(reports);
    return proofStat.isFile() &&
      !proofStat.isSymbolicLink() &&
      reportsStat.isDirectory() &&
      !reportsStat.isSymbolicLink()
      ? { proof, reports }
      : null;
  } catch {
    return null;
  }
}
