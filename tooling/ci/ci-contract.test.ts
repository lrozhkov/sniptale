import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import ts from 'typescript';
import { expect, it } from 'vitest';

import { createTempRoot, writeFile } from '../qa/core/test-helpers';
import { parseToggleState, requireSelectedActionsSnapshot } from './github-policy-response.mjs';
import { assertProofAuthority } from './proof-authority.mjs';
import {
  assertDraftRelease,
  assertImmutableRelease,
  assertPublishedReleaseAssets,
  readExpectedReleaseAssetDigests,
} from './release-verification.mjs';
import { assertReleaseTagRuleset } from './release-tag-policy.mjs';
import { createProofSemanticDigest } from './artifacts.mjs';
import { verifyMainProof } from './verify-main-proof.mjs';
import { createCandidateControlDigest } from './control-digest.mjs';
import { verifyImageProof, writeImageProof } from './image-proof.mjs';
import { CANONICAL_IMAGE_ENVIRONMENT } from './container-command.mjs';

it('distinguishes disabled settings from rollback snapshot failures', () => {
  expect(parseToggleState({ ok: true, error: '' }, 'setting')).toBe(true);
  expect(parseToggleState({ ok: false, error: 'gh: Not Found (HTTP 404)' }, 'setting')).toBe(false);
  expect(() =>
    parseToggleState({ ok: false, error: 'gh: Forbidden (HTTP 403)' }, 'setting')
  ).toThrow('Unable to snapshot setting');
  expect(() => requireSelectedActionsSnapshot(null)).toThrow('rollback state is unavailable');
});

it('binds the Dockerfile base and tool versions to the machine lock', () => {
  const lock = JSON.parse(fs.readFileSync('tooling/configs/ci/toolchain.lock.json', 'utf8'));
  const dockerfile = fs.readFileSync('tooling/ci/Dockerfile', 'utf8');
  const installer = fs.readFileSync('tooling/ci/install-toolchain.mjs', 'utf8');
  const semgrepLock = fs.readFileSync('tooling/configs/ci/semgrep-requirements.lock', 'utf8');
  expect(dockerfile.startsWith(`FROM ${lock.node.image}\n`)).toBe(true);
  expect(CANONICAL_IMAGE_ENVIRONMENT.NODE_VERSION).toBe(lock.node.version);
  expect(semgrepLock).toContain(`semgrep==${lock.semgrep.version}`);
  expect(installer).toContain("['semgrep', lock.semgrep.version, ['--legacy', '--version']]");
  const playwrightLock = fs.readFileSync('tooling/configs/ci/playwright/package-lock.json');
  const projectLock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));
  const projectPackage = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const playwrightPackage = JSON.parse(
    fs.readFileSync('tooling/configs/ci/playwright/package.json', 'utf8')
  );
  expect(crypto.createHash('sha256').update(playwrightLock).digest('hex')).toBe(
    lock.playwright.npmLockSha256
  );
  expect(playwrightPackage.dependencies['@playwright/test']).toBe(lock.playwright.version);
  expect(projectLock.packages['node_modules/playwright'].version).toBe(lock.playwright.version);
  expect(Object.keys(lock.projectToolchain).sort()).toEqual([
    'oxfmt',
    'oxlint',
    'oxlintTsgolint',
    'typescriptCompilerApi',
    'typescriptCompilerApiShim',
    'typescriptNative',
    'viteReact',
  ]);
  const expectedToolchainPackages = {
    oxfmt: ['node_modules/oxfmt', '0.64.0'],
    oxlint: ['node_modules/oxlint', '1.79.0'],
    oxlintTsgolint: ['node_modules/oxlint-tsgolint', '7.0.2001'],
    typescriptCompilerApi: ['node_modules/@typescript/old', '6.0.3'],
    typescriptCompilerApiShim: ['node_modules/typescript', '6.0.2'],
    typescriptNative: ['node_modules/@typescript/native', '7.0.2'],
    viteReact: ['node_modules/@vitejs/plugin-react', '6.1.0'],
  };
  for (const [toolId, tool] of Object.entries(lock.projectToolchain) as Array<
    [
      keyof typeof expectedToolchainPackages,
      {
        packagePath: string;
        version: string;
      },
    ]
  >) {
    expect([tool.packagePath, tool.version]).toEqual(expectedToolchainPackages[toolId]);
    expect(projectLock.packages[tool.packagePath].version).toBe(tool.version);
  }
  expect(projectPackage.devDependencies['@typescript/native']).toBe('npm:typescript@^7.0.2');
  expect(projectPackage.devDependencies.typescript).toBe('npm:@typescript/typescript6@^6.0.2');
  expect(projectLock.packages['node_modules/@typescript/native'].name).toBe('typescript');
  expect(projectLock.packages['node_modules/typescript'].name).toBe('@typescript/typescript6');
  expect(ts.version).toBe(lock.projectToolchain.typescriptCompilerApi.version);
  expect(JSON.stringify(projectPackage)).not.toContain('@typescript/native-preview');
  expect(projectPackage.devDependencies).not.toHaveProperty('prettier');
  expect(projectPackage.devDependencies).not.toHaveProperty('eslint-config-prettier');
  expect(lock.playwright.assets).toHaveLength(3);
  expect(lock.debian.snapshot).toMatch(/^\d{8}T\d{6}Z$/u);
  expect(dockerfile).toContain(`${lock.debian.archiveUrl} bookworm main`);
  expect(dockerfile).toContain(`${lock.debian.securityArchiveUrl} bookworm-security main`);
  expect(dockerfile).not.toContain('deb.debian.org');
  expect(lock.codeql.url).toContain(`codeql-bundle-v${lock.codeql.version}`);
  expect(lock.codeql.sha256).toMatch(/^[a-f0-9]{64}$/u);
  expect(installer).toContain("codeql.tar.gz', '-C', '/opt'");
  expect(installer).not.toContain('codeql.zip');
  for (const excluded of ['.git', '.env', '.tmp', 'build', 'node_modules']) {
    expect(fs.readFileSync('.dockerignore', 'utf8').split('\n')).toContain(excluded);
  }
});

