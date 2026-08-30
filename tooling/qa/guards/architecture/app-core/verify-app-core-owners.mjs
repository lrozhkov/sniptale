import { existsSync } from 'node:fs';
import { posix, resolve } from 'node:path';

import {
  collectImportEdges,
  collectProductionImportEdges,
  isProductionImportTarget,
} from '../architecture-guardrails/helpers.mjs';
import { collectRepositoryFiles } from '../../../analysis/git/git-fallback-repository.mjs';
import { collectCodeFiles } from '../../../analysis/repository/shared-files.mjs';
import { repoRoot, toRelativePath } from '../../../analysis/repository/shared-paths.mjs';
import { isExecutedAsScript } from '../../../runtime/process/shared-cli.mjs';
import { classifyFinalAppCoreOwnerPath, readAppCoreOwnerPolicy } from './app-core-owner-policy.mjs';
import { getRuntimeRoots } from '../runtime-topology/model.mjs';

const OWNER_TEST_FILE_PATTERN = /\.(?:test|spec)\.[cm]?[jt]sx?$/u;

function within(path, root) {
  return path === root || path.startsWith(`${root}/`);
}

function currentOwnerFiles(allFiles) {
  const appCoreRoot = 'apps/extension/src';
  return allFiles.filter((path) => {
    const owner = path.split('/')[3];
    if (!path.startsWith(`${appCoreRoot}/`)) return false;
    return [
      'composition',
      'contracts',
      'features',
      'foundation',
      'platform',
      'ui',
      'workflows',
    ].includes(owner);
  });
}

function finalOwnerErrors(policy, allFiles) {
  const errors = [];
  for (const path of currentOwnerFiles(allFiles)) {
    try {
      classifyFinalAppCoreOwnerPath(path, policy);
    } catch {
      errors.push(`unclassified app-core owner: ${path}`);
    }
  }
  for (const prefix of policy.forbiddenSourcePrefixes) {
    if (
      allFiles.some(
        (path) => path === prefix || path.startsWith(`${prefix}/`) || path.startsWith(`${prefix}.`)
      )
    ) {
      errors.push(`retired owner path remains: ${prefix}`);
    }
  }
  for (const path of policy.forbiddenBroadBarrels) {
    if (allFiles.includes(path)) errors.push(`broad app-core barrel remains: ${path}`);
  }
  return errors;
}

function authorityErrors(root, policy) {
  return policy.authorityOwners.flatMap((ownerPath) =>
    existsSync(resolve(root, ownerPath)) ? [] : [`authority owner is missing: ${ownerPath}`]
  );
}

function featureOwner(path) {
  return path.startsWith('apps/extension/src/features/') ? path.split('/')[4] : null;
}

function runtimeOwner(path, runtimeRoots) {
  return runtimeRoots.find((root) => within(path, root)) ?? null;
}

function persistenceOwner(path) {
  return path.startsWith('apps/extension/src/composition/persistence/')
    ? path.split('/').slice(0, 6).join('/')
    : null;
}

function appCoreOwner(path) {
  const prefix = 'apps/extension/src/';
  if (!path.startsWith(prefix)) return null;
  const owner = path.slice(prefix.length).split('/')[0];
  return [
    'composition',
    'contracts',
    'features',
    'foundation',
    'platform',
    'ui',
    'workflows',
  ].includes(owner)
    ? owner
    : null;
}

function isFeaturePublicTarget(path, policy) {
  return policy.featurePublicEntrypoints.some(
    (entry) =>
      path === entry || (posix.basename(entry) === 'index.ts' && path === posix.dirname(entry))
  );
}

function isAllowedFeaturePersistenceEdge(from, to, policy) {
  return policy.sameConcernPersistenceEdges.some(
    ([featureRoot, persistenceRoot]) => within(from, featureRoot) && within(to, persistenceRoot)
  );
}

function uiResidencyErrors(allFiles, policy) {
  return allFiles
    .filter((path) => within(path, 'apps/extension/src/ui'))
    .flatMap((path) => {
      if (!policy.retainedAppUiRoots.some((root) => within(path, root))) {
        return [`unclassified or reusable UI remains app-local: ${path}`];
      }
      if (/(?:^|\/)(?:design-system|catalog|previews?)(?:[./-]|$)/u.test(path)) {
        return [`preview/catalog UI remains app-local: ${path}`];
      }
      return [];
    });
}

function forbiddenEdgeErrors(root, policy, codeFiles) {
  const edges = collectProductionImportEdges(codeFiles, { root });
  const runtimeRoots = getRuntimeRoots(root);
  return edges.flatMap((edge) => {
    const from = toRelativePath(edge.from);
    const to = toRelativePath(edge.to);
    const fromFeature = featureOwner(from);
    const toFeature = featureOwner(to);
    if (
      fromFeature &&
      toFeature &&
      fromFeature !== toFeature &&
      !isFeaturePublicTarget(to, policy)
    ) {
      return [`cross-feature deep import: ${from} -> ${to}`];
    }
    const toRuntime = runtimeOwner(to, runtimeRoots);
    if (fromFeature && persistenceOwner(to) && !isAllowedFeaturePersistenceEdge(from, to, policy)) {
      return [`feature imports foreign concrete persistence: ${from} -> ${to}`];
    }
    if (
      persistenceOwner(from) &&
      (toRuntime ||
        within(to, 'apps/extension/src/ui') ||
        within(to, 'apps/extension/src/workflows'))
    ) {
      return [`persistence imports UI/runtime/workflow implementation: ${from} -> ${to}`];
    }
    if (appCoreOwner(from) && toRuntime) {
      return [`app-core imports runtime implementation: ${from} -> ${to}`];
    }
    const forbidden = policy.forbiddenOwnerEdges.find(
      ([fromRoot, toRoot]) => within(from, fromRoot) && within(to, toRoot)
    );
    return forbidden ? [`forbidden app-core owner import: ${from} -> ${to}`] : [];
  });
}

function ownerTestEdgeErrors(root, codeFiles) {
  const runtimeRoots = getRuntimeRoots(root);
  const testFiles = codeFiles.filter((file) => OWNER_TEST_FILE_PATTERN.test(toRelativePath(file)));
  return collectImportEdges(testFiles, { root })
    .filter((edge) => isProductionImportTarget(edge.to))
    .flatMap((edge) => {
      const from = toRelativePath(edge.from);
      const to = toRelativePath(edge.to);
      return appCoreOwner(from) && runtimeOwner(to, runtimeRoots)
        ? [`app-core owner test imports runtime implementation: ${from} -> ${to}`]
        : [];
    });
}

export function appCoreOwnerErrors({
  root = repoRoot,
  policy = readAppCoreOwnerPolicy(root),
  codeFiles = collectCodeFiles(),
} = {}) {
  const allFiles = collectRepositoryFiles(root);
  return [
    ...finalOwnerErrors(policy, allFiles),
    ...authorityErrors(root, policy),
    ...uiResidencyErrors(allFiles, policy),
    ...forbiddenEdgeErrors(root, policy, codeFiles),
    ...ownerTestEdgeErrors(root, codeFiles),
  ].sort();
}

export function runAppCoreOwnerCheck(options) {
  return { violations: appCoreOwnerErrors(options) };
}

if (isExecutedAsScript(import.meta.url)) {
  const errors = appCoreOwnerErrors();
  if (errors.length) {
    process.stderr.write(`App-core owner violations found:\n${errors.join('\n')}\n`);
    process.exit(1);
  }
  process.stdout.write('App-core owners: OK\n');
}
