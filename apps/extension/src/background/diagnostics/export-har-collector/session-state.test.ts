import { beforeEach, expect, it, vi } from 'vitest';

const { getTabIdByTargetIdMock } = vi.hoisted(() => ({
  getTabIdByTargetIdMock: vi.fn(),
}));

vi.mock('../../debugger/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../debugger/session')>()),
  getTabIdByTargetId: getTabIdByTargetIdMock,
}));

import {
  clearExportHarSession,
  clearExportHarSessionForTab,
  getExportHarSession,
  getExportHarSessionForSource,
  getExportHarSessionIdForTab,
  hasExportHarSession,
  registerExportHarSession,
} from './session-state';
import type { ExportHarSession } from './helpers';
import { createCapabilityContext } from '@sniptale/platform/security/capability-context';

function createSession(
  props?: Partial<Omit<ExportHarSession, 'capabilityContext'>>
): ExportHarSession {
  const expiresAtEpochMs = Date.now() + 60000;
  return {
    browserName: 'Chrome',
    browserVersion: '123.0.0.0',
    capabilityContext: createCapabilityContext({
      expiresAtEpochMs,
      origin: 'https://example.test',
      scopes: ['export:har'],
      tabId: props?.tabId ?? 7,
      token: 'har-token',
    }),
    capabilityToken: 'har-token',
    completedEntries: [],
    expiresAtEpochMs,
    pageId: 'page-1',
    pageUrl: 'https://example.test/page',
    rawDiagnosticsEnabled: false,
    pendingEntries: new Map(),
    sessionId: 'session-1',
    startedAtIso: '2024-01-01T00:00:00.000Z',
    tabId: 7,
    ...props,
  };
}

beforeEach(() => {
  getTabIdByTargetIdMock.mockReset();
  clearExportHarSessionForTab(7);
  clearExportHarSession('session-1');
  clearExportHarSession('session-2');
});

it('registers and clears HAR sessions by session id and tab id', () => {
  const session = createSession();

  registerExportHarSession(session);

  expect(hasExportHarSession('session-1')).toBe(true);
  expect(getExportHarSession('session-1')).toBe(session);
  expect(getExportHarSessionIdForTab(7)).toBe('session-1');

  clearExportHarSession('session-1');

  expect(hasExportHarSession('session-1')).toBe(false);
  expect(getExportHarSessionIdForTab(7)).toBeUndefined();
});

it('resolves sessions from debugger sources using tab ids and target ids', () => {
  registerExportHarSession(createSession());
  registerExportHarSession(
    createSession({
      sessionId: 'session-2',
      tabId: 19,
    })
  );
  getTabIdByTargetIdMock.mockReturnValue(19);

  expect(getExportHarSessionForSource({ tabId: 7 })).toMatchObject({
    sessionId: 'session-1',
  });
  expect(getExportHarSessionForSource({ targetId: 'target-19' })).toMatchObject({
    sessionId: 'session-2',
  });

  clearExportHarSessionForTab(19);

  expect(getExportHarSessionForSource({ targetId: 'target-19' })).toBeNull();
});
