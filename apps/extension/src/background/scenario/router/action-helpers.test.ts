import { beforeEach, expect, it, vi } from 'vitest';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';

const {
  buildScenarioSessionPayloadMock,
  flushPendingCaptureIfNeededMock,
  saveScenarioCaptureSlideToProjectMock,
} = vi.hoisted(() => ({
  buildScenarioSessionPayloadMock: vi.fn(),
  flushPendingCaptureIfNeededMock: vi.fn(),
  saveScenarioCaptureSlideToProjectMock: vi.fn(),
}));

vi.mock('./helpers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./helpers')>();
  return {
    ...actual,
    buildScenarioSessionPayload: buildScenarioSessionPayloadMock,
    flushPendingCaptureIfNeeded: flushPendingCaptureIfNeededMock,
  };
});

vi.mock('../../../composition/persistence/scenario/store/v3', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/scenario/store/v3')>()),
  saveScenarioCaptureSlideToProject: saveScenarioCaptureSlideToProjectMock,
}));

import {
  buildScenarioPayloadResponse,
  flushScenarioProjectCapture,
  saveCaptureStepToScenarioProject,
  setScenarioProjectSelection,
} from './action-helpers';
import { createScenarioSessionServiceStub } from './test-support';

function createScenarioSaveCaptureStepMessage(overrides = {}) {
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
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  buildScenarioSessionPayloadMock.mockResolvedValue({ session: { enabled: true } });
  flushPendingCaptureIfNeededMock.mockResolvedValue({});
  saveScenarioCaptureSlideToProjectMock.mockResolvedValue({
    project: { id: 'project-1', name: 'Project 1' },
    slide: { id: 'slide-1' },
  });
});

it('builds scenario payload responses through the shared payload seam', async () => {
  const scenarioSessionService = createScenarioSessionServiceStub();

  await expect(
    buildScenarioPayloadResponse({
      resolvedTabId: 9,
      scenarioSessionService,
    })
  ).resolves.toEqual({ success: true, session: { enabled: true } });
  expect(buildScenarioSessionPayloadMock).toHaveBeenCalledWith(9, scenarioSessionService);
});

it('updates project selection and flushes pending captures through the session service', async () => {
  const scenarioSessionService = createScenarioSessionServiceStub();
  flushPendingCaptureIfNeededMock.mockResolvedValue({ stepId: 'step-1' });

  await setScenarioProjectSelection({
    resolvedTabId: 3,
    scenarioSessionService,
    projectSelection: { id: 'project-1', name: 'Project 1' },
    rememberProjectSelection: true,
  });
  await expect(
    flushScenarioProjectCapture({
      resolvedTabId: 3,
      scenarioSessionService,
      projectId: 'project-1',
    })
  ).resolves.toEqual({ stepId: 'step-1' });

  expect(scenarioSessionService.setActiveProject).toHaveBeenCalledWith(
    3,
    { id: 'project-1', name: 'Project 1' },
    { rememberProjectSelection: true }
  );
  expect(scenarioSessionService.bumpProjectRevision).toHaveBeenCalledWith(3);
});

it('does not bump project revision when flushing finds no persisted step', async () => {
  const scenarioSessionService = createScenarioSessionServiceStub();
  flushPendingCaptureIfNeededMock.mockResolvedValue({});

  await expect(
    flushScenarioProjectCapture({
      resolvedTabId: 4,
      scenarioSessionService,
      projectId: 'project-1',
    })
  ).resolves.toEqual({});

  expect(scenarioSessionService.bumpProjectRevision).not.toHaveBeenCalled();
});

it('saves capture steps through the shared capture-step seam', async () => {
  await saveCaptureStepToScenarioProject(
    {
      ...createScenarioSaveCaptureStepMessage(),
      captureSurface: 'visible',
      sourceKind: 'manual',
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
    },
    'project-1'
  );

  expect(saveScenarioCaptureSlideToProjectMock).toHaveBeenCalledWith(
    expect.objectContaining({
      projectId: 'project-1',
      dataUrl: 'data:image/png;base64,1',
    })
  );
});

it('omits undefined optional capture-step fields before calling the shared save seam', async () => {
  await saveCaptureStepToScenarioProject(
    createScenarioSaveCaptureStepMessage({
      dataUrl: 'data:image/png;base64,2',
    }),
    'project-2'
  );

  expect(saveScenarioCaptureSlideToProjectMock).toHaveBeenCalledWith({
    projectId: 'project-2',
    dataUrl: 'data:image/png;base64,2',
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

it('preserves explicit optional capture-step fields through the shared save seam', async () => {
  const message = createScenarioSaveCaptureStepMessage({
    dataUrl: 'data:image/png;base64,3',
    galleryAssetId: 'gallery-1',
    captureSurface: 'full' as const,
    sourceKind: 'auto-click' as const,
    page: {
      title: 'Page',
      url: 'https://example.com',
      viewport: { x: 0, y: 0, width: 1000, height: 800 },
      scrollX: 12,
      scrollY: 14,
      devicePixelRatio: 2,
    },
    target: {
      selector: '#capture',
      iframeSelector: null,
      tagName: 'BUTTON',
      role: 'button',
      text: 'Capture',
      ariaLabel: 'Capture',
      title: 'Capture',
      rect: { x: 10, y: 12, width: 40, height: 20 },
      framePadding: null,
    },
    interactionPoint: { x: 20, y: 24 },
    cursorPoint: { x: 21, y: 25 },
    captureMetadata: {
      pointerRange: null,
      scroll: null,
      trigger: 'pointer-up' as const,
    },
    title: 'Saved step',
    body: 'Saved body',
  });

  await saveCaptureStepToScenarioProject(message, 'project-3');

  expect(saveScenarioCaptureSlideToProjectMock).toHaveBeenCalledWith(
    expect.objectContaining({
      projectId: 'project-3',
      galleryAssetId: 'gallery-1',
      captureSurface: 'full',
      sourceKind: 'auto-click',
      title: 'Saved step',
      body: 'Saved body',
    })
  );
});
