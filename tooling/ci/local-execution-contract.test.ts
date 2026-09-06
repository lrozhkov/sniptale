import fs from 'node:fs';

import { expect, it } from 'vitest';

it('runs local full gates directly in WSL and keeps Docker limited to external reproduction', () => {
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const local = fs.readFileSync('tooling/ci/local.mjs', 'utf8');
  const containerCommand = fs.readFileSync('tooling/ci/container-command.mjs', 'utf8');
  const toolchain = fs.readFileSync('tooling/ci/local-toolchain.mjs', 'utf8');
  const proof = fs.readFileSync('tooling/ci/proof.mjs', 'utf8');
  expect(packageJson.scripts['ci:proof']).toBe('node tooling/ci/proof.mjs');
  expect(packageJson.scripts['ci:release']).toBe('node tooling/ci/release.mjs');
  const release = fs.readFileSync('tooling/ci/release.mjs', 'utf8');
  expect(release).toContain('prepareLocalFastProofAdmission({');
  expect(release).toContain('expectedExecutionEnvironmentDigest: executionEnvironment.digest');
  expect(release).toContain("'tooling/ci/local.mjs'");
  expect(packageJson.scripts['ci:proof:container']).toBe(
    'node tooling/ci/local-container.mjs proof'
  );
  expect(packageJson.scripts['ci:release:container']).toBe(
    'node tooling/ci/local-container.mjs release'
  );
  expect(packageJson.scripts['ci:build']).toBe('npm run build');
  expect(packageJson.scripts.build).toBe('vite build --config apps/extension/vite.config.ts');
  expect(local).toContain('tooling/ci/${lane}-wrapper.mjs');
  expect(local).toContain("path.join(process.cwd(), 'tooling/ci/local-workflow-validation.mjs')");
  expect(local).toContain("path.join(process.cwd(), 'tooling/ci/local-project-bootstrap.mjs')");
  expect(local).not.toContain("'playwright-smoke'");
  expect(local).toContain("rawArgs.includes('--fresh-install')");
  expect(local).toContain('resolveLocalExecutionEnvironmentIdentity()');
  expect(local).not.toContain("spawnSync('docker'");
  expect(toolchain).not.toContain("spawnSync('docker'");
  expect(toolchain).toMatch(
    /path\.join\(\s*os\.homedir\(\),\s*'\.cache',\s*'sniptale',\s*'ci-toolchain'/u
  );
  expect(toolchain).not.toContain("path.resolve('.tmp/ci-toolchain'");
  expect(toolchain).toContain("url.origin !== 'https://github.com'");
  expect(toolchain).toContain("!/^[a-f0-9]{64}$/u.test(tool?.sha256 ?? '')");
  expect(toolchain).toContain("{ flag: 'wx', mode: 0o755 }");
  expect(toolchain).not.toContain('semgrep');
  expect(toolchain).toContain('createRuntimeParityReceipt({');
  const runtimeParity = fs.readFileSync('tooling/ci/runtime-parity.mjs', 'utf8');
  expect(runtimeParity).toContain("{ id: 'node'");
  expect(runtimeParity).toContain("{ id: 'npm'");
  expect(runtimeParity).toContain("{ id: 'npx'");
  expect(runtimeParity).toContain('path drift');
  expect(toolchain).toContain('delete result[name]');
  for (const tool of ['OSV Scanner', 'Gitleaks', 'actionlint', 'CodeQL', 'Stryker']) {
    expect(toolchain).toContain(`name: '${tool}'`);
  }
  expect(containerCommand).toContain("['install', 'npm', ['ci', '--ignore-scripts']]");
  expect(containerCommand).toContain("'/opt/sniptale-trusted/tooling/ci/validate-workflows.mjs'");
  expect(containerCommand).toContain("['provision-canvas', 'npm', ['rebuild', 'canvas']]");
  expect(containerCommand).toContain("['provision-ast-grep', 'node'");
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
      resourceProfileAffectsReuseCompatibility: false,
      fastGateNeverClaimsReleaseReadiness: true,
      ciProofScope: 'repository-wide',
      ciProofUsesSemanticDiff: true,
      ciProofOwnsFullProductTests: true,
      ciProofOwnsFullProductCoverage: true,
      ciProofOwnsFullHarnessTests: false,
      ciProofHarnessSelection: 'affected-or-full-fallback',
      ciReleaseRequiresFastProofAdmission: true,
      ciReleaseExecutesProductTests: false,
      ciReleaseExecutesProductCoverage: false,
      checkpointKeepsFormatWriteBarrier: true,
      gitleaksScopesRemainProfileOwned: true,
      soloMaintainerBypassRemainsSupported: true,
      baseShaIsProvenanceOnly: false,
      baseShaOwnsHarnessSelection: true,
      fastGateFullVitestOwner: 'full-product-plus-required-harness-proof',
      releaseProvenanceAcceptsFastProofReuse: true,
      ciBuildIsNonProof: true,
      ciBuildArtifactAdmissibleForProvenance: false,
    },
  });
  expect(policy.semanticIdentity).not.toContain('resourceProfiles');
  expect(policy.gateCapabilities.proof).toMatchObject({
    scope: 'repository-wide',
    fullVitest: true,
    releaseReady: false,
  });
  expect(policy.gateCapabilities.release).toMatchObject({
    scope: 'repository-wide',
    fullVitest: true,
    releaseReady: true,
  });
  expect(policy.environmentAdmissibility.releaseProvenanceRequires).toBe('locked-container');
});
