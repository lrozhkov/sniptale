import { createSecureRandomUuid } from '@sniptale/platform/security/secure-random-id';
import { releaseWebSnapshotStagedBlobsForSession } from './staged-blobs';

const SNAPSHOT_SESSION_TTL_MS = 5 * 60 * 1000;
const MAX_SESSION_ASSET_URLS = 500;

type SnapshotSession = {
  allowAnonymousCrossOriginAssets: boolean;
  assetId: string | null;
  allowedUrls: Set<string>;
  cancelRequested: boolean;
  createdAt: number;
  requestId: string;
  saveState: 'open' | 'saving' | 'saved';
  tabId: number;
};

type PendingCaptureRequest = {
  allowAnonymousCrossOriginAssets: boolean;
  createdAt: number;
};

const sessions = new Map<string, SnapshotSession>();
const pendingCaptureRequests = new Map<string, PendingCaptureRequest>();
const cancelledCaptureRequests = new Map<string, number>();

function createSnapshotSessionId(): string {
  return createSecureRandomUuid('Secure random values are unavailable for web snapshot sessions');
}

function purgeExpiredSessions(now = Date.now()): void {
  for (const [sessionId, session] of sessions.entries()) {
    if (now - session.createdAt > SNAPSHOT_SESSION_TTL_MS) {
      sessions.delete(sessionId);
    }
  }

  for (const [requestKey, request] of pendingCaptureRequests.entries()) {
    if (now - request.createdAt > SNAPSHOT_SESSION_TTL_MS) {
      pendingCaptureRequests.delete(requestKey);
    }
  }
  for (const [requestKey, cancelledAt] of cancelledCaptureRequests.entries()) {
    if (now - cancelledAt > SNAPSHOT_SESSION_TTL_MS) {
      cancelledCaptureRequests.delete(requestKey);
    }
  }
}

function normalizeAssetUrl(value: string): string {
  return new URL(value).href;
}

function createCaptureRequestKey(tabId: number, requestId: string): string {
  return `${tabId}:${requestId}`;
}

export function authorizeWebSnapshotCaptureRequest(
  tabId: number,
  requestId: string,
  options: { allowAnonymousCrossOriginAssets?: boolean } = {}
): void {
  purgeExpiredSessions();
  const requestKey = createCaptureRequestKey(tabId, requestId);
  if (cancelledCaptureRequests.has(requestKey)) {
    throw new Error('Web snapshot save was cancelled');
  }
  pendingCaptureRequests.set(requestKey, {
    allowAnonymousCrossOriginAssets: options.allowAnonymousCrossOriginAssets === true,
    createdAt: Date.now(),
  });
}

function consumeWebSnapshotCaptureRequest(tabId: number, requestId: string): PendingCaptureRequest {
  purgeExpiredSessions();
  const requestKey = createCaptureRequestKey(tabId, requestId);
  if (cancelledCaptureRequests.has(requestKey)) {
    throw new Error('Web snapshot save was cancelled');
  }
  const request = pendingCaptureRequests.get(requestKey);
  if (!request) {
    throw new Error('Web snapshot capture request is not authorized');
  }
  pendingCaptureRequests.delete(requestKey);
  return request;
}

export function registerWebSnapshotAssetSession(
  tabId: number,
  requestId: string,
  assetUrls: string[]
): string {
  purgeExpiredSessions();
  if (assetUrls.length > MAX_SESSION_ASSET_URLS) {
    throw new Error('Too many web snapshot assets');
  }

  const request = consumeWebSnapshotCaptureRequest(tabId, requestId);
  if (!request.allowAnonymousCrossOriginAssets && assetUrls.length > 0) {
    throw new Error('anonymous cross-origin asset fetch is disabled');
  }

  const allowedUrls = new Set(assetUrls.map(normalizeAssetUrl));

  const sessionId = createSnapshotSessionId();
  sessions.set(sessionId, {
    allowAnonymousCrossOriginAssets: request.allowAnonymousCrossOriginAssets,
    assetId: null,
    allowedUrls,
    cancelRequested: false,
    createdAt: Date.now(),
    requestId,
    saveState: 'open',
    tabId,
  });
  return sessionId;
}

