import fs from 'node:fs';

import { describe, expect, it } from 'vitest';
import YAML from 'yaml';

type Permissions = Record<string, 'none' | 'read' | 'write'>;

interface WorkflowStep {
  name?: string;
  run?: string;
  uses?: string;
  with?: Record<string, unknown>;
}

interface WorkflowJob {
  environment?: string;
  if?: string;
  name?: string;
  permissions?: Permissions;
  secrets?: string;
  steps?: WorkflowStep[];
  uses?: string;
  with?: Record<string, unknown>;
}

interface Workflow {
  jobs: Record<string, WorkflowJob>;
  on: Record<string, unknown>;
  permissions?: Permissions;
}

const WORKFLOW_PATHS = [
  '.github/workflows/_canonical-proof.yml',
  '.github/workflows/pr.yml',
  '.github/workflows/provenance.yml',
  '.github/workflows/release.yml',
  '.github/workflows/selectel-maintenance.yml',
  '.github/workflows/selectel-smoke.yml',
] as const;

const CANONICAL = '.github/workflows/_canonical-proof.yml';
const PR = '.github/workflows/pr.yml';
const PROVENANCE = '.github/workflows/provenance.yml';
const RELEASE = '.github/workflows/release.yml';
const MAINTENANCE = '.github/workflows/selectel-maintenance.yml';
const SMOKE = '.github/workflows/selectel-smoke.yml';
const REUSABLE_PROOF = './.github/workflows/_canonical-proof.yml';
const LOCKED_NODE_ACTION = '/.github/actions/setup-locked-node';
const LOCKED_NODE_ACTION_PATH = '.github/actions/setup-locked-node/action.yml';

function readSource(path: string) {
  return fs.readFileSync(path, 'utf8');
}

function readWorkflow(path: string) {
  return YAML.parse(readSource(path)) as Workflow;
}

function actionUses(workflow: Workflow) {
  return Object.values(workflow.jobs).flatMap((job) =>
    (job.steps ?? []).flatMap((step) => (step.uses === undefined ? [] : [step.uses]))
  );
}

function reusableUses(workflow: Workflow) {
  return Object.values(workflow.jobs).flatMap((job) => (job.uses === undefined ? [] : [job.uses]));
}

function expectExactPermissions(job: WorkflowJob, expected: Permissions) {
  expect(job.permissions ?? {}).toEqual(expected);
}

