import fs from 'node:fs';

import {
  classifyExistingRelease,
  readExpectedReleaseAssetDigests,
} from './release-verification.mjs';

const [assetRoot, tag, expectedName] = process.argv.slice(2);
if (!assetRoot || !tag || !expectedName) {
  throw new Error('Usage: classify-release-state.mjs <asset-root> <tag> <expected-name>');
}
const release = JSON.parse(fs.readFileSync(0, 'utf8'));
process.stdout.write(
  `${JSON.stringify(
    classifyExistingRelease(release, tag, expectedName, readExpectedReleaseAssetDigests(assetRoot))
  )}\n`
);
