import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import {
  assertEnvironmentPolicySnapshot,
  parseOptionalResourceSnapshot,
  parseToggleState,
  requireAbsentResource,
  requireCompleteBranchPolicyInventory,
  requireSelectedActionsSnapshot,
} from './github-policy-response.mjs';
import { validateSelectelProfilesForLane } from './selectel/policy.mjs';

const policy = JSON.parse(fs.readFileSync('tooling/configs/ci/github-policy.json', 'utf8'));
const mode = process.argv[2] ?? 'plan';
const repository = policy.repository;
const selectelEnvironment = 'selectel-runner-controller';
const apiVersion = '2026-03-10';

function api(endpoint, { method = 'GET', body, allowFailure = false, paginate = false } = {}) {
  const args = ['api', '--header', `X-GitHub-Api-Version: ${apiVersion}`, endpoint];
  if (paginate) args.push('--paginate', '--slurp');
  if (method !== 'GET') args.push('--method', method);
  if (body !== undefined) args.push('--input', '-');
  const result = spawnSync('gh', args, {
    encoding: 'utf8',
    input: body === undefined ? undefined : JSON.stringify(body),
  });
  if (result.status !== 0 && !allowFailure) {
    throw new Error(`GitHub API ${method} ${endpoint} failed: ${(result.stderr ?? '').trim()}`);
  }
  return {
    ok: result.status === 0,
    error: result.stderr.trim(),
    value: result.stdout.trim() ? JSON.parse(result.stdout) : null,
  };
}

function toggleState(endpoint) {
  return parseToggleState(api(endpoint, { allowFailure: true }), endpoint);
}

function booleanState(endpoint) {
  const response = api(endpoint);
  if (typeof response.value?.enabled !== 'boolean') {
    throw new Error(`Unable to snapshot ${endpoint}: malformed GitHub API response`);
  }
  return response.value.enabled;
}

function rulesetPayload(value) {
  return {
    name: value.name,
    target: value.target,
    enforcement: value.enforcement,
    bypass_actors: value.bypass_actors ?? [],
    conditions: value.conditions,
    rules: value.rules,
  };
}

function findRuleset(name) {
  const summaries = api(`repos/${repository}/rulesets`).value;
  const summary = summaries.find((candidate) => candidate.name === name);
  return summary ? api(`repos/${repository}/rulesets/${summary.id}`).value : null;
}

function selectelProfilesSnapshot(name, lane) {
  const repositoryVariableEndpoint = `repos/${repository}/actions/variables/${name}`;
  const repositoryVariable = parseOptionalResourceSnapshot(
    api(repositoryVariableEndpoint, { allowFailure: true }),
    repositoryVariableEndpoint
  );
  if (repositoryVariable !== null) {
    const authority = `${selectelEnvironment} environment`;
    throw new Error(
      `${name} must exist only in the ${authority}; a repository variable would create a shadow authority.`
    );
  }
  const variable = api(
    `repos/${repository}/environments/${selectelEnvironment}/variables/${name}`
  ).value;
  const validation = validateSelectelProfilesForLane(variable?.value, lane);
  return {
    name: variable?.name,
    environment: selectelEnvironment,
    digest: validation.digest,
    profiles: validation.profiles.length,
  };
}

function environmentSnapshot(name) {
  const environmentEndpoint = `repos/${repository}/environments/${name}`;
  const environment = parseOptionalResourceSnapshot(
    api(environmentEndpoint, { allowFailure: true }),
    environmentEndpoint
  );
  if (environment === null) return null;
  const policyEndpoint = `${environmentEndpoint}/deployment-branch-policies`;
  const policies = environment.deployment_branch_policy?.custom_branch_policies
    ? requireCompleteBranchPolicyInventory(
        api(`${policyEndpoint}?per_page=100`, { paginate: true }).value,
        policyEndpoint
      )
    : [];
  return {
    deployment_branch_policy: environment.deployment_branch_policy,
    branches: policies.map(({ name: branch }) => branch).sort(),
  };
}

