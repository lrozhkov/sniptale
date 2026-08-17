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
import { assertReleasePublisher, assertReleaseTagRuleset } from './release-tag-policy.mjs';

it('pins every external workflow action to a full commit SHA', () => {
  for (const workflow of ['.github/workflows/quality-gate.yml', '.github/workflows/release.yml']) {
    const source = fs.readFileSync(workflow, 'utf8');
    const uses = [...source.matchAll(/^\s*uses:\s*([^\s]+)$/gmu)].map((match) => match[1]);
    expect(uses.length).toBeGreaterThan(0);
    for (const action of uses) expect(action).toMatch(/^[^@]+@[a-f0-9]{40}$/u);
  }
});

it('keeps the GitHub gate on canonical wrappers without checkpoint', () => {
  const workflow = fs.readFileSync('.github/workflows/quality-gate.yml', 'utf8');
  expect(workflow).toContain('qa-release:');
  expect(workflow).toContain('security-audit:');
  expect(workflow).toContain('coverage-audit:');
  expect(workflow).toContain('pr-gate:');
  expect(workflow).toContain('name: pr-gate-authority');
  expect(workflow).toContain('checks: write');
  expect(workflow).toContain('-f head_sha="$CANDIDATE_SHA"');
  expect(workflow).toContain('-f name=pr-gate');
  expect(workflow).toContain('pull_request_target:');
  expect(workflow).not.toContain('  pull_request:\n');
  expect(workflow).toContain('Check out trusted control plane');
  expect(workflow).toContain('SNIPTALE_TRUSTED_CI_ROOT: ${{ github.workspace }}/trusted-control');
  expect(workflow).toContain('node ../trusted-control/tooling/ci/container.mjs release');
  expect(workflow).not.toContain('qa:checkpoint');
  expect(workflow).toContain(
    "retention-days: ${{ github.event_name == 'pull_request_target' && 14 || 30 }}"
  );
  expect(workflow.match(/include-hidden-files: true/gu)).toHaveLength(3);
  expect(workflow).not.toContain("hashFiles('reports/.tmp/");
  expect(workflow).toContain('needs: [qa-release, security-audit, coverage-audit]');
  expect(workflow).toContain('Refuse immutable tag replacement');
  expect(workflow).toContain('Refusing to replace existing immutable image tag');
  expect(workflow).toContain('Unable to prove immutable image tag absence');
  expect(workflow).toContain('manifest unknown|not found');
});

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
  const dockerignore = fs.readFileSync('.dockerignore', 'utf8');
  for (const excluded of ['.git', '.env', '.tmp', 'build', 'node_modules']) {
    expect(dockerignore.split('\n')).toContain(excluded);
  }
  for (const asset of lock.playwright.assets) {
    expect(asset.url).toMatch(/^https:\/\/cdn\.playwright\.dev\//u);
    expect(asset.sha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(asset.executable).not.toContain('..');
  }
});

it('fails release publication closed around live immutability and asset digests', () => {
  const workflow = fs.readFileSync('.github/workflows/release.yml', 'utf8');
  const policy = fs.readFileSync('tooling/ci/release-policy.mjs', 'utf8');
  expect(workflow).toContain('include-hidden-files: true');
  expect(workflow).toContain('verify-published-release.mjs "$asset_root" "$release_id"');
  expect(workflow).toContain('verify-draft-release.mjs "$asset_root" "$release_id"');
  expect(workflow.indexOf('verify-draft-release.mjs')).toBeLessThan(
    workflow.indexOf('gh api --method PATCH')
  );
  expect(workflow).toContain("grep -q '(HTTP 404)'");
  expect(workflow).toContain("created_release_id=''");
  expect(workflow).toContain('releases/${created_release_id}');
  expect(workflow).toContain('upload-release-assets.mjs "$asset_root" "$release_id"');
  expect(workflow).not.toContain('gh release upload');
  expect(workflow).not.toContain('gh release edit');
  expect(workflow).not.toContain('gh release delete');
  expect(workflow).toContain('RELEASE_POLICY_READ_TOKEN');
  expect(workflow).not.toContain('existing_draft=');
  expect(policy).toContain("api(repository, 'immutable-releases')");
  expect(policy).toContain('--recheck');
  const githubPolicy = JSON.parse(fs.readFileSync('tooling/configs/ci/github-policy.json', 'utf8'));
  expect(githubPolicy.releaseTagRuleset).toMatchObject({
    target: 'tag',
    enforcement: 'active',
    bypass_actors: [],
    rules: [{ type: 'update' }, { type: 'deletion' }],
  });
  expect(githubPolicy.releasePublisher).toBe('lrozhkov');
  expect(
    githubPolicy.ruleset.rules.find(({ type }) => type === 'required_status_checks').parameters
      .required_status_checks
  ).toEqual([{ context: 'pr-gate', integration_id: 15368 }]);
  expect(() => assertReleasePublisher('collaborator', 'collaborator', 'lrozhkov')).toThrow(
    'Release actor is not authorized'
  );
});

