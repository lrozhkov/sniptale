import {
  MAX_MEDIA_ARCHIVE_TEXT_ENTRY_BYTES,
  openArchiveReader,
  type ArchiveEntryInfo,
  type ArchiveReader,
  type ArchiveRootDescriptor,
} from '../../../composition/archive-transfer';
import { createArchiveFingerprint, parseCatalog } from './catalog';
import { parseBoundedJson, parseManifestV6, parseRootEnvelope } from './codec';
import {
  MAX_CATALOG_SHARD_BYTES,
  MAX_ROOT_METADATA_BYTES,
  type MediaHubBackupManifestV6,
} from './contracts';
import { assertV6MetadataPath, MANIFEST_PATH } from './layout';

export interface InspectedMediaHubBackupV6 {
  descriptors: ArchiveRootDescriptor[];
  fingerprint: string;
  manifest: MediaHubBackupManifestV6;
  rootKeys: string[];
  thumbnailCount: number;
}

function countRootThumbnails(metadata: unknown): number {
  if (typeof metadata !== 'object' || metadata === null || Array.isArray(metadata)) return 0;
  const record = metadata as Record<string, unknown>;
  let count = record['thumbnail'] === undefined ? 0 : 1;
  if (Array.isArray(record['projectExports'])) {
    count += record['projectExports'].filter(
      (item) => typeof item === 'object' && item !== null && 'thumbnail' in item
    ).length;
  }
  if (Array.isArray(record['exportThumbnails'])) count += record['exportThumbnails'].length;
  return count;
}

function rootKey(descriptor: ArchiveRootDescriptor): string {
  if (descriptor.rootKind === 'media') {
    return `media:${descriptor.mediaSubtype}:${descriptor.rootId}`;
  }
  return `${descriptor.rootKind}:${descriptor.rootId}`;
}

function matchesCatalogProfile(
  descriptor: ArchiveRootDescriptor,
  catalog: MediaHubBackupManifestV6['catalogs'][number]
): boolean {
  if (descriptor.rootKind !== catalog.rootKind) return false;
  if (descriptor.rootKind === 'media') return descriptor.mediaSubtype === catalog.mediaSubtype;
  return catalog.mediaSubtype === undefined;
}

function assertMetadataPath(descriptor: ArchiveRootDescriptor): void {
  assertV6MetadataPath(
    descriptor.metadataPath,
    descriptor.rootKind,
    descriptor.rootId,
    descriptor.rootKind === 'media' ? descriptor.mediaSubtype : undefined
  );
}

function sameDescriptor(left: ArchiveRootDescriptor, right: ArchiveRootDescriptor): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function centralDirectoryIdentity(entries: readonly ArchiveEntryInfo[]) {
  return entries.map(({ compressedSize, crc32, path, size }) => ({
    compressedSize,
    crc32,
    path,
    size,
  }));
}

interface InspectionAccumulator {
  catalogTexts: string[];
  declaredPaths: Set<string>;
  rootDescriptors: ArchiveRootDescriptor[];
  rootKeys: string[];
  canonicalRootKeys: Set<string>;
  rootsByProfile: MediaHubBackupManifestV6['totals']['rootsByProfile'];
  thumbnailCount: number;
  totalBytes: number;
  totalObjects: number;
  totalRoots: number;
}

function createInspectionAccumulator(): InspectionAccumulator {
  return {
    catalogTexts: [],
    canonicalRootKeys: new Set(),
    declaredPaths: new Set([MANIFEST_PATH]),
    rootDescriptors: [],
    rootKeys: [],
    rootsByProfile: {
      effectBundles: 0,
      libraryItems: 0,
      scenarioProjects: 0,
      videoProjects: 0,
    },
    thumbnailCount: 0,
    totalBytes: 0,
    totalObjects: 0,
    totalRoots: 0,
  };
}

function addProfileRoot(
  counts: InspectionAccumulator['rootsByProfile'],
  descriptor: ArchiveRootDescriptor
) {
  if (descriptor.rootKind === 'video-project') counts.videoProjects += 1;
  else if (descriptor.rootKind === 'scenario-project') counts.scenarioProjects += 1;
  else if (descriptor.rootKind === 'media' && descriptor.mediaSubtype === 'effect-bundle')
    counts.effectBundles += 1;
  else counts.libraryItems += 1;
}

