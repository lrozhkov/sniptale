import { beforeEach, expect, it, vi } from 'vitest';

const {
  getScenarioProjectRecordV3Mock,
  listScenarioProjectSummariesV3Mock,
  saveScenarioCaptureSlideToProjectMock,
} = vi.hoisted(() => ({
  getScenarioProjectRecordV3Mock: vi.fn(),
  listScenarioProjectSummariesV3Mock: vi.fn(),
  saveScenarioCaptureSlideToProjectMock: vi.fn(),
}));

vi.mock('../../../composition/persistence/scenario/store/v3', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/scenario/store/v3')>()),
  getScenarioProjectRecordV3: getScenarioProjectRecordV3Mock,
  listScenarioProjectSummariesV3: listScenarioProjectSummariesV3Mock,
  saveScenarioCaptureSlideToProject: saveScenarioCaptureSlideToProjectMock,
}));

import {
  buildPendingCapture,
  buildScenarioSessionPayload,
  flushPendingCaptureIfNeeded,
  resolveProjectSelection,
} from './helpers';
import { createScenarioSessionServiceStub } from '../../../../../../tooling/test/support/scenario-session-service.stub';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';

beforeEach(() => {
  vi.clearAllMocks();
  listScenarioProjectSummariesV3Mock.mockResolvedValue([]);
  saveScenarioCaptureSlideToProjectMock.mockResolvedValue({
    slide: { id: 'slide-1' },
  });
});

function createPendingCaptureRequest() {
  return {
    type: MessageType.SCENARIO_SAVE_CAPTURE_STEP,
    dataUrl: 'data:image/png;base64,1',
    filename: 'capture.png',
    captureSurface: 'visible' as const,
    sourceKind: 'manual' as const,
    page: {
      title: 'Page',
      url: 'https://example.com',
      viewport: { x: 0, y: 0, width: 1000, height: 800 },
      scrollX: 0,
      scrollY: 0,
      devicePixelRatio: 1,
    },
    captureMetadata: createCaptureMetadata(),
  } satisfies Parameters<typeof buildPendingCapture>[0];
}

function createCaptureMetadata() {
  return {
    pointerRange: {
      start: { x: 10, y: 20 },
      end: { x: 16, y: 28 },
      minX: 10,
      minY: 20,
      maxX: 16,
      maxY: 28,
      distance: 10,
      durationMs: 240,
    },
    scroll: {
      startX: 0,
      startY: 100,
      endX: 0,
      endY: 220,
      deltaX: 0,
      deltaY: 120,
    },
    trigger: 'pointer-up' as const,
  };
}

it('normalizes optional capture-step fields while building a pending capture', () => {
  const pendingCapture = buildPendingCapture(createPendingCaptureRequest());

  expect(pendingCapture).toEqual(
    expect.objectContaining({
      filename: 'capture.png',
      target: null,
      interactionPoint: null,
      cursorPoint: null,
      captureMetadata: createCaptureMetadata(),
      title: '',
      body: '',
    })
  );
});

it('preserves an explicit gallery asset link while building a pending capture', () => {
  const pendingCapture = buildPendingCapture({
    ...createPendingCaptureRequest(),
    galleryAssetId: 'gallery-1',
  });

  expect(pendingCapture.galleryAssetId).toBe('gallery-1');
});

async function buildSessionPayload() {
  const scenarioSessionService = createScenarioSessionServiceStub();
  const session = {
    enabled: true,
    captureMode: 'by-click' as const,
    projectId: 'project-1',
    projectName: 'Project 1',
    rememberProjectSelection: true,
    pendingProjectSelection: false,
    sidebarVisible: true,
  };
  vi.mocked(scenarioSessionService.getSession).mockResolvedValue(session);
  vi.mocked(scenarioSessionService.getSurface).mockResolvedValue({
    screenshotMode: true,
    toolbarVisible: true,
    captureAction: 'scenario',
  });
  listScenarioProjectSummariesV3Mock.mockResolvedValue([
    { id: 'project-1', name: 'Project 1', createdAt: 10, updatedAt: 20 },
  ]);
  getScenarioProjectRecordV3Mock.mockResolvedValue({
    id: 'project-1',
    name: 'Project 1',
    slides: [],
    trash: [],
  });

  return {
    payload: await buildScenarioSessionPayload(11, scenarioSessionService),
    session,
  };
}

