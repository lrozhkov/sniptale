import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

export const INTERFACE_FONT_PATH = 'packages/ui/src/styles/golos-ui/golos-ui-vf.woff2';
export const INTERFACE_FONT_LICENSE_PATH = 'packages/ui/src/styles/golos-ui/LICENSE.txt';

export const DOCUMENT_FONT_PATH = 'packages/ui/src/styles/golos-text/golos-text-vf.woff2';
export const DOCUMENT_FONT_LICENSE_PATH = 'packages/ui/src/styles/golos-text/LICENSE.txt';
export const DOCUMENT_FONT_SHA256 =
  'ee021f497d8f5b323b9dc5653b88380be86a176de08cbe74d6fe721cafe9c843';

export const OSS_RELEASE_POLICY_PATH = 'tooling/configs/qa/oss-release.data.json';
const FONT_ARCHIVE_PATHS = new Map([
  [INTERFACE_FONT_LICENSE_PATH, 'LICENSES/fonts/golos-ui.txt'],
  [DOCUMENT_FONT_LICENSE_PATH, 'LICENSES/fonts/golos-text.txt'],
]);

export function releaseLegalArchivePath(source) {
  return FONT_ARCHIVE_PATHS.get(source) ?? source;
}
export const REQUIRED_RELEASE_LEGAL_PATHS = [
  'LICENSE',
  'LICENSES/OFL-1.1.txt',
  'packages/ui/src/styles/golos-ui/LICENSE.txt',
  'NOTICE',
  'THIRD_PARTY_NOTICES.md',
];
export const CANONICAL_LICENSE_DIGESTS = new Map([
  [DOCUMENT_FONT_LICENSE_PATH, '2c7e44f733787b9d9fe9ee3f857e24bed455523b14804ebf73480c125e4b6784'],
  [INTERFACE_FONT_LICENSE_PATH, 'c8e985ff79ce19d0c8029ef5d772c18044cdcafb5294e629722c979d169820a9'],
  ['LICENSE', 'e9df4c4e4e64b8168a71c3c67668dcffabbe8fca11d4ac4a7d5482562cd1679c'],
  ['LICENSES/OFL-1.1.txt', 'd826ab6583b12c26807d8716a545bdbbb672df04f48608a364ba9efdbe501c30'],
]);

for (const [source, target] of FONT_ARCHIVE_PATHS) {
  CANONICAL_LICENSE_DIGESTS.set(target, CANONICAL_LICENSE_DIGESTS.get(source));
}

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
  const requiredPaths = policy.bundledAssets?.some((asset) => asset.id === 'golos-text')
    ? [...REQUIRED_RELEASE_LEGAL_PATHS, DOCUMENT_FONT_LICENSE_PATH]
    : REQUIRED_RELEASE_LEGAL_PATHS;
  for (const requiredPath of requiredPaths) {
    const distributedPath = releaseLegalArchivePath(requiredPath);
    if (!archivePaths.includes(distributedPath) || !sourcePaths.includes(distributedPath)) {
      throw new Error(`OSS release policy is missing canonical legal file: ${requiredPath}`);
    }
  }
  return policy;
}

export function dependencySourceArchiveIdentity(repoRoot = process.cwd()) {
  const metadata = JSON.parse(readFileSync(path.resolve(repoRoot, 'package.json'), 'utf8'));
  if (
    typeof metadata?.version !== 'string' ||
    !/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u.test(metadata.version)
  ) {
    throw new Error('Dependency source distribution requires an exact release version.');
  }
  const file = `sniptale-dependency-source-${metadata.version}.zip`;
  return {
    file,
    url: `https://github.com/lrozhkov/sniptale/releases/download/v${metadata.version}/${file}`,
  };
}

export async function collectReleaseLegalSourceFiles(
  repoRoot = process.cwd(),
  { includeSource = false } = {}
) {
  const policy = readOssReleasePolicy(repoRoot);
  return Promise.all(
    policy.legalFiles
      .filter((entry) => includeSource || entry.distribution !== 'source')
      .map(async (entry) => {
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
    if (entry.distribution === 'source') {
      if (filesByPath.has(entry.archivePath))
        throw new Error(`Source-only file in installer: ${entry.archivePath}`);
      continue;
    }
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
