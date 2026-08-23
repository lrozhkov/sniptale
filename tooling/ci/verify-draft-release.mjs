import {
  assertDraftRelease,
  readExpectedReleaseAssetDigests,
  readReleaseVerificationInput,
} from './release-verification.mjs';

const { assetRoot, release, releaseId, tag } = readReleaseVerificationInput('draft');
assertDraftRelease(release, releaseId, tag, readExpectedReleaseAssetDigests(assetRoot));
process.stdout.write(`Mutable draft assets verified: ${tag} (${releaseId})\n`);