it('keeps the residual ESLint TypeScript peer exception explicit and diagnosable', () => {
  const npmrc = fs.readFileSync('.npmrc', 'utf8').trim().split('\n').sort();
  const projectPackage = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const projectLock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));
  expect(npmrc).toEqual(['legacy-peer-deps=true', 'loglevel=error']);
  expect(projectPackage.devDependencies.typescript).toMatch(/^npm:@typescript\/typescript6@/u);
  expect(projectPackage.devDependencies).toHaveProperty('typescript-eslint');
  expect(projectLock.packages['node_modules/typescript-eslint'].peerDependencies.typescript).toBe(
    '>=4.8.4 <6.0.0'
  );
});

it('binds the CodeQL audit suite to the locked query suite and production-only scope', () => {
  const lock = JSON.parse(fs.readFileSync('tooling/configs/ci/toolchain.lock.json', 'utf8'));
  const source = fs.readFileSync('tooling/qa/audits/codeql.mjs', 'utf8');
  const policy = JSON.parse(
    fs.readFileSync('tooling/configs/qa/codeql-proof-reuse.data.json', 'utf8')
  );
  expect(source).toContain(lock.codeql.querySuite);
  expect(policy.excludedDirectoryNames).toEqual(
    expect.arrayContaining(['fixtures', 'generated', 'test', 'tests'])
  );
  expect(policy.excludedFileMarkers).toEqual(expect.arrayContaining(['.test.', '.spec.']));
});

it('rejects release tag ruleset exclusions and parameter drift', () => {
  const expected = JSON.parse(
    fs.readFileSync('tooling/configs/ci/github-policy.json', 'utf8')
  ).releaseTagRuleset;
  expect(() => assertReleaseTagRuleset(structuredClone(expected), expected)).not.toThrow();
  const excludedTag = structuredClone(expected);
  excludedTag.conditions.ref_name.exclude.push('refs/tags/v0.3.0');
  expect(() => assertReleaseTagRuleset(excludedTag, expected)).toThrow(
    'Immutable release tag ruleset drifted'
  );
  const mutableUpdate = structuredClone(expected);
  mutableUpdate.rules[0].parameters.update_allows_fetch_and_merge = true;
  expect(() => assertReleaseTagRuleset(mutableUpdate, expected)).toThrow(
    'Immutable release tag ruleset drifted'
  );
});

