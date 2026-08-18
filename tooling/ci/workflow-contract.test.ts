import fs from 'node:fs';

import { expect, it } from 'vitest';

import { assertReleasePublisher } from './release-tag-policy.mjs';

it('pins every external workflow action to an approved full commit SHA', () => {
  const expectedEveryWorkflowPins = {
    'actions/checkout@': 'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1',
    'actions/setup-node@': 'actions/setup-node@820762786026740c76f36085b0efc47a31fe5020',
  };
  const expectedRepositoryPins = {
    ...expectedEveryWorkflowPins,
    'actions/upload-artifact@': 'actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a',
    'actions/download-artifact@':
      'actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c',
    'docker/setup-buildx-action@':
      'docker/setup-buildx-action@bb05f3f5519dd87d3ba754cc423b652a5edd6d2c',
    'docker/login-action@': 'docker/login-action@dbcb813823bdd20940b903addbd779551569679f',
    'docker/build-push-action@':
      'docker/build-push-action@53b7df96c91f9c12dcc8a07bcb9ccacbed38856a',
    'github/codeql-action/upload-sarif@':
      'github/codeql-action/upload-sarif@ff2f1c621b7f889edc0d3c761ac2e6a3f8cdb0dd',
    'codecov/codecov-action@': 'codecov/codecov-action@fb8b3582c8e4def4969c97caa2f19720cb33a72f',
  };
  const repositoryUses = [];
  for (const workflow of ['.github/workflows/quality-gate.yml', '.github/workflows/release.yml']) {
    const source = fs.readFileSync(workflow, 'utf8');
    const uses = source
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('uses:') || line.startsWith('- uses:'))
      .map((line) => (line.startsWith('- ') ? line.slice(2) : line))
      .map((line) => line.slice('uses:'.length).trim().split(' ')[0]);
    expect(uses.length).toBeGreaterThan(0);
    for (const action of uses) expect(action).toMatch(/^[^@]+@[a-f0-9]{40}$/u);
    for (const [prefix, pin] of Object.entries(expectedEveryWorkflowPins)) {
      const occurrences = uses.filter((action) => action.startsWith(prefix));
      expect(occurrences.length).toBeGreaterThan(0);
      expect(occurrences.every((action) => action === pin)).toBe(true);
    }
    repositoryUses.push(...uses);
  }
  for (const [prefix, pin] of Object.entries(expectedRepositoryPins)) {
    const occurrences = repositoryUses.filter((action) => action.startsWith(prefix));
    expect(occurrences.length).toBeGreaterThan(0);
    expect(occurrences.every((action) => action === pin)).toBe(true);
  }
});

