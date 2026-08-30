import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import {
  classifyDependencyScope,
  resolveLockPackageName,
} from '../../analysis/dependencies/dependency-lock-identity.mjs';
import {
  admittedDependencySource,
  admittedInstallScript,
  dependencyPolicyRuleErrors,
  dependencyPolicyRules,
  rootLifecyclePolicyStatus,
} from '../../policy/dependencies/dependency-policy-rules.mjs';

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
  'tooling/configs/qa/dependency-policy-rules.data.json',
  'tooling/configs/qa/licenses.json',
  'tooling/qa/analysis/dependencies/dependency-lock-identity.mjs',
  'tooling/qa/guards/security/verify-dependency-admission.mjs',
  'tooling/qa/policy/dependencies/dependency-policy-rules.mjs',
]);
const WORKSPACE_PACKAGE_PATH_PATTERN = /^(?:apps|packages)\/[^/]+\/package\.json$/u;

export function isDependencyAdmissionInputPath(file) {
  return INPUT_PATHS.has(file) || WORKSPACE_PACKAGE_PATH_PATTERN.test(file);
}

function sourceProtocol(sourceUrl) {
  try {
    return new URL(sourceUrl).protocol.replace(/:$/u, '');
  } catch {
    return null;
  }
}

function bundledOwner(lock, lockPath, entry) {
  if (entry.inBundle !== true) return null;
  const packageName = resolveLockPackageName(lockPath, entry);
  if (!packageName) return null;
  return (
    Object.entries(lock.packages ?? {})
      .filter(
        ([candidatePath, candidate]) =>
          candidatePath &&
          lockPath.startsWith(`${candidatePath}/node_modules/`) &&
          Array.isArray(candidate.bundleDependencies) &&
          candidate.bundleDependencies.every((dependency) => typeof dependency === 'string') &&
          candidate.bundleDependencies.includes(packageName)
      )
      .sort(([leftPath], [rightPath]) => rightPath.length - leftPath.length)[0] ?? null
  );
}

function directScope(packageManifests, lockPath, name, entry) {
  if (lockPath !== `node_modules/${name}`) return null;
  const runtime = packageManifests.some(
    (manifest) =>
      Object.hasOwn(manifest.dependencies ?? {}, name) ||
      Object.hasOwn(manifest.optionalDependencies ?? {}, name)
  );
  const development = packageManifests.some((manifest) =>
    Object.hasOwn(manifest.devDependencies ?? {}, name)
  );
  if (runtime === development) return null;
  const developmentEntry = entry.dev === true || entry.devOptional === true;
  if (runtime) return developmentEntry ? null : 'direct-runtime';
  return developmentEntry ? 'direct-development' : null;
}

function admissionRow(packageJson, workspacePackages, lock, lockPath, entry, rules) {
  const name = resolveLockPackageName(lockPath, entry);
  const packageManifests = [packageJson, ...workspacePackages];
  const scope =
    name &&
    (directScope(packageManifests, lockPath, name, entry) ??
      classifyDependencyScope(packageJson, lockPath, name, entry));
  const artifactInclusion = scope?.includes('development')
    ? 'development-only'
    : 'source-runtime-candidate';
  const owner = bundledOwner(lock, lockPath, entry);
  const ownerEntry = owner?.[1];
  const row = {
    packageName: name,
    resolvedVersion: entry.version,
    dependencyScope: scope,
    artifactInclusion,
    sourceUrl: entry.resolved ?? ownerEntry?.resolved,
    sourceProtocol: sourceProtocol(entry.resolved ?? ownerEntry?.resolved),
    integrity: entry.integrity ?? ownerEntry?.integrity,
    hasInstallScript: Boolean(entry.hasInstallScript),
    bundledBy: owner ? resolveLockPackageName(owner[0], ownerEntry) : null,
  };
  return {
    ...row,
    sourcePolicyStatus: row.sourceProtocol && admittedDependencySource(row, rules),
    installScriptPolicyStatus: admittedInstallScript(row, rules),
  };
}

function isWorkspaceLockEntry(lockPath, entry) {
  return Boolean(entry.link || !lockPath.includes('node_modules/'));
}

