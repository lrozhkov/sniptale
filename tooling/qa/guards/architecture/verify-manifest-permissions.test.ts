import { expect, it } from 'vitest';

import { createTempRoot } from '../../core/test-helpers';
import { collectManifestPermissionViolations } from './verify-manifest-permissions.mjs';
import {
  createContentScriptPolicyName,
  createWebAccessibleResourcePolicyName,
  writeFixture,
  writePolicyWithMissingCapability,
  writePolicyWithMissingDisclosure,
  writePolicyWithMissingOwnerPath,
  writePolicyWithStaleEntryAndMissingMetadata,
} from './verify-manifest-permissions.test-support';

it('passes when manifest permissions match the policy registry', () => {
  const root = createTempRoot('verify-manifest-permissions-pass-');
  writeFixture(root);

  expect(collectManifestPermissionViolations({ rootDir: root })).toEqual([]);
});

it('flags manifest permissions that are missing from policy', () => {
  const root = createTempRoot('verify-manifest-permissions-missing-');
  writeFixture(root, {
    permissions: ['storage', 'downloads', 'clipboardWrite'],
    policyPermissions: ['storage', 'downloads'],
  });

  expect(collectManifestPermissionViolations({ rootDir: root })).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        rule: 'manifest-permissions-missing-policy',
        message: expect.stringContaining('clipboardWrite'),
      }),
    ])
  );
});

it('requires optional host permissions to be recorded in policy', () => {
  const root = createTempRoot('verify-manifest-optional-host-missing-');
  writeFixture(root, {
    optionalHostPermissions: ['http://*/*', 'https://*/*'],
    policyOptionalHostPermissions: ['https://*/*'],
  });

  expect(collectManifestPermissionViolations({ rootDir: root })).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        rule: 'manifest-permissions-missing-policy',
        message: expect.stringContaining('http://*/*'),
      }),
    ])
  );
});

it('passes when optional host permission policy matches the manifest', () => {
  const root = createTempRoot('verify-manifest-optional-host-pass-');
  writeFixture(root, {
    optionalHostPermissions: ['http://*/*', 'https://*/*'],
    policyOptionalHostPermissions: ['http://*/*', 'https://*/*'],
  });

  expect(collectManifestPermissionViolations({ rootDir: root })).toEqual([]);
});

it('flags stale policy entries and missing metadata', () => {
  const root = createTempRoot('verify-manifest-permissions-stale-');
  writePolicyWithStaleEntryAndMissingMetadata(root);

  expect(collectManifestPermissionViolations({ rootDir: root })).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        rule: 'manifest-permissions-policy-metadata',
        message: expect.stringContaining('storage'),
      }),
      expect.objectContaining({
        rule: 'manifest-permissions-stale-policy',
        message: expect.stringContaining('downloads'),
      }),
    ])
  );
});

it('flags policy entries without capability and failure metadata', () => {
  const root = createTempRoot('verify-manifest-permissions-capability-');
  writePolicyWithMissingCapability(root);

  expect(collectManifestPermissionViolations({ rootDir: root })).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        rule: 'manifest-permissions-policy-metadata',
        message: expect.stringContaining('capabilityPolicy'),
      }),
    ])
  );
});

it('flags policy entries without user-facing disclosure metadata', () => {
  const root = createTempRoot('verify-manifest-permissions-disclosure-');
  writePolicyWithMissingDisclosure(root);

  expect(collectManifestPermissionViolations({ rootDir: root })).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        rule: 'manifest-permissions-policy-metadata',
        message: expect.stringContaining('userFacingDisclosure'),
      }),
    ])
  );
});

it('flags policy entries with stale owner paths', () => {
  const root = createTempRoot('verify-manifest-permissions-owner-path-');
  writePolicyWithMissingOwnerPath(root);

  expect(collectManifestPermissionViolations({ rootDir: root })).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        rule: 'manifest-permissions-policy-owner-path',
        message: expect.stringContaining('missing-storage-owner'),
      }),
    ])
  );
});

