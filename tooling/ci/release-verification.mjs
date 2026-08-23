import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

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

export function assertOwnedDraftAssets(release, expected) {
  if (!Array.isArray(release.assets)) throw new Error('Existing release asset list is malformed.');
  const names = new Set();
  for (const asset of release.assets) {
    if (
      !asset ||
      typeof asset.name !== 'string' ||
      names.has(asset.name) ||
      !expected.has(asset.name) ||
      expected.get(asset.name) !== asset.digest
    ) {
      throw new Error('Existing mutable draft contains an unowned or mismatched asset.');
    }
    names.add(asset.name);
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

export function classifyExistingRelease(release, expectedTag, expectedName, expectedAssets) {
  if (
    release?.tag_name !== expectedTag ||
    release?.name !== expectedName ||
    release?.prerelease !== true
  ) {
    throw new Error('Existing release does not belong to the exact Sniptale alpha publication.');
  }
  if (release.draft === false && release.immutable === true) {
    assertImmutableRelease(release, release.id, expectedTag, expectedAssets);
    return { action: 'already-published', releaseId: String(release.id) };
  }
  if (release.draft === true && release.immutable !== true) {
    assertOwnedDraftAssets(release, expectedAssets);
    return { action: 'recreate-owned-draft', releaseId: String(release.id) };
  }
  throw new Error('Existing release has an unsupported mutable publication state.');
}

export function readReleaseVerificationInput(kind) {
  const [assetRoot, releaseId] = process.argv.slice(2);
  const repository = process.env.GITHUB_REPOSITORY ?? 'lrozhkov/sniptale';
  const tag = process.env.RELEASE_TAG ?? process.env.GITHUB_REF_NAME;
  if (!assetRoot || !releaseId || !tag) {
    throw new Error(`${kind} release verification requires assets, release ID, and tag.`);
  }
  const result = spawnSync('gh', ['api', `repos/${repository}/releases/${releaseId}`], {
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(`Unable to verify ${kind} release: ${result.stderr.trim()}`);
  }
  return {
    assetRoot,
    release: JSON.parse(result.stdout),
    releaseId,
    tag,
  };
}
