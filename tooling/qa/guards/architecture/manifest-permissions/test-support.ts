import { writeFile, writeJson } from '../../../test-support/test-helpers';

export function writeFixture(
  root: string,
  {
    permissions = ['storage', 'downloads'],
    optionalPermissions = [],
    hostPermissions = [],
    optionalHostPermissions = ['http://*/*', 'https://*/*'],
    contentScripts = [],
    webAccessibleResources = [],
    policyPermissions = permissions,
    policyOptionalPermissions = optionalPermissions,
    policyHostPermissions = hostPermissions,
    policyOptionalHostPermissions = optionalHostPermissions,
    policyContentScripts = [],
    policyWebAccessibleResources = [],
  }: {
    permissions?: string[];
    optionalPermissions?: string[];
    hostPermissions?: string[];
    optionalHostPermissions?: string[];
    contentScripts?: Array<Record<string, unknown>>;
    webAccessibleResources?: Array<Record<string, unknown>>;
    policyPermissions?: string[];
    policyOptionalPermissions?: string[];
    policyHostPermissions?: string[];
    policyOptionalHostPermissions?: string[];
    policyContentScripts?: string[];
    policyWebAccessibleResources?: string[];
  } = {}
) {
  writeJson(root, 'apps/extension/manifest.json', {
    permissions,
    optional_permissions: optionalPermissions,
    host_permissions: hostPermissions,
    optional_host_permissions: optionalHostPermissions,
    content_scripts: contentScripts,
    web_accessible_resources: webAccessibleResources,
  });
  const policy = {
    permissions: policyPermissions.map((name) => createPolicyEntry(name, `src/shared/${name}.ts`)),
    optionalPermissions: policyOptionalPermissions.map((name) =>
      createPolicyEntry(name, 'packages/platform/src/browser/native-messaging.ts')
    ),
    hostPermissions: policyHostPermissions.map((name) =>
      createPolicyEntry(name, 'apps/extension/src/content/index.tsx')
    ),
    optionalHostPermissions: policyOptionalHostPermissions.map((name) =>
      createPolicyEntry(name, 'apps/extension/src/background/page-access/service.ts')
    ),
    contentScripts: policyContentScripts.map((name) =>
      createPolicyEntry(name, 'apps/extension/src/content/index.tsx')
    ),
    webAccessibleResources: policyWebAccessibleResources.map((name) =>
      createPolicyEntry(name, 'apps/extension/src/content/index.tsx')
    ),
  };
  writePolicy(root, policy);
  for (const contentScript of contentScripts) {
    for (const sourcePath of [...toStrings(contentScript.js), ...toStrings(contentScript.css)]) {
      writeFile(root, sourcePath, 'export {};\n');
    }
  }
  for (const resourceEntry of webAccessibleResources) {
    for (const resource of toStrings(resourceEntry.resources)) {
      if (!resource.includes('*')) {
        const resourcePath = resource.startsWith('apps/extension/src/')
          ? resource
          : `apps/extension/public/${resource}`;
        writeFile(root, resourcePath, 'fixture');
      }
    }
  }
}

function toStrings(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

function createPolicyEntry(name: string, owner: string) {
  return {
    name,
    owner,
    feature: `${name} feature`,
    runtimeRoute: `${name} route`,
    capabilityPolicy: `${name} capability policy`,
    failureBehavior: `${name} failure behavior`,
    justification: `${name} justification`,
    reviewNote: `${name} note`,
    userFacingDisclosure: `settings.permissions.required.${name}`,
  };
}

function writePolicy(
  root: string,
  policy: Record<string, Array<Record<string, unknown>>>,
  { skipOwners = [] }: { skipOwners?: string[] } = {}
) {
  writeJson(root, 'tooling/configs/qa/manifest-permissions.data.json', policy);

  const skippedOwners = new Set(skipOwners);
  for (const entries of Object.values(policy)) {
    for (const entry of entries) {
      if (
        typeof entry.owner === 'string' &&
        entry.owner.length > 0 &&
        !skippedOwners.has(entry.owner)
      ) {
        writeFile(root, entry.owner, 'export {};\n');
      }
    }
  }
}

function normalizeSortedStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string').sort()
    : [];
}

function normalizeOrderedStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

function stablePolicyName(prefix: string, descriptor: Record<string, unknown>) {
  return `${prefix}:${JSON.stringify(descriptor)}`;
}

export function createContentScriptPolicyName(contentScript: Record<string, unknown>) {
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

export function createWebAccessibleResourcePolicyName(entry: Record<string, unknown>) {
  return stablePolicyName('web_accessible_resources', {
    resources: normalizeSortedStringArray(entry.resources),
    matches: normalizeSortedStringArray(entry.matches),
    extensionIds: normalizeSortedStringArray(entry.extension_ids),
    useDynamicUrl: entry.use_dynamic_url === true,
  });
}

export function writePolicyWithMissingCapability(root: string) {
  writeJson(root, 'apps/extension/manifest.json', {
    permissions: ['storage'],
    optional_host_permissions: ['http://*/*'],
  });
  writePolicy(root, {
    permissions: [
      {
        name: 'storage',
        owner: 'src/shared/storage.ts',
        feature: 'storage feature',
        runtimeRoute: 'storage route',
        failureBehavior: 'storage failure behavior',
        justification: 'storage justification',
        reviewNote: 'storage note',
      },
    ],
    optionalPermissions: [],
    hostPermissions: [],
    optionalHostPermissions: [
      createPolicyEntry('http://*/*', 'apps/extension/src/background/page-access/service.ts'),
    ],
    contentScripts: [],
    webAccessibleResources: [],
  });
}

export function writePolicyWithMissingDisclosure(root: string) {
  const storageEntry = createPolicyEntry('storage', 'src/shared/storage.ts');
  delete (storageEntry as Partial<typeof storageEntry>).userFacingDisclosure;

  writeJson(root, 'apps/extension/manifest.json', {
    permissions: ['storage'],
    optional_host_permissions: ['http://*/*'],
  });
  writePolicy(root, {
    permissions: [storageEntry],
    optionalPermissions: [],
    hostPermissions: [],
    optionalHostPermissions: [
      createPolicyEntry('http://*/*', 'apps/extension/src/background/page-access/service.ts'),
    ],
    contentScripts: [],
    webAccessibleResources: [],
  });
}

export function writePolicyWithMissingOwnerPath(root: string) {
  const missingOwner = 'src/shared/platform/browser/missing-storage-owner.ts';
  writeJson(root, 'apps/extension/manifest.json', {
    permissions: ['storage'],
    optional_host_permissions: ['http://*/*'],
  });
  writePolicy(
    root,
    {
      permissions: [createPolicyEntry('storage', missingOwner)],
      optionalPermissions: [],
      hostPermissions: [],
      optionalHostPermissions: [
        createPolicyEntry('http://*/*', 'apps/extension/src/background/page-access/service.ts'),
      ],
      contentScripts: [],
      webAccessibleResources: [],
    },
    { skipOwners: [missingOwner] }
  );
}

export function writePolicyWithStaleEntryAndMissingMetadata(root: string) {
  writeJson(root, 'apps/extension/manifest.json', {
    permissions: ['storage'],
    optional_host_permissions: ['http://*/*'],
  });
  writePolicy(root, {
    permissions: [
      {
        ...createPolicyEntry('storage', ''),
      },
      createPolicyEntry('downloads', 'src/shared/downloads.ts'),
    ],
    optionalPermissions: [],
    hostPermissions: [],
    optionalHostPermissions: [
      createPolicyEntry('http://*/*', 'apps/extension/src/background/page-access/service.ts'),
    ],
    contentScripts: [],
    webAccessibleResources: [],
  });
}
