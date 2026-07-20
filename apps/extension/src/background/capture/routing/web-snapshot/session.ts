import { createSecureRandomUuid } from '@sniptale/platform/security/secure-random-id';

const SNAPSHOT_SESSION_TTL_MS = 5 * 60 * 1000;
const MAX_SESSION_ASSET_URLS = 500;

type SnapshotSession = {
  allowedUrls: Set<string>;
  createdAt: number;
  saveState: 'open' | 'saving' | 'saved';
  tabId: number;
};

type PendingCaptureRequest = {
  allowAnonymousCrossOriginAssets: boolean;
  createdAt: number;
};

const sessions = new Map<string, SnapshotSession>();
const pendingCaptureRequests = new Map<string, PendingCaptureRequest>();

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
  pendingCaptureRequests.set(createCaptureRequestKey(tabId, requestId), {
    allowAnonymousCrossOriginAssets: options.allowAnonymousCrossOriginAssets === true,
    createdAt: Date.now(),
  });
}

function consumeWebSnapshotCaptureRequest(tabId: number, requestId: string): PendingCaptureRequest {
  purgeExpiredSessions();
  const requestKey = createCaptureRequestKey(tabId, requestId);
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
    allowedUrls,
    createdAt: Date.now(),
    saveState: 'open',
    tabId,
  });
  return sessionId;
}

function getAuthorizedSession(sessionId: string, tabId: number): SnapshotSession {
  purgeExpiredSessions();
  const session = sessions.get(sessionId);
  if (!session || session.tabId !== tabId) {
    throw new Error('Invalid web snapshot session');
  }
  return session;
}

export function authorizeWebSnapshotAssetFetch(args: {
  sessionId: string;
  tabId: number;
  url: string;
}): void {
  const session = getAuthorizedSession(args.sessionId, args.tabId);
  if (!session.allowedUrls.has(normalizeAssetUrl(args.url))) {
    throw new Error('Web snapshot asset was not registered for this session');
  }
}

export function assertWebSnapshotSessionOpen(args: { sessionId: string; tabId: number }): void {
  const session = getAuthorizedSession(args.sessionId, args.tabId);
  if (session.saveState !== 'open') {
    throw new Error('Web snapshot session is not open');
  }
}

export function beginWebSnapshotSave(args: { sessionId: string; tabId: number }): void {
  const session = getAuthorizedSession(args.sessionId, args.tabId);
  if (session.saveState === 'saved') {
    throw new Error('Web snapshot session was already saved');
  }
  if (session.saveState === 'saving') {
    throw new Error('Web snapshot session save is already in progress');
  }
  session.saveState = 'saving';
}

export function commitWebSnapshotSave(args: { sessionId: string; tabId: number }): void {
  const session = getAuthorizedSession(args.sessionId, args.tabId);
  session.saveState = 'saved';
}

export function releaseWebSnapshotSave(args: { sessionId: string; tabId: number }): void {
  const session = getAuthorizedSession(args.sessionId, args.tabId);
  if (session.saveState === 'saving') {
    session.saveState = 'open';
  }
}

export function resetWebSnapshotAssetSessionsForTests(): void {
  sessions.clear();
  pendingCaptureRequests.clear();
}
