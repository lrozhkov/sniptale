import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { createCandidateControlDigest } from './control-digest.mjs';

export function checkControlAuthority(trustedRoot, candidateRoot) {
  const trustedControlDigest = createCandidateControlDigest({ cwd: path.resolve(trustedRoot) });
  const candidateControlDigest = createCandidateControlDigest({ cwd: path.resolve(candidateRoot) });
  const controlsChanged = candidateControlDigest !== trustedControlDigest;
  return {
    candidateControlDigest,
    trustedControlDigest,
    controlsChanged,
    controlDisposition: controlsChanged ? 'candidate-controls' : 'trusted-controls',
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [trustedRoot, candidateRoot] = process.argv.slice(2);
  if (!trustedRoot || !candidateRoot) {
    throw new Error('Usage: check-control-authority.mjs <trusted-root> <candidate-root>');
  }
  process.stdout.write(`${JSON.stringify(checkControlAuthority(trustedRoot, candidateRoot))}\n`);
}