it('requires content-script topology policy for manifest content scripts', () => {
  const root = createTempRoot('verify-manifest-content-script-missing-');
  writeFixture(root, {
    contentScripts: [
      {
        matches: ['<all_urls>'],
        js: ['apps/extension/src/content/index.tsx'],
        all_frames: true,
        run_at: 'document_end',
      },
    ],
    policyContentScripts: [],
  });

  expect(collectManifestPermissionViolations({ rootDir: root })).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        rule: 'manifest-permissions-missing-policy',
        message: expect.stringContaining('"world":"ISOLATED"'),
      }),
    ])
  );
});

it('requires content-script policy updates for security-relevant topology drift', () => {
  const root = createTempRoot('verify-manifest-content-script-drift-');
  const contentScript = {
    matches: ['<all_urls>'],
    exclude_matches: ['*://example.test/private/*'],
    js: ['apps/extension/src/content/a.ts', 'apps/extension/src/content/b.ts'],
    css: ['apps/extension/src/content/styles.css'],
    all_frames: true,
    match_about_blank: true,
    match_origin_as_fallback: true,
    run_at: 'document_end',
    world: 'MAIN',
  };
  const staleContentScript = {
    ...contentScript,
    js: ['apps/extension/src/content/b.ts', 'apps/extension/src/content/a.ts'],
    world: 'ISOLATED',
  };
  writeFixture(root, {
    contentScripts: [contentScript],
    policyContentScripts: [createContentScriptPolicyName(staleContentScript)],
  });

  expect(collectManifestPermissionViolations({ rootDir: root })).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        rule: 'manifest-permissions-missing-policy',
        message: expect.stringContaining('"world":"MAIN"'),
      }),
      expect.objectContaining({
        rule: 'manifest-permissions-stale-policy',
        message: expect.stringContaining('"world":"ISOLATED"'),
      }),
    ])
  );
});

it('passes when content-script topology policy matches the manifest', () => {
  const root = createTempRoot('verify-manifest-content-script-pass-');
  const contentScript = {
    matches: ['<all_urls>'],
    js: ['apps/extension/src/content/index.tsx'],
    all_frames: true,
    run_at: 'document_end',
  };
  writeFixture(root, {
    contentScripts: [contentScript],
    policyContentScripts: [createContentScriptPolicyName(contentScript)],
  });

  expect(collectManifestPermissionViolations({ rootDir: root })).toEqual([]);
});

it('requires web-accessible resource policy for extension exposure topology', () => {
  const root = createTempRoot('verify-manifest-war-missing-');
  const resourceEntry = {
    resources: ['fonts/content-font.woff2'],
    matches: ['<all_urls>'],
    extension_ids: ['aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'],
    use_dynamic_url: true,
  };
  writeFixture(root, {
    webAccessibleResources: [resourceEntry],
    policyWebAccessibleResources: [],
  });

  expect(collectManifestPermissionViolations({ rootDir: root })).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        rule: 'manifest-permissions-missing-policy',
        message: expect.stringContaining('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),
      }),
    ])
  );
});

it('requires policy updates when web-accessible extension exposure changes', () => {
  const root = createTempRoot('verify-manifest-war-drift-');
  const resourceEntry = {
    resources: ['fonts/content-font.woff2'],
    matches: ['<all_urls>'],
    extension_ids: ['bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'],
    use_dynamic_url: true,
  };
  const staleResourceEntry = {
    ...resourceEntry,
    extension_ids: ['aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'],
  };
  writeFixture(root, {
    webAccessibleResources: [resourceEntry],
    policyWebAccessibleResources: [createWebAccessibleResourcePolicyName(staleResourceEntry)],
  });

  expect(collectManifestPermissionViolations({ rootDir: root })).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        rule: 'manifest-permissions-missing-policy',
        message: expect.stringContaining('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'),
      }),
      expect.objectContaining({
        rule: 'manifest-permissions-stale-policy',
        message: expect.stringContaining('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),
      }),
    ])
  );
});

it('passes when web-accessible resource policy matches extension exposure topology', () => {
  const root = createTempRoot('verify-manifest-war-pass-');
  const resourceEntry = {
    resources: ['fonts/content-font.woff2'],
    matches: ['<all_urls>'],
    extension_ids: ['aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'],
    use_dynamic_url: true,
  };
  writeFixture(root, {
    webAccessibleResources: [resourceEntry],
    policyWebAccessibleResources: [createWebAccessibleResourcePolicyName(resourceEntry)],
  });

  expect(collectManifestPermissionViolations({ rootDir: root })).toEqual([]);
});