it('rejects release tag ruleset exclusions and parameter drift', () => {
  const expected = JSON.parse(
    fs.readFileSync('tooling/configs/ci/github-policy.json', 'utf8')
  ).releaseTagRuleset;
  expect(() => assertReleaseTagRuleset(structuredClone(expected), expected)).not.toThrow();
  const githubCanonical = structuredClone(expected);
  delete githubCanonical.rules[0].parameters;
  expect(() => assertReleaseTagRuleset(githubCanonical, expected)).not.toThrow();
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
  const malformedUpdate = structuredClone(expected);
  malformedUpdate.rules[0].parameters.update_allows_fetch_and_merge = 'false';
  expect(() => assertReleaseTagRuleset(malformedUpdate, expected)).toThrow(
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
  release.assets.find(({ name }) => name === 'SHA256SUMS')!.digest = expected.get('SHA256SUMS')!;
  const draft = { ...release, id: 42, tag_name: 'v0.3.0', draft: true, immutable: false };
  expect(() => assertDraftRelease(draft, '42', 'v0.3.0', expected)).not.toThrow();
  expect(() => assertDraftRelease({ ...draft, id: 43 }, '42', 'v0.3.0', expected)).toThrow(
    'Draft release identity'
  );
  draft.assets.pop();
  expect(() => assertDraftRelease(draft, '42', 'v0.3.0', expected)).toThrow(
    'asset set is incomplete'
  );
  const published = {
    ...draft,
    assets: [...expected].map(([name, digest]) => ({ name, digest })),
    draft: false,
    immutable: true,
  };
  expect(() => assertImmutableRelease(published, '42', 'v0.3.0', expected)).not.toThrow();
  expect(() => assertImmutableRelease({ ...published, id: 43 }, '42', 'v0.3.0', expected)).toThrow(
    'Published release identity'
  );
});

it('fails canonical artifact collection on missing reports and refuses overwrite', () => {
  const root = createTempRoot('ci-artifact-contract-');
  fs.mkdirSync(path.join(root, 'build'), { recursive: true });
  const moduleUrl = new URL('./artifacts.mjs', import.meta.url).href;
  const script = `import { collectLaneArtifacts } from ${JSON.stringify(moduleUrl)}; collectLaneArtifacts({ lane: 'coverage', startedAtMs: 0, status: 'passed', command: [], containerDigest: 'sha256:${'a'.repeat(64)}' });`;
  const missing = spawnSync(process.execPath, ['--input-type=module', '--eval', script], {
    cwd: root,
    env: { ...process.env, GITHUB_SHA: 'b'.repeat(40), GITHUB_RUN_ID: '17' },
    encoding: 'utf8',
  });
  expect(missing.status).not.toBe(0);
  expect(missing.stderr).toContain('Required artifact is missing');

  for (const file of ['coverage-final.json', 'coverage-summary.json', 'lcov.info']) {
    writeFile(root, `.tmp/coverage/canonical/${file}`, '{}\n');
  }
  writeFile(root, '.tmp/coverage/canonical/html/index.html', '<html></html>\n');
  const runId = '018f68b2-6e52-7cb0-bdb7-7f0a901c94de';
  const logPath = `.tmp/qa-logs/2026-08-17/${runId}.log`;
  writeFile(root, logPath, '');
  writeFile(
    root,
    `.tmp/qa-observability/runs/2026-08-17/${runId}.json`,
    JSON.stringify({
      schemaVersion: 2,
      runId,
      rootRunId: runId,
      parentRunId: null,
      ownerPid: 42,
      wrapperId: 'qa:audit',
      status: 'all-passed',
      exitCode: 0,
      startedAt: '2026-08-17T00:00:00.000Z',
      finishedAt: '2026-08-17T00:00:01.000Z',
      durationMs: 1000,
      repository: {
        head: 'a'.repeat(40),
        treeFingerprint: 'b'.repeat(40),
        diffFingerprint: 'c'.repeat(64),
        changedFileCount: 0,
        scope: 'workspace',
        suite: null,
        mode: 'default',
        targetFiles: [],
      },
      correlation: {},
      summary: {
        stepCount: 0,
        passed: 0,
        problemsFound: 0,
        skipped: 0,
        errors: 0,
        interrupted: 0,
        problemCount: 0,
        problemIds: [],
      },
      steps: [],
      log: {
        path: logPath,
        digest: crypto.createHash('sha256').update('').digest('hex'),
        byteCount: 0,
        truncated: false,
      },
    })
  );
  const forgedRoot = createTempRoot('ci-artifact-forged-record-');
  fs.cpSync(root, forgedRoot, { recursive: true });
  const forgedRunId = '118f68b2-6e52-7cb0-bdb7-7f0a901c94de';
  const forgedRecord = JSON.parse(
    fs.readFileSync(path.join(root, `.tmp/qa-observability/runs/2026-08-17/${runId}.json`), 'utf8')
  );
  forgedRecord.runId = forgedRunId;
  forgedRecord.rootRunId = forgedRunId;
  forgedRecord.log.path = '.env';
  writeFile(
    forgedRoot,
    `.tmp/qa-observability/runs/2026-08-17/${forgedRunId}.json`,
    JSON.stringify(forgedRecord)
  );
  const forged = spawnSync(process.execPath, ['--input-type=module', '--eval', script], {
    cwd: forgedRoot,
    env: { ...process.env, GITHUB_SHA: 'b'.repeat(40), GITHUB_RUN_ID: '20' },
    encoding: 'utf8',
  });
  expect(forged.status).not.toBe(0);
  expect(forged.stderr).toContain('log.path must be the canonical path');
  const success = spawnSync(process.execPath, ['--input-type=module', '--eval', script], {
    cwd: root,
    env: { ...process.env, GITHUB_SHA: 'b'.repeat(40), GITHUB_RUN_ID: '18' },
    encoding: 'utf8',
  });
  expect(success.status, success.stderr).toBe(0);
  const collision = spawnSync(process.execPath, ['--input-type=module', '--eval', script], {
    cwd: root,
    env: { ...process.env, GITHUB_SHA: 'b'.repeat(40), GITHUB_RUN_ID: '18' },
    encoding: 'utf8',
  });
  expect(collision.status).not.toBe(0);
  expect(collision.stderr).toContain('EEXIST');
});

it('rejects stale coverage outputs from an earlier run', () => {
  const root = createTempRoot('ci-artifact-stale-');
  fs.mkdirSync(path.join(root, 'build'), { recursive: true });
  for (const file of ['coverage-final.json', 'coverage-summary.json', 'lcov.info']) {
    writeFile(root, `.tmp/coverage/canonical/${file}`, '{}\n');
    fs.utimesSync(path.join(root, `.tmp/coverage/canonical/${file}`), new Date(0), new Date(0));
  }
  const moduleUrl = new URL('./artifacts.mjs', import.meta.url).href;
  const script = `import { collectLaneArtifacts } from ${JSON.stringify(moduleUrl)}; collectLaneArtifacts({ lane: 'coverage', startedAtMs: Date.now(), status: 'passed', command: [], containerDigest: 'sha256:${'a'.repeat(64)}' });`;
  const result = spawnSync(process.execPath, ['--input-type=module', '--eval', script], {
    cwd: root,
    env: { ...process.env, GITHUB_SHA: 'c'.repeat(40), GITHUB_RUN_ID: '19' },
    encoding: 'utf8',
  });
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain('Stale artifact predates lane');
});

it('blocks local proof for a dirty tree and an unauthorized PR author', () => {
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
  fs.rmSync(path.join(root, 'dirty.txt'));

  const binRoot = createTempRoot('ci-proof-bin-');
  const bin = path.join(binRoot, 'bin');
  fs.mkdirSync(bin);
  writeFile(
    binRoot,
    'bin/gh',
    '#!/bin/sh\nprintf \'%s\\n\' \'{"headRefOid":"0000000000000000000000000000000000000000","baseRefOid":"1111111111111111111111111111111111111111","url":"https://example.test/pr/1","author":{"login":"collaborator"}}\'\n'
  );
  fs.chmodSync(path.join(bin, 'gh'), 0o755);
  const mismatch = spawnSync(process.execPath, [proofModule.pathname, '--pr', '1'], {
    cwd: root,
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
    encoding: 'utf8',
  });
  expect(mismatch.status).not.toBe(0);
  expect(mismatch.stderr).toContain('only accepts PRs authored by lrozhkov');
});

it('rejects PR and local authority that changes while proof lanes run', () => {
  const initial = {
    localSha: 'a'.repeat(40),
    pr: {
      headRefOid: 'a'.repeat(40),
      baseRefOid: 'b'.repeat(40),
      url: 'https://example.test/pr/1',
      author: { login: 'lrozhkov' },
    },
  };
  const current = {
    worktreeStatus: '',
    localSha: initial.localSha,
    pr: { ...initial.pr, headRefOid: 'c'.repeat(40) },
  };
  expect(() => assertProofAuthority(initial, current)).toThrow(
    'PR head or base changed while proof lanes were running'
  );
  expect(() =>
    assertProofAuthority(initial, { ...current, pr: initial.pr, worktreeStatus: ' M tracked.txt' })
  ).toThrow('worktree changed while proof lanes were running');
  const proofSource = fs.readFileSync('tooling/ci/proof.mjs', 'utf8');
  const laneSource = fs.readFileSync('tooling/ci/run-lane.mjs', 'utf8');
  expect(proofSource).toContain('launcher must run from the clean origin/main commit');
  expect(proofSource).toContain('SNIPTALE_TRUSTED_CI_ROOT: trustedWorkspace');
  expect(proofSource).toContain("['checkout', '--quiet', '--detach', pr.headRefOid]");
  expect(proofSource).toContain('Fetched PR commit does not match GitHub PR authority');
  expect(laneSource).toContain("['ci', '--ignore-scripts']");
});