it('loads session payload and project selection details through shared store seams', async () => {
  const { payload, session } = await buildSessionPayload();

  expect(payload).toEqual({
    session,
    surface: {
      screenshotMode: true,
      toolbarVisible: true,
      captureAction: 'scenario',
    },
    projects: [{ id: 'project-1', name: 'Project 1', createdAt: 10, updatedAt: 20 }],
    recentSteps: [],
    trashedSteps: [],
    projectRevision: 1,
    snapshot: {
      session,
      surface: {
        screenshotMode: true,
        toolbarVisible: true,
        captureAction: 'scenario',
      },
      projectRevision: 1,
    },
  });
  expect(await resolveProjectSelection(null)).toEqual({ id: null, name: null });
  expect(await resolveProjectSelection('project-1')).toEqual({
    id: 'project-1',
    name: 'Project 1',
  });
});

it('throws when the selected project cannot be resolved', async () => {
  getScenarioProjectRecordV3Mock.mockResolvedValue(undefined);

  await expect(resolveProjectSelection('missing')).rejects.toThrow(
    'Scenario project not found: missing'
  );
});

it('flushes buffered captures into the selected project and clears the pending state', async () => {
  const scenarioSessionService = createScenarioSessionServiceStub();
  vi.mocked(scenarioSessionService.resolvePendingCapture).mockResolvedValue({
    id: 'pending-1',
    pendingAssetId: 'pending-asset-1',
    dataUrl: 'data:image/png;base64,pending',
    filename: 'pending.png',
    galleryAssetId: 'gallery-1',
    captureSurface: 'selection',
    sourceKind: 'manual',
    page: createPendingCaptureRequest().page,
    target: null,
    interactionPoint: null,
    cursorPoint: null,
    captureMetadata: createCaptureMetadata(),
    title: 'Crop region',
    body: '',
  });

  const flushed = await flushPendingCaptureIfNeeded(4, 'project-4', scenarioSessionService);

  expect(saveScenarioCaptureSlideToProjectMock).toHaveBeenCalledWith(
    expect.objectContaining({
      projectId: 'project-4',
      dataUrl: 'data:image/png;base64,pending',
      captureMetadata: createCaptureMetadata(),
    })
  );
  expect(scenarioSessionService.clearPendingCaptureIfCurrent).toHaveBeenCalledWith(
    4,
    expect.objectContaining({ id: 'pending-1', pendingAssetId: 'pending-asset-1' })
  );
  expect(flushed).toEqual({
    stepId: 'slide-1',
  });
});

it('returns an empty flush payload when no pending capture exists', async () => {
  const scenarioSessionService = createScenarioSessionServiceStub();
  vi.mocked(scenarioSessionService.resolvePendingCapture).mockResolvedValue(null);

  await expect(
    flushPendingCaptureIfNeeded(5, 'project-5', scenarioSessionService)
  ).resolves.toEqual({});
  expect(saveScenarioCaptureSlideToProjectMock).not.toHaveBeenCalled();
  expect(scenarioSessionService.clearPendingCapture).not.toHaveBeenCalled();
});

it('keeps the pending capture when saving into the project fails', async () => {
  const scenarioSessionService = createScenarioSessionServiceStub();
  vi.mocked(scenarioSessionService.resolvePendingCapture).mockResolvedValue({
    id: 'pending-2',
    pendingAssetId: 'pending-asset-2',
    dataUrl: 'data:image/png;base64,pending-2',
    filename: 'pending.png',
    galleryAssetId: null,
    captureSurface: 'visible',
    sourceKind: 'manual',
    page: createPendingCaptureRequest().page,
    target: null,
    interactionPoint: null,
    cursorPoint: null,
    captureMetadata: createCaptureMetadata(),
    title: 'Step',
    body: '',
  });
  saveScenarioCaptureSlideToProjectMock.mockRejectedValueOnce(new Error('save failed'));

  await expect(flushPendingCaptureIfNeeded(6, 'project-6', scenarioSessionService)).rejects.toThrow(
    'save failed'
  );
  expect(scenarioSessionService.clearPendingCapture).not.toHaveBeenCalled();
});
