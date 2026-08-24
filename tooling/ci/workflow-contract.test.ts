import fs from 'node:fs';

import { expect, it } from 'vitest';

function collectWorkflowJobBlocks(workflow: string) {
  const jobsStart = workflow.indexOf('\njobs:\n');
  if (jobsStart < 0) throw new Error('Workflow jobs block is missing.');
  const jobs = workflow.slice(jobsStart + 1);
  const headers = [...jobs.matchAll(/^[ ]{2}([a-z0-9-]+):$/gmu)];
  return headers.map((header, index) => ({
    name: header[1],
    source: jobs.slice(header.index, headers[index + 1]?.index ?? jobs.length),
  }));
}

const QUALITY = '.github/workflows/quality-gate.yml';
const RELEASE = '.github/workflows/release.yml';

function workflowUses(source: string) {
  return source
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('uses:') || line.startsWith('- uses:'))
    .map((line) => (line.startsWith('- ') ? line.slice(2) : line))
    .map((line) => line.slice('uses:'.length).trim().split(' ')[0]);
}

it('pins every external Action to an approved full commit SHA', () => {
  const sources = [QUALITY, RELEASE].map((file) => fs.readFileSync(file, 'utf8'));
  const uses = sources.flatMap(workflowUses);
  for (const action of uses) expect(action).toMatch(/^[^@]+@[a-f0-9]{40}$/u);
  for (const pin of [
    'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1',
    'actions/setup-node@820762786026740c76f36085b0efc47a31fe5020',
    'actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a',
    'actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c',
    'actions/cache/restore@27d5ce7f107fe9357f9df03efb73ab90386fccae',
    'actions/cache/save@27d5ce7f107fe9357f9df03efb73ab90386fccae',
    'docker/setup-buildx-action@bb05f3f5519dd87d3ba754cc423b652a5edd6d2c',
    'docker/login-action@dbcb813823bdd20940b903addbd779551569679f',
    'docker/build-push-action@53b7df96c91f9c12dcc8a07bcb9ccacbed38856a',
    'github/codeql-action/upload-sarif@ff2f1c621b7f889edc0d3c761ac2e6a3f8cdb0dd',
    'codecov/codecov-action@fb8b3582c8e4def4969c97caa2f19720cb33a72f',
  ]) {
    expect(uses).toContain(pin);
  }
});