export function extendWebSnapshotAssetSession(args: {
  assetUrls: string[];
  sessionId: string;
  tabId: number;
}): void {
  const session = getAuthorizedSession(args.sessionId, args.tabId);
  assertSessionNotCancelled(session);
  if (session.saveState !== 'open') {
    throw new Error('Web snapshot session is not open');
  }
  if (!session.allowAnonymousCrossOriginAssets && args.assetUrls.length > 0) {
    throw new Error('anonymous cross-origin asset fetch is disabled');
  }
  const normalizedUrls = args.assetUrls.map(normalizeAssetUrl);
  const nextUrlCount = new Set([...session.allowedUrls, ...normalizedUrls]).size;
  if (nextUrlCount > MAX_SESSION_ASSET_URLS) {
    throw new Error('Too many web snapshot assets');
  }
  for (const url of normalizedUrls) session.allowedUrls.add(url);
}

function getAuthorizedSession(sessionId: string, tabId: number): SnapshotSession {
  purgeExpiredSessions();
  const session = sessions.get(sessionId);
  if (!session || session.tabId !== tabId) {
    throw new Error('Invalid web snapshot session');
  }
  return session;
}

function assertSessionNotCancelled(session: SnapshotSession): void {
  if (session.cancelRequested) {
    throw new Error('Web snapshot save was cancelled');
  }
}

export function authorizeWebSnapshotAssetFetch(args: {
  sessionId: string;
  tabId: number;
  url: string;
}): void {
  const session = getAuthorizedSession(args.sessionId, args.tabId);
  assertSessionNotCancelled(session);
  if (!session.allowedUrls.has(normalizeAssetUrl(args.url))) {
    throw new Error('Web snapshot asset was not registered for this session');
  }
}

export function assertWebSnapshotSessionOpen(args: { sessionId: string; tabId: number }): void {
  const session = getAuthorizedSession(args.sessionId, args.tabId);
  assertSessionNotCancelled(session);
  if (session.saveState !== 'open') {
    throw new Error('Web snapshot session is not open');
  }
}

export function assertWebSnapshotSessionOwner(args: { sessionId: string; tabId: number }): void {
  getAuthorizedSession(args.sessionId, args.tabId);
}

export function beginWebSnapshotSave(args: { sessionId: string; tabId: number }): void {
  const session = getAuthorizedSession(args.sessionId, args.tabId);
  assertSessionNotCancelled(session);
  if (session.saveState === 'saved') {
    throw new Error('Web snapshot session was already saved');
  }
  if (session.saveState === 'saving') {
    throw new Error('Web snapshot session save is already in progress');
  }
  session.saveState = 'saving';
}

export function commitWebSnapshotSave(args: {
  assetId: string;
  sessionId: string;
  tabId: number;
}): void {
  const session = getAuthorizedSession(args.sessionId, args.tabId);
  assertSessionNotCancelled(session);
  session.saveState = 'saved';
  session.assetId = args.assetId;
}

export function releaseWebSnapshotSave(args: { sessionId: string; tabId: number }): void {
  const session = getAuthorizedSession(args.sessionId, args.tabId);
  if (session.saveState === 'saving') {
    session.saveState = 'open';
  }
}

export function cancelWebSnapshotCaptureRequest(tabId: number, requestId: string): string[] {
  purgeExpiredSessions();
  const requestKey = createCaptureRequestKey(tabId, requestId);
  pendingCaptureRequests.delete(requestKey);
  cancelledCaptureRequests.set(requestKey, Date.now());
  const committedAssetIds: string[] = [];
  for (const [sessionId, session] of sessions) {
    if (session.tabId !== tabId || session.requestId !== requestId) continue;
    session.cancelRequested = true;
    releaseWebSnapshotStagedBlobsForSession({ snapshotSessionId: sessionId, tabId });
    if (session.assetId) committedAssetIds.push(session.assetId);
  }
  return committedAssetIds;
}

export function resetWebSnapshotAssetSessionsForTests(): void {
  sessions.clear();
  pendingCaptureRequests.clear();
  cancelledCaptureRequests.clear();
}
