import { expect, it } from 'vitest';
import sourceManifest from '../manifest.json';
import { buildManifestForMode } from './manifest';

it('grants all-sites only to the isolated browser E2E artifact', () => {
  expect(buildManifestForMode(sourceManifest, 'test-e2e')).toEqual(
    expect.objectContaining({ host_permissions: ['<all_urls>'] })
  );
  expect(buildManifestForMode(sourceManifest, 'release')).not.toHaveProperty('host_permissions');
  expect(sourceManifest).not.toHaveProperty('host_permissions');
});
