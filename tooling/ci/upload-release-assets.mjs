import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { readExpectedReleaseAssetDigests } from './release-verification.mjs';

const [assetRoot, releaseId] = process.argv.slice(2);
const repository = process.env.GITHUB_REPOSITORY ?? 'lrozhkov/sniptale';
if (!assetRoot || !/^\d+$/u.test(releaseId ?? '')) {
  throw new Error('Release asset upload requires an asset directory and numeric release ID.');
}
for (const name of readExpectedReleaseAssetDigests(assetRoot).keys()) {
  const source = path.join(assetRoot, name);
  const stat = fs.lstatSync(source);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(`Release asset is not a regular owned file: ${name}`);
  }
  const endpoint = `repos/${repository}/releases/${releaseId}/assets?name=${encodeURIComponent(name)}`;
  const result = spawnSync(
    'gh',
    [
      'api',
      '--hostname',
      'uploads.github.com',
      '--method',
      'POST',
      '-H',
      'Content-Type: application/octet-stream',
      '--input',
      source,
      endpoint,
    ],
    { encoding: 'utf8' }
  );
  if (result.status !== 0) {
    throw new Error(`Release asset upload failed for ${name}: ${result.stderr.trim()}`);
  }
  const uploaded = JSON.parse(result.stdout);
  if (uploaded.name !== name || uploaded.state !== 'uploaded' || !uploaded.id) {
    throw new Error(`GitHub returned an invalid upload identity for ${name}.`);
  }
}
process.stdout.write(`Release assets uploaded to owned release ${releaseId}.\n`);
