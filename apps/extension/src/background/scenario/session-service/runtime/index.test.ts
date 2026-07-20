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

vi.mock('../../../storage/scenario/session', () => ({
  readStoredScenarioSessions: readStoredScenarioSessionsMock,
  writeStoredScenarioSessions: writeStoredScenarioSessionsMock,
}));

vi.mock('../pending-assets', () => ({
  clearPendingScenarioCaptureAsset: clearPendingScenarioCaptureAssetMock,
  resolvePendingScenarioCapture: resolvePendingScenarioCaptureMock,
  stagePendingScenarioCapture: stagePendingScenarioCaptureMock,
}));

import { createScenarioSessionServiceRuntime } from './index';

beforeEach(() => {
  vi.clearAllMocks();
  readStoredScenarioSessionsMock.mockResolvedValue(new Map());
  writeStoredScenarioSessionsMock.mockResolvedValue(undefined);
  clearPendingScenarioCaptureAssetMock.mockResolvedValue(undefined);
  resolvePendingScenarioCaptureMock.mockResolvedValue(null);
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
    captureMetadata: capture.captureMetadata,
    title: capture.title,
    body: capture.body,
  }));
});

it('hydrates once and persists tab-local runtime state through the runtime helper', async () => {
  const runtime = createScenarioSessionServiceRuntime();

  expect(await runtime.getSession(7)).toEqual({
    enabled: false,
    captureMode: 'manual',
    projectId: null,
    projectName: null,
    rememberProjectSelection: false,
    pendingProjectSelection: false,
    sidebarVisible: true,
  });
  await runtime.setEnabled(7, true);
  await runtime.clearTab(7);

  expect(readStoredScenarioSessionsMock).toHaveBeenCalledTimes(1);
  expect(writeStoredScenarioSessionsMock).toHaveBeenCalled();
});
