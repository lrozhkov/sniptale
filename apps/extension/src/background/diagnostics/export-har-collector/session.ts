import { browserDebugger } from '@sniptale/platform/browser/debugger';
import { browserTabs } from '@sniptale/platform/browser/tabs';
import { createLogger } from '@sniptale/platform/observability/logger';
import { isCapabilityContextAuthorized } from '@sniptale/platform/security/capability-context';
import { armDebuggerActivation } from '../../debugger/session/activation';
import { attachDebugger } from '../../debugger/session/attach';
import { detachDebugger } from '../../debugger/session/detach';
import { runWithDiagnosticsMutationPermit } from '../lifecycle-gate';
import { resolveHarBrowserInfo } from './browser-info';
import {
  buildHarPayload,
  isDebuggerConflictError,
  type ExportHarCaptureResult,
  type ExportHarStartResult,
} from './helpers';
import { buildHarUrl, type HarSanitizationMode } from './sanitization';
import { createExportHarSession, isExportHarSessionExpired } from './session-factory';
import { clearExpiredExportHarSession, detachExportHarSession } from './session-lifecycle';
import { scheduleExportHarSessionExpiry } from './session-expiry-orchestrator';
import {
  clearExportHarSession,
  getExportHarSession,
  getExportHarSessionIdForTab,
  hasExportHarSession,
  registerExportHarSession,
} from './session-state';
import {
  consumeExportHarStartAuthorization,
  type ExportHarStartPreauthorization,
} from './start-capability';

const logger = createLogger({ namespace: 'ExportHAR' });

async function enableHarNetworkCapture(tabId: number): Promise<void> {
  await browserDebugger.sendCommand({ tabId }, 'Network.enable', {
    maxTotalBufferSize: 10000000,
    maxResourceBufferSize: 5000000,
  });
}

async function detachAfterHarStartupFailure(tabId: number): Promise<void> {
  try {
    await browserDebugger.sendCommand({ tabId }, 'Network.disable');
  } catch (disableError) {
    logger.warn('Failed to disable Network after HAR startup failure', disableError);
  }
  try {
    await detachDebugger(tabId, 'export-har');
  } catch (detachError) {
    logger.warn('Failed to detach debugger after HAR startup failure', detachError);
  }
}

function normalizeHarStartupError(error: unknown): unknown {
  return isDebuggerConflictError(error)
    ? new Error('HAR collection is unavailable because another debugger client owns the tab.')
    : error;
}

async function ensureHarStartSlot(sessionId: string, tabId: number): Promise<void> {
  await clearExpiredExportHarSession(getExportHarSession(sessionId));

  if (hasExportHarSession(sessionId)) {
    throw new Error(`HAR session "${sessionId}" is already active.`);
  }

  const activeTabSessionId = getExportHarSessionIdForTab(tabId);
  await clearExpiredExportHarSession(
    activeTabSessionId ? getExportHarSession(activeTabSessionId) : undefined
  );

  const refreshedActiveTabSessionId = getExportHarSessionIdForTab(tabId);
  if (refreshedActiveTabSessionId) {
    throw new Error(
      `HAR session "${refreshedActiveTabSessionId}" is already active for tab ${tabId}.`
    );
  }
}

async function attachHarDebugger(tabId: number): Promise<void> {
  let debuggerAttached = false;

  try {
    await attachDebugger(
      tabId,
      'export-har',
      armDebuggerActivation({ client: 'export-har', reason: 'har-export-start', tabId })
    );
    debuggerAttached = true;
    await enableHarNetworkCapture(tabId);
  } catch (error) {
    if (debuggerAttached) {
      await detachAfterHarStartupFailure(tabId);
    }

    throw normalizeHarStartupError(error);
  }
}

export async function startExportHarSession(
  sessionId: string,
  tabId: number,
  startAuthorization: string | ExportHarStartPreauthorization | undefined,
  senderUrl?: string | undefined
): Promise<ExportHarStartResult> {
  return runWithDiagnosticsMutationPermit(
    () => startExportHarSessionWithPermit(sessionId, tabId, startAuthorization, senderUrl),
    'HAR mutation rejected during local data erasure'
  );
}

