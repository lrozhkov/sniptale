import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { parseToggleState, requireSelectedActionsSnapshot } from './github-policy-response.mjs';
import { validateSelectelQaProfiles } from './selectel/policy.mjs';

const policy = JSON.parse(fs.readFileSync('tooling/configs/ci/github-policy.json', 'utf8'));
const mode = process.argv[2] ?? 'plan';
const repository = policy.repository;
const selectelEnvironment = 'selectel-runner-controller';
const apiVersion = '2026-03-10';

function api(endpoint, { method = 'GET', body, allowFailure = false } = {}) {
  const args = ['api', '--header', `X-GitHub-Api-Version: ${apiVersion}`, endpoint];
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

function selectelProfilesSnapshot(name) {
  const variable = api(
    `repos/${repository}/environments/${selectelEnvironment}/variables/${name}`
  ).value;
  const validation = validateSelectelQaProfiles(variable?.value);
  return {
    name: variable?.name,
    environment: selectelEnvironment,
    digest: validation.digest,
    profiles: validation.profiles.length,
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
    selectelProfiles: {
      qa: selectelProfilesSnapshot('SELECTEL_QA_PROFILES'),
      release: selectelProfilesSnapshot('SELECTEL_RELEASE_PROFILES'),
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
  };
}

function setToggle(endpoint, enabled) {
  api(endpoint, { method: enabled ? 'PUT' : 'DELETE' });
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
    },
    { releaseTag: false }
  );
  restoreReleaseTagRuleset(previous.releaseTagRuleset);
  process.stdout.write(`GitHub policy restored from ${snapshotPath}\n`);
} else {
  throw new Error('Usage: github-policy.mjs <plan|apply|restore>');
}
