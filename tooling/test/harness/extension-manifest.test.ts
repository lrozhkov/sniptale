import { expect, it } from 'vitest';
import sourceManifest from '../../../apps/extension/manifest.json';
import { buildManifestForMode } from '../../../apps/extension/build/manifest';

const EXPECTED_DESCRIPTION =
  'Workspace for capturing, understanding, annotating, recording, editing, and exporting the web.';

it('grants all-sites only to the isolated browser E2E artifact', () => {
  const e2eManifest = buildManifestForMode(sourceManifest, 'test-e2e');
  const securityManifest = buildManifestForMode(sourceManifest, 'security-e2e');
  const releaseManifest = buildManifestForMode(sourceManifest, 'release');

  expect(e2eManifest).toEqual(expect.objectContaining({ host_permissions: ['<all_urls>'] }));
  expect(e2eManifest).not.toHaveProperty('optional_host_permissions');
  expect(releaseManifest).not.toHaveProperty('host_permissions');
  expect(securityManifest).not.toHaveProperty('host_permissions');
  expect(securityManifest).toEqual(
    expect.objectContaining({ optional_host_permissions: ['<all_urls>'] })
  );
  expect(releaseManifest).toEqual(
    expect.objectContaining({ optional_host_permissions: ['<all_urls>'] })
  );
  expect(sourceManifest).not.toHaveProperty('host_permissions');
});

it('preserves the extension description from source to built manifests', () => {
  expect(sourceManifest.description).toBe(EXPECTED_DESCRIPTION);
  expect(buildManifestForMode(sourceManifest, 'test-e2e').description).toBe(EXPECTED_DESCRIPTION);
  expect(buildManifestForMode(sourceManifest, 'release').description).toBe(EXPECTED_DESCRIPTION);
});
