export function parseToggleState({ ok, error }, endpoint) {
  if (ok) return true;
  if (/\(HTTP 404\)/u.test(error ?? '')) return false;
  throw new Error(`Unable to snapshot ${endpoint}: ${error || 'unknown GitHub API failure'}`);
}

export function requireSelectedActionsSnapshot(value) {
  if (
    !value ||
    typeof value !== 'object' ||
    typeof value.github_owned_allowed !== 'boolean' ||
    typeof value.verified_allowed !== 'boolean' ||
    !Array.isArray(value.patterns_allowed)
  ) {
    throw new Error('Selected Actions rollback state is unavailable or malformed.');
  }
  return value;
}

function isNotFound(error) {
  return /\(HTTP 404\)/u.test(error ?? '');
}

export function parseOptionalResourceSnapshot({ error, ok, value }, endpoint) {
  if (!ok) {
    if (isNotFound(error)) return null;
    throw new Error(`Unable to snapshot ${endpoint}: ${error || 'unknown GitHub API failure'}`);
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Unable to snapshot ${endpoint}: malformed GitHub API response`);
  }
  return value;
}

export function requireCompleteBranchPolicyInventory(pages, endpoint) {
  if (!Array.isArray(pages) || pages.length === 0) {
    throw new Error(`Unable to snapshot ${endpoint}: missing paginated GitHub API response`);
  }
  const totals = new Set();
  const policies = [];
  for (const page of pages) {
    if (
      !page ||
      typeof page !== 'object' ||
      !Number.isInteger(page.total_count) ||
      page.total_count < 0 ||
      !Array.isArray(page.branch_policies)
    ) {
      throw new Error(`Unable to snapshot ${endpoint}: malformed branch policy page`);
    }
    totals.add(page.total_count);
    policies.push(...page.branch_policies);
  }
  if (totals.size !== 1 || policies.length !== [...totals][0]) {
    throw new Error(`Unable to snapshot ${endpoint}: incomplete branch policy inventory`);
  }
  const ids = new Set();
  const names = new Set();
  for (const policy of policies) {
    if (
      !policy ||
      typeof policy !== 'object' ||
      !['number', 'string'].includes(typeof policy.id) ||
      typeof policy.name !== 'string' ||
      policy.name.length === 0 ||
      ids.has(String(policy.id)) ||
      names.has(policy.name)
    ) {
      throw new Error(`Unable to snapshot ${endpoint}: ambiguous branch policy inventory`);
    }
    ids.add(String(policy.id));
    names.add(policy.name);
  }
  return policies;
}

export function assertEnvironmentPolicySnapshot(snapshot, desired, name) {
  const actualPolicy = snapshot?.deployment_branch_policy;
  const actualBranches = snapshot?.branches;
  const expectedBranches = [...(desired.branches ?? [])].sort();
  if (
    actualPolicy?.protected_branches !== desired.protected_branches ||
    actualPolicy?.custom_branch_policies !== desired.custom_branch_policies ||
    !Array.isArray(actualBranches) ||
    JSON.stringify(actualBranches) !== JSON.stringify(expectedBranches)
  ) {
    throw new Error(`GitHub environment ${name} policy did not reconcile to the exact state.`);
  }
}

export function requireAbsentResource(deletion, snapshot, endpoint) {
  if (!deletion.ok && !isNotFound(deletion.error)) {
    throw new Error(`Unable to restore absent ${endpoint}: ${deletion.error}`);
  }
  if (parseOptionalResourceSnapshot(snapshot, endpoint) !== null) {
    throw new Error(`Unable to restore absent ${endpoint}: resource survived deletion.`);
  }
}