it('verifies the exact published asset set including SHA256SUMS itself', () => {
  const root = createTempRoot('release-verification-');
  writeFile(root, 'release/SHA256SUMS', `${'a'.repeat(64)}  sniptale.zip\n`);
  const expected = readExpectedReleaseAssetDigests(path.join(root, 'release'));
  const release = { assets: [...expected].map(([name, digest]) => ({ name, digest })) };
  expect(() => assertPublishedReleaseAssets(release, expected)).not.toThrow();
  release.assets.find(({ name }) => name === 'SHA256SUMS')!.digest = `sha256:${'b'.repeat(64)}`;
  expect(() => assertPublishedReleaseAssets(release, expected)).toThrow(
    'Published asset digest mismatch: SHA256SUMS'
  );
  const exactAssets = [...expected].map(([name, digest]) => ({ name, digest }));
  const draft = {
    assets: exactAssets,
    id: 42,
    tag_name: 'v0.3.3',
    draft: true,
    immutable: false,
  };
  expect(() => assertDraftRelease(draft, '42', 'v0.3.3', expected)).not.toThrow();
  expect(() =>
    assertImmutableRelease({ ...draft, draft: false, immutable: true }, '42', 'v0.3.3', expected)
  ).not.toThrow();
});

it('binds a reusable main proof to commit, tree, candidate controls, and semantic inputs', () => {
  const root = createTempRoot('main-proof-');
  const commit = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
  const tree = spawnSync('git', ['rev-parse', 'HEAD^{tree}'], { encoding: 'utf8' }).stdout.trim();
  writeFile(root, 'build/sniptale_0.3.3.zip', 'zip\n');
  const files = ['build/sniptale_0.3.3.zip'].map((file) => ({
    file,
    sha256: crypto
      .createHash('sha256')
      .update(fs.readFileSync(path.join(root, file)))
      .digest('hex'),
  }));
  const executionEnvironment = { kind: 'locked-container', digest: `sha256:${'a'.repeat(64)}` };
  const controlDigest = createCandidateControlDigest();
  const trustedControlDigest = controlDigest;
  const gateInputDigest = `sha256:${'c'.repeat(64)}`;
  const manifest = {
    schemaVersion: 1,
    artifactKind: 'sniptale-ci-proof',
    lane: 'proof',
    status: 'passed',
    workspaceMode: 'committed',
    commit,
    candidateTree: tree,
    trustedControlSha: commit,
    controlAuthority: 'trusted-base',
    trustedControlDigest,
    controlsChanged: false,
    controlDisposition: 'trusted-controls',
    evidenceDisposition: 'executed',
    gateClaim: 'fast-pr-gate',
    fullVitest: false,
    releaseReady: false,
    reuseCompatibility: { outcome: 'compatible' },
    controlDigest,
    gateInputDigest,
    executionEnvironment,
    containerDigest: executionEnvironment.digest,
    proofSemanticDigest: createProofSemanticDigest({
      lane: 'proof',
      commit,
      candidateTree: tree,
      trustedControlSha: commit,
      trustedControlDigest,
      controlDigest,
      gateInputDigest,
      executionEnvironment,
    }),
    files,
  };
  writeFile(root, 'proof-manifest.json', `${JSON.stringify(manifest)}\n`);
  writeFile(
    root,
    'SHA256SUMS',
    `${[
      ...files.map(({ file, sha256 }) => `${sha256}  ${file}`),
      `${crypto
        .createHash('sha256')
        .update(fs.readFileSync(path.join(root, 'proof-manifest.json')))
        .digest('hex')}  proof-manifest.json`,
    ].join('\n')}\n`
  );
  expect(verifyMainProof(root, commit).zipFile).toBe('build/sniptale_0.3.3.zip');
  fs.appendFileSync(path.join(root, 'build/sniptale_0.3.3.zip'), 'drift\n');
  expect(() => verifyMainProof(root, commit)).toThrow('Main proof digest mismatch');
});

