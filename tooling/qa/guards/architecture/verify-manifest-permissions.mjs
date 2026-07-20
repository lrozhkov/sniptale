/**
 * Manifest permission governance guardrail.
 * Blocks undeclared permission and host-permission drift in the app-owned extension manifest.
 */

import fs from 'node:fs';
import path from 'node:path';

import { isExecutedAsScript, printViolations, repoRoot } from '../../core/shared.mjs';

const MANIFEST_PATH = 'apps/extension/manifest.json';
const POLICY_PATH = 'tooling/configs/qa/manifest-permissions.data.json';

function createViolation(rule, file, message) {
  return { rule, file, message };
}

function readJson(rootDir, relativePath) {
  return JSON.parse(fs.readFileSync(path.join(rootDir, relativePath), 'utf8'));
}

const REQUIRED_METADATA_FIELDS = [
  'name',
  'owner',
  'feature',
  'runtimeRoute',
  'capabilityPolicy',
  'failureBehavior',
  'justification',
  'reviewNote',
  'userFacingDisclosure',
];

function collectMissingMetadataFields(entry) {
  return REQUIRED_METADATA_FIELDS.filter(
    (fieldName) => typeof entry?.[fieldName] !== 'string' || entry[fieldName].length === 0
  );
}

function hasMetadata(entry) {
  return collectMissingMetadataFields(entry).length === 0;
}

function createMetadataViolation(entry, file) {
  const missingFields = collectMissingMetadataFields(entry);
  return createViolation(
    'manifest-permissions-policy-metadata',
    file,
    `Policy entry "${entry?.name ?? '<unknown>'}" is missing metadata fields: ${missingFields.join(
      ', '
    )}.`
  );
}

function createOwnerPathViolation(entry, file) {
  return createViolation(
    'manifest-permissions-policy-owner-path',
    file,
    `Policy entry "${entry?.name ?? '<unknown>'}" owner does not resolve to a repo path: ${
      entry?.owner ?? '<missing>'
    }.`
  );
}

function normalizeSortedStringArray(value) {
  return Array.isArray(value) ? value.filter((entry) => typeof entry === 'string').sort() : [];
}

function normalizeOrderedStringArray(value) {
  return Array.isArray(value) ? value.filter((entry) => typeof entry === 'string') : [];
}

function stablePolicyName(prefix, descriptor) {
  return `${prefix}:${JSON.stringify(descriptor)}`;
}

function createContentScriptPolicyName(contentScript) {
  return stablePolicyName('content_script', {
    js: normalizeOrderedStringArray(contentScript.js),
    css: normalizeOrderedStringArray(contentScript.css),
    matches: normalizeSortedStringArray(contentScript.matches),
    excludeMatches: normalizeSortedStringArray(contentScript.exclude_matches),
    includeGlobs: normalizeSortedStringArray(contentScript.include_globs),
    excludeGlobs: normalizeSortedStringArray(contentScript.exclude_globs),
    allFrames: contentScript.all_frames === true,
    matchAboutBlank: contentScript.match_about_blank === true,
    matchOriginAsFallback: contentScript.match_origin_as_fallback === true,
    runAt: typeof contentScript.run_at === 'string' ? contentScript.run_at : 'document_idle',
    world: typeof contentScript.world === 'string' ? contentScript.world : 'ISOLATED',
  });
}

function createWebAccessibleResourcePolicyName(entry) {
  return stablePolicyName('web_accessible_resources', {
    resources: normalizeSortedStringArray(entry.resources),
    matches: normalizeSortedStringArray(entry.matches),
    extensionIds: normalizeSortedStringArray(entry.extension_ids),
    useDynamicUrl: entry.use_dynamic_url === true,
  });
}

function collectSetViolations({ rootDir, manifestEntries, policyEntries, file, kind }) {
  const violations = [];
  const policyNames = new Set(policyEntries.map((entry) => entry.name));

  for (const entry of policyEntries) {
    if (!hasMetadata(entry)) {
      violations.push(createMetadataViolation(entry, file));
      continue;
    }

    if (!fs.existsSync(path.join(rootDir, entry.owner))) {
      violations.push(createOwnerPathViolation(entry, file));
    }
  }

  for (const manifestEntry of manifestEntries) {
    if (!policyNames.has(manifestEntry)) {
      violations.push(
        createViolation(
          'manifest-permissions-missing-policy',
          file,
          `Manifest ${kind} "${manifestEntry}" is missing from ${POLICY_PATH}.`
        )
      );
    }
  }

  const manifestNames = new Set(manifestEntries);
  for (const policyEntry of policyEntries) {
    if (!manifestNames.has(policyEntry.name)) {
      violations.push(
        createViolation(
          'manifest-permissions-stale-policy',
          file,
          `Policy ${kind} "${policyEntry.name}" is not present in ${MANIFEST_PATH}.`
        )
      );
    }
  }

  return violations;
}

export function collectManifestPermissionViolations({
  rootDir = repoRoot,
  manifestPath = MANIFEST_PATH,
  policyPath = POLICY_PATH,
} = {}) {
  const manifest = readJson(rootDir, manifestPath);
  const policy = readJson(rootDir, policyPath);

  return [
    ...collectSetViolations({
      rootDir,
      manifestEntries: manifest.permissions ?? [],
      policyEntries: policy.permissions ?? [],
      file: manifestPath,
      kind: 'permission',
    }),
    ...collectSetViolations({
      rootDir,
      manifestEntries: manifest.host_permissions ?? [],
      policyEntries: policy.hostPermissions ?? [],
      file: manifestPath,
      kind: 'host permission',
    }),
    ...collectSetViolations({
      rootDir,
      manifestEntries: manifest.optional_host_permissions ?? [],
      policyEntries: policy.optionalHostPermissions ?? [],
      file: manifestPath,
      kind: 'optional host permission',
    }),
    ...collectSetViolations({
      rootDir,
      manifestEntries: (manifest.content_scripts ?? []).map(createContentScriptPolicyName),
      policyEntries: policy.contentScripts ?? [],
      file: manifestPath,
      kind: 'content script',
    }),
    ...collectSetViolations({
      rootDir,
      manifestEntries: (manifest.web_accessible_resources ?? []).map(
        createWebAccessibleResourcePolicyName
      ),
      policyEntries: policy.webAccessibleResources ?? [],
      file: manifestPath,
      kind: 'web-accessible resource',
    }),
  ];
}

export function runManifestPermissionsCheck(options = {}) {
  return {
    violations: collectManifestPermissionViolations(options),
  };
}

if (isExecutedAsScript(import.meta.url)) {
  const result = runManifestPermissionsCheck();

  if (result.violations.length > 0) {
    printViolations('Manifest permission violations found:', result.violations);
    process.exit(1);
  }

  process.stdout.write('Manifest permissions passed\n');
}
