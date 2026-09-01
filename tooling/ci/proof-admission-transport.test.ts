import { expect, it } from 'vitest';

import { transportProofAdmission } from './proof-admission-transport.mjs';

it('preserves admitted proof identity while rebinding its container-visible locator', () => {
  const admission = {
    artifactKind: 'sniptale-fast-proof-admission',
    outcome: 'admitted',
    proofRoot: '/host/candidate/build/ci-artifacts/proof-1',
    proofSemanticDigest: `sha256:${'a'.repeat(64)}`,
  };

  expect(
    transportProofAdmission({
      admission,
      admittedProofRoot: '/host/candidate/build/ci-artifacts/proof-1',
      mountedProofRoot: '/opt/sniptale-fast-proof',
    })
  ).toEqual({ ...admission, proofRoot: '/opt/sniptale-fast-proof' });
});

it('refuses to rebind a receipt that does not identify the admitted host proof', () => {
  expect(() =>
    transportProofAdmission({
      admission: {
        artifactKind: 'sniptale-fast-proof-admission',
        outcome: 'admitted',
        proofRoot: '/host/other-proof',
      },
      admittedProofRoot: '/host/candidate-proof',
      mountedProofRoot: '/opt/sniptale-fast-proof',
    })
  ).toThrow('stale or incompatible');
});
