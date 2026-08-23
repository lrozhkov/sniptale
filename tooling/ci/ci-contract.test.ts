import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

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
import { verifyImageProof, writeImageProof } from './image-proof.mjs';

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
  expect(semgrepLock).toContain(`semgrep==${lock.semgrep.version}`);
  const playwrightLock = fs.readFileSync('tooling/configs/ci/playwright/package-lock.json');
  expect(crypto.createHash('sha256').update(playwrightLock).digest('hex')).toBe(
    lock.playwright.npmLockSha256
  );
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
  const controlDigest = `sha256:${'b'.repeat(64)}`;
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

it('binds the published QA image digest to the exact successful main workflow', () => {
  const root = path.join(createTempRoot('image-proof-'), 'build', 'proof');
  const identity = {
    commit: 'a'.repeat(40),
    digest: `sha256:${'b'.repeat(64)}`,
    repository: 'lrozhkov/sniptale',
    runId: '42',
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
  const invocation = (startedAtMs: string, status: string) =>
    [
      `import { collectLaneArtifacts } from ${JSON.stringify(moduleUrl)};`,
      `collectLaneArtifacts({ lane: 'proof', startedAtMs: ${startedAtMs}, status: '${status}',`,
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

it('runs only controls identical to trusted base and rechecks PR authority', () => {
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
  expect(proofSource).toContain('launcher must run from the clean origin/main commit');
  expect(laneSource).toContain("['install', 'npm', ['ci', '--ignore-scripts']]");
  expect(laneSource).toContain('`tooling/ci/${lane}-wrapper.mjs`');
  expect(laneSource).toContain('candidateControlDigest !== trustedControlDigest');
  expect(laneSource).toContain('createCandidateControlDigest({ cwd: trustedRoot })');
  expect(laneSource).toContain('assertedCandidateControlDigest !== candidateControlDigest');
  expect(laneSource).toContain('assertedTrustedControlDigest !== trustedControlDigest');
  expect(laneSource).not.toContain('qa:checkpoint');
  expect(laneSource).not.toContain('qa:closeout');
  expect(containerSource).toContain(
    'const trustedControlSha = process.env.SNIPTALE_TRUSTED_CONTROL_SHA ?? candidateIdentity.head'
  );
  expect(containerSource).toContain('${trustedRoot}:/opt/sniptale-trusted:ro');
  expect(containerSource).toContain('/opt/sniptale-trusted/tooling/ci/run-lane.mjs');
  expect(containerSource).toContain('candidateControlDigest !== trustedControlDigest');
  expect(containerSource).not.toContain('RUNNER_CONTROLLER_TOKEN');
  expect(containerSource).not.toContain('SELECTEL_OS_APPLICATION_CREDENTIAL_SECRET');
});
