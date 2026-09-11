import { beforeEach, expect, it, vi } from 'vitest';
import {
  createGuideProject,
  createGuideStep,
  createGuideImageBlock,
} from '../../../features/scenario/project/public';

const {
  blobToDataUrlMock,
  getScenarioAssetMock,
  getScenarioProjectRecordMock,
  listScenarioProjectSummariesMock,
  saveScenarioCaptureStepToProjectMock,
} = vi.hoisted(() => ({
  blobToDataUrlMock: vi.fn(),
  getScenarioAssetMock: vi.fn(),
  getScenarioProjectRecordMock: vi.fn(),
  listScenarioProjectSummariesMock: vi.fn(),
  saveScenarioCaptureStepToProjectMock: vi.fn(),
}));

vi.mock('../../../composition/persistence/scenario/projects', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/scenario/projects')>()),
  getScenarioAsset: getScenarioAssetMock,
  getScenarioProject: getScenarioProjectRecordMock,
}));
vi.mock('../../../platform/media-utils/data-url', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/media-utils/data-url')>()),
  blobToDataUrl: blobToDataUrlMock,
}));
vi.mock('../../../composition/persistence/scenario/store/public', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../composition/persistence/scenario/store/public')
  >()),
  getScenarioProjectRecord: getScenarioProjectRecordMock,
  listScenarioProjectSummaries: listScenarioProjectSummariesMock,
}));
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import {
  buildScenarioCaptureSaveFields,
  buildScenarioCaptureSaveArgs,
  buildPendingCapture,
  buildScenarioSessionPayload,
  flushPendingCaptureIfNeeded,
  resolveProjectSelection,
} from './helpers';
import { createScenarioAssetEntryFixture, createScenarioSessionServiceStub } from './test-support';

