import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import {
  classifyDependencyScope,
  resolveLockPackageName,
} from '../../core/dependency-lock-identity.mjs';
import {
  admittedDependencySource,
  admittedInstallScript,
  dependencyPolicyRules,
  rootLifecyclePolicyStatus,
} from '../../policy/dependency-policy-rules.mjs';

const REPORT_PATH = '.tmp/security/dependency-admission.json';
const LIFECYCLE_SCRIPTS = new Set([
  'preinstall',
  'install',
  'postinstall',
  'preprepare',
  'prepare',
  'postprepare',
  'prepublish',
  'prepublishOnly',
  'prepack',
  'postpack',
  'publish',
  'postpublish',
]);
const INPUT_PATHS = new Set([
  'package.json',
  'package-lock.json',
  'apps/extension/package.json',
  'tooling/configs/qa/dependency-policy-rules.data.json',
  'tooling/configs/qa/licenses.json',
  'tooling/qa/core/dependency-lock-identity.mjs',
  'tooling/qa/guards/security/verify-dependency-admission.mjs',
  'tooling/qa/policy/dependency-policy-rules.mjs',
]);

function sourceProtocol(sourceUrl) {
  try {
    return new URL(sourceUrl).protocol.replace(/:$/u, '');
  } catch {
    return null;
  }
}

function admissionRow(packageJson, lockPath, entry, rules) {
  const name = resolveLockPackageName(lockPath, entry);
  const scope = name && classifyDependencyScope(packageJson, lockPath, name, entry);
  const artifactInclusion = scope?.includes('development')
    ? 'development-only'
    : 'source-runtime-candidate';
  const row = {
    packageName: name,
    resolvedVersion: entry.version,
    dependencyScope: scope,
    artifactInclusion,
    sourceUrl: entry.resolved,
    sourceProtocol: sourceProtocol(entry.resolved),
    integrity: entry.integrity,
    hasInstallScript: Boolean(entry.hasInstallScript),
  };
  return {
    ...row,
    sourcePolicyStatus: row.sourceProtocol && admittedDependencySource(row, rules),
    installScriptPolicyStatus: admittedInstallScript(row, rules),
  };
}

function isWorkspaceLockEntry(lockPath, entry) {
  return Boolean(entry.link || lockPath.startsWith('apps/') || lockPath.startsWith('packages/'));
}

function lifecycleRows(packageJson, rules) {
  return Object.entries(packageJson.scripts ?? {})
    .filter(([name]) => LIFECYCLE_SCRIPTS.has(name))
    .map(([scriptName, command]) => {
      const approval = rules.rootLifecycleApprovals.find(
        (entry) => entry.scriptName === scriptName && entry.command === command
      );
      const row = { scriptName, command, ownerId: approval?.ownerId ?? '' };
      return { ...row, policyStatus: rootLifecyclePolicyStatus(row, rules) };
    })
    .sort((left, right) => left.scriptName.localeCompare(right.scriptName));
}

function violation(rule, message) {
  return { rule, file: 'package-lock.json', message };
}

/** Validate source, integrity and install-time admission directly from the current lockfile. */
export function collectDependencyAdmission({ packageJson, lock, rules }) {
  const rows = Object.entries(lock.packages ?? {})
    .filter(([lockPath, entry]) => lockPath && !isWorkspaceLockEntry(lockPath, entry))
    .map(([lockPath, entry]) => admissionRow(packageJson, lockPath, entry, rules))
    .sort((left, right) =>
      `${left.packageName}@${left.resolvedVersion}`.localeCompare(
        `${right.packageName}@${right.resolvedVersion}`
      )
    );
  const lifecycle = lifecycleRows(packageJson, rules);
  const violations = [
    ...rows.flatMap((row) => {
      const label = `${row.packageName ?? '<unknown>'}@${row.resolvedVersion ?? '<unknown>'}`;
      const rowViolations = [];
      if (!row.packageName || !row.resolvedVersion || !row.sourceUrl || !row.integrity) {
        rowViolations.push(
          violation('dependency-lock-metadata', `${label} is missing lock source or integrity`)
        );
      }
      if (!row.sourcePolicyStatus) {
        rowViolations.push(
          violation('dependency-source-admission', `${label} has an unapproved source`)
        );
      }
      if (!row.installScriptPolicyStatus) {
        rowViolations.push(
          violation('dependency-install-admission', `${label} has an unapproved install script`)
        );
      }
      return rowViolations;
    }),
    ...lifecycle.flatMap((row) =>
      row.policyStatus
        ? []
        : [
            {
              rule: 'dependency-root-lifecycle',
              file: 'package.json',
              message: `root lifecycle script ${row.scriptName} is unapproved`,
            },
          ]
    ),
  ];
  return { rows, lifecycle, violations };
}

function readInputs(root) {
  const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
  const lock = JSON.parse(readFileSync(resolve(root, 'package-lock.json'), 'utf8'));
  return { packageJson, lock, rules: dependencyPolicyRules(root) };
}

function writeReport(root, result) {
  const destination = resolve(root, REPORT_PATH);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(
    destination,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        componentCount: result.rows.length,
        lifecycleCount: result.lifecycle.length,
        rows: result.rows,
        lifecycle: result.lifecycle,
      },
      null,
      2
    )}\n`
  );
}

/** Skip unrelated product edits but always re-evaluate the policy itself, lock or admission tool. */
export function runDependencyAdmissionCheck({
  files = [],
  targetFiles = files,
  root = process.cwd(),
} = {}) {
  const relevantFiles = targetFiles.length > 0 ? targetFiles : files;
  const relevant =
    relevantFiles.length === 0 || relevantFiles.some((file) => INPUT_PATHS.has(file));
  if (!relevant) return { skipped: true, violations: [] };
  const result = collectDependencyAdmission(readInputs(root));
  writeReport(root, result);
  return { skipped: false, violations: result.violations };
}
