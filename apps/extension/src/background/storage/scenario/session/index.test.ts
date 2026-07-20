import { beforeEach, expect, it, vi } from 'vitest';

const {
  browserStorageSessionGetMock,
  browserStorageSessionRemoveMock,
  browserStorageSessionSetMock,
} = vi.hoisted(() => ({
  browserStorageSessionGetMock: vi.fn(),
  browserStorageSessionRemoveMock: vi.fn(),
  browserStorageSessionSetMock: vi.fn(),
}));

vi.mock(
  '../../../../composition/persistence/infrastructure/browser-storage',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../../../composition/persistence/infrastructure/browser-storage')
    >()),
    browserStorage: {
      session: {
        get: browserStorageSessionGetMock,
        remove: browserStorageSessionRemoveMock,
        set: browserStorageSessionSetMock,
      },
    },
  })
);

import { readStoredScenarioSessions, writeStoredScenarioSessions } from './index';
import { createStoredPendingScenarioCapture, createStoredScenarioTabState } from './test-support';

beforeEach(() => {
  vi.clearAllMocks();
  browserStorageSessionGetMock.mockResolvedValue({});
  browserStorageSessionRemoveMock.mockResolvedValue(undefined);
  browserStorageSessionSetMock.mockResolvedValue(undefined);
});

function createStoredSession(
  projectId: string,
  projectName: string,
  captureMode: 'manual' | 'by-click'
) {
  return createStoredScenarioTabState({
    captureMode,
    projectId,
    projectName,
  });
}

it('restores numeric tab sessions and ignores invalid storage payloads', async () => {
  browserStorageSessionGetMock
    .mockResolvedValueOnce({
      'scenario-tab-sessions': 'invalid',
    })
    .mockResolvedValueOnce({
      'scenario-tab-sessions': {
        '7': createStoredSession('project-7', 'Project 7', 'by-click').session,
        notANumber: {
          enabled: false,
          captureMode: 'manual',
          projectId: null,
          projectName: null,
          rememberProjectSelection: false,
          pendingProjectSelection: false,
          sidebarVisible: true,
        },
      },
    });

  expect(await readStoredScenarioSessions()).toEqual(new Map());
  expect(await readStoredScenarioSessions()).toEqual(
    new Map([[7, createStoredSession('project-7', 'Project 7', 'by-click')]])
  );
});

it('persists or removes stored sessions via browserStorage.session', async () => {
  const session = createStoredSession('project-3', 'Project 3', 'manual');

  await writeStoredScenarioSessions(new Map());
  await writeStoredScenarioSessions(new Map([[3, session]]));

  expect(browserStorageSessionRemoveMock).toHaveBeenCalledWith('scenario-tab-sessions');
  expect(browserStorageSessionSetMock).toHaveBeenCalledWith({
    'scenario-tab-sessions': {
      '3': session,
    },
  });
});

it('round-trips pending captures and keeps legacy stored sessions backward compatible', async () => {
  const storedSession = createStoredSession('project-5', 'Project 5', 'manual');
  storedSession.pendingCapture = createStoredPendingScenarioCapture();
  browserStorageSessionGetMock
    .mockResolvedValueOnce({
      'scenario-tab-sessions': {
        '5': storedSession,
      },
    })
    .mockResolvedValueOnce({
      'scenario-tab-sessions': {
        '6': {
          ...storedSession,
          pendingCapture: 'invalid',
        },
      },
    });

  expect(await readStoredScenarioSessions()).toEqual(new Map([[5, storedSession]]));
  expect(await readStoredScenarioSessions()).toEqual(
    new Map([
      [
        6,
        {
          ...storedSession,
          pendingCapture: null,
        },
      ],
    ])
  );
});

it('drops malformed persisted pending capture metadata instead of hydrating unsafe typed state', async () => {
  const storedSession = createStoredSession('project-7', 'Project 7', 'by-click');
  browserStorageSessionGetMock.mockResolvedValue({
    'scenario-tab-sessions': {
      '7': {
        ...storedSession,
        pendingCapture: {
          id: 'pending-7',
          pendingAssetId: 'pending-asset-7',
          filename: 'capture.png',
          galleryAssetId: null,
          captureSurface: 'visible',
          sourceKind: 'manual',
          page: { title: 'Page' },
          target: null,
          interactionPoint: null,
          cursorPoint: null,
          title: 'Title',
          body: '',
        },
      },
    },
  });

  expect(await readStoredScenarioSessions()).toEqual(
    new Map([
      [
        7,
        {
          ...storedSession,
          pendingCapture: null,
        },
      ],
    ])
  );
});

it('drops malformed legacy session records instead of bypassing the parser', async () => {
  const legacySession = createStoredSession('project-8', 'Project 8', 'manual').session;
  browserStorageSessionGetMock.mockResolvedValue({
    'scenario-tab-sessions': {
      '8': legacySession,
      '9': {
        enabled: true,
        captureMode: 'by-click',
        projectId: 42,
        projectName: null,
        rememberProjectSelection: false,
        pendingProjectSelection: false,
        sidebarVisible: true,
      },
    },
  });

  expect(await readStoredScenarioSessions()).toEqual(
    new Map([
      [
        8,
        {
          pendingCapture: null,
          session: legacySession,
          surface: {
            captureAction: 'download_default',
            screenshotMode: false,
            toolbarVisible: false,
          },
        },
      ],
    ])
  );
});