async function inspectRoot(args: {
  catalog: MediaHubBackupManifestV6['catalogs'][number];
  descriptor: ArchiveRootDescriptor;
  reader: ArchiveReader;
  state: InspectionAccumulator;
}) {
  if (!matchesCatalogProfile(args.descriptor, args.catalog)) {
    throw new Error('Media backup catalog contains a root from another profile.');
  }
  assertMetadataPath(args.descriptor);
  const key = rootKey(args.descriptor);
  const canonicalKey = key.toLocaleLowerCase('en-US');
  if (args.state.canonicalRootKeys.has(canonicalKey)) {
    throw new Error('Media backup root identity is duplicated.');
  }
  if (args.state.declaredPaths.has(args.descriptor.metadataPath)) {
    throw new Error('Media backup root metadata path is duplicated.');
  }
  const metadataEntry = args.reader.entry(args.descriptor.metadataPath);
  if (!metadataEntry) {
    throw new Error(`Media backup root metadata is missing: ${args.descriptor.metadataPath}.`);
  }
  const envelope = parseRootEnvelope(
    parseBoundedJson(await metadataEntry.text(MAX_ROOT_METADATA_BYTES), MAX_ROOT_METADATA_BYTES)
  );
  if (!sameDescriptor(envelope.descriptor, args.descriptor)) {
    throw new Error('Media backup catalog and root metadata descriptors do not match.');
  }
  for (const object of envelope.objects) {
    if (args.state.declaredPaths.has(object.path)) {
      throw new Error('Media backup object path is duplicated.');
    }
    const objectEntry = args.reader.entry(object.path);
    if (!objectEntry) throw new Error(`Media backup object is missing: ${object.path}.`);
    if (objectEntry.size !== object.size) {
      throw new Error(`Media backup object size does not match: ${object.path}.`);
    }
    args.state.declaredPaths.add(object.path);
  }
  args.state.canonicalRootKeys.add(canonicalKey);
  args.state.declaredPaths.add(args.descriptor.metadataPath);
  args.state.rootDescriptors.push(args.descriptor);
  args.state.rootKeys.push(key);
  args.state.thumbnailCount += countRootThumbnails(envelope.metadata);
  args.state.totalBytes += args.descriptor.totalBytes;
  args.state.totalObjects += args.descriptor.objectCount;
  args.state.totalRoots += 1;
  addProfileRoot(args.state.rootsByProfile, args.descriptor);
}

async function inspectCatalog(args: {
  catalog: MediaHubBackupManifestV6['catalogs'][number];
  reader: ArchiveReader;
  state: InspectionAccumulator;
}) {
  if (args.state.declaredPaths.has(args.catalog.path)) {
    throw new Error('Media backup catalog path is duplicated.');
  }
  const catalogEntry = args.reader.entry(args.catalog.path);
  if (!catalogEntry) throw new Error(`Media backup catalog is missing: ${args.catalog.path}.`);
  const catalogText = await catalogEntry.text(MAX_CATALOG_SHARD_BYTES);
  const descriptors = parseCatalog(catalogText);
  args.state.catalogTexts.push(catalogText);
  args.state.declaredPaths.add(args.catalog.path);
  for (const descriptor of descriptors) {
    await inspectRoot({ ...args, descriptor });
  }
  const objectCount = descriptors.reduce((total, descriptor) => total + descriptor.objectCount, 0);
  const totalBytes = descriptors.reduce((total, descriptor) => total + descriptor.totalBytes, 0);
  if (
    descriptors.length !== args.catalog.rootCount ||
    objectCount !== args.catalog.objectCount ||
    totalBytes !== args.catalog.totalBytes
  ) {
    throw new Error('Media backup catalog totals do not match its roots.');
  }
}

function assertManifestTotals(manifest: MediaHubBackupManifestV6, state: InspectionAccumulator) {
  const profileMismatch = Object.entries(state.rootsByProfile).some(
    ([profile, count]) =>
      count !== manifest.totals.rootsByProfile[profile as keyof typeof state.rootsByProfile]
  );
  if (
    state.totalBytes !== manifest.totals.bytes ||
    state.totalObjects !== manifest.totals.objects ||
    state.totalRoots !== manifest.totals.roots ||
    profileMismatch
  ) {
    throw new Error('Media backup manifest totals do not match its catalogs.');
  }
}

function assertExactDeclaredEntries(reader: ArchiveReader, state: InspectionAccumulator) {
  const entries = reader.entries();
  const undeclared = entries.find((entry) => !state.declaredPaths.has(entry.path));
  if (undeclared) throw new Error(`Media backup contains an undeclared entry: ${undeclared.path}.`);
  if (state.declaredPaths.size !== entries.length) {
    throw new Error('Media backup declared entry set is incomplete.');
  }
}

export async function inspectMediaHubBackupV6(file: Blob): Promise<InspectedMediaHubBackupV6> {
  const reader = await openArchiveReader(file);
  try {
    const manifestEntry = reader.entry(MANIFEST_PATH);
    if (!manifestEntry) {
      if (reader.entry('manifest.json')) {
        throw new Error(
          'Unsupported media backup v6 layout. Create a new backup with this version.'
        );
      }
      throw new Error('Media backup manifest is missing.');
    }
    const manifestText = await manifestEntry.text(MAX_MEDIA_ARCHIVE_TEXT_ENTRY_BYTES);
    const manifest = parseManifestV6(parseBoundedJson(manifestText));
    const state = createInspectionAccumulator();
    for (const catalog of manifest.catalogs) {
      await inspectCatalog({ catalog, reader, state });
    }
    assertManifestTotals(manifest, state);
    assertExactDeclaredEntries(reader, state);
    return {
      descriptors: state.rootDescriptors,
      fingerprint: await createArchiveFingerprint({
        catalogTexts: state.catalogTexts,
        entries: centralDirectoryIdentity(reader.entries()),
        manifestText,
      }),
      manifest,
      rootKeys: state.rootKeys,
      thumbnailCount: state.thumbnailCount,
    };
  } finally {
    await reader.close();
  }
}
