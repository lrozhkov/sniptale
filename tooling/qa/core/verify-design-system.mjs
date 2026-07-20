/**
 * Deterministic design-system guardrail.
 * Run from repo root with `node tooling/qa/core/verify-design-system.mjs`.
 * Exits non-zero when feature code bypasses package UI or registry coverage is incomplete.
 */

import path from 'node:path';

import { getFamilyClassBypassRules } from './design-system-rules.mjs';
import {
  getDesignSystemThemeFailures,
  getThemeSafePortalFailures,
} from './design-system-theme-rules.mjs';
import {
  collectPreviewSource,
  collectRegistrySource,
  getCanonicalOwnershipFailures,
  getFeatureBypassFailures,
  getPublicUiFiles,
  getRegistryCoverageFailures,
  getRegistryPathFailures,
} from './design-system-verifier.mjs';
import { getFeatureRuntimeRoots } from './runtime-topology.mjs';
import { isExecutedAsScript } from './shared.mjs';

const repoRoot = process.cwd();
const srcRoot = path.join(repoRoot, 'src');
const extensionSrcRoot = path.join(repoRoot, 'apps', 'extension', 'src');
const sharedUiRoot = path.join(repoRoot, 'packages', 'ui', 'src');
const appUiRoot = path.join(extensionSrcRoot, 'ui');
const registryRoot = path.join(appUiRoot, 'design-system-registry');
const designSystemRoot = path.join(extensionSrcRoot, 'design-system');

const featureRoots = getFeatureRuntimeRoots(repoRoot);

const ignoredFiles = new Set([
  path.join(extensionSrcRoot, 'popup', 'components', 'PopupActionButton.tsx'),
  path.join(extensionSrcRoot, 'popup', 'components', 'PopupFooter.tsx'),
]);

const familyClassBypassRules = getFamilyClassBypassRules(srcRoot, sharedUiRoot);

export function runDesignSystemCheck({
  featureRootsOverride = featureRoots,
  ignoredFilesOverride = ignoredFiles,
  familyClassBypassRulesOverride = familyClassBypassRules,
  designSystemRootOverride = designSystemRoot,
  sharedUiRootOverride = sharedUiRoot,
  appUiRootOverride = appUiRoot,
  registryRootOverride = registryRoot,
  srcRootOverride = srcRoot,
  repoRootOverride = repoRoot,
} = {}) {
  const registrySource = collectRegistrySource(sharedUiRootOverride, registryRootOverride);
  const previewSource = [sharedUiRootOverride, appUiRootOverride]
    .map((uiRoot) => collectPreviewSource(designSystemRootOverride, uiRoot))
    .join('\n');
  const publicUiFiles = getPublicUiFiles(sharedUiRootOverride);

  return [
    ...getFeatureBypassFailures({
      featureRoots: featureRootsOverride,
      familyClassBypassRules: familyClassBypassRulesOverride,
      ignoredFiles: ignoredFilesOverride,
      repoRoot: repoRootOverride,
    }),
    ...getRegistryCoverageFailures({
      registrySource,
      previewSource,
      publicUiFiles,
    }),
    ...getRegistryPathFailures({
      registrySource,
      repoRoot: repoRootOverride,
    }),
    ...getCanonicalOwnershipFailures(registrySource),
    ...getDesignSystemThemeFailures(designSystemRootOverride),
    ...getThemeSafePortalFailures(srcRootOverride),
  ];
}

if (isExecutedAsScript(import.meta.url)) {
  const failures = runDesignSystemCheck();

  if (failures.length > 0) {
    console.error('design-system guardrail violations found:\n');
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exitCode = 1;
  } else {
    console.log('design-system guardrail passed');
  }
}
