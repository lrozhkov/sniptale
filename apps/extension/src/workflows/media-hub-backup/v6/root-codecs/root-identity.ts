import type { ArchiveRootDescriptor } from '../../../../composition/archive-transfer';
import { parseEffectBundleMetadata } from './effect-bundle';
import { parsePortableMediaMetadata } from './media';
import {
  parsePortableScenarioProjectMetadata,
  parsePortableVideoProjectMetadata,
} from './projects';

function parseDomainRootId(descriptor: ArchiveRootDescriptor, metadata: unknown): string {
  if (descriptor.rootKind === 'video-project') {
    return parsePortableVideoProjectMetadata(metadata).entry.id;
  }
  if (descriptor.rootKind === 'scenario-project') {
    return parsePortableScenarioProjectMetadata(metadata).entry.id;
  }
  if (descriptor.rootKind === 'media') {
    return descriptor.mediaSubtype === 'effect-bundle'
      ? parseEffectBundleMetadata(metadata).entry.packId
      : parsePortableMediaMetadata(metadata).entry.id;
  }
  throw new Error('Media backup root descriptor kind is unsupported.');
}

/** Binds the catalog identity to the domain identity before restore authority is acquired. */
export function assertArchiveRootMetadataIdentity(
  descriptor: ArchiveRootDescriptor,
  metadata: unknown
): void {
  if (parseDomainRootId(descriptor, metadata) !== descriptor.rootId) {
    throw new Error('Media backup root metadata identity does not match its descriptor.');
  }
}
