import { createSecureRandomUuid } from '@sniptale/platform/security/secure-random-id';

const SNAPSHOT_SESSION_TTL_MS = 5 * 60 * 1000;
const MAX_SESSION_ASSET_URLS = 500;
const SNAPSHOT_ASSET_COLLECTION_BUDGET_MS = 45_000;

type SnapshotSession = {
  activeAssetFetchControllers: Set<AbortController>;
  assetFetchDeadlineAt: number;
  allowAnonymousCrossOriginAssets: boolean;
  assetId: string | null;
  allowedUrls: Set<string>;
  cancelRequested: boolean;
  expiresAt: number;
  requestId: string;
  saveState: 'open' | 'saving' | 'saved';
  tabId: number;
};

type PendingCaptureRequest = {
  allowAnonymousCrossOriginAssets: boolean;
  createdAt: number;
};

const sessions = new Map<string, SnapshotSession>();
const sessionExpiryTimers = new Map<string, ReturnType<typeof setTimeout>>();
const pendingCaptureRequests = new Map<string, PendingCaptureRequest>();
const cancelledCaptureRequests = new Map<string, number>();

function createSnapshotSessionId(): string {
  return createSecureRandomUuid('Secure random values are unavailable for web snapshot sessions');
}

function clearSessionExpiryTimer(sessionId: string): void {
  const timer = sessionExpiryTimers.get(sessionId);
  if (timer !== undefined) clearTimeout(timer);
  sessionExpiryTimers.delete(sessionId);
}

function expireSession(sessionId: string, session: SnapshotSession): void {
  if (sessions.get(sessionId) !== session) return;
  if (session.saveState === 'saving') return;
  abortActiveAssetFetches(session, new Error('Web snapshot asset session expired'));
  sessions.delete(sessionId);
  clearSessionExpiryTimer(sessionId);
}

function abortActiveAssetFetches(session: SnapshotSession, reason: Error): void {
  for (const controller of session.activeAssetFetchControllers) controller.abort(reason);
  session.activeAssetFetchControllers.clear();
}

function scheduleSessionExpiry(sessionId: string, session: SnapshotSession): void {
  clearSessionExpiryTimer(sessionId);
  session.expiresAt = Date.now() + SNAPSHOT_SESSION_TTL_MS;
  sessionExpiryTimers.set(
    sessionId,
    setTimeout(() => expireSession(sessionId, session), SNAPSHOT_SESSION_TTL_MS + 1)
  );
}

function purgeExpiredSessions(now = Date.now()): void {
  for (const [sessionId, session] of sessions.entries()) {
    if (session.saveState !== 'saving' && now > session.expiresAt) {
      expireSession(sessionId, session);
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
  const session: SnapshotSession = {
    activeAssetFetchControllers: new Set(),
    assetFetchDeadlineAt: Date.now() + SNAPSHOT_ASSET_COLLECTION_BUDGET_MS,
    allowAnonymousCrossOriginAssets: request.allowAnonymousCrossOriginAssets,
    assetId: null,
    allowedUrls,
    cancelRequested: false,
    expiresAt: 0,
    requestId,
    saveState: 'open',
    tabId,
  };
  sessions.set(sessionId, session);
  scheduleSessionExpiry(sessionId, session);
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

function resolveAuthorizedWebSnapshotAssetFetch(args: {
  sessionId: string;
  tabId: number;
  url: string;
}): SnapshotSession {
  const session = getAuthorizedSession(args.sessionId, args.tabId);
  assertSessionNotCancelled(session);
  if (session.saveState !== 'open') {
    throw new Error('Web snapshot session is not open');
  }
  if (!session.allowedUrls.has(normalizeAssetUrl(args.url))) {
    throw new Error('Web snapshot asset was not registered for this session');
  }
  return session;
}

export function authorizeWebSnapshotAssetFetch(args: {
  sessionId: string;
  tabId: number;
  url: string;
}): void {
  resolveAuthorizedWebSnapshotAssetFetch(args);
}

export function beginWebSnapshotAssetFetch(args: {
  sessionId: string;
  tabId: number;
  url: string;
}): { abort(reason?: unknown): void; release(): void; signal: AbortSignal; timeoutMs: number } {
  const session = resolveAuthorizedWebSnapshotAssetFetch(args);
  const controller = new AbortController();
  session.activeAssetFetchControllers.add(controller);
  return {
    abort: (reason) => controller.abort(reason),
    release: () => session.activeAssetFetchControllers.delete(controller),
    signal: controller.signal,
    timeoutMs: Math.max(0, session.assetFetchDeadlineAt - Date.now()),
  };
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
  clearSessionExpiryTimer(args.sessionId);
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
  scheduleSessionExpiry(args.sessionId, session);
}

export function retainWebSnapshotSaveAfterCompensationFailure(args: {
  assetId: string;
  sessionId: string;
  tabId: number;
}): void {
  const session = getAuthorizedSession(args.sessionId, args.tabId);
  if (session.saveState !== 'saving') {
    throw new Error('Web snapshot session is not awaiting compensation');
  }
  session.saveState = 'saved';
  session.assetId = args.assetId;
  scheduleSessionExpiry(args.sessionId, session);
}

export function cancelWebSnapshotCaptureRequest(
  tabId: number,
  requestId: string
): { committedAssetIds: string[] } {
  purgeExpiredSessions();
  const requestKey = createCaptureRequestKey(tabId, requestId);
  pendingCaptureRequests.delete(requestKey);
  cancelledCaptureRequests.set(requestKey, Date.now());
  const committedAssetIds: string[] = [];
  for (const session of sessions.values()) {
    if (session.tabId !== tabId || session.requestId !== requestId) continue;
    session.cancelRequested = true;
    abortActiveAssetFetches(session, new Error('Web snapshot save was cancelled'));
    if (session.assetId) committedAssetIds.push(session.assetId);
  }
  return { committedAssetIds };
}

export function resetWebSnapshotAssetSessionsForTests(): void {
  for (const sessionId of sessionExpiryTimers.keys()) clearSessionExpiryTimer(sessionId);
  for (const session of sessions.values()) {
    abortActiveAssetFetches(session, new Error('Web snapshot asset sessions were reset'));
  }
  sessions.clear();
  pendingCaptureRequests.clear();
  cancelledCaptureRequests.clear();
}