it('pins project Node for every workflow job that executes a repository Node entrypoint', () => {
  for (const file of ['.github/workflows/quality-gate.yml', '.github/workflows/release.yml']) {
    const workflow = fs.readFileSync(file, 'utf8');
    for (const job of collectWorkflowJobBlocks(workflow)) {
      if (!/\bnode (?:\.\.\/trusted-control\/|trusted-control\/)?tooling\//u.test(job.source)) {
        continue;
      }
      expect(job.source, `${file}:${job.name}`).toContain(
        'actions/setup-node@820762786026740c76f36085b0efc47a31fe5020'
      );
      expect(job.source, `${file}:${job.name}`).toContain('node-version: 22.12.0');
      expect(
        job.source.indexOf('actions/setup-node@'),
        `${file}:${job.name}: setup-node must precede repository Node execution`
      ).toBeLessThan(
        job.source.search(/\bnode (?:\.\.\/trusted-control\/|trusted-control\/)?tooling\//u)
      );
    }
  }
});

it('installs exact publication dependencies before the only npm-backed workflow entrypoint', () => {
  const release = fs.readFileSync(RELEASE, 'utf8');
  expect(release.indexOf('npm ci --ignore-scripts')).toBeLessThan(
    release.indexOf('node tooling/ci/prepare-release-assets.mjs')
  );
});

it('keeps credential-bearing environments restricted to main', () => {
  const policy = JSON.parse(fs.readFileSync('tooling/configs/ci/github-policy.json', 'utf8'));
  expect(policy.environments).toEqual({
    'selectel-runner-controller': {
      protected_branches: false,
      custom_branch_policies: true,
      branches: ['main'],
    },
    'release-publisher': {
      protected_branches: false,
      custom_branch_policies: true,
      branches: ['main'],
    },
  });
  const quality = fs.readFileSync(QUALITY, 'utf8');
  const release = fs.readFileSync(RELEASE, 'utf8');
  expect(quality).toContain(
    "(github.event_name != 'workflow_dispatch' || github.ref == 'refs/heads/main')"
  );
  expect(release).toContain("if: github.ref == 'refs/heads/main'");
});

it('documents the no-run bootstrap graph for both PR and main push events', () => {
  const quality = fs.readFileSync(QUALITY, 'utf8');
  const guide = fs.readFileSync('docs/tooling/ci-cd.md', 'utf8');
  expect(quality).toContain('github.event.pull_request.draft == false');
  expect(quality).toContain("'ci-local-proof-bypass'");
  expect(guide).toContain('apply the trusted `ci-local-proof-bypass` label');
  expect(guide).toContain('with `[skip ci]` in the resulting `main` commit subject');
  expect(guide).toContain('verify the skipped Actions run');
});

it('uses one external workflow for commit gates and the bounded infrastructure smoke', () => {
  const workflow = fs.readFileSync(QUALITY, 'utf8');
  const candidateJob = workflow.slice(
    workflow.indexOf('  canonical-qa:'),
    workflow.indexOf('\n  cleanup:')
  );
  expect(workflow).toContain('name: Continuous Integration');
  expect(workflow).toContain(
    'QA_CACHE_EXPORT: type=gha,mode=min,scope=sniptale-qa,ignore-error=true'
  );
  expect(workflow).toContain(
    'CONTROLLER_CACHE_EXPORT: type=gha,mode=min,scope=sniptale-controller,ignore-error=true'
  );
  expect(workflow).toContain(
    "cache-to: ${{ github.event_name != 'pull_request_target' && env.QA_CACHE_EXPORT || '' }}"
  );
  expect(workflow).toContain(
    "cache-to: ${{ github.event_name != 'pull_request_target' && env.CONTROLLER_CACHE_EXPORT || '' }}"
  );
  expect(workflow).not.toContain('cache-to: type=gha');
  expect(workflow).toContain(
    'options: [fast, release-provenance, selectel-smoke, selectel-connectivity]'
  );
  expect(workflow).toContain('PROOF_LANE:');
  expect(workflow).toContain("'release' || 'proof'");
  expect(workflow).toContain('SELECTEL_RELEASE_PROFILES is required for release provenance.');
  expect(workflow).toContain('SELECTEL_RELEASE_PROFILES: ${{ vars.SELECTEL_RELEASE_PROFILES }}');
  expect(workflow).toContain('--env SELECTEL_QA_PROFILES="$SELECTEL_RELEASE_PROFILES"');
  expect(workflow).toContain(
    "inputs.gate != 'release-provenance' || github.ref == 'refs/heads/main'"
  );
  expect(workflow).toContain('restore-fast-proof.mjs');
  expect(workflow).toContain(
    'classify-fast-gate.mjs trusted-control candidate "$BASE_SHA" "$CANDIDATE_SHA"'
  );
  expect(workflow).toContain('derive-fast-proof.mjs');
  expect(workflow).toContain(
    'node trusted-control/tooling/ci/check-control-authority.mjs trusted-control candidate'
  );
  expect(workflow).toContain('name: Report candidate QA control disposition');
  expect(workflow).toContain('QA controls changed: $CONTROLS_CHANGED');
  expect(workflow).toContain('Control disposition: $disposition');
  expect(workflow).toContain('name: Bind candidate and trusted QA control digests');
  expect(workflow).not.toContain('Reject self-authorizing QA control drift');
  expect(workflow).toContain('trusted-admission:');
  expect(workflow).toContain('admit-candidate-proof.mjs');
  expect(workflow).toContain('admit-gate-graph.mjs');
  expect(workflow).toContain('needs.trusted-admission.outputs.execution_path');
  expect(workflow).toContain("needs.fast-classifier.outputs.reuse != 'true'");
  expect(workflow).toContain('node ../trusted-control/tooling/ci/container.mjs "$PROOF_LANE"');
  expect(candidateJob).toMatch(
    /actions\/setup-node@820762786026740c76f36085b0efc47a31fe5020[\s\S]*node-version: 22\.12\.0[\s\S]*Restore verified reusable proof inputs/u
  );
  expect(candidateJob).toContain('if [ -f "$manifest" ]; then');
  expect(candidateJob).toContain('Artifact: not produced before the failure.');
  expect(workflow).toContain(
    'name: ${{ env.PROOF_KIND }}-${{ env.CANDIDATE_SHA }}-${{ github.run_id }}-${{ github.run_attempt }}'
  );
  expect(workflow).toContain('pr-gate:');
  expect(workflow).toContain('name: Fast PR Gate');
  expect(workflow).toContain('name: Release provenance Gate');
  expect(workflow).toContain('name: Selectel infrastructure smoke');
  expect(workflow).toContain("if: ${{ !cancelled() && needs.qa-image.result == 'success' }}");
  const candidateCondition = candidateJob.slice(
    candidateJob.indexOf('    if:'),
    candidateJob.indexOf('    runs-on:')
  );
  expect(candidateCondition).toContain('!cancelled() &&');
  expect(candidateCondition).toContain("needs.provision.result == 'success'");
  expect(candidateCondition).toContain(
    "(github.event_name != 'workflow_dispatch' || inputs.gate != 'selectel-smoke')"
  );
  const infrastructureJob = workflow.slice(
    workflow.indexOf('  infrastructure-smoke:'),
    workflow.indexOf('\n  trusted-admission:')
  );
  expect(infrastructureJob).toContain('!cancelled() &&');
  expect(infrastructureJob).toContain("needs.provision.result == 'success'");
  expect(infrastructureJob).toContain("inputs.gate == 'selectel-smoke'");
  expect(workflow).toContain(
    "node tooling/ci/infrastructure-smoke.mjs '${{ needs.qa-image.outputs.reference }}'"
  );
  expect(workflow).toContain('needs: [qa-image, provision, canonical-qa, infrastructure-smoke]');
  expect(workflow).toContain('[ "$CLEANUP_RESULT" = success ]');
  expect(workflow).toContain('scheduled-sweeper:');
  expect(workflow).toContain("github.event.schedule == '17 * * * *'");
  expect(workflow).toContain("github.event.schedule == '23 4 * * 1'");
  expect(workflow).toContain("github.event.schedule != '17 * * * *'");
  expect(workflow).toContain('recover-cleanup');
  expect(workflow).toContain("github.ref == 'refs/heads/main'");
  expect(workflow).toContain("'ci-local-proof-bypass'");
  expect(workflow).toContain('continue-on-error: true');
  expect(workflow).toContain('resolve-run-artifact.mjs');
  expect(workflow).not.toContain('Build informational candidate controls');
  expect(workflow).not.toContain('container.mjs candidate');
  expect(candidateJob).not.toContain('qa:checkpoint');
  expect(candidateJob).not.toContain('qa:closeout');
  expect(candidateJob).not.toContain('SELECTEL_OS_APPLICATION_CREDENTIAL');
  expect(candidateJob).not.toContain('RUNNER_CONTROLLER_TOKEN');
  expect(workflow).not.toContain('RUNNER_IMAGE_TOKEN');
  expect(workflow).not.toContain('RUNNER_IMAGE_USER');
  expect(workflow).toContain('docker manifest inspect "$SNIPTALE_QA_IMAGE"');
  const container = fs.readFileSync('tooling/ci/container.mjs', 'utf8');
  expect(container).toContain('resolveContainerDigest(image');
});

it('reuses immutable images when image inputs are unchanged and records sanitized resources', () => {
  const workflow = fs.readFileSync(QUALITY, 'utf8');
  expect(workflow).toContain('Resolve reusable image digests or request a rebuild');
  expect(workflow).toContain('git -C candidate diff --quiet "$source_sha" "$target_sha"');
  expect(workflow).toContain('context: candidate');
  expect(workflow).toContain('org.opencontainers.image.revision=${{ env.CANDIDATE_SHA }}');
  expect(workflow).toContain("steps.select.outputs['qa-build'] == 'true'");
  expect(workflow).toContain("steps.select.outputs['controller-build'] == 'true'");
  expect(workflow).toContain('SNIPTALE_SELECTEL_PROFILES_DIGEST:');
  expect(workflow).toContain('SNIPTALE_QA_MEMORY_MIB:');
  expect(workflow).toContain('path: candidate/.tmp/npm-cache');
  expect(workflow).toContain('actions/cache/restore@');
  expect(workflow).toContain('actions/cache/save@');
  expect(workflow).toContain("if: success() && github.event_name != 'pull_request_target'");
  expect(workflow).toContain('node-22.12.0-toolchain-');
  expect(workflow).toContain('npm ci --ignore-scripts');
  expect(workflow).not.toContain('SELECTEL_OS_PROJECT_ID');
  expect(workflow).toContain(
    'Restore the early provision receipt independently of artifact transport'
  );
  expect(workflow).toContain('Report cleanup status');
  expect(workflow).toContain('any(.attempts[]?; .runnerId != null');
  expect(workflow).toContain('checkout_path: candidate');
  expect(workflow).toContain("format('refs/pull/{0}/head', github.event.pull_request.number)");
  expect(workflow).toContain('sha: ${{ env.CANDIDATE_SHA }}');
  expect(workflow).toContain(
    "retention-days: ${{ github.event_name == 'pull_request_target' && 14 || 30 }}"
  );
});

it('publishes from one admitted provenance artifact without provisioning another VM', () => {
  const workflow = fs.readFileSync(RELEASE, 'utf8');
  const publishJob = workflow.slice(
    workflow.indexOf('  publish:'),
    workflow.indexOf('\n  coverage-results:')
  );
  const coverageJob = workflow.slice(workflow.indexOf('  coverage-results:'));
  expect(workflow).toContain('name: Continuous Deployment');
  expect(workflow).toContain('release_tag:');
  expect(workflow).toContain('provenance_run_id:');
  expect(workflow).toContain('allow_non_latest_provenance:');
  expect(workflow).toContain('.display_title == "Release provenance Gate"');
  expect(workflow).toContain(
    'artifact_prefix="release-provenance-${release_sha}-${PROVENANCE_RUN_ID}-"'
  );
  expect(workflow).not.toContain('provenance-attempt=$provenance_attempt');
  expect(workflow).toContain("! -name '*-qa-evidence.zip'");
  expect(coverageJob).toContain('resolve-run-artifact.mjs');
  expect(workflow).toContain('event=workflow_dispatch&status=completed');
  expect(workflow).toContain('.name == "Release provenance Gate" and .conclusion == "success"');
  expect(workflow).toContain('is not the latest completed run');
  expect(workflow).toContain('verify-main-proof.mjs release');
  expect(workflow).toContain('prepare-release-assets.mjs build/release-proof');
  expect(workflow).toContain("grep -q '(HTTP 404)'");
  expect(workflow).toContain("created_release_id=''");
  expect(workflow).toContain('classify-release-state.mjs');
  expect(workflow).toContain('already_published=true');
  expect(workflow).toContain('recreate-owned-draft');
  expect(workflow).toContain("if: github.ref == 'refs/heads/main'");
  expect(workflow).toContain('environment: release-publisher');
  expect(workflow).toContain('verify-published-release.mjs');
  expect(workflow).not.toContain('SELECTEL_');
  expect(workflow).not.toContain('  provision:');
  expect(publishJob).not.toContain('id-token: write');
  expect(coverageJob).toContain('id-token: write');
  expect(coverageJob).toContain('use_oidc: true');
  expect(coverageJob).toContain('continue-on-error: true');
});
