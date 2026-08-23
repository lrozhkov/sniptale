import fs from 'node:fs';

import { expect, it } from 'vitest';

it('runs local full gates directly in WSL and keeps Docker limited to external reproduction', () => {
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const local = fs.readFileSync('tooling/ci/local.mjs', 'utf8');
  const toolchain = fs.readFileSync('tooling/ci/local-toolchain.mjs', 'utf8');
  const proof = fs.readFileSync('tooling/ci/proof.mjs', 'utf8');
  expect(packageJson.scripts['ci:proof']).toBe('node tooling/ci/proof.mjs');
  expect(packageJson.scripts['ci:release']).toBe('node tooling/ci/local.mjs release');
  expect(packageJson.scripts['ci:build']).toBe('npm run build');
  expect(local).toContain('tooling/ci/${lane}-wrapper.mjs');
  expect(local).toContain("kind: 'host-wsl'");
  expect(local).not.toContain("spawnSync('docker'");
  expect(toolchain).not.toContain("spawnSync('docker'");
  expect(proof).toContain('if (prIndex < 0)');
  expect(proof).toContain("path.join(process.cwd(), 'tooling/ci/local.mjs')");
  expect(proof).toContain("'proof',");
});

it('fixes resource profiles as planning-only metadata and rejects ci:build provenance', () => {
  const policy = JSON.parse(fs.readFileSync('tooling/configs/ci/proof-semantics.json', 'utf8'));
  expect(policy).toMatchObject({
    controlAuthority: 'trusted-base',
    planningMetadata: ['resourceProfiles', 'infrastructure.resourceProfile'],
    invariants: {
      resourceProfileDoesNotChangeControlSemantics: true,
      resourceProfileExcludedFromSemanticDigest: true,
      resourceProfileAffectsReuseCompatibility: true,
      fastGateNeverClaimsReleaseReadiness: true,
      fullVitestIsReleaseOnly: true,
      ciBuildIsNonProof: true,
      ciBuildArtifactAdmissibleForProvenance: false,
    },
  });
  expect(policy.semanticIdentity).not.toContain('resourceProfiles');
  expect(policy.gateCapabilities.proof).toMatchObject({
    scope: 'repository-wide',
    fullVitest: false,
    releaseReady: false,
  });
  expect(policy.gateCapabilities.release).toMatchObject({
    scope: 'repository-wide',
    fullVitest: true,
    releaseReady: true,
  });
  expect(policy.environmentAdmissibility.releaseProvenanceRequires).toBe('locked-container');
});