function snapshot() {
  const actions = api(`repos/${repository}/actions/permissions`).value;
  const selectedActions =
    actions.allowed_actions === 'selected'
      ? requireSelectedActionsSnapshot(
          api(`repos/${repository}/actions/permissions/selected-actions`).value
        )
      : null;
  return {
    schemaVersion: 1,
    repository,
    capturedAt: new Date().toISOString(),
    actions,
    selectedActions,
    workflow: api(`repos/${repository}/actions/permissions/workflow`).value,
    vulnerabilityAlerts: toggleState(`repos/${repository}/vulnerability-alerts`),
    automatedSecurityFixes: toggleState(`repos/${repository}/automated-security-fixes`),
    privateVulnerabilityReporting: booleanState(
      `repos/${repository}/private-vulnerability-reporting`
    ),
    immutableReleases: toggleState(`repos/${repository}/immutable-releases`),
    ruleset: rulesetPayload(api(`repos/${repository}/rulesets/${policy.rulesetId}`).value),
    releaseTagRuleset: (() => {
      const current = findRuleset(policy.releaseTagRuleset.name);
      return current ? { id: current.id, ...rulesetPayload(current) } : null;
    })(),
    environments: Object.fromEntries(
      Object.keys(policy.environments).map((name) => [name, environmentSnapshot(name)])
    ),
    selectelProfiles: {
      qa: selectelProfilesSnapshot('SELECTEL_QA_PROFILES', 'proof'),
      release: selectelProfilesSnapshot('SELECTEL_RELEASE_PROFILES', 'release'),
    },
  };
}

function desired() {
  const owner = api(`users/${policy.ruleset.bypassOwner.login}`).value;
  return {
    actions: policy.actions,
    security: policy.security,
    ruleset: {
      name: policy.ruleset.name,
      target: policy.ruleset.target,
      enforcement: policy.ruleset.enforcement,
      bypass_actors: [
        {
          actor_id: owner.id,
          actor_type: 'User',
          bypass_mode: policy.ruleset.bypassOwner.mode,
        },
      ],
      conditions: policy.ruleset.conditions,
      rules: policy.ruleset.rules,
    },
    releaseTagRuleset: policy.releaseTagRuleset,
    environments: policy.environments,
  };
}

function setToggle(endpoint, enabled) {
  api(endpoint, { method: enabled ? 'PUT' : 'DELETE' });
}

function applyEnvironment(name, value) {
  api(`repos/${repository}/environments/${name}`, {
    method: 'PUT',
    body: {
      deployment_branch_policy: {
        protected_branches: value.protected_branches,
        custom_branch_policies: value.custom_branch_policies,
      },
    },
  });
  if (value.custom_branch_policies) {
    const endpoint = `repos/${repository}/environments/${name}/deployment-branch-policies`;
    const current = requireCompleteBranchPolicyInventory(
      api(`${endpoint}?per_page=100`, { paginate: true }).value,
      endpoint
    );
    for (const branch of current) {
      if (!value.branches.includes(branch.name)) {
        api(`${endpoint}/${branch.id}`, { method: 'DELETE' });
      }
    }
    const currentNames = new Set(current.map(({ name: branch }) => branch));
    for (const branch of value.branches) {
      if (!currentNames.has(branch)) api(endpoint, { method: 'POST', body: { name: branch } });
    }
  }
  assertEnvironmentPolicySnapshot(environmentSnapshot(name), value, name);
}

function apply(value, { releaseTag = true } = {}) {
  api(`repos/${repository}/actions/permissions`, {
    method: 'PUT',
    body: {
      enabled: value.actions.enabled,
      allowed_actions: value.actions.allowed_actions,
      sha_pinning_required: value.actions.sha_pinning_required,
    },
  });
  if (value.actions.allowed_actions === 'selected') {
    api(`repos/${repository}/actions/permissions/selected-actions`, {
      method: 'PUT',
      body: requireSelectedActionsSnapshot(value.actions.selected),
    });
  }
  api(`repos/${repository}/actions/permissions/workflow`, {
    method: 'PUT',
    body: value.actions.workflow,
  });
  setToggle(`repos/${repository}/vulnerability-alerts`, value.security.vulnerabilityAlerts);
  setToggle(`repos/${repository}/automated-security-fixes`, value.security.automatedSecurityFixes);
  setToggle(
    `repos/${repository}/private-vulnerability-reporting`,
    value.security.privateVulnerabilityReporting
  );
  setToggle(`repos/${repository}/immutable-releases`, value.security.immutableReleases);
  for (const [name, environment] of Object.entries(value.environments ?? {})) {
    applyEnvironment(name, environment);
  }
  api(`repos/${repository}/rulesets/${policy.rulesetId}`, {
    method: 'PUT',
    body: value.ruleset,
  });
  if (releaseTag) {
    const currentTagRuleset = findRuleset(policy.releaseTagRuleset.name);
    api(
      currentTagRuleset
        ? `repos/${repository}/rulesets/${currentTagRuleset.id}`
        : `repos/${repository}/rulesets`,
      {
        method: currentTagRuleset ? 'PUT' : 'POST',
        body: value.releaseTagRuleset,
      }
    );
  }
}

