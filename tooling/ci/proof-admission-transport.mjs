import path from 'node:path';

/** Rebinds an admitted proof's physical locator after an exact host-to-container mount. */
export function transportProofAdmission({ admission, admittedProofRoot, mountedProofRoot }) {
  if (
    admission?.artifactKind !== 'sniptale-fast-proof-admission' ||
    admission.outcome !== 'admitted' ||
    admission.proofRoot !== path.resolve(admittedProofRoot)
  ) {
    throw new Error('Cannot transport a stale or incompatible Fast proof admission.');
  }
  if (!path.isAbsolute(mountedProofRoot)) {
    throw new Error('Fast proof transport mount must be an absolute path.');
  }
  return { ...admission, proofRoot: path.normalize(mountedProofRoot) };
}