function policyIdentity(entry, keys) {
  return keys.map((key) => entry[key]).join('\0');
}

function collectApprovalClosureViolations(rows, lifecycle, rules) {
  const sourceIdentities = new Set(
    rows.map((row) =>
      policyIdentity(row, [
        'packageName',
        'resolvedVersion',
        'dependencyScope',
        'artifactInclusion',
        'sourceUrl',
      ])
    )
  );
  const installIdentities = new Set(
    rows
      .filter((row) => row.hasInstallScript)
      .map((row) =>
        policyIdentity(row, [
          'packageName',
          'resolvedVersion',
          'dependencyScope',
          'artifactInclusion',
        ])
      )
  );
  const lifecycleIdentities = new Set(
    lifecycle.map((row) => policyIdentity(row, ['scriptName', 'command', 'ownerId']))
  );
  return [
    ...rules.sourceExceptions.flatMap((entry) =>
      sourceIdentities.has(
        policyIdentity(entry, [
          'packageName',
          'resolvedVersion',
          'dependencyScope',
          'artifactInclusion',
          'sourceUrl',
        ])
      )
        ? []
        : [
            {
              rule: 'dependency-source-approval-stale',
              file: 'tooling/configs/qa/dependency-policy-rules.data.json',
              message: `${entry.packageName}@${entry.resolvedVersion} source exception matches no lock entry`,
            },
          ]
    ),
    ...rules.installScriptApprovals.flatMap((entry) =>
      installIdentities.has(
        policyIdentity(entry, [
          'packageName',
          'resolvedVersion',
          'dependencyScope',
          'artifactInclusion',
        ])
      )
        ? []
        : [
            {
              rule: 'dependency-install-approval-stale',
              file: 'tooling/configs/qa/dependency-policy-rules.data.json',
              message: `${entry.packageName}@${entry.resolvedVersion} install approval matches no scripted lock entry`,
            },
          ]
    ),
    ...rules.rootLifecycleApprovals.flatMap((entry) =>
      lifecycleIdentities.has(policyIdentity(entry, ['scriptName', 'command', 'ownerId']))
        ? []
        : [
            {
              rule: 'dependency-root-lifecycle-approval-stale',
              file: 'tooling/configs/qa/dependency-policy-rules.data.json',
              message: `${entry.scriptName} lifecycle approval matches no root script`,
            },
          ]
    ),
  ];
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
export function collectDependencyAdmission({ packageJson, lock, rules, workspacePackages = [] }) {
  const policyErrors = dependencyPolicyRuleErrors(rules);
  if (policyErrors.length > 0) {
    return {
      rows: [],
      lifecycle: [],
      violations: policyErrors.map((message) => ({
        rule: 'dependency-policy-schema',
        file: 'tooling/configs/qa/dependency-policy-rules.data.json',
        message,
      })),
    };
  }
  const rows = Object.entries(lock.packages ?? {})
    .filter(([lockPath, entry]) => lockPath && !isWorkspaceLockEntry(lockPath, entry))
    .map(([lockPath, entry]) =>
      admissionRow(packageJson, workspacePackages, lock, lockPath, entry, rules)
    )
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
      if (
        !row.packageName ||
        !row.resolvedVersion ||
        !row.dependencyScope ||
        !row.sourceUrl ||
        !row.integrity
      ) {
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
    ...collectApprovalClosureViolations(rows, lifecycle, rules),
  ];
  return { rows, lifecycle, violations };
}

function readInputs(root) {
  const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
  const lock = JSON.parse(readFileSync(resolve(root, 'package-lock.json'), 'utf8'));
  const workspacePackages = Object.entries(lock.packages ?? {})
    .filter(([lockPath, entry]) =>
      Boolean(lockPath && !lockPath.includes('node_modules/') && entry && !entry.link)
    )
    .map(([, entry]) => entry);
  return { packageJson, workspacePackages, lock, rules: dependencyPolicyRules(root) };
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
  const relevant = relevantFiles.length === 0 || relevantFiles.some(isDependencyAdmissionInputPath);
  if (!relevant) return { skipped: true, violations: [] };
  const result = collectDependencyAdmission(readInputs(root));
  writeReport(root, result);
  return { skipped: false, violations: result.violations };
}