beforeEach(() => {
  vi.clearAllMocks();
  blobToDataUrlMock.mockResolvedValue('data:image/png;base64,preview');
  getScenarioAssetMock.mockResolvedValue(createScenarioAssetEntryFixture());
  listScenarioProjectSummariesMock.mockResolvedValue([]);
  saveScenarioCaptureStepToProjectMock.mockResolvedValue({
    step: { id: 'slide-1' },
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
    captureMetadata: {
      pointerRange: null,
      scroll: null,
      trigger: 'pointer-up' as const,
    },
  } satisfies Parameters<typeof buildPendingCapture>[0];
}

function createProjectSelectionSession() {
  const scenarioSessionService = createScenarioSessionServiceStub();
  vi.mocked(scenarioSessionService.getSession).mockResolvedValue({
    enabled: true,
    captureMode: 'by-click',
    projectId: 'project-1',
    projectName: 'Project 1',
    rememberProjectSelection: true,
    pendingProjectSelection: false,
    sidebarVisible: true,
  });
  vi.mocked(scenarioSessionService.getSurface).mockResolvedValue({
    screenshotMode: true,
    toolbarVisible: true,
    captureAction: 'scenario',
  });

  return scenarioSessionService;
}

it('normalizes optional capture-step fields while building a pending capture', () => {
  const pendingCapture = buildPendingCapture(createPendingCaptureRequest());

  expect(pendingCapture).toEqual(
    expect.objectContaining({
      filename: 'capture.png',
      target: null,
      interactionPoint: null,
      cursorPoint: null,
      title: '',
      body: '',
    })
  );
});

it('omits null and empty optional save fields when building shared capture-step args', () => {
  expect(
    buildScenarioCaptureSaveArgs({
      projectId: 'project-1',
      dataUrl: 'data:image/png;base64,1',
      galleryAssetId: null,
      captureSurface: 'visible',
      sourceKind: 'manual',
      page: {
        title: 'Page',
        url: 'https://example.com',
        viewport: { x: 0, y: 0, width: 1000, height: 800 },
        scrollX: 0,
        scrollY: 0,
        devicePixelRatio: 1,
      },
      target: null,
      interactionPoint: null,
      cursorPoint: null,
      captureMetadata: undefined,
      title: '',
      body: '',
    })
  ).toEqual({
    projectId: 'project-1',
    dataUrl: 'data:image/png;base64,1',
    captureSurface: 'visible',
    sourceKind: 'manual',
    page: {
      title: 'Page',
      url: 'https://example.com',
      viewport: { x: 0, y: 0, width: 1000, height: 800 },
      scrollX: 0,
      scrollY: 0,
      devicePixelRatio: 1,
    },
  });
});

it('normalizes scenario save fields from capture-step messages', () => {
  expect(buildScenarioCaptureSaveFields(createPendingCaptureRequest())).toEqual({
    dataUrl: 'data:image/png;base64,1',
    galleryAssetId: null,
    captureSurface: 'visible',
    sourceKind: 'manual',
    page: {
      title: 'Page',
      url: 'https://example.com',
      viewport: { x: 0, y: 0, width: 1000, height: 800 },
      scrollX: 0,
      scrollY: 0,
      devicePixelRatio: 1,
    },
    target: null,
    interactionPoint: null,
    cursorPoint: null,
    captureMetadata: {
      pointerRange: null,
      scroll: null,
      trigger: 'pointer-up',
    },
    title: '',
    body: '',
  });
});

it('loads session payload and project selection details through shared store seams', async () => {
  const scenarioSessionService = createProjectSelectionSession();
  listScenarioProjectSummariesMock.mockResolvedValue([
    {
      availability: 'available' as const,
      id: 'project-1',
      name: 'Project 1',
      createdAt: 10,
      updatedAt: 20,
    },
  ]);
  getScenarioProjectRecordMock.mockResolvedValue({
    ...createGuideProject('Project 1', 'project-1'),
    items: [createCapturedStep('slide-1')],
  });

  const payload = await buildScenarioSessionPayload(11, scenarioSessionService);

  expect(payload.projectRevision).toBe(1);
  expect(payload.recentSteps).toEqual([
    expect.objectContaining({
      id: 'slide-1',
      position: 0,
      stepNumber: 1,
      previewDataUrl: 'data:image/png;base64,preview',
      title: 'Captured step',
    }),
  ]);
  expect(await resolveProjectSelection(null)).toEqual({ id: null, name: null });
  expect(await resolveProjectSelection('project-1')).toEqual({
    id: 'project-1',
    name: 'Project 1',
  });
});

it('flushes buffered captures into the selected project and clears the pending state', async () => {
  const scenarioSessionService = createScenarioSessionServiceStub();
  const pendingCaptureRequest = createPendingCaptureRequest();
  vi.mocked(scenarioSessionService.resolvePendingCapture).mockResolvedValue({
    id: 'pending-1',
    pendingAssetId: 'pending-asset-1',
    dataUrl: 'data:image/png;base64,pending',
    filename: 'pending.png',
    galleryAssetId: 'gallery-1',
    captureSurface: 'visible',
    sourceKind: 'manual',
    page: pendingCaptureRequest.page,
    target: null,
    interactionPoint: null,
    cursorPoint: null,
    captureMetadata: pendingCaptureRequest.captureMetadata,
    title: '',
    body: '',
  });

  await expect(
    flushPendingCaptureIfNeeded(4, 'project-1', scenarioSessionService)
  ).resolves.toEqual({
    stepId: 'slide-1',
  });
  expect(saveScenarioCaptureStepToProjectMock).toHaveBeenCalledWith(
    expect.objectContaining({
      projectId: 'project-1',
      galleryAssetId: 'gallery-1',
    })
  );
  expect(scenarioSessionService.clearPendingCaptureIfCurrent).toHaveBeenCalledWith(
    4,
    expect.objectContaining({ id: 'pending-1', pendingAssetId: 'pending-asset-1' })
  );
  expect(scenarioSessionService.clearPendingCapture).not.toHaveBeenCalled();
});

function createCapturedStep(id: string) {
  const step = createGuideStep('Captured step', id);
  step.blocks.push(
    createGuideImageBlock({
      id: 'image',
      assetId: 'asset-1',
      width: 1000,
      height: 800,
      source: {
        kind: 'capture',
        captureSurface: 'visible',
        sourceKind: 'manual',
        page: createPendingCaptureRequest().page,
        target: null,
        cursorPoint: null,
        interactionPoint: null,
        captureMetadata: { pointerRange: null, scroll: null, trigger: 'pointer-up' },
      },
    })
  );
  return step;
}

vi.mock('../../../composition/persistence/scenario/store/capture-step', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../composition/persistence/scenario/store/capture-step')
  >()),
  saveScenarioCaptureStepToProject: saveScenarioCaptureStepToProjectMock,
}));
