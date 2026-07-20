import {
  createCapabilityContext,
  resolveCapabilityOrigin,
} from '@sniptale/platform/security/capability-context';
import type { ExportHarSession } from './helpers';

const EXPORT_HAR_SESSION_TTL_MS = 10 * 60 * 1000;

function createHarCapabilityToken(): string {
  return crypto.randomUUID();
}

function createHarSessionExpiry(nowEpochMs = Date.now()): number {
  return nowEpochMs + EXPORT_HAR_SESSION_TTL_MS;
}

export function isExportHarSessionExpired(session: ExportHarSession): boolean {
  return Date.now() >= session.expiresAtEpochMs;
}

export function createExportHarSession(args: {
  browserName: string;
  browserVersion: string;
  pageUrl: string;
  rawDiagnosticsEnabled: boolean;
  sessionId: string;
  tabId: number;
}): ExportHarSession {
  const capabilityToken = createHarCapabilityToken();
  const expiresAtEpochMs = createHarSessionExpiry();

  return {
    capabilityContext: createCapabilityContext({
      expiresAtEpochMs,
      origin: resolveCapabilityOrigin(args.pageUrl),
      scopes: ['export:har'],
      tabId: args.tabId,
      token: capabilityToken,
    }),
    capabilityToken,
    expiresAtEpochMs,
    sessionId: args.sessionId,
    tabId: args.tabId,
    pageId: `page_${args.sessionId}`,
    pageUrl: args.pageUrl,
    rawDiagnosticsEnabled: args.rawDiagnosticsEnabled,
    browserName: args.browserName,
    browserVersion: args.browserVersion,
    startedAtIso: new Date().toISOString(),
    pendingEntries: new Map(),
    completedEntries: [],
  };
}