it('runs one candidate-bound GitHub gate over the canonical local wrapper sequence', () => {
  const workflow = fs.readFileSync('.github/workflows/quality-gate.yml', 'utf8');
  const lane = fs.readFileSync('tooling/ci/run-lane.mjs', 'utf8');
  const container = fs.readFileSync('tooling/ci/container.mjs', 'utf8');
  const artifacts = fs.readFileSync('tooling/ci/artifacts.mjs', 'utf8');
  expect(workflow).toContain('canonical-qa:');
  expect(workflow).toContain('scheduled-sweeper:');
  expect(workflow).toContain('provision-1:');
  expect(workflow).toContain('provision-2:');
  expect(workflow).toContain('provision-3:');
  expect(workflow).toContain('canonical-qa-1:');
  expect(workflow).toContain('adjudicate-1:');
  expect(workflow).toContain('cleanup-1:');
  expect(workflow).not.toContain('candidate-control-smoke:');
  expect(
    workflow.match(/Build informational candidate controls on the disposable runner/gu)
  ).toHaveLength(3);
  expect(workflow).toContain('continue-on-error: true');
  expect(workflow).toContain('informational: true');
  expect(workflow).toContain('candidate-control-1-${{ env.CANDIDATE_SHA }}-${{ github.run_id }}');
  expect(workflow).toContain('path: candidate/build/candidate-control-proof.json');
  expect(workflow).toContain('> build/candidate-control-proof.json');
  expect(workflow).toContain('pr-gate:');
  expect(workflow).toContain('name: pr-gate-authority');
  expect(workflow).toContain('checks: write');
  expect(workflow).toContain('-f head_sha="$CANDIDATE_SHA"');
  expect(workflow).toContain('-f name=pr-gate');
  expect(workflow).toContain('pull_request_target:');
  expect(workflow).not.toContain('  pull_request:\n');
  expect(workflow).toContain('Check out trusted control plane');
  expect(workflow).toContain('SNIPTALE_TRUSTED_CI_ROOT: ${{ github.workspace }}/trusted-control');
  expect(workflow).toContain('node ../trusted-control/tooling/ci/container.mjs candidate');
  expect(workflow).toContain('SNIPTALE_CI_IMAGE: ${{ needs.qa-image.outputs.reference }}');
  expect(workflow).toContain("SNIPTALE_CI_SKIP_BUILD: '1'");
  expect(workflow).toContain('ghcr.io/lrozhkov/sniptale-qa@$digest');
  expect(workflow).toContain('SNIPTALE_SELECTEL_ATTEMPT:');
  expect(workflow).not.toContain('SELECTEL_OS_PROJECT_ID');
  expect(workflow.match(/environment: selectel-runner-controller/gu)).toHaveLength(8);
  for (const attempt of ['1', '2', '3']) {
    const start = workflow.indexOf(`  canonical-qa-${attempt}:`);
    const end = workflow.indexOf(`\n  adjudicate-${attempt}:`, start);
    const candidateJob = workflow.slice(start, end);
    expect(candidateJob).not.toContain('SELECTEL_OS_APPLICATION_CREDENTIAL');
    expect(candidateJob).not.toContain('RUNNER_CONTROLLER_TOKEN');
    expect(candidateJob).toContain(
      'Build informational candidate controls on the disposable runner'
    );
  }
  expect(lane.indexOf("wrapper('release-harness')")).toBeLessThan(
    lane.indexOf("wrapper('checkpoint')")
  );
  expect(lane.indexOf("wrapper('checkpoint')")).toBeLessThan(lane.indexOf("wrapper('closeout'"));
  expect(lane).toContain("wrapper('release')");
  expect(lane).toContain("wrapper('audit', '--profile', 'security')");
  expect(lane).toContain("wrapper('audit', '--profile', 'coverage')");
  expect(lane).toContain('if (!candidatePhaseCommand && lane !== candidateFinalizeLane)');
  expect(lane).toContain('await finalizeCandidateReleaseArchive');
  expect(lane).toContain("const candidateFinalizeLane = 'candidate-release-artifact'");
  expect(lane).toContain("temporaryParent: '/tmp'");
  expect(container).toContain("id: 'release-artifact'");
  expect(container.indexOf("id: 'coverage'")).toBeLessThan(
    container.indexOf("id: 'release-artifact'")
  );
  expect(container).toContain('runContainer(`candidate-${phase.id}`)');
  expect(container).toContain('restoreCandidateAuthority(phase.authority)');
  expect(container).toContain(
    'prepareTrustedControlDependencyMount({ controlRoot, executionRoot, trustedCiRoot })'
  );
  expect(container).toContain('SNIPTALE_CANDIDATE_STARTED_AT_MS');
  expect(container).not.toContain('await finalizeCandidateReleaseArchive');
  expect(artifacts).not.toContain(
    "import { createReleaseArchive } from '../release/package-dist.mjs'"
  );
  expect(artifacts).toContain("await import('../release/package-dist.mjs')");
  expect(workflow).toContain(
    "retention-days: ${{ github.event_name == 'pull_request_target' && 14 || 30 }}"
  );
  expect(workflow.match(/include-hidden-files: true/gu)).toHaveLength(4);
  expect(workflow).not.toContain("hashFiles('reports/.tmp/");
  expect(workflow).toContain('needs: canonical-qa');
  expect(workflow).toContain("if: always() && needs.provision-2.result == 'success'");
  expect(workflow).toContain("if: always() && needs.provision-3.result == 'success'");
  expect(workflow).not.toMatch(/pr-gate:[\s\S]*needs:\s*\[[^\]]*candidate-control-smoke/u);
  expect(workflow).toContain('Refuse immutable tag replacement');
  expect(workflow).toContain('Refusing to replace existing immutable image tag');
  expect(workflow).toContain('Unable to prove immutable image tag absence');
  expect(workflow).toContain('manifest unknown|not found');
});

