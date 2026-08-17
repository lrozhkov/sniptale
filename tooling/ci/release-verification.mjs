import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

function sha256(filePath) {
  return `sha256:${crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')}`;
}

export function readExpectedReleaseAssetDigests(assetRoot) {
  const checksumPath = path.join(assetRoot, 'SHA256SUMS');
  const expected = new Map(
    fs
      .readFileSync(checksumPath, 'utf8')
      .trim()
      .split('\n')
      .map((line) => {
        const [digest, name] = line.split(/\s{2}/u);
        return [name, `sha256:${digest}`];
      })
  );
  expected.set('SHA256SUMS', sha256(checksumPath));
  return expected;
}

export function assertPublishedReleaseAssets(release, expected) {
  const published = new Map(release.assets.map((asset) => [asset.name, asset.digest]));
  if (published.size !== expected.size) {
    throw new Error('Published release asset set is incomplete or contains unexpected assets.');
  }
  for (const [name, digest] of expected) {
    if (published.get(name) !== digest) throw new Error(`Published asset digest mismatch: ${name}`);
  }
}

export function assertDraftRelease(release, expectedId, expectedTag, expectedAssets) {
  if (
    String(release.id) !== String(expectedId) ||
    release.tag_name !== expectedTag ||
    release.draft !== true ||
    release.immutable === true
  ) {
    throw new Error('Draft release identity or mutable state drifted before publication.');
  }
  assertPublishedReleaseAssets(release, expectedAssets);
}

export function assertImmutableRelease(release, expectedId, expectedTag, expectedAssets) {
  if (
    String(release.id) !== String(expectedId) ||
    release.tag_name !== expectedTag ||
    release.draft === true ||
    release.immutable !== true
  ) {
    throw new Error('Published release identity or immutable state drifted.');
  }
  assertPublishedReleaseAssets(release, expectedAssets);
}
