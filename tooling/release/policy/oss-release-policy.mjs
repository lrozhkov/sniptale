import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

export const OSS_RELEASE_POLICY_PATH = 'tooling/configs/qa/oss-release.data.json';
export const REQUIRED_RELEASE_LEGAL_PATHS = [
  'LICENSE',
  'LICENSES/OFL-1.1.txt',
  'NOTICE',
  'THIRD_PARTY_NOTICES.md',
];
export const CANONICAL_LICENSE_DIGESTS = new Map([
  ['LICENSE', 'e9df4c4e4e64b8168a71c3c67668dcffabbe8fca11d4ac4a7d5482562cd1679c'],
  ['LICENSES/OFL-1.1.txt', 'd826ab6583b12c26807d8716a545bdbbb672df04f48608a364ba9efdbe501c30'],
]);

export function sha256(contents) {
  return createHash('sha256').update(contents).digest('hex');
}

export function readOssReleasePolicy(repoRoot = process.cwd()) {
  const policy = JSON.parse(readFileSync(path.resolve(repoRoot, OSS_RELEASE_POLICY_PATH), 'utf8'));
  const archivePaths = policy.legalFiles?.map((entry) => entry.archivePath) ?? [];
  const sourcePaths = policy.legalFiles?.map((entry) => entry.source) ?? [];
  if (
    new Set(archivePaths).size !== archivePaths.length ||
    new Set(sourcePaths).size !== sourcePaths.length
  ) {
    throw new Error('OSS release policy legal payload paths must be one-to-one.');
  }
  for (const requiredPath of REQUIRED_RELEASE_LEGAL_PATHS) {
    if (!archivePaths.includes(requiredPath) || !sourcePaths.includes(requiredPath)) {
      throw new Error(`OSS release policy is missing canonical legal file: ${requiredPath}`);
    }
  }
  return policy;
}

export async function collectReleaseLegalSourceFiles(repoRoot = process.cwd()) {
  const policy = readOssReleasePolicy(repoRoot);
  return Promise.all(
    policy.legalFiles.map(async (entry) => {
      const absolutePath = path.resolve(repoRoot, entry.source);
      const contents = await fs.readFile(absolutePath);
      if (sha256(contents) !== entry.sha256) {
        throw new Error(`Release legal source digest drift: ${entry.source}`);
      }
      const canonicalDigest = CANONICAL_LICENSE_DIGESTS.get(entry.source);
      if (canonicalDigest && entry.sha256 !== canonicalDigest) {
        throw new Error(`Canonical release license digest drift: ${entry.source}`);
      }
      return { absolutePath, contents, relativePath: entry.archivePath };
    })
  );
}

export function assertReleaseLegalPayload(files, repoRoot = process.cwd()) {
  const filesByPath = new Map(files.map((file) => [file.relativePath, file]));
  const policy = readOssReleasePolicy(repoRoot);
  for (const entry of policy.legalFiles) {
    const canonicalDigest = CANONICAL_LICENSE_DIGESTS.get(entry.archivePath);
    if (canonicalDigest && entry.sha256 !== canonicalDigest) {
      throw new Error(`Canonical release license digest drift: ${entry.archivePath}`);
    }
    const file = filesByPath.get(entry.archivePath);
    if (!file) throw new Error(`Release artifact is missing legal file: ${entry.archivePath}`);
    if (sha256(file.contents) !== entry.sha256) {
      throw new Error(`Release artifact legal file digest drift: ${entry.archivePath}`);
    }
  }
  const declaredPaths = new Set(policy.legalFiles.map((entry) => entry.archivePath));
  for (const file of files) {
    if (
      (file.relativePath === 'THIRD_PARTY_DEPENDENCIES.json' ||
        file.relativePath.startsWith('LICENSES/dependencies/')) &&
      !declaredPaths.has(file.relativePath)
    ) {
      throw new Error(`Release artifact contains undeclared legal file: ${file.relativePath}`);
    }
  }
}
