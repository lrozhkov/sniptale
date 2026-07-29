import { expect, it } from 'vitest';
import sourceManifest from '../../../apps/extension/manifest.json';
import { buildManifestForMode } from '../../../apps/extension/build/manifest';

it('grants all-sites only to the isolated browser E2E artifact', () => {
  const e2eManifest = buildManifestForMode(sourceManifest, 'test-e2e');
  const releaseManifest = buildManifestForMode(sourceManifest, 'release');

  expect(e2eManifest).toEqual(expect.objectContaining({ host_permissions: ['<all_urls>'] }));
  expect(e2eManifest).not.toHaveProperty('optional_host_permissions');
  expect(releaseManifest).not.toHaveProperty('host_permissions');
  expect(releaseManifest).toEqual(
    expect.objectContaining({ optional_host_permissions: ['<all_urls>'] })
  );
  expect(sourceManifest).not.toHaveProperty('host_permissions');
});