describe('split workflow topology', () => {
  it('has one exact reusable proof owner and five bounded public entrypoints', () => {
    const actual = fs
      .readdirSync('.github/workflows')
      .filter((file) => file.endsWith('.yml'))
      .map((file) => `.github/workflows/${file}`)
      .sort();
    expect(actual).toEqual([...WORKFLOW_PATHS].sort());

    const expectedTriggers: Record<string, string[]> = {
      [CANONICAL]: ['workflow_call'],
      [PR]: ['pull_request_target'],
      [PROVENANCE]: ['schedule', 'workflow_dispatch'],
      [RELEASE]: ['workflow_dispatch'],
      [MAINTENANCE]: ['schedule', 'workflow_dispatch'],
      [SMOKE]: ['workflow_dispatch'],
    };
    for (const path of WORKFLOW_PATHS) {
      const workflow = readWorkflow(path);
      expect(Object.keys(workflow.on).sort(), path).toEqual(expectedTriggers[path].sort());
      expect(workflow.on, path).not.toHaveProperty('push');
      expect(workflow.permissions, path).toEqual({ contents: 'read' });
    }
  });

  it('allows only the intended callers to invoke the canonical proof', () => {
    const callers = WORKFLOW_PATHS.flatMap((path) =>
      reusableUses(readWorkflow(path)).map((uses) => ({ path, uses }))
    );
    expect(callers).toEqual([
      { path: PR, uses: REUSABLE_PROOF },
      { path: PROVENANCE, uses: REUSABLE_PROOF },
      { path: SMOKE, uses: REUSABLE_PROOF },
    ]);
    expect(readWorkflow(PR).jobs['canonical-proof'].with).toMatchObject({
      gate: 'fast',
    });
    expect(readWorkflow(PROVENANCE).jobs['canonical-proof'].with).toMatchObject({
      gate: 'release-provenance',
      release_diagnostic: '${{ inputs.diagnostic || false }}',
    });
    expect(readWorkflow(SMOKE).jobs['canonical-smoke'].with).toMatchObject({
      gate: 'selectel-smoke',
    });
  });

  it('keeps branch release diagnostics exact and non-publishing', () => {
    const provenance = readWorkflow(PROVENANCE);
    const canonical = readWorkflow(CANONICAL);
    const diagnosticInput = (
      provenance.on as {
        workflow_dispatch: { inputs: Record<string, Record<string, unknown>> };
      }
    ).workflow_dispatch.inputs.diagnostic;
    expect(diagnosticInput).toEqual({
      description: 'Run the release QA graph on this branch without publication or attestation',
      required: false,
      default: false,
      type: 'boolean',
    });
    expect(provenance.jobs['canonical-proof'].if).toContain('inputs.diagnostic');
    expect(provenance.jobs['canonical-proof'].with).toMatchObject({
      gate: 'release-provenance',
      release_diagnostic: '${{ inputs.diagnostic || false }}',
    });
    expect(provenance.jobs['release-provenance-gate'].if).toContain('!inputs.diagnostic');
    expect(provenance.jobs['diagnostic-gate'].if).toContain('inputs.diagnostic');
    expect(provenance.jobs['attest-release'].if).toBe(
      "needs.release-provenance-gate.result == 'success'"
    );
    expect(provenance.jobs['coverage-results'].if).toBe(
      "needs.release-provenance-gate.result == 'success'"
    );
    expect(canonical.jobs['qa-image'].if).toContain(
      "inputs.release_diagnostic && inputs.gate == 'release-provenance'"
    );
    expect(canonical.jobs['security-results'].if).toContain('!inputs.release_diagnostic');
    expect(canonical.jobs['publish-qa-image'].if).toContain('!inputs.release_diagnostic');
    expect(canonical.jobs['release-provenance-gate'].if).toContain('!inputs.release_diagnostic');
    expect(canonical.jobs['release-diagnostic-gate'].if).toContain('inputs.release_diagnostic');
  });

  it('keeps deployment diagnostics read-only and publication environment-gated', () => {
    const release = readWorkflow(RELEASE);
    const diagnosticInput = (
      release.on as {
        workflow_dispatch: { inputs: Record<string, Record<string, unknown>> };
      }
    ).workflow_dispatch.inputs.diagnostic;
    expect(diagnosticInput).toEqual({
      description: 'Admit and prepare the exact release without creating or publishing it',
      required: false,
      default: false,
      type: 'boolean',
    });
    expect(Object.keys(release.jobs)).toEqual(['admission', 'diagnostic-gate', 'publish']);
    expect(release.jobs.admission.environment).toBeUndefined();
    expect(release.jobs['diagnostic-gate'].environment).toBeUndefined();
    expect(release.jobs['diagnostic-gate'].if).toContain('inputs.diagnostic');
    expect(release.jobs.publish.environment).toBe('release-publisher');
    expect(release.jobs.publish.if).toContain('!inputs.diagnostic');
    const admission = (release.jobs.admission.steps ?? []).map((step) => step.run ?? '').join('\n');
    const publication = (release.jobs.publish.steps ?? []).map((step) => step.run ?? '').join('\n');
    for (const mutation of [
      '--method POST',
      '--method PATCH',
      '--method DELETE',
      'upload-release-assets.mjs',
    ]) {
      expect(admission).not.toContain(mutation);
      expect(publication).toContain(mutation);
    }
    expect(admission).toContain('classify-release-state.mjs');
    expect(admission).toContain('release-request.json');
    expect(admission).toContain('deployment-plan.json');
  });

  it('inherits secrets only into the environment-gated release proof caller', () => {
    for (const path of WORKFLOW_PATHS) {
      const source = readSource(path);
      expect(source, path).not.toMatch(/^\s{2}push\s*:/mu);
    }
    expect(readWorkflow(PROVENANCE).jobs['canonical-proof'].secrets).toBe('inherit');
    expect(readWorkflow(PR).jobs['canonical-proof'].secrets).toBeUndefined();
    expect(readWorkflow(SMOKE).jobs['canonical-smoke'].secrets).toBeUndefined();
    for (const path of [CANONICAL, PR, RELEASE, MAINTENANCE, SMOKE]) {
      expect(readSource(path), path).not.toMatch(/\bsecrets\s*:\s*inherit\b/u);
    }
  });

  it('declares only the environment-overridden controller secrets at the reusable boundary', () => {
    const workflowCall = (
      readWorkflow(CANONICAL).on as {
        workflow_call: { secrets: Record<string, { required: boolean }> };
      }
    ).workflow_call;
    expect(workflowCall.secrets).toEqual({
      SELECTEL_OS_APPLICATION_CREDENTIAL_ID: {
        description: 'Environment-owned Selectel application credential identifier',
        required: false,
      },
      SELECTEL_OS_APPLICATION_CREDENTIAL_SECRET: {
        description: 'Environment-owned Selectel application credential secret',
        required: false,
      },
      RUNNER_CONTROLLER_TOKEN: {
        description: 'Environment-owned GitHub runner registration controller token',
        required: false,
      },
    });
  });

  it('exposes the exact stable PR required-check boundary', () => {
    const workflow = readWorkflow(PR);
    expect(Object.keys(workflow.jobs)).toEqual(['canonical-proof', 'pr-gate']);
    expect(workflow.jobs['pr-gate']).toMatchObject({
      name: 'pr-gate',
      permissions: {},
    });
    expect(readSource(PR)).toContain('test "$CANONICAL_PROOF_RESULT" = success');
    expect(readSource(PR)).toContain("'ci-local-proof-bypass'");
  });

  it('keeps maintenance isolated from proof, release, and publication authority', () => {
    const workflow = readWorkflow(MAINTENANCE);
    expect(Object.keys(workflow.jobs)).toEqual([
      'candidate-image-sweeper',
      'scheduled-sweeper',
      'selectel-recovery',
      'dependency-freshness',
    ]);
    expect(reusableUses(workflow)).toEqual([]);
    const source = readSource(MAINTENANCE);
    expect(source).not.toContain('_canonical-proof.yml');
    expect(source).not.toContain('release-publisher');
    expect(source).not.toContain('coverallsapp/github-action');
    expect(source).not.toContain('actions/attest@');
  });
});

