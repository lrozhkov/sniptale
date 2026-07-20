import fs from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { sha256 } from './oss-release-policy.mjs';

const LEGAL_CONTENTS = new Map([
  ['LICENSE', readFileSync(path.resolve('LICENSE'), 'utf8')],
  ['NOTICE', 'Sniptale fixture notice\n'],
  ['THIRD_PARTY_NOTICES.md', '# Fixture notices\n'],
  ['LICENSES/OFL-1.1.txt', readFileSync(path.resolve('LICENSES/OFL-1.1.txt'), 'utf8')],
  ['THIRD_PARTY_DEPENDENCIES.json', '{"entries":[],"schemaVersion":1}\n'],
  ['LICENSES/dependencies/example-1.0.0.txt', 'Example dependency license\n'],
]);

export const TEST_LEGAL_FILES = [...LEGAL_CONTENTS].map(([archivePath, contents]) => ({
  archivePath,
  contents,
  sha256: sha256(Buffer.from(contents)),
  source: archivePath,
}));

export function createTestLegalArtifactFiles() {
  return TEST_LEGAL_FILES.map((entry) => ({
    contents: Buffer.from(entry.contents),
    relativePath: entry.archivePath,
  }));
}

export async function seedTestOssReleasePolicy(root: string) {
  await fs.mkdir(path.join(root, 'tooling/configs/qa'), { recursive: true });
  for (const entry of TEST_LEGAL_FILES) {
    const destination = path.join(root, entry.source);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, entry.contents);
  }
  await fs.writeFile(
    path.join(root, 'tooling/configs/qa/oss-release.data.json'),
    JSON.stringify({ legalFiles: TEST_LEGAL_FILES })
  );
}
