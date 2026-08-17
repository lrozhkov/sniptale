import { spawnSync } from 'node:child_process';

import { assertDraftRelease, readExpectedReleaseAssetDigests } from './release-verification.mjs';

const [assetRoot, releaseId] = process.argv.slice(2);
const repository = process.env.GITHUB_REPOSITORY ?? 'lrozhkov/sniptale';
const tag = process.env.GITHUB_REF_NAME;
if (!assetRoot || !releaseId || !tag) {
  throw new Error('Draft release verification requires assets, release ID, and tag.');
}
const result = spawnSync('gh', ['api', `repos/${repository}/releases/${releaseId}`], {
  encoding: 'utf8',
});
if (result.status !== 0) {
  throw new Error(`Unable to verify draft release: ${result.stderr.trim()}`);
}
const release = JSON.parse(result.stdout);
assertDraftRelease(release, releaseId, tag, readExpectedReleaseAssetDigests(assetRoot));
process.stdout.write(`Mutable draft assets verified: ${tag} (${releaseId})\n`);
