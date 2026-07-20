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
  createPendingScenarioCaptureInput,
  createStoredPendingScenarioCapture,
} from './test-support';

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
    captureMetadata: capture.captureMetadata,
    title: capture.title,
    body: capture.body,
  }));
});

it('hydrates stored sessions and returns cloned state snapshots', async () => {
  readStoredScenarioSessionsMock.mockResolvedValue(
    new Map([
      [
        7,
        {
          session: {
            enabled: true,
            captureMode: 'by-click',
            projectId: 'project-7',
            projectName: 'Project 7',
            rememberProjectSelection: true,
            pendingProjectSelection: false,
            sidebarVisible: true,
          },
          surface: {
            screenshotMode: true,
            toolbarVisible: true,
            captureAction: 'scenario',
          },
        },
      ],
    ])
  );

  const service = new ScenarioSessionService();
  const session = await service.getSession(7);
  session.projectName = 'Mutated outside';

  expect(await service.getSession(7)).toEqual({
    enabled: true,
    captureMode: 'by-click',
    projectId: 'project-7',
    projectName: 'Project 7',
    rememberProjectSelection: true,
    pendingProjectSelection: false,
    sidebarVisible: true,
  });
  expect(readStoredScenarioSessionsMock).toHaveBeenCalledTimes(1);
});

it('updates enabled state, capture mode, and remember-project behavior per tab', async () => {
  const service = new ScenarioSessionService();

  expect(await service.setEnabled(3, true)).toEqual({
    enabled: true,
    captureMode: 'manual',
    projectId: null,
    projectName: null,
    rememberProjectSelection: false,
    pendingProjectSelection: false,
    sidebarVisible: true,
  });
  expect(await service.setCaptureMode(3, 'by-click')).toEqual({
    enabled: true,
    captureMode: 'by-click',
    projectId: null,
    projectName: null,
    rememberProjectSelection: false,
    pendingProjectSelection: false,
    sidebarVisible: true,
  });

  await service.setActiveProject(
    3,
    { id: 'project-3', name: 'Project 3' },
    { rememberProjectSelection: true }
  );
  expect(await service.setActiveProject(3, { id: 'project-3', name: 'Project 3' })).toEqual({
    enabled: true,
    captureMode: 'by-click',
    projectId: 'project-3',
    projectName: 'Project 3',
    rememberProjectSelection: true,
    pendingProjectSelection: false,
    sidebarVisible: true,
  });
  expect(await service.setActiveProject(3, { id: null, name: null })).toEqual({
    enabled: true,
    captureMode: 'by-click',
    projectId: null,
    projectName: null,
    rememberProjectSelection: true,
    pendingProjectSelection: false,
    sidebarVisible: true,
  });
});

it('tracks recorder surface state separately from scenario session state', async () => {
  const service = new ScenarioSessionService();

  expect(
    await service.updateSurfaceState(3, {
      screenshotMode: true,
      toolbarVisible: true,
      captureAction: 'scenario',
    })
  ).toEqual({
    screenshotMode: true,
    toolbarVisible: true,
    captureAction: 'scenario',
  });

  expect(await service.setRememberProjectSelection(3, true)).toEqual({
    enabled: false,
    captureMode: 'manual',
    projectId: null,
    projectName: null,
    rememberProjectSelection: true,
    pendingProjectSelection: false,
    sidebarVisible: true,
  });
});

it('delegates restore snapshots, sidebar visibility, and resolved pending captures', async () => {
  const service = new ScenarioSessionService();
  const pendingCapture = createPendingScenarioCaptureInput();
  const surface = await service.updateSurfaceState(11, {
    screenshotMode: true,
    toolbarVisible: false,
    captureAction: 'scenario',
  });

  expect(surface).toEqual({
    screenshotMode: true,
    toolbarVisible: false,
    captureAction: 'scenario',
  });
  expect(await service.setSidebarVisible(11, false)).toEqual({
    enabled: false,
    captureMode: 'manual',
    projectId: null,
    projectName: null,
    rememberProjectSelection: false,
    pendingProjectSelection: false,
    sidebarVisible: false,
  });

  await service.bufferPendingCapture(11, pendingCapture);

  expect(service.hasPendingCapture(11)).toBe(true);
  expect(await service.resolvePendingCapture(11)).toEqual({
    ...createStoredPendingScenarioCapture(),
    dataUrl: 'data:image/png;base64,resolved',
  });
  expect(await service.getSurface(11)).toEqual(surface);
  expect(await service.getRestoreSnapshot(11, 4)).toEqual({
    projectRevision: 4,
    session: {
      enabled: false,
      captureMode: 'manual',
      projectId: null,
      projectName: null,
      rememberProjectSelection: false,
      pendingProjectSelection: true,
      sidebarVisible: false,
    },
    surface,
  });
});

it('tracks pending first capture and clears tab-scoped state', async () => {
  const service = new ScenarioSessionService();
  const pendingCapture = createPendingScenarioCaptureInput();
  const storedPendingCapture = createStoredPendingScenarioCapture();

  const bufferedSession = await service.bufferPendingCapture(9, pendingCapture);
  const selectedSession = await service.setActiveProject(
    9,
    { id: 'project-9', name: 'Project 9' },
    { rememberProjectSelection: true }
  );

  expect(bufferedSession.pendingProjectSelection).toBe(true);
  expect(selectedSession).toEqual({
    enabled: false,
    captureMode: 'manual',
    projectId: 'project-9',
    projectName: 'Project 9',
    rememberProjectSelection: true,
    pendingProjectSelection: false,
    sidebarVisible: true,
  });
  expect(service.getPendingCapture(9)).toEqual(storedPendingCapture);
  expect(await service.consumePendingCapture(9)).toEqual({
    ...storedPendingCapture,
    dataUrl: 'data:image/png;base64,resolved',
  });
  expect(service.getPendingCapture(9)).toBeNull();

  await service.clearTab(9);
  expect(await service.getSession(9)).toEqual({
    enabled: false,
    captureMode: 'manual',
    projectId: null,
    projectName: null,
    rememberProjectSelection: false,
    pendingProjectSelection: false,
    sidebarVisible: true,
  });
  expect(writeStoredScenarioSessionsMock).toHaveBeenCalled();
});

it('clears only the pending-capture flag when the pending buffer is removed', async () => {
  const service = new ScenarioSessionService();

  await service.bufferPendingCapture(5, createPendingScenarioCaptureInput());
  expect(await service.clearPendingCapture(5)).toEqual({
    enabled: false,
    captureMode: 'manual',
    projectId: null,
    projectName: null,
    rememberProjectSelection: false,
    pendingProjectSelection: false,
    sidebarVisible: true,
  });
  expect(service.getPendingCapture(5)).toBeNull();
  expect(await service.consumePendingCapture(5)).toBeNull();
});

it('owns monotonic project revisions independently from project timestamps', async () => {
  const service = new ScenarioSessionService();

  expect(service.syncProjectRevision(12)).toBe(0);
  expect(service.syncProjectRevision(13, { hasActiveProject: true })).toBe(1);
  expect(await service.bumpProjectRevision(13)).toBe(2);
  expect(await service.bumpProjectRevision(13)).toBe(3);
  expect(service.syncProjectRevision(13, { hasActiveProject: true })).toBe(3);

  await service.clearTab(13);
  expect(service.syncProjectRevision(13)).toBe(0);
});