it('pins the measured GitHub runner profile in both canonical workflows', () => {
  for (const workflowPath of [
    '.github/workflows/quality-gate.yml',
    '.github/workflows/release.yml',
  ]) {
    const workflow = fs.readFileSync(workflowPath, 'utf8');
    expect(workflow).toContain("SNIPTALE_QA_CPU_TOKENS: '24'");
    expect(workflow).toContain("SNIPTALE_QA_MEMORY_MIB: '36864'");
    expect(workflow).toContain("SNIPTALE_QA_VITEST_MAX_WORKERS: '16'");
    expect(workflow).toContain("SNIPTALE_QA_PLAYWRIGHT_WORKERS: '4'");
    expect(workflow).toContain("SNIPTALE_QA_SECURITY_WORKERS: '8'");
  }
  const quality = fs.readFileSync('.github/workflows/quality-gate.yml', 'utf8');
  expect(quality).toMatch(
    /canonical-qa-3:[\s\S]*SNIPTALE_QA_CPU_TOKENS: '12'[\s\S]*SNIPTALE_QA_MEMORY_MIB: '18432'[\s\S]*SNIPTALE_QA_VITEST_MAX_WORKERS: '8'/u
  );
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
  expect(workflow).toContain('image-proof.mjs verify');
  expect(workflow).toContain('admission:');
  expect(workflow).toContain('release-audit:');
  expect(workflow).toContain('cleanup:');
  expect(workflow).toContain('publish:');
  expect(workflow).toContain('for attempt in 1 2 3; do');
  expect(workflow).toContain('build/selectel-controller/selected-attempt.txt');
  expect(workflow).toContain('SNIPTALE_SELECTEL_ATTEMPT: ${{ needs.provision.outputs.attempt }}');
  expect(workflow).toContain('SNIPTALE_QA_CPU_TOKENS: ${{ needs.provision.outputs.cpu-tokens }}');
  expect(workflow).toContain('--arg name "Sniptale ${version} alpha"');
  expect(workflow).toContain('--rawfile body "$release_notes"');
  expect(workflow).toContain('Added verified unit and CodeQL proof reuse');
  expect(workflow).toContain('This is still an alpha preview (**v${version}-alpha**)');
  expect(workflow).toContain('prerelease: false, generate_release_notes: false');
  expect(workflow).toContain('SNIPTALE_CI_IMAGE: ${{ needs.admission.outputs.qa-image }}');
  expect(workflow).toContain('runs-on: ${{ fromJSON(format');
  expect(workflow).toContain('permissions: { actions: read, contents: read }');
  expect(workflow.indexOf('release-audit:')).toBeLessThan(workflow.indexOf('publish:'));
  expect(workflow.indexOf('cleanup:')).toBeLessThan(workflow.indexOf('publish:'));
  const auditJob = workflow.slice(
    workflow.indexOf('  release-audit:'),
    workflow.indexOf('\n  cleanup:')
  );
  expect(auditJob).not.toContain('contents: write');
  expect(auditJob).not.toContain('SELECTEL_OS_APPLICATION_CREDENTIAL');
  expect(auditJob).not.toContain('RUNNER_CONTROLLER_TOKEN');
  expect(workflow).not.toContain('ghcr.io/lrozhkov/sniptale-qa:sha-${GITHUB_SHA}');
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
