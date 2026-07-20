import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

function sha256(contents) {
  return createHash('sha256').update(contents).digest('hex');
}

function assertContainedSourcePath(sourcePath) {
  if (
    path.isAbsolute(sourcePath) ||
    sourcePath.split(/[\\/]/u).includes('..') ||
    !sourcePath.startsWith('tooling/release/dependency-legal/sources/')
  ) {
    throw new Error(`Pinned dependency license source path is outside its owner: ${sourcePath}`);
  }
}

function assertVersionedOrigin(source) {
  let upstreamUrl;
  try {
    upstreamUrl = new URL(source.upstreamAuthorUrl);
  } catch {
    throw new Error(`Pinned dependency upstream URL is invalid: ${source.upstreamAuthorUrl}`);
  }
  const repositoryPath = upstreamUrl.pathname.replace(/^\//u, '').replace(/\/$/u, '');
  const expected = `https://raw.githubusercontent.com/${repositoryPath}/v${source.upstreamVersion}/LICENSE`;
  if (
    source.originUrl !== expected ||
    /(?:\/master\/|icon-sets\.iconify\.design)/u.test(source.originUrl)
  ) {
    throw new Error(`Pinned dependency license origin is not version-tagged: ${source.originUrl}`);
  }
}

function assertPinnedIdentity(record, selectedLicense, source) {
  const iconSet = record.installedMetadata.iconSetInfo;
  const matches =
    record.packageName === source.packageName &&
    record.version === source.packageVersion &&
    record.resolved === source.packageResolved &&
    record.integrity === source.packageIntegrity &&
    selectedLicense === source.license &&
    iconSet?.version === source.upstreamVersion &&
    iconSet?.license?.spdx === source.license &&
    iconSet?.license?.url === source.upstreamLicenseMetadataUrl &&
    iconSet?.author?.name === source.upstreamAuthorName &&
    iconSet?.author?.url === source.upstreamAuthorUrl;
  if (!matches) {
    throw new Error(
      `Pinned dependency license identity drift for ${record.packageName}@${record.version}.`
    );
  }
}

/** Reads a reviewed version-tagged, byte-pinned license source without network access. */
export async function selectPinnedLicenseSource(record, selectedLicense, pinnedSources) {
  const source = pinnedSources.find(
    (candidate) =>
      candidate.packageName === record.packageName && candidate.packageVersion === record.version
  );
  if (!source) return undefined;
  assertContainedSourcePath(source.sourcePath);
  assertVersionedOrigin(source);
  assertPinnedIdentity(record, selectedLicense, source);
  let contents;
  try {
    contents = await fs.readFile(path.resolve(record.repoRoot, source.sourcePath), 'utf8');
  } catch {
    throw new Error(`Pinned dependency license source is missing: ${source.sourcePath}`);
  }
  if (sha256(contents) !== source.sha256) {
    throw new Error(`Pinned dependency license source digest drift: ${source.sourcePath}`);
  }
  return {
    contents,
    licenseProvenance: {
      kind: 'pinned-upstream',
      originUrl: source.originUrl,
      sha256: source.sha256,
      sourcePath: source.sourcePath,
      upstreamVersion: source.upstreamVersion,
    },
    licenseSource: source.sourcePath,
    licenseSourceKind: 'pinned-upstream',
  };
}