it('rejects equal but stale main-proof control digests', () => {
  const root = createTempRoot('stale-main-proof-');
  const commit = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
  const tree = spawnSync('git', ['rev-parse', 'HEAD^{tree}'], { encoding: 'utf8' }).stdout.trim();
  const staleDigest = `sha256:${'f'.repeat(64)}`;
  writeFile(root, 'build/sniptale_0.3.3.zip', 'zip\n');
  const files = [
    {
      file: 'build/sniptale_0.3.3.zip',
      sha256: crypto.createHash('sha256').update('zip\n').digest('hex'),
    },
  ];
  const executionEnvironment = { kind: 'locked-container', digest: `sha256:${'a'.repeat(64)}` };
  const manifest = {
    schemaVersion: 1,
    artifactKind: 'sniptale-ci-proof',
    lane: 'proof',
    status: 'passed',
    workspaceMode: 'committed',
    commit,
    candidateTree: tree,
    trustedControlSha: commit,
    trustedControlDigest: staleDigest,
    controlDigest: staleDigest,
    controlsChanged: false,
    controlDisposition: 'trusted-controls',
    controlAuthority: 'trusted-base',
    evidenceDisposition: 'executed',
    gateClaim: 'fast-pr-gate',
    fullVitest: false,
    releaseReady: false,
    reuseCompatibility: { outcome: 'compatible' },
    gateInputDigest: `sha256:${'c'.repeat(64)}`,
    executionEnvironment,
    containerDigest: executionEnvironment.digest,
    proofSemanticDigest: createProofSemanticDigest({
      lane: 'proof',
      commit,
      candidateTree: tree,
      trustedControlSha: commit,
      trustedControlDigest: staleDigest,
      controlDigest: staleDigest,
      gateInputDigest: `sha256:${'c'.repeat(64)}`,
      executionEnvironment,
    }),
    files,
  };
  writeFile(root, 'proof-manifest.json', `${JSON.stringify(manifest)}\n`);
  writeFile(
    root,
    'SHA256SUMS',
    `${files[0].sha256}  ${files[0].file}\n${crypto
      .createHash('sha256')
      .update(fs.readFileSync(path.join(root, 'proof-manifest.json')))
      .digest('hex')}  proof-manifest.json\n`
  );

  expect(() => verifyMainProof(root, commit)).toThrow(
    'proof identity does not match the release commit'
  );
});

it('binds the published QA image digest to the exact successful main workflow', () => {
  const root = path.join(createTempRoot('image-proof-'), 'build', 'proof');
  const identity = {
    commit: 'a'.repeat(40),
    digest: `sha256:${'b'.repeat(64)}`,
    repository: 'lrozhkov/sniptale',
    runId: '42',
    runAttempt: '2',
  };
  writeImageProof(root, identity);
  expect(verifyImageProof(root, identity).reference).toBe(
    `ghcr.io/lrozhkov/sniptale-qa@${identity.digest}`
  );
  writeFile(root, 'extra.json', '{}\n');
  expect(() => verifyImageProof(root, identity)).toThrow('inventory is not exact');
});