describe('workflow supply-chain and privilege contracts', () => {
  it('pins every external Action to a full immutable commit SHA', () => {
    for (const path of WORKFLOW_PATHS) {
      for (const uses of actionUses(readWorkflow(path))) {
        if (uses.startsWith('./')) continue;
        expect(uses, `${path}: ${uses}`).toMatch(/^[^@\s]+@[a-f0-9]{40}$/u);
      }
    }
    expect(readSource(LOCKED_NODE_ACTION_PATH)).toMatch(/uses: actions\/setup-node@[a-f0-9]{40}/u);
  });

  it('keeps each job at its exact permission ceiling', () => {
    const canonical = readWorkflow(CANONICAL).jobs;
    const canonicalPermissions: Record<string, Permissions> = {
      'fast-classifier': { actions: 'read', contents: 'read' },
      'qa-image': { contents: 'read', packages: 'write' },
      provision: { contents: 'read', packages: 'read' },
      'canonical-qa': { actions: 'read', contents: 'read' },
      'advisory-artifacts': { contents: 'read' },
      'infrastructure-smoke': { contents: 'read', packages: 'read' },
      'trusted-admission': { actions: 'read', contents: 'read' },
      cleanup: { actions: 'read', contents: 'read', packages: 'read' },
      'security-results': {
        actions: 'read',
        contents: 'read',
        'security-events': 'write',
      },
      'publish-qa-image': { contents: 'read', packages: 'write' },
      'pr-gate': {},
      'fast-gate': {},
      'release-provenance-gate': {},
      'release-diagnostic-gate': {},
      'infrastructure-smoke-gate': {},
    };
    expect(Object.keys(canonical).sort()).toEqual(Object.keys(canonicalPermissions).sort());
    for (const [name, permissions] of Object.entries(canonicalPermissions)) {
      expectExactPermissions(canonical[name], permissions);
    }

    expectExactPermissions(readWorkflow(PR).jobs['canonical-proof'], {
      actions: 'read',
      contents: 'read',
      packages: 'write',
      'security-events': 'write',
    });
    expectExactPermissions(readWorkflow(PROVENANCE).jobs['canonical-proof'], {
      actions: 'read',
      contents: 'read',
      packages: 'write',
      'security-events': 'write',
    });
    expectExactPermissions(readWorkflow(PROVENANCE).jobs['diagnostic-gate'], {});
    expectExactPermissions(readWorkflow(SMOKE).jobs['canonical-smoke'], {
      actions: 'read',
      contents: 'read',
      packages: 'write',
    });
    expectExactPermissions(readWorkflow(RELEASE).jobs.admission, {
      actions: 'read',
      contents: 'read',
    });
    expectExactPermissions(readWorkflow(RELEASE).jobs['diagnostic-gate'], {});
    expectExactPermissions(readWorkflow(RELEASE).jobs.publish, {
      actions: 'read',
      contents: 'write',
    });
    expectExactPermissions(readWorkflow(MAINTENANCE).jobs['candidate-image-sweeper'], {
      actions: 'read',
      contents: 'read',
      packages: 'write',
    });
  });

  it('grants OIDC and attestation writes only to the provenance attestation job', () => {
    const privileged: Array<{ job: string; path: string }> = [];
    for (const path of WORKFLOW_PATHS) {
      for (const [job, definition] of Object.entries(readWorkflow(path).jobs)) {
        const permissions = definition.permissions ?? {};
        if ('id-token' in permissions || 'attestations' in permissions)
          privileged.push({ path, job });
      }
    }
    expect(privileged).toEqual([{ path: PROVENANCE, job: 'attest-release' }]);
    expectExactPermissions(readWorkflow(PROVENANCE).jobs['attest-release'], {
      actions: 'read',
      attestations: 'write',
      contents: 'read',
      'id-token': 'write',
      packages: 'write',
    });
  });
});

