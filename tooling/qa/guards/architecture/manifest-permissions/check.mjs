/**
 * Manifest permission governance guardrail.
 * Blocks undeclared permission and host-permission drift in the app-owned extension manifest.
 */

import fs from 'node:fs';
import path from 'node:path';

import { repoRoot } from '../../../analysis/repository/shared-paths.mjs';
import { isExecutedAsScript, printViolations } from '../../../runtime/process/shared-cli.mjs';

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

function createSchemaViolation(file, message) {
  return createViolation('manifest-permissions-schema', file, message);
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
  if (new Set(manifestEntries).size !== manifestEntries.length) {
    violations.push(createSchemaViolation(file, `Manifest ${kind} entries must be unique.`));
  }
  if (new Set(policyEntries.map((entry) => entry?.name)).size !== policyEntries.length) {
    violations.push(createSchemaViolation(POLICY_PATH, `Policy ${kind} names must be unique.`));
  }
  const policyNames = new Set(policyEntries.map((entry) => entry?.name));

  for (const entry of policyEntries) {
    if (!hasMetadata(entry)) {
      violations.push(createMetadataViolation(entry, file));
      continue;
    }

    const ownerPath = path.join(rootDir, entry.owner);
    if (!fs.existsSync(ownerPath) || !fs.statSync(ownerPath).isFile()) {
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

function hasOriginOnlyPath(match) {
  if (match === '<all_urls>') return true;
  if (typeof match !== 'string') return false;
  const separator = match.indexOf('://');
  return separator >= 0 && match.slice(match.indexOf('/', separator + 3)) === '/*';
}

function manifestResourceExists(rootDir, resource) {
  const relativePath = resource.startsWith('apps/extension/src/')
    ? resource
    : path.join('apps/extension/public', resource);
  return fs.existsSync(path.join(rootDir, relativePath));
}

function collectContentScriptShapeViolations(rootDir, entries, file) {
  const violations = [];
  for (const [index, entry] of entries.entries()) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      violations.push(createSchemaViolation(file, `content_scripts[${index}] must be an object.`));
      continue;
    }
    for (const field of ['js', 'css']) {
      if (entry[field] !== undefined && !isStringArray(entry[field])) {
        violations.push(
          createSchemaViolation(file, `content_scripts[${index}].${field} must be a string array.`)
        );
      }
      for (const sourcePath of isStringArray(entry[field]) ? entry[field] : []) {
        if (!fs.existsSync(path.join(rootDir, sourcePath))) {
          violations.push(
            createSchemaViolation(
              file,
              `content_scripts[${index}].${field} points to a missing file: ${sourcePath}.`
            )
          );
        }
      }
    }
    if (!isStringArray(entry.matches)) {
      violations.push(
        createSchemaViolation(file, `content_scripts[${index}].matches must be a string array.`)
      );
    }
  }
  return violations;
}

function isStringArray(value) {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

function collectWebAccessibleResourceFields(entry, index, file) {
  const violations = [];
  if (!isStringArray(entry.resources) || entry.resources.length === 0) {
    violations.push(
      createSchemaViolation(
        file,
        `web_accessible_resources[${index}].resources must be a non-empty string array.`
      )
    );
  }
  for (const field of ['matches', 'extension_ids']) {
    if (entry[field] !== undefined && !isStringArray(entry[field])) {
      violations.push(
        createSchemaViolation(
          file,
          `web_accessible_resources[${index}].${field} must be a string array.`
        )
      );
    }
  }
  return violations;
}

function collectWebAccessibleResourcePaths(rootDir, entry, index, file) {
  return (isStringArray(entry.resources) ? entry.resources : []).flatMap((resource) => {
    if (resource.includes('*')) {
      return [
        createSchemaViolation(
          file,
          `web_accessible_resources[${index}] must list concrete files: ${resource}.`
        ),
      ];
    }
    return manifestResourceExists(rootDir, resource)
      ? []
      : [
          createSchemaViolation(
            file,
            `web_accessible_resources[${index}] points to a missing file: ${resource}.`
          ),
        ];
  });
}

function collectWebAccessibleResourcePolicy(entry, index, file) {
  const violations = (isStringArray(entry.matches) ? entry.matches : []).flatMap((match) =>
    hasOriginOnlyPath(match)
      ? []
      : [
          createSchemaViolation(
            file,
            `web_accessible_resources[${index}].matches must end in an origin-only /*: ${JSON.stringify(match)}.`
          ),
        ]
  );
  const hasManrope = (isStringArray(entry.resources) ? entry.resources : []).some((resource) =>
    /^fonts\/manrope-[\w-]+\.woff2$/u.test(resource)
  );
  if (hasManrope && entry.use_dynamic_url !== true) {
    violations.push(
      createSchemaViolation(
        file,
        `web_accessible_resources[${index}] Manrope fonts require use_dynamic_url: true.`
      )
    );
  }
  return violations;
}

function collectWebAccessibleResourceShapeViolations(rootDir, entries, file) {
  return entries.flatMap((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      return [createSchemaViolation(file, `web_accessible_resources[${index}] must be an object.`)];
    }
    return [
      ...collectWebAccessibleResourceFields(entry, index, file),
      ...collectWebAccessibleResourcePaths(rootDir, entry, index, file),
      ...collectWebAccessibleResourcePolicy(entry, index, file),
    ];
  });
}

function requirePolicyArrays(policy, file) {
  const fields = [
    'permissions',
    'hostPermissions',
    'optionalPermissions',
    'optionalHostPermissions',
    'contentScripts',
    'webAccessibleResources',
  ];
  return fields.flatMap((field) =>
    Array.isArray(policy?.[field])
      ? []
      : [createSchemaViolation(file, `Policy field ${field} must be an array.`)]
  );
}

export function collectManifestPermissionViolations({
  rootDir = repoRoot,
  manifestPath = MANIFEST_PATH,
  policyPath = POLICY_PATH,
} = {}) {
  const manifest = readJson(rootDir, manifestPath);
  const policy = readJson(rootDir, policyPath);
  const schemaViolations = [];
  const manifestArray = (key) => {
    const value = manifest[key];
    if (value === undefined) return [];
    if (Array.isArray(value)) return value;
    schemaViolations.push(
      createSchemaViolation(manifestPath, `Manifest field ${key} must be an array.`)
    );
    return [];
  };
  const permissions = manifestArray('permissions');
  const hostPermissions = manifestArray('host_permissions');
  const optionalPermissions = manifestArray('optional_permissions');
  const optionalHostPermissions = manifestArray('optional_host_permissions');
  const contentScripts = manifestArray('content_scripts');
  const webAccessibleResources = manifestArray('web_accessible_resources');
  for (const [key, entries] of [
    ['permissions', permissions],
    ['host_permissions', hostPermissions],
    ['optional_permissions', optionalPermissions],
    ['optional_host_permissions', optionalHostPermissions],
  ]) {
    if (!entries.every((entry) => typeof entry === 'string')) {
      schemaViolations.push(
        createSchemaViolation(manifestPath, `Manifest field ${key} must contain only strings.`)
      );
    }
  }
  const validContentScripts = contentScripts.filter(
    (entry) => entry && typeof entry === 'object' && !Array.isArray(entry)
  );
  const validWebAccessibleResources = webAccessibleResources.filter(
    (entry) => entry && typeof entry === 'object' && !Array.isArray(entry)
  );

  return [
    ...schemaViolations,
    ...requirePolicyArrays(policy, policyPath),
    ...collectContentScriptShapeViolations(rootDir, contentScripts, manifestPath),
    ...collectWebAccessibleResourceShapeViolations(rootDir, webAccessibleResources, manifestPath),
    ...collectSetViolations({
      rootDir,
      manifestEntries: permissions.filter((entry) => typeof entry === 'string'),
      policyEntries: Array.isArray(policy.permissions) ? policy.permissions : [],
      file: manifestPath,
      kind: 'permission',
    }),
    ...collectSetViolations({
      rootDir,
      manifestEntries: hostPermissions.filter((entry) => typeof entry === 'string'),
      policyEntries: Array.isArray(policy.hostPermissions) ? policy.hostPermissions : [],
      file: manifestPath,
      kind: 'host permission',
    }),
    ...collectSetViolations({
      rootDir,
      manifestEntries: optionalPermissions.filter((entry) => typeof entry === 'string'),
      policyEntries: Array.isArray(policy.optionalPermissions) ? policy.optionalPermissions : [],
      file: manifestPath,
      kind: 'optional permission',
    }),
    ...collectSetViolations({
      rootDir,
      manifestEntries: optionalHostPermissions.filter((entry) => typeof entry === 'string'),
      policyEntries: Array.isArray(policy.optionalHostPermissions)
        ? policy.optionalHostPermissions
        : [],
      file: manifestPath,
      kind: 'optional host permission',
    }),
    ...collectSetViolations({
      rootDir,
      manifestEntries: validContentScripts.map(createContentScriptPolicyName),
      policyEntries: Array.isArray(policy.contentScripts) ? policy.contentScripts : [],
      file: manifestPath,
      kind: 'content script',
    }),
    ...collectSetViolations({
      rootDir,
      manifestEntries: validWebAccessibleResources.map(createWebAccessibleResourcePolicyName),
      policyEntries: Array.isArray(policy.webAccessibleResources)
        ? policy.webAccessibleResources
        : [],
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
