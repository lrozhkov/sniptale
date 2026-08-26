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
const TOOLCHAIN = JSON.parse(fs.readFileSync('tooling/configs/ci/toolchain.lock.json', 'utf8')) as {
  node: { version: string };
};
const PROJECT_NODE_VERSION = TOOLCHAIN.node.version;

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
    'coverallsapp/github-action@8d6379e14d29928660c4ba802d8e85393440b329',
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
      expect(job.source, `${file}:${job.name}`).toContain(`node-version: ${PROJECT_NODE_VERSION}`);
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

it('documents the no-run bootstrap graph and forbids automatic main gates', () => {
  const quality = fs.readFileSync(QUALITY, 'utf8');
  const guide = fs.readFileSync('docs/tooling/ci-cd.md', 'utf8');
  expect(quality).toContain('github.event.pull_request.draft == false');
  expect(quality).toContain("'ci-local-proof-bypass'");
  expect(guide).toContain('apply the trusted `ci-local-proof-bypass` label');
  expect(guide).toContain('The workflow has no `push main` trigger');
  expect(quality).not.toContain('\n  push:\n');
});

it('uses one external workflow for commit gates and the bounded infrastructure smoke', () => {
  const workflow = fs.readFileSync(QUALITY, 'utf8');
  const candidateJob = workflow.slice(
    workflow.indexOf('  canonical-qa:'),
    workflow.indexOf('\n  cleanup:')
  );
  expect(workflow).toContain('name: Continuous Integration');
  expect(workflow).toContain(
    "inputs.gate == 'selectel-connectivity' && 'Selectel connectivity preflight'"
  );
  expect(workflow).toContain(
    "github.event.schedule == '17 3 * * *' && 'sweep' || 'release-provenance'"
  );
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
    'options:\n          [fast, release-provenance, selectel-smoke, selectel-connectivity, selectel-recovery]'
  );
  expect(workflow).toContain('PROOF_LANE:');
  expect(workflow).toContain("'release' || 'proof'");
  expect(workflow).toContain('SELECTEL_RELEASE_PROFILES is required for release provenance.');
  expect(workflow).toContain('SELECTEL_RELEASE_PROFILES: ${{ vars.SELECTEL_RELEASE_PROFILES }}');
  expect(workflow).toContain('--env SELECTEL_QA_PROFILES="$SELECTEL_RELEASE_PROFILES"');
  expect(
    workflow.match(/docker run --rm --user "\$\(id -u\):\$\(id -g\)" --env HOME=\/tmp/g)
  ).toHaveLength(6);
  expect(workflow.match(/docker run --rm/g)).toHaveLength(6);
  expect(workflow).toContain(
    'mv build/selectel-controller/preflight.json build/selectel-controller/preflight-qa.json'
  );
  expect(workflow).toContain(
    'mv build/selectel-controller/preflight.json build/selectel-controller/preflight-release.json'
  );
  expect(workflow).toContain(
    "inputs.gate != 'release-provenance' || github.ref == 'refs/heads/main'"
  );
  expect(workflow).toContain('restore-fast-proof.mjs');
  expect(workflow).not.toContain('if cd trusted-control');
  expect(
    workflow.match(/if \(cd trusted-control && node tooling\/ci\/restore-fast-proof\.mjs/g)
  ).toHaveLength(2);
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
  expect(
    candidateJob.indexOf('actions/setup-node@820762786026740c76f36085b0efc47a31fe5020')
  ).toBeLessThan(candidateJob.indexOf(`node-version: ${PROJECT_NODE_VERSION}`));
  expect(candidateJob.indexOf(`node-version: ${PROJECT_NODE_VERSION}`)).toBeLessThan(
    candidateJob.indexOf('Restore verified reusable proof inputs')
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
  expect(workflow).toContain("github.event.schedule == '17 3 * * *'");
  expect(workflow).toContain("github.event.schedule == '23 4 * * 1'");
  expect(workflow).toContain("github.event.schedule != '17 3 * * *'");
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

it('falls back to the full VM graph when docs-only proof installation or derivation fails', () => {
  const workflow = fs.readFileSync(QUALITY, 'utf8');
  const classifier = workflow.slice(
    workflow.indexOf('  fast-classifier:'),
    workflow.indexOf('\n  qa-image:')
  );
  const qaImage = workflow.slice(
    workflow.indexOf('  qa-image:'),
    workflow.indexOf('\n  provision:')
  );
  const install = classifier.slice(
    classifier.indexOf('name: Install exact candidate dependencies'),
    classifier.indexOf('name: Derive a candidate-bound proof')
  );
  const derive = classifier.slice(
    classifier.indexOf('name: Derive a candidate-bound proof'),
    classifier.indexOf('name: Publish docs-only admission decision')
  );
  expect(install).toContain('id: install');
  expect(install).toContain('continue-on-error: true');
  expect(derive).toContain("if: steps.install.outcome == 'success'");
  expect(derive).toContain('continue-on-error: true');
  expect(classifier).toContain('INSTALL_OUTCOME: ${{ steps.install.outcome }}');
  expect(classifier).toContain('[ "$INSTALL_OUTCOME" = success ]');
  expect(classifier).toContain('[ "$DERIVE_OUTCOME" = success ]');
  expect(qaImage).toContain("needs.fast-classifier.outputs.reuse != 'true'");
  expect(qaImage).toContain("needs.fast-classifier.result == 'success'");
});

it('keeps Selectel maintenance exact-main, recovery-only, and diagnostically replayable', () => {
  const workflow = fs.readFileSync(QUALITY, 'utf8');
  const qaImage = workflow.slice(
    workflow.indexOf('  qa-image:'),
    workflow.indexOf('\n  provision:')
  );
  const sweeper = workflow.slice(
    workflow.indexOf('  scheduled-sweeper:'),
    workflow.indexOf('\n  selectel-recovery:')
  );
  const recovery = workflow.slice(
    workflow.indexOf('  selectel-recovery:'),
    workflow.indexOf('\n  pr-gate:')
  );
  expect(qaImage).toContain("inputs.gate != 'selectel-recovery'");
  expect(sweeper).toContain("with: { ref: '${{ github.sha }}', persist-credentials: false }");
  expect(sweeper).toContain(
    'docker build --file tooling/ci/selectel/Dockerfile.controller --tag sniptale-controller:${GITHUB_SHA} .'
  );
  expect(sweeper).not.toContain('sniptale-controller:main');
  expect(sweeper).not.toContain('docker login');
  expect(sweeper).toContain('artifactKind: "sniptale-selectel-sweep-proof"');
  expect(sweeper).toContain('failure: {kind: "ControllerExit", exitCode: $exitCode}');
  expect(recovery).toContain("inputs.gate == 'selectel-recovery'");
  expect(recovery).toContain("github.ref == 'refs/heads/main'");
  expect(recovery).toContain(
    'docker build --file tooling/ci/selectel/Dockerfile.controller --tag sniptale-controller:${GITHUB_SHA} .'
  );
  expect(recovery).toContain('recover-cleanup /workspace/build/selectel-controller/recovery.json');
  expect(recovery).not.toContain('needs:');
  expect(recovery).not.toMatch(/"\$CONTROLLER_IMAGE" provision(?:\s|$)/u);
  expect(recovery).not.toContain('SNIPTALE_QA_IMAGE');
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
  const classifier = workflow.slice(
    workflow.indexOf('  fast-classifier:'),
    workflow.indexOf('\n  qa-image:')
  );
  expect(classifier).toContain('actions/cache/restore@');
  expect(classifier).not.toContain('cache: npm');
  expect(classifier).not.toContain('actions/cache/save@');
  expect(classifier).toContain(
    'npm_config_cache: ${{ github.workspace }}/candidate/.tmp/npm-cache'
  );
  expect(workflow).toContain("if: success() && github.event_name != 'pull_request_target'");
  expect(workflow).toContain(`node-${PROJECT_NODE_VERSION}-toolchain-`);
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

it('makes immutable main image publication retry-safe after an explicit admitted main gate', () => {
  const workflow = fs.readFileSync(QUALITY, 'utf8');
  const publisher = workflow.slice(
    workflow.indexOf('  publish-qa-image:'),
    workflow.indexOf('\n  scheduled-sweeper:')
  );
  expect(publisher).toContain("github.ref == 'refs/heads/main'");
  expect(publisher).toContain("github.event_name == 'workflow_dispatch'");
  expect(publisher).toContain("inputs.gate == 'fast'");
  expect(publisher).toContain("inputs.gate == 'release-provenance'");
  expect(publisher).toContain('expected=${binding#*|}');
  expect(publisher).toContain('node tooling/ci/immutable-image-tag.mjs "$image" "$expected"');
  expect(publisher).toContain('Immutable image tag admission: $image ($disposition)');
  expect(publisher).not.toContain('Refusing to replace existing immutable image tag');
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
  expect(workflow).toContain('release_notes:');
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
  expect(workflow).toContain('printf \'\\n%s\\n\\n\' "$RELEASE_NOTES" >> "$notes"');
  expect(workflow).not.toContain('Unified local WSL and GitHub/Selectel validation');
  expect(workflow).toContain('release_sha=$(git rev-list -n 1 "$RELEASE_TAG")');
  expect(workflow).toContain('GITHUB_REF_NAME="$RELEASE_TAG" node tooling/ci/release-policy.mjs');
  expect(workflow).not.toContain('release_sha=$(git rev-list -n 1 "$GITHUB_REF_NAME")');
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
  expect(coverageJob).not.toContain('id-token: write');
  expect(coverageJob).toContain('github-token: ${{ secrets.GITHUB_TOKEN }}');
  expect(coverageJob).toContain('coverage-reporter-version: v0.6.22');
  expect(coverageJob).toContain('continue-on-error: true');
  expect(coverageJob).toContain('fail-on-error: true');
  expect(workflow).not.toContain('releases/latest/download/ci.svg');
  expect(workflow).not.toContain('release-owned status badges');
});