it('fails closed on missing or stale canonical reports and refuses artifact overwrite', () => {
  const root = createTempRoot('ci-artifact-contract-');
  fs.mkdirSync(path.join(root, 'build'), { recursive: true });
  const policy = path.join(root, 'tooling/configs/ci/proof-semantics.json');
  fs.mkdirSync(path.dirname(policy), { recursive: true });
  fs.copyFileSync('tooling/configs/ci/proof-semantics.json', policy);
  const moduleUrl = new URL('./artifacts.mjs', import.meta.url).href;
  const invocation = (startedAtMs: string, status: string, lane = 'proof') =>
    [
      `import { collectLaneArtifacts } from ${JSON.stringify(moduleUrl)};`,
      `collectLaneArtifacts({ lane: '${lane}', startedAtMs: ${startedAtMs}, status: '${status}',`,
      `command: [], containerDigest: 'sha256:${'a'.repeat(64)}',`,
      `trustedControlDigest: 'sha256:${'b'.repeat(64)}', controlDigest: 'sha256:${'b'.repeat(64)}',`,
      `gateInputDigest: 'sha256:${'c'.repeat(64)}' });`,
    ].join(' ');
  const missing = spawnSync(
    process.execPath,
    ['--input-type=module', '--eval', invocation('0', 'passed')],
    {
      cwd: root,
      env: { ...process.env, GITHUB_SHA: 'd'.repeat(40), GITHUB_RUN_ID: '17' },
      encoding: 'utf8',
    }
  );
  expect(missing.status).not.toBe(0);
  expect(missing.stderr).toContain('Required artifact is missing');
  const collision = spawnSync(
    process.execPath,
    ['--input-type=module', '--eval', invocation('0', 'failed')],
    {
      cwd: root,
      env: { ...process.env, GITHUB_SHA: 'd'.repeat(40), GITHUB_RUN_ID: '17' },
      encoding: 'utf8',
    }
  );
  expect(collision.status).not.toBe(0);
  expect(collision.stderr).toContain('EEXIST');

  const staleRoot = createTempRoot('ci-artifact-stale-');
  fs.mkdirSync(path.join(staleRoot, 'build'), { recursive: true });
  const stalePolicy = path.join(staleRoot, 'tooling/configs/ci/proof-semantics.json');
  fs.mkdirSync(path.dirname(stalePolicy), { recursive: true });
  fs.copyFileSync('tooling/configs/ci/proof-semantics.json', stalePolicy);
  writeFile(staleRoot, '.tmp/qa/build-proof.json', '{}\n');
  fs.utimesSync(path.join(staleRoot, '.tmp/qa/build-proof.json'), new Date(0), new Date(0));
  const stale = spawnSync(
    process.execPath,
    ['--input-type=module', '--eval', invocation('Date.now()', 'passed')],
    {
      cwd: staleRoot,
      env: { ...process.env, GITHUB_SHA: 'e'.repeat(40), GITHUB_RUN_ID: '18' },
      encoding: 'utf8',
    }
  );
  expect(stale.status).not.toBe(0);
  expect(stale.stderr).toContain('Stale artifact predates lane');
  const failedWithStale = spawnSync(
    process.execPath,
    ['--input-type=module', '--eval', invocation('Date.now()', 'failed')],
    {
      cwd: staleRoot,
      env: { ...process.env, GITHUB_SHA: 'e'.repeat(40), GITHUB_RUN_ID: '19' },
      encoding: 'utf8',
    }
  );
  expect(failedWithStale.status, failedWithStale.stderr).toBe(0);
  writeFile(staleRoot, '.tmp/mutation/persistence/after/stryker-report.json', '{}\n');
  fs.utimesSync(
    path.join(staleRoot, '.tmp/mutation/persistence/after/stryker-report.json'),
    new Date(0),
    new Date(0)
  );
  const failedReleaseWithStaleTree = spawnSync(
    process.execPath,
    ['--input-type=module', '--eval', invocation('Date.now()', 'failed', 'release')],
    {
      cwd: staleRoot,
      env: { ...process.env, GITHUB_SHA: 'e'.repeat(40), GITHUB_RUN_ID: '20' },
      encoding: 'utf8',
    }
  );
  expect(failedReleaseWithStaleTree.status, failedReleaseWithStaleTree.stderr).toBe(0);
});