async function startExportHarSessionWithPermit(
  sessionId: string,
  tabId: number,
  startAuthorization: string | ExportHarStartPreauthorization | undefined,
  senderUrl?: string | undefined
): Promise<ExportHarStartResult> {
  if (!startAuthorization) {
    throw new Error(`HAR session "${sessionId}" requires a start capability token.`);
  }
  if (typeof startAuthorization !== 'string' && typeof startAuthorization !== 'object') {
    throw new Error(`HAR session "${sessionId}" requires a start capability token.`);
  }
  const { rawDiagnosticsEnabled } = consumeExportHarStartAuthorization({
    senderUrl,
    sessionId,
    startAuthorization,
    tabId,
  });
  await ensureHarStartSlot(sessionId, tabId);

  const tabUrl = (await browserTabs.get(tabId)).url;
  const mode: HarSanitizationMode = rawDiagnosticsEnabled ? 'raw' : 'sanitized';
  const pageUrl = buildHarUrl(tabUrl ?? '', mode);
  await attachHarDebugger(tabId);

  const { browserName, browserVersion } = await resolveHarBrowserInfo(tabId);
  const session = createExportHarSession({
    browserName,
    browserVersion,
    pageUrl,
    rawDiagnosticsEnabled,
    sessionId,
    tabId,
  });
  registerExportHarSession(session, scheduleExportHarSessionExpiry(session));

  return {
    capabilityToken: session.capabilityToken,
    expiresAtEpochMs: session.expiresAtEpochMs,
  };
}

export async function stopExportHarSession(
  sessionId: string,
  resolvedTabId: number,
  capabilityToken: string
): Promise<ExportHarCaptureResult> {
  return runWithDiagnosticsMutationPermit(
    () => stopExportHarSessionWithPermit(sessionId, resolvedTabId, capabilityToken),
    'HAR mutation rejected during local data erasure'
  );
}

async function stopExportHarSessionWithPermit(
  sessionId: string,
  resolvedTabId: number,
  capabilityToken: string
): Promise<ExportHarCaptureResult> {
  const session = getExportHarSession(sessionId);
  if (!session) {
    throw new Error(`HAR session "${sessionId}" was not found.`);
  }
  if (session.tabId !== resolvedTabId) {
    throw new Error(`HAR session "${sessionId}" is not active for tab ${resolvedTabId}.`);
  }
  if (isExportHarSessionExpired(session)) {
    await detachExportHarSession(session);
    throw new Error(`HAR session "${sessionId}" expired.`);
  }
  if (
    !isCapabilityContextAuthorized(session.capabilityContext, {
      scope: 'export:har',
      tabId: resolvedTabId,
      token: capabilityToken,
    })
  ) {
    throw new Error(`HAR session "${sessionId}" rejected an invalid capability token.`);
  }

  try {
    await browserDebugger.sendCommand({ tabId: session.tabId }, 'Network.disable');
  } catch (error) {
    logger.warn('Failed to disable Network domain', error);
  }

  await detachDebugger(session.tabId, 'export-har');
  const harPayload = buildHarPayload(session);
  clearExportHarSession(sessionId);
  return {
    har: harPayload,
    rawDiagnosticsEnabled: session.rawDiagnosticsEnabled,
  };
}

export function isExportHarStopCapabilityAuthorized(
  sessionId: string,
  resolvedTabId: number,
  capabilityToken: string
): boolean {
  const session = getExportHarSession(sessionId);
  return Boolean(
    session &&
    session.tabId === resolvedTabId &&
    !isExportHarSessionExpired(session) &&
    isCapabilityContextAuthorized(session.capabilityContext, {
      scope: 'export:har',
      tabId: resolvedTabId,
      token: capabilityToken,
    })
  );
}

export { handleExportHarForcedDetach, handleExportHarNavigationStart } from './session-lifecycle';
