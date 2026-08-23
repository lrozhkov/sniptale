import {
  assertImmutableRelease,
  readExpectedReleaseAssetDigests,
  readReleaseVerificationInput,
} from './release-verification.mjs';

const { assetRoot, release, releaseId, tag } = readReleaseVerificationInput('published');
assertImmutableRelease(release, releaseId, tag, readExpectedReleaseAssetDigests(assetRoot));
process.stdout.write(`Immutable release verified: ${tag} (${releaseId})\n`);
