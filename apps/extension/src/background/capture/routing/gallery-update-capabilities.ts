import {
  issuePolicyCapability,
  pruneExpiredPolicyCapabilities,
  type PolicyCapabilityRecord,
} from '../../routing-contracts/capabilities/policy/capability-store';
import { consumeOneShotPolicyCapability } from '../../routing-contracts/capabilities/policy/one-shot';
import { createPolicySenderBinding } from '../../routing-contracts/capabilities/policy/sender-binding';
import { createPrivilegedCapabilityStore } from '../../routing-contracts/capabilities/privileged-authority/state';

type GalleryImageUpdateCapability = {
  assetId: string;
  editorSessionId: string;
};

const GALLERY_IMAGE_UPDATE_CAPABILITIES_POLICY_ID = 'gallery-image-update-capabilities';
const galleryImageUpdateCapabilities = createPrivilegedCapabilityStore<
  PolicyCapabilityRecord<GalleryImageUpdateCapability>
>({
  domain: 'background.privileged.gallery-image-update-capabilities',
  policyId: GALLERY_IMAGE_UPDATE_CAPABILITIES_POLICY_ID,
  storageClass: 'memory-only',
});

function createCapabilityToken(): string {
  const randomUUID = globalThis.crypto?.randomUUID;
  if (!randomUUID) {
    throw new Error('Gallery image update capability token generation is unavailable.');
  }
  return randomUUID.call(globalThis.crypto);
}

function pruneExpiredGalleryImageUpdateCapabilities(now = Date.now()): void {
  pruneExpiredPolicyCapabilities({
    nowEpochMs: now,
    store: galleryImageUpdateCapabilities,
  });
}

function createGalleryImageUpdateSenderBinding(args: { documentId: string; senderUrl: string }) {
  return createPolicySenderBinding({
    documentId: args.documentId,
    senderUrl: args.senderUrl,
  });
}

export function issueGalleryImageUpdateCapability(args: {
  assetId: string;
  documentId: string;
  editorSessionId: string;
  senderUrl: string;
}): string {
  pruneExpiredGalleryImageUpdateCapabilities();
  const token = createCapabilityToken();
  issuePolicyCapability({
    payload: {
      assetId: args.assetId,
      editorSessionId: args.editorSessionId,
    },
    policyStateId: GALLERY_IMAGE_UPDATE_CAPABILITIES_POLICY_ID,
    scopes: ['gallery:image-update'],
    senderBinding: createGalleryImageUpdateSenderBinding(args),
    store: galleryImageUpdateCapabilities,
    tokenFactory: () => token,
  });
  return token;
}

export function consumeGalleryImageUpdateCapability(args: {
  assetId: string;
  documentId: string;
  editorSessionId: string;
  senderUrl: string;
  token: string;
}): boolean {
  pruneExpiredGalleryImageUpdateCapabilities();
  const result = consumeOneShotPolicyCapability({
    policyStateId: GALLERY_IMAGE_UPDATE_CAPABILITIES_POLICY_ID,
    scope: 'gallery:image-update',
    senderBinding: createGalleryImageUpdateSenderBinding(args),
    store: galleryImageUpdateCapabilities,
    strategy: 'delete-before-validation',
    token: args.token,
    validateRecord: ({ payload }) =>
      payload.assetId === args.assetId && payload.editorSessionId === args.editorSessionId,
  });
  return result.consumed;
}

export function resetGalleryImageUpdateCapabilitiesForTests(): void {
  galleryImageUpdateCapabilities.clear();
}
