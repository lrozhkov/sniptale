import {
  bindCameraRecorderDocumentGrant,
  clearCameraRecorderGrant as clearStoredCameraRecorderGrant,
  createCameraRecorderLaunchGrant,
  readCameraRecorderGrant,
  rebindCameraRecorderDocumentGrant,
  type CameraRecorderGrant,
} from '../../../storage/video/camera-recorder-grant';
import {
  acquireMediaMutationPermit,
  getMediaAuthorityGeneration,
} from '../../../mutation-exclusion/media-activity';

let activeGrant: CameraRecorderGrant | null = null;
let activeGrantAuthorityGeneration = -1;
let cacheOperationGeneration = 0;

function beginCacheOperation(): number {
  cacheOperationGeneration += 1;
  return cacheOperationGeneration;
}

function publishGrantToCache(
  grant: CameraRecorderGrant,
  operationGeneration: number,
  authorityGeneration: number
): boolean {
  if (
    operationGeneration !== cacheOperationGeneration ||
    authorityGeneration !== getMediaAuthorityGeneration()
  ) {
    return false;
  }
  activeGrant = grant;
  activeGrantAuthorityGeneration = authorityGeneration;
  return true;
}

function clearGrantCache(): void {
  activeGrant = null;
  activeGrantAuthorityGeneration = -1;
}

export async function issueCameraRecorderLaunchToken(recordingId: string): Promise<string> {
  const releaseMutationPermit = acquireMediaMutationPermit();
  if (!releaseMutationPermit) {
    throw new Error('Camera recorder launch is unavailable during privacy erasure.');
  }
  const authorityGeneration = getMediaAuthorityGeneration();
  const operationGeneration = beginCacheOperation();
  const registrationToken = crypto.randomUUID();
  try {
    const grant = await createCameraRecorderLaunchGrant(recordingId, registrationToken);
    if (!publishGrantToCache(grant, operationGeneration, authorityGeneration)) {
      throw new Error('Camera recorder launch authority changed before activation.');
    }
    return registrationToken;
  } finally {
    releaseMutationPermit();
  }
}

export async function authorizeCameraRecorderDocument(args: {
  documentId?: string | undefined;
  registrationToken?: string | undefined;
  recordingId: string;
  senderUrl: string | null;
  tabId?: number | undefined;
}): Promise<{ recordingId: string } | null> {
  if (!args.senderUrl || !args.documentId || !args.registrationToken || args.tabId === undefined) {
    return null;
  }
  const releaseMutationPermit = acquireMediaMutationPermit();
  if (!releaseMutationPermit) {
    return null;
  }
  const authorityGeneration = getMediaAuthorityGeneration();
  const operationGeneration = beginCacheOperation();

  const nextRegistrationToken = crypto.randomUUID();
  try {
    const grant = await bindCameraRecorderDocumentGrant({
      documentId: args.documentId,
      nextRegistrationToken,
      registrationToken: args.registrationToken,
      recordingId: args.recordingId,
      senderUrl: args.senderUrl,
      tabId: args.tabId,
    });
    if (!grant || !publishGrantToCache(grant, operationGeneration, authorityGeneration)) {
      return null;
    }
    return { recordingId: grant.recordingId };
  } finally {
    releaseMutationPermit();
  }
}

export async function reconnectCameraRecorderDocument(args: {
  documentId?: string | undefined;
  senderUrl: string | null;
  tabId?: number | undefined;
}): Promise<{ recordingId: string } | null> {
  if (!args.senderUrl || !args.documentId || args.tabId === undefined) {
    return null;
  }
  const releaseMutationPermit = acquireMediaMutationPermit();
  if (!releaseMutationPermit) {
    return null;
  }
  const authorityGeneration = getMediaAuthorityGeneration();
  const operationGeneration = beginCacheOperation();
  try {
    const grant = await rebindCameraRecorderDocumentGrant({
      documentId: args.documentId,
      senderUrl: args.senderUrl,
      tabId: args.tabId,
    });
    if (!grant || !publishGrantToCache(grant, operationGeneration, authorityGeneration)) {
      return null;
    }
    return { recordingId: grant.recordingId };
  } finally {
    releaseMutationPermit();
  }
}

export function isAuthorizedCameraRecorderDocument(args: {
  documentId?: string | undefined;
  recordingId?: string | undefined;
  senderUrl: string | null;
  tabId?: number | undefined;
}): boolean {
  if (
    !activeGrant ||
    activeGrantAuthorityGeneration !== getMediaAuthorityGeneration() ||
    activeGrant.stage !== 'document' ||
    !args.documentId ||
    !args.recordingId ||
    !args.senderUrl ||
    args.tabId === undefined
  ) {
    return false;
  }
  if (activeGrant.expiresAt <= Date.now()) {
    forgetCameraRecorderControlGrant();
    return false;
  }

  return matchesCameraRecorderDocument(activeGrant, {
    documentId: args.documentId,
    recordingId: args.recordingId,
    senderUrl: args.senderUrl,
    tabId: args.tabId,
  });
}

export async function restoreAuthorizedCameraRecorderDocument(args: {
  documentId?: string | undefined;
  recordingId?: string | undefined;
  senderUrl: string | null;
  tabId?: number | undefined;
}): Promise<boolean> {
  if (!args.documentId || !args.recordingId || !args.senderUrl || args.tabId === undefined) {
    return false;
  }
  const releaseMutationPermit = acquireMediaMutationPermit();
  if (!releaseMutationPermit) {
    return false;
  }
  const authorityGeneration = getMediaAuthorityGeneration();
  try {
    if (isAuthorizedCameraRecorderDocument(args)) {
      return true;
    }
    const operationGeneration = beginCacheOperation();

    const stored = await readCameraRecorderGrant();
    if (
      !stored ||
      stored.stage !== 'document' ||
      !matchesCameraRecorderDocument(stored, {
        documentId: args.documentId,
        recordingId: args.recordingId,
        senderUrl: args.senderUrl,
        tabId: args.tabId,
      })
    ) {
      return false;
    }
    return publishGrantToCache(stored, operationGeneration, authorityGeneration);
  } finally {
    releaseMutationPermit();
  }
}

function matchesCameraRecorderDocument(
  grant: CameraRecorderGrant,
  args: { documentId: string; recordingId: string; senderUrl: string; tabId: number }
): boolean {
  return (
    grant.documentId === args.documentId &&
    grant.recordingId === args.recordingId &&
    grant.senderUrl === args.senderUrl &&
    grant.tabId === args.tabId
  );
}

export async function clearCameraRecorderControlGrant(recordingId?: string): Promise<boolean> {
  const operationGeneration = beginCacheOperation();
  const cleared = await clearStoredCameraRecorderGrant(recordingId);
  if (
    cleared &&
    operationGeneration === cacheOperationGeneration &&
    (!recordingId || activeGrant?.recordingId === recordingId)
  ) {
    clearGrantCache();
  }
  return cleared;
}

export function forgetCameraRecorderControlGrant(recordingId?: string): void {
  beginCacheOperation();
  if (!recordingId || activeGrant?.recordingId === recordingId) {
    clearGrantCache();
  }
}
