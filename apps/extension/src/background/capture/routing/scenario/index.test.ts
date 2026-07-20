import { beforeEach, expect, it, vi } from 'vitest';

const { ensureScenarioCaptureProjectMock, saveScenarioCaptureSlideToProjectMock } = vi.hoisted(
  () => ({
    ensureScenarioCaptureProjectMock: vi.fn(async () => ({
      id: 'project-auto',
      name: 'Auto project',
    })),
    saveScenarioCaptureSlideToProjectMock: vi.fn(),
  })
);

vi.mock('../../../../composition/persistence/scenario/store/v3', () => ({
  saveScenarioCaptureSlideToProject: saveScenarioCaptureSlideToProjectMock,
}));

vi.mock('../../../scenario/router/project-selection', () => ({
  ensureScenarioCaptureProject: ensureScenarioCaptureProjectMock,
}));

import { persistScenarioCaptureFromBackground } from './index';
import { createScenarioSessionServiceStub } from '../../../../../../../tooling/test/support/scenario-session-service.stub';
import {
  createCaptureMetadata,
  createMinimalScenarioCapturePayload,
  createPendingCapture,
  createScenarioCapturePayload,
  createSessionState,
} from './test-helpers';

beforeEach(() => {
  vi.clearAllMocks();
  saveScenarioCaptureSlideToProjectMock.mockResolvedValue(undefined);
});

it('auto-creates a project and saves the first capture without an active project', async () => {
  const scenarioSessionService = createScenarioSessionServiceStub();
  vi.mocked(scenarioSessionService.getSession).mockResolvedValue(
    createSessionState({ enabled: true, captureMode: 'by-click' })
  );

  await persistScenarioCaptureFromBackground({
    dataUrl: 'data:image/png;base64,buffer',
    galleryAssetId: 'gallery-1',
    scenarioCapture: createScenarioCapturePayload(),
    tabId: 7,
    scenarioSessionService,
  });

  expect(ensureScenarioCaptureProjectMock).toHaveBeenCalledWith(
    expect.objectContaining({
      tabId: 7,
    })
  );
  expect(saveScenarioCaptureSlideToProjectMock).toHaveBeenCalledWith(
    expect.objectContaining({
      projectId: 'project-auto',
      dataUrl: 'data:image/png;base64,buffer',
      captureMetadata: createCaptureMetadata(),
      title: 'Click submit',
    })
  );
  expect(scenarioSessionService.bufferPendingCapture).not.toHaveBeenCalled();
  expect(scenarioSessionService.bumpProjectRevision).toHaveBeenCalledWith(7);
});

async function expectNoBufferingForDisabledSession() {
  const disabledService = createScenarioSessionServiceStub();
  vi.mocked(disabledService.getSession).mockResolvedValue(createSessionState());

  await persistScenarioCaptureFromBackground({
    dataUrl: 'data:image/png;base64,disabled',
    galleryAssetId: null,
    scenarioCapture: createScenarioCapturePayload(),
    tabId: 1,
    scenarioSessionService: disabledService,
  });

  expect(disabledService.bufferPendingCapture).not.toHaveBeenCalled();
}

async function expectAutoCreateWhileWaitingForSelection() {
  const waitingService = createScenarioSessionServiceStub();
  vi.mocked(waitingService.getSession).mockResolvedValue(
    createSessionState({ enabled: true, captureMode: 'by-click', pendingProjectSelection: true })
  );
  vi.mocked(waitingService.getPendingCapture).mockReturnValue(createPendingCapture('pending-1'));

  await persistScenarioCaptureFromBackground({
    dataUrl: 'data:image/png;base64,waiting',
    galleryAssetId: null,
    scenarioCapture: createScenarioCapturePayload(),
    tabId: 2,
    scenarioSessionService: waitingService,
  });

  expect(waitingService.bufferPendingCapture).not.toHaveBeenCalled();
  expect(saveScenarioCaptureSlideToProjectMock).toHaveBeenCalledWith(
    expect.objectContaining({ projectId: 'project-auto' })
  );
}

async function expectAutoCreateWhenPendingCaptureExists() {
  const existingBufferService = createScenarioSessionServiceStub();
  vi.mocked(existingBufferService.getSession).mockResolvedValue(
    createSessionState({ enabled: true, captureMode: 'by-click' })
  );
  vi.mocked(existingBufferService.getPendingCapture).mockReturnValue(
    createPendingCapture('pending-2')
  );

  await persistScenarioCaptureFromBackground({
    dataUrl: 'data:image/png;base64,existing',
    galleryAssetId: null,
    scenarioCapture: createScenarioCapturePayload(),
    tabId: 3,
    scenarioSessionService: existingBufferService,
  });

  expect(existingBufferService.bufferPendingCapture).not.toHaveBeenCalled();
  expect(saveScenarioCaptureSlideToProjectMock).toHaveBeenCalledWith(
    expect.objectContaining({ projectId: 'project-auto' })
  );
}

