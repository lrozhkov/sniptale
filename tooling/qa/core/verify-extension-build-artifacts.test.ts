import { expect, it } from 'vitest';

import fs from 'node:fs';
import path from 'node:path';

import { createTempRoot, writeFile } from './test-helpers';
import {
  collectExtensionArtifactSnapshot,
  collectExtensionBuildArtifactViolations,
  extensionArtifactSnapshotErrors,
} from './verify-extension-build-artifacts.mjs';

const POLICY = {
  manifestPath: 'apps/extension/manifest.json',
  outputRoot: 'dist',
  forbiddenOutputRoot: 'apps/extension/dist',
  requiredReleaseArtifacts: ['manifest.json', 'apps/extension/src/popup/index.html'],
};

function seedArtifacts(root: string) {
  writeFile(
    root,
    POLICY.manifestPath,
    JSON.stringify({
      action: { default_popup: 'apps/extension/src/popup/index.html' },
      sandbox: { pages: ['apps/extension/src/effect-runtime-sandbox/index.html'] },
    })
  );
  writeFile(
    root,
    'dist/manifest.json',
    JSON.stringify({
      action: { default_popup: 'apps/extension/src/popup/index.html' },
      sandbox: { pages: ['apps/extension/src/effect-runtime-sandbox/index.html'] },
    })
  );
  writeFile(root, 'dist/apps/extension/src/popup/index.html', '<main>popup</main>');
}

it('rejects missing paths, app-local output and shortened manifest URLs', () => {
  const root = createTempRoot('extension-artifacts-');
  seedArtifacts(root);
  expect(collectExtensionBuildArtifactViolations({ rootDir: root, policy: POLICY })).toEqual([]);

  fs.rmSync(path.join(root, 'dist/apps/extension/src/popup/index.html'));
  writeFile(root, 'apps/extension/dist/stale.js', 'stale');
  writeFile(
    root,
    'dist/manifest.json',
    JSON.stringify({
      action: { default_popup: 'src/popup/index.html' },
      sandbox: { pages: ['src/effect-runtime-sandbox/index.html'] },
    })
  );
  expect(
    collectExtensionBuildArtifactViolations({ rootDir: root, policy: POLICY }).map(
      (entry) => entry.message
    )
  ).toEqual(
    expect.arrayContaining([
      expect.stringContaining('required artifact is missing'),
      expect.stringContaining('app-local build output'),
      expect.stringContaining('popup path differs'),
      expect.stringContaining('sandbox paths differ'),
    ])
  );
});

it('compares complete file sets and content digests', () => {
  const root = createTempRoot('extension-artifact-snapshot-');
  seedArtifacts(root);
  const baseline = collectExtensionArtifactSnapshot({ rootDir: root });
  expect(extensionArtifactSnapshotErrors(baseline, baseline)).toEqual([]);

  writeFile(root, 'dist/extra.js', 'extra');
  const withExtra = collectExtensionArtifactSnapshot({ rootDir: root });
  expect(extensionArtifactSnapshotErrors(baseline, withExtra)).toContain(
    'app build has extra artifact: extra.js'
  );

  writeFile(root, 'dist/manifest.json', '{"changed":true}');
  const changed = collectExtensionArtifactSnapshot({ rootDir: root });
  expect(extensionArtifactSnapshotErrors(withExtra, changed)).toContain(
    'root/app artifact content differs: manifest.json'
  );
});
