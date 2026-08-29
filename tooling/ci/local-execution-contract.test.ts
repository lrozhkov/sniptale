import fs from 'node:fs';

import { expect, it } from 'vitest';

it('runs local full gates directly in WSL and keeps Docker limited to external reproduction', () => {
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const local = fs.readFileSync('tooling/ci/local.mjs', 'utf8');
  const playwrightSmoke = fs.readFileSync('tooling/ci/local-playwright-smoke.mjs', 'utf8');
  const toolchain = fs.readFileSync('tooling/ci/local-toolchain.mjs', 'utf8');
  const proof = fs.readFileSync('tooling/ci/proof.mjs', 'utf8');
  expect(packageJson.scripts['ci:proof']).toBe('node tooling/ci/proof.mjs');
  expect(packageJson.scripts['ci:release']).toBe('node tooling/ci/local.mjs release');
  expect(packageJson.scripts['ci:build']).toBe('npm run build');
  expect(local).toContain('tooling/ci/${lane}-wrapper.mjs');
  expect(local).toContain("['playwright-smoke', process.execPath");
  expect(local).toContain("kind: 'host-wsl'");
  expect(local).not.toContain("spawnSync('docker'");
  expect(toolchain).not.toContain("spawnSync('docker'");
  expect(toolchain).toMatch(
    /path\.join\(\s*os\.homedir\(\),\s*'\.cache',\s*'sniptale',\s*'ci-toolchain'/u
  );
  expect(toolchain).not.toContain("path.resolve('.tmp/ci-toolchain'");
  expect(toolchain).toContain("url.origin !== 'https://github.com'");
  expect(toolchain).toContain("!/^[a-f0-9]{64}$/u.test(tool?.sha256 ?? '')");
  expect(toolchain).toContain("{ flag: 'wx', mode: 0o755 }");
  expect(toolchain).toContain('includes(semgrepPython)');
  expect(toolchain).toContain("args: ['--legacy', '--version']");
  expect(toolchain).toContain('process.version !== `v${lock.node.version}`');
  expect(toolchain).toContain("spawnSync('npm', ['--version']");
  expect(toolchain).toContain('delete result[name]');
  for (const tool of ['OSV Scanner', 'Gitleaks', 'actionlint', 'Semgrep', 'CodeQL', 'Stryker']) {
    expect(toolchain).toContain(`name: '${tool}'`);
  }
  expect(playwrightSmoke).toContain('installed.version !== lock.playwright.version');
  expect(playwrightSmoke).toContain('await chromium.launch({ headless: true })');
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
      fullVitestOwnedByFastGate: true,
      releaseProvenanceRequiresFastProof: true,
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
