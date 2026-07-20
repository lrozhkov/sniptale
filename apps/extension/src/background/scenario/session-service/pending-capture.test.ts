import { beforeEach, expect, it, vi } from 'vitest';

const {
  clearPendingScenarioCaptureAssetMock,
  readStoredScenarioSessionsMock,
  resolvePendingScenarioCaptureMock,
  stagePendingScenarioCaptureMock,
  writeStoredScenarioSessionsMock,
} = vi.hoisted(() => ({
  clearPendingScenarioCaptureAssetMock: vi.fn(),
  readStoredScenarioSessionsMock: vi.fn(),
  resolvePendingScenarioCaptureMock: vi.fn(),
  stagePendingScenarioCaptureMock: vi.fn(),
  writeStoredScenarioSessionsMock: vi.fn(),
}));

vi.mock('../../storage/scenario/session', () => ({
  readStoredScenarioSessions: readStoredScenarioSessionsMock,
  writeStoredScenarioSessions: writeStoredScenarioSessionsMock,
}));

vi.mock('./pending-assets', () => ({
  clearPendingScenarioCaptureAsset: clearPendingScenarioCaptureAssetMock,
  resolvePendingScenarioCapture: resolvePendingScenarioCaptureMock,
  stagePendingScenarioCapture: stagePendingScenarioCaptureMock,
}));

import { ScenarioSessionService } from './service/index';
import {
  createExpectedPersistedPendingCaptureState,
  createPendingScenarioCaptureInput,
  createStoredPendingScenarioCapture,
  createStoredScenarioTabState,
} from './test-support';

function createStoredPendingCaptureState(pendingCapture = createStoredPendingScenarioCapture()) {
  return new Map([
    [
      12,
      createStoredScenarioTabState({
        captureMode: 'by-click',
        pendingCapture,
        pendingProjectSelection: true,
        projectId: null,
        projectName: null,
        rememberProjectSelection: true,
        surface: {
          screenshotMode: false,
          toolbarVisible: true,
          captureAction: 'scenario',
        },
      }),
    ],
  ]);
}

beforeEach(() => {
  vi.clearAllMocks();
  readStoredScenarioSessionsMock.mockResolvedValue(new Map());
  writeStoredScenarioSessionsMock.mockResolvedValue(undefined);
  clearPendingScenarioCaptureAssetMock.mockResolvedValue(undefined);
  resolvePendingScenarioCaptureMock.mockImplementation(async (capture) =>
    capture
      ? {
          ...capture,
          dataUrl: 'data:image/png;base64,resolved',
        }
      : null
  );
  stagePendingScenarioCaptureMock.mockImplementation(async (_tabId, capture) => ({
    id: capture.id,
    pendingAssetId: 'pending-asset-1',
    filename: capture.filename,
    galleryAssetId: capture.galleryAssetId,
    captureSurface: capture.captureSurface,
    sourceKind: capture.sourceKind,
    page: capture.page,
    target: capture.target,
    interactionPoint: capture.interactionPoint,
    cursorPoint: capture.cursorPoint,
    title: capture.title,
    body: capture.body,
  }));
});

it('rehydrates pending captures from storage so restart-like flows keep the first capture', async () => {
  const pendingCapture = createStoredPendingScenarioCapture();
  readStoredScenarioSessionsMock.mockResolvedValue(createStoredPendingCaptureState(pendingCapture));

  const service = new ScenarioSessionService();

  expect(await service.getSession(12)).toEqual({
    enabled: true,
    captureMode: 'by-click',
    projectId: null,
    projectName: null,
    rememberProjectSelection: true,
    pendingProjectSelection: true,
    sidebarVisible: true,
  });
  expect(service.getPendingCapture(12)).toEqual(pendingCapture);

  await service.setActiveProject(12, { id: null, name: null }, { rememberProjectSelection: false });

  expect(await service.getSession(12)).toEqual({
    enabled: true,
    captureMode: 'by-click',
    projectId: null,
    projectName: null,
    rememberProjectSelection: true,
    pendingProjectSelection: true,
    sidebarVisible: true,
  });
  expect(writeStoredScenarioSessionsMock).toHaveBeenLastCalledWith(
    createExpectedPersistedPendingCaptureState(pendingCapture)
  );
});

it('persists pending-capture removal when consumePendingCapture is used', async () => {
  const service = new ScenarioSessionService();

  await service.bufferPendingCapture(14, createPendingScenarioCaptureInput());

  expect(await service.consumePendingCapture(14)).toEqual({
    ...createStoredPendingScenarioCapture(),
    dataUrl: 'data:image/png;base64,resolved',
  });
  expect(writeStoredScenarioSessionsMock).toHaveBeenLastCalledWith(
    new Map([
      [
        14,
        {
          session: {
            enabled: false,
            captureMode: 'manual',
            projectId: null,
            projectName: null,
            rememberProjectSelection: false,
            pendingProjectSelection: false,
            sidebarVisible: true,
          },
          surface: {
            screenshotMode: false,
            toolbarVisible: false,
            captureAction: 'download_default',
          },
          pendingCapture: null,
        },
      ],
    ])
  );
});

it('clears stale pending state when the temp asset cannot be resolved after recovery', async () => {
  const pendingCapture = createStoredPendingScenarioCapture();
  readStoredScenarioSessionsMock.mockResolvedValue(createStoredPendingCaptureState(pendingCapture));
  resolvePendingScenarioCaptureMock.mockResolvedValue(null);

  const service = new ScenarioSessionService();

  await expect(service.resolvePendingCapture(12)).resolves.toBeNull();
  expect(await service.getSession(12)).toEqual({
    enabled: true,
    captureMode: 'by-click',
    projectId: null,
    projectName: null,
    rememberProjectSelection: true,
    pendingProjectSelection: false,
    sidebarVisible: true,
  });
  expect(writeStoredScenarioSessionsMock).toHaveBeenLastCalledWith(
    new Map([
      [
        12,
        {
          session: {
            enabled: true,
            captureMode: 'by-click',
            projectId: null,
            projectName: null,
            rememberProjectSelection: true,
            pendingProjectSelection: false,
            sidebarVisible: true,
          },
          surface: {
            screenshotMode: false,
            toolbarVisible: true,
            captureAction: 'scenario',
          },
          pendingCapture: null,
        },
      ],
    ])
  );
});