it('skips capture only when scenario mode is disabled, and otherwise auto-creates a project', async () => {
  await expectNoBufferingForDisabledSession();
  saveScenarioCaptureSlideToProjectMock.mockClear();
  await expectAutoCreateWhileWaitingForSelection();
  saveScenarioCaptureSlideToProjectMock.mockClear();
  await expectAutoCreateWhenPendingCaptureExists();
});

it('persists directly into the active project when the session already has one', async () => {
  const scenarioSessionService = createScenarioSessionServiceStub();
  vi.mocked(scenarioSessionService.getSession).mockResolvedValue(
    createSessionState({
      enabled: true,
      projectId: 'project-1',
      projectName: 'Project 1',
      rememberProjectSelection: true,
    })
  );

  await persistScenarioCaptureFromBackground({
    dataUrl: 'data:image/png;base64,ready',
    galleryAssetId: 'gallery-7',
    scenarioCapture: createScenarioCapturePayload(),
    tabId: 8,
    scenarioSessionService,
  });

  expect(saveScenarioCaptureSlideToProjectMock).toHaveBeenCalledWith(
    expect.objectContaining({
      projectId: 'project-1',
      dataUrl: 'data:image/png;base64,ready',
      sourceKind: 'auto-click',
      captureMetadata: createCaptureMetadata(),
    })
  );
  expect(scenarioSessionService.bufferPendingCapture).not.toHaveBeenCalled();
});

async function expectBufferedMetadataNormalization() {
  const bufferService = createScenarioSessionServiceStub();
  vi.mocked(bufferService.getSession).mockResolvedValue(createSessionState({ enabled: true }));

  await persistScenarioCaptureFromBackground({
    dataUrl: 'data:image/png;base64,min-buffer',
    galleryAssetId: null,
    scenarioCapture: createMinimalScenarioCapturePayload(),
    tabId: 10,
    scenarioSessionService: bufferService,
  });

  expect(saveScenarioCaptureSlideToProjectMock).toHaveBeenCalledWith(
    expect.objectContaining({
      projectId: 'project-auto',
      captureSurface: 'full',
      galleryAssetId: null,
      sourceKind: 'manual',
    })
  );
  expect(bufferService.bufferPendingCapture).not.toHaveBeenCalled();
}

async function expectSavedMetadataNormalization() {
  const saveService = createScenarioSessionServiceStub();
  vi.mocked(saveService.getSession).mockResolvedValue(
    createSessionState({
      enabled: true,
      projectId: 'project-10',
      projectName: 'Project 10',
      rememberProjectSelection: true,
    })
  );

  await persistScenarioCaptureFromBackground({
    dataUrl: 'data:image/png;base64,min-save',
    galleryAssetId: null,
    scenarioCapture: createMinimalScenarioCapturePayload(),
    tabId: 11,
    scenarioSessionService: saveService,
  });

  expect(saveScenarioCaptureSlideToProjectMock).toHaveBeenCalledWith(
    expect.objectContaining({
      projectId: 'project-10',
      captureSurface: 'full',
      galleryAssetId: null,
      sourceKind: 'manual',
    })
  );
}

it('normalizes missing optional scenario metadata before saving or buffering', async () => {
  await expectBufferedMetadataNormalization();
  await expectSavedMetadataNormalization();
});

it('returns early when the capture did not include scenario metadata', async () => {
  const scenarioSessionService = createScenarioSessionServiceStub();

  await persistScenarioCaptureFromBackground({
    dataUrl: 'data:image/png;base64,plain',
    galleryAssetId: null,
    tabId: 4,
    scenarioSessionService,
  });

  expect(scenarioSessionService.getSession).not.toHaveBeenCalled();
  expect(saveScenarioCaptureSlideToProjectMock).not.toHaveBeenCalled();
});

it('returns early when project auto-selection does not yield an id', async () => {
  const scenarioSessionService = createScenarioSessionServiceStub();
  ensureScenarioCaptureProjectMock.mockResolvedValueOnce({ id: '', name: '' });
  vi.mocked(scenarioSessionService.getSession).mockResolvedValue(
    createSessionState({ enabled: true, captureMode: 'by-click' })
  );

  await persistScenarioCaptureFromBackground({
    dataUrl: 'data:image/png;base64,buffer',
    galleryAssetId: null,
    scenarioCapture: createScenarioCapturePayload(),
    tabId: 12,
    scenarioSessionService,
  });

  expect(saveScenarioCaptureSlideToProjectMock).not.toHaveBeenCalled();
  expect(scenarioSessionService.bumpProjectRevision).not.toHaveBeenCalled();
});
