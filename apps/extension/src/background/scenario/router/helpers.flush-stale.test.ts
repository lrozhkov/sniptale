import { beforeEach, expect, it, vi } from 'vitest';

const { saveScenarioCaptureSlideToProjectMock } = vi.hoisted(() => ({
  saveScenarioCaptureSlideToProjectMock: vi.fn(),
}));

vi.mock('../../../composition/persistence/scenario/store/v3', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/scenario/store/v3')>()),
  saveScenarioCaptureSlideToProject: saveScenarioCaptureSlideToProjectMock,
}));

import { flushPendingCaptureIfNeeded } from './helpers';
import { createScenarioSessionServiceStub } from '../../../../../../tooling/test/support/scenario-session-service.stub';

beforeEach(() => {
  vi.clearAllMocks();
  saveScenarioCaptureSlideToProjectMock.mockResolvedValue({
    slide: { id: 'slide-1' },
  });
});

function createPendingCapture(id: string, pendingAssetId: string) {
  return {
    id,
    pendingAssetId,
    dataUrl: 'data:image/png;base64,pending',
    filename: 'pending.png',
    galleryAssetId: null,
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
    target: null,
    interactionPoint: null,
    cursorPoint: null,
    captureMetadata: {
      pointerRange: null,
      scroll: null,
      trigger: 'pointer-up' as const,
    },
    title: 'Step',
    body: '',
  };
}

function createDeferredSave() {
  let resolve!: (value: { slide: { id: string } }) => void;
  const promise = new Promise<{ slide: { id: string } }>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

it('does not clear a newer pending capture after a stale flush save completes', async () => {
  const scenarioSessionService = createScenarioSessionServiceStub();
  const firstCapture = createPendingCapture('pending-1', 'pending-asset-1');
  const secondCapture = createPendingCapture('pending-2', 'pending-asset-2');
  const deferredSave = createDeferredSave();
  let currentCapture: typeof secondCapture | null = secondCapture;

  saveScenarioCaptureSlideToProjectMock.mockReturnValueOnce(deferredSave.promise);
  vi.mocked(scenarioSessionService.resolvePendingCapture).mockResolvedValue(firstCapture);
  vi.mocked(scenarioSessionService.clearPendingCaptureIfCurrent).mockImplementation(
    async (_tabId, expectedCapture) => {
      if (currentCapture?.id === expectedCapture.id) {
        currentCapture = null;
      }
      return {
        enabled: true,
        captureMode: 'by-click',
        projectId: 'project-7',
        projectName: 'Project 7',
        rememberProjectSelection: true,
        pendingProjectSelection: currentCapture !== null,
        sidebarVisible: true,
      };
    }
  );

  const flush = flushPendingCaptureIfNeeded(7, 'project-7', scenarioSessionService);
  await new Promise((resolve) => setTimeout(resolve, 0));

  currentCapture = secondCapture;
  deferredSave.resolve({ slide: { id: 'slide-1' } });

  await expect(flush).resolves.toEqual({ stepId: 'slide-1' });
  expect(scenarioSessionService.clearPendingCaptureIfCurrent).toHaveBeenCalledWith(
    7,
    expect.objectContaining({ id: 'pending-1', pendingAssetId: 'pending-asset-1' })
  );
  expect(currentCapture).toEqual(secondCapture);
});