function restoreReleaseTagRuleset(previous) {
  const current = findRuleset(policy.releaseTagRuleset.name);
  if (previous) {
    api(current ? `repos/${repository}/rulesets/${current.id}` : `repos/${repository}/rulesets`, {
      method: current ? 'PUT' : 'POST',
      body: rulesetPayload(previous),
    });
  } else if (current) {
    api(`repos/${repository}/rulesets/${current.id}`, { method: 'DELETE' });
  }
}

if (mode === 'plan') {
  process.stdout.write(`${JSON.stringify({ current: snapshot(), desired: desired() }, null, 2)}\n`);
} else if (mode === 'apply') {
  const current = snapshot();
  const backupDirectory = '.tmp/github-policy-backup';
  fs.mkdirSync(backupDirectory, { recursive: true });
  const backupPath = path.join(
    backupDirectory,
    `${new Date().toISOString().replaceAll(':', '-')}.json`
  );
  fs.writeFileSync(backupPath, `${JSON.stringify(current, null, 2)}\n`, {
    flag: 'wx',
    mode: 0o600,
  });
  apply(desired());
  process.stdout.write(`GitHub policy applied. Rollback snapshot: ${backupPath}\n`);
} else if (mode === 'restore') {
  const snapshotFlag = process.argv.indexOf('--snapshot');
  const snapshotPath = snapshotFlag >= 0 ? process.argv[snapshotFlag + 1] : null;
  if (!snapshotPath || !snapshotPath.startsWith('.tmp/github-policy-backup/')) {
    throw new Error('Restore requires --snapshot .tmp/github-policy-backup/<file>.json');
  }
  const previous = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
  apply(
    {
      actions: {
        enabled: previous.actions.enabled,
        allowed_actions: previous.actions.allowed_actions,
        sha_pinning_required: previous.actions.sha_pinning_required ?? false,
        selected:
          previous.actions.allowed_actions === 'selected'
            ? requireSelectedActionsSnapshot(previous.selectedActions)
            : null,
        workflow: previous.workflow,
      },
      security: {
        vulnerabilityAlerts: previous.vulnerabilityAlerts,
        automatedSecurityFixes: previous.automatedSecurityFixes,
        privateVulnerabilityReporting: previous.privateVulnerabilityReporting,
        immutableReleases: previous.immutableReleases,
      },
      ruleset: previous.ruleset,
      environments: Object.fromEntries(
        Object.entries(previous.environments ?? {})
          .filter(([, environment]) => environment)
          .map(([name, environment]) => [
            name,
            {
              ...environment.deployment_branch_policy,
              branches: environment.branches,
            },
          ])
      ),
    },
    { releaseTag: false }
  );
  for (const [name, environment] of Object.entries(previous.environments ?? {})) {
    if (environment === null) {
      const endpoint = `repos/${repository}/environments/${name}`;
      const deletion = api(endpoint, { method: 'DELETE', allowFailure: true });
      requireAbsentResource(deletion, api(endpoint, { allowFailure: true }), endpoint);
    }
  }
  restoreReleaseTagRuleset(previous.releaseTagRuleset);
  process.stdout.write(`GitHub policy restored from ${snapshotPath}\n`);
} else {
  throw new Error('Usage: github-policy.mjs <plan|apply|restore>');
}