it('blocks local PR bypass for a dirty tree and unauthorized author', () => {
  const root = createTempRoot('ci-proof-contract-');
  writeFile(root, 'tracked.txt', 'tracked\n');
  writeFile(
    root,
    'tooling/configs/ci/github-policy.json',
    JSON.stringify({ releasePublisher: 'lrozhkov' })
  );
  for (const args of [
    ['init'],
    ['config', 'user.name', 'CI Test'],
    ['config', 'user.email', 'ci@example.test'],
    ['add', '.'],
    ['commit', '-m', 'initial'],
  ]) {
    expect(spawnSync('git', args, { cwd: root }).status).toBe(0);
  }
  const proofModule = new URL('./proof.mjs', import.meta.url);
  writeFile(root, 'dirty.txt', 'dirty\n');
  const dirty = spawnSync(process.execPath, [proofModule.pathname, '--pr', '1'], {
    cwd: root,
    encoding: 'utf8',
  });
  expect(dirty.status).not.toBe(0);
  expect(dirty.stderr).toContain('clean worktree');
});

it('runs candidate controls once inside a trusted identity and admission envelope', () => {
  const initial = {
    localSha: 'a'.repeat(40),
    pr: {
      headRefOid: 'a'.repeat(40),
      baseRefOid: 'b'.repeat(40),
      url: 'https://example.test/pr/1',
      author: { login: 'lrozhkov' },
    },
  };
  expect(() =>
    assertProofAuthority(initial, {
      worktreeStatus: '',
      localSha: initial.localSha,
      pr: { ...initial.pr, headRefOid: 'c'.repeat(40) },
    })
  ).toThrow('PR head or base changed while proof lanes were running');
  const proofSource = fs.readFileSync('tooling/ci/proof.mjs', 'utf8');
  const laneSource = fs.readFileSync('tooling/ci/run-lane.mjs', 'utf8');
  const containerSource = fs.readFileSync('tooling/ci/container.mjs', 'utf8');
  const containerCommandSource = fs.readFileSync('tooling/ci/container-command.mjs', 'utf8');
  expect(proofSource).toContain('launcher must run from the clean origin/main commit');
  expect(containerCommandSource).toContain("['install', 'npm', ['ci', '--ignore-scripts']]");
  expect(containerCommandSource).toContain("'verify-project-toolchain'");
  expect(containerCommandSource).toContain(
    '/opt/sniptale-trusted/tooling/ci/verify-project-toolchain.mjs'
  );
  expect(containerCommandSource).toContain('`tooling/ci/${lane}-wrapper.mjs`');
  expect(containerSource).toContain('resolveGithubRunIdentityEnvironment()');
  expect(laneSource).toContain('createCandidateControlDigest({ cwd: trustedRoot })');
  expect(laneSource).toContain('assertedCandidateControlDigest !== candidateControlDigest');
  expect(laneSource).toContain('assertedTrustedControlDigest !== trustedControlDigest');
  expect(laneSource).not.toContain('qa:checkpoint');
  expect(laneSource).not.toContain('qa:closeout');
  expect(containerSource).toContain(
    'const trustedControlSha = process.env.SNIPTALE_TRUSTED_CONTROL_SHA ?? candidateIdentity.head'
  );
  expect(containerSource).toContain('${trustedRoot}:/opt/sniptale-trusted:ro');
  expect(containerSource).toContain("[path.join(trustedRoot, 'tooling/ci/run-lane.mjs'), lane]");
  expect(containerSource).toContain("SNIPTALE_CI_TRUSTED_HOST: '1'");
  expect(laneSource).toContain("spawnSync('docker', invocation");
  expect(laneSource).toContain('appendCandidatePhaseInvocation(dockerArgs');
  expect(containerCommandSource).toContain("npm: '/usr/local/bin/npm'");
  expect(containerSource).toContain('validateCandidateImageEnvironment(');
  expect(containerSource).toContain(
    'const controlsChanged = candidateControlDigest !== trustedControlDigest'
  );
  expect(containerSource).toContain('const reuseAllowed = !controlsChanged');
  expect(containerSource).toContain(
    'Release provenance requires QA controls already trusted by the main commit.'
  );
  expect(containerSource).not.toContain('RUNNER_CONTROLLER_TOKEN');
  expect(containerSource).not.toContain('SELECTEL_OS_APPLICATION_CREDENTIAL_SECRET');
});