describe('publication proof ownership', () => {
  it('keeps coverage publication and subject attestation in provenance only', () => {
    for (const path of WORKFLOW_PATHS) {
      const source = readSource(path);
      if (path === PROVENANCE) {
        expect(source).toContain('coverallsapp/github-action@');
        expect(source).toContain('actions/attest@');
        expect(source).toContain('verify-main-proof.mjs release');
      } else {
        expect(source, path).not.toContain('coverallsapp/github-action@');
        expect(source, path).not.toContain('actions/attest@');
      }
    }
  });

  it('requires deployment to consume verified assets and verify their attestations', () => {
    const source = readSource(RELEASE);
    expect(source).toContain('.github/workflows/provenance.yml');
    expect(source).toContain('verify-release-assets.mjs');
    expect(source).toContain('gh attestation verify');
    expect(source).toContain('--signer-workflow');
    expect(source).toContain('--source-ref refs/heads/main');
    expect(source).toContain('--source-digest');
    expect(source).toContain('--deny-self-hosted-runners');
    expect(source).not.toContain('prepare-release-assets.mjs');
    expect(source).not.toContain('coverallsapp/github-action@');
  });
});

describe('repository Node entrypoint runtime parity', () => {
  it('verifies the exact locked Node, npm, npx, and paths before every repository entrypoint', () => {
    const action = readSource(LOCKED_NODE_ACTION_PATH);
    expect(action).toContain('node-version-file: ${{ inputs.repository-root }}/.nvmrc');
    expect(action).toContain('package-manager-cache: false');
    expect(action).toContain('npm install --global "npm@$npm_version"');
    expect(action).toContain('(cd "${RUNNER_TEMP:?}" && npm install --global');
    expect(action).toContain('tooling/ci/runtime-parity.mjs');
    expect(action).toContain('tooling/configs/ci/toolchain.lock.json');

    for (const path of WORKFLOW_PATHS) {
      const workflow = readWorkflow(path);
      for (const [jobName, job] of Object.entries(workflow.jobs)) {
        const steps = job.steps ?? [];
        const firstNodeEntry = steps.findIndex((step) =>
          /\bnode (?:\.\.\/)?(?:candidate\/|trusted-control\/)?tooling\//u.test(step.run ?? '')
        );
        if (firstNodeEntry < 0) continue;

        const setupIndex = steps.findIndex((step) => step.uses?.endsWith(LOCKED_NODE_ACTION));
        expect(
          setupIndex,
          `${path}:${jobName}: missing locked runtime parity`
        ).toBeGreaterThanOrEqual(0);
        expect(
          setupIndex,
          `${path}:${jobName}: runtime parity must precede Node execution`
        ).toBeLessThan(firstNodeEntry);
      }
    }
  });
});
