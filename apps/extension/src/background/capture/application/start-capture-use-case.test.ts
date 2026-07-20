import { beforeEach, expect, it, vi } from 'vitest';

import type { ScenarioRuntimeCapturePayload } from '../../../contracts/messaging/contracts/types';
import type { Settings } from '../../../contracts/settings';
import { createScenarioSessionServiceStub } from '../../../../../../tooling/test/support/scenario-session-service.stub';
import { createVisibleCapturePromise, runStartCaptureUseCase } from './start-capture-use-case';
import type { StartCapturePorts } from './ports';

function createSettings(overrides: Partial<Settings> = {}): Settings {
  return {
    captureAction: 'copy',
    defaultImagePresetId: 'preset-1',
    imageFormat: 'png',
    saveCapturesToGallery: false,
    ...overrides,
  } as Settings;
}

function createScenarioCapturePayload(): ScenarioRuntimeCapturePayload {
  return {
    captureSurface: 'visible',
    sourceKind: 'manual',
    page: {
      title: 'Example',
      url: 'https://example.test',
      viewport: { height: 720, width: 1280, x: 0, y: 0 },
      scrollX: 0,
      scrollY: 0,
      devicePixelRatio: 1,
    },
  };
}

function createPorts(settings: Settings = createSettings()): StartCapturePorts {
  return {
    generateFilename: vi.fn(() => 'visible.png'),
    loadSettings: vi.fn(async () => settings),
    persistScenarioCaptureFromBackground: vi.fn(async () => undefined),
    saveScreenshotToMediaHubFromDataUrl: vi.fn(async () => 'asset-1'),
    transitionCaptureJob: vi.fn(async () => undefined),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

it('selects viewport capture when viewport dimensions are available', async () => {
  const viewportCapture = vi.fn().mockResolvedValue('data:image/png;base64,viewport');
  const cropCapture = vi.fn().mockResolvedValue('data:image/png;base64,crop');

  await expect(
    createVisibleCapturePromise(
      viewportCapture,
      cropCapture,
      7,
      new Map([[7, { height: 200, width: 300 }]])
    )
  ).resolves.toBe('data:image/png;base64,viewport');

  expect(viewportCapture).toHaveBeenCalledWith(7, { height: 200, width: 300 });
  expect(cropCapture).not.toHaveBeenCalled();
});

it('persists gallery and scenario outputs before returning the capture payload', async () => {
  const ports = createPorts(
    createSettings({ captureAction: 'scenario', saveCapturesToGallery: true })
  );
  const scenarioSessionService = createScenarioSessionServiceStub();
  const scenarioCapture = createScenarioCapturePayload();

  await expect(
    runStartCaptureUseCase(
      {
        capture: () => Promise.resolve({ dataUrl: 'data:image/png;base64,1', jobId: 'job-1' }),
        captureTarget: 'visible',
        resolvedTabId: 42,
        scenarioCapture,
        scenarioSessionService,
      },
      ports
    )
  ).resolves.toEqual({
    captureAction: 'scenario',
    defaultImagePresetId: 'preset-1',
    filename: 'visible.png',
    payload: { dataUrl: 'data:image/png;base64,1', jobId: 'job-1' },
  });

  expect(ports.generateFilename).toHaveBeenCalledWith('visible', 'png');
  expect(ports.saveScreenshotToMediaHubFromDataUrl).toHaveBeenCalledWith(
    'data:image/png;base64,1',
    'visible.png',
    42
  );
  expect(ports.persistScenarioCaptureFromBackground).toHaveBeenCalledWith(
    expect.objectContaining({
      dataUrl: 'data:image/png;base64,1',
      galleryAssetId: 'asset-1',
      scenarioCapture,
      scenarioSessionService,
      tabId: 42,
    })
  );
});

it('marks the capture job failed when persistence rejects', async () => {
  const ports = createPorts(createSettings({ saveCapturesToGallery: true }));
  vi.mocked(ports.saveScreenshotToMediaHubFromDataUrl).mockRejectedValueOnce(
    new Error('gallery unavailable')
  );

  await expect(
    runStartCaptureUseCase(
      {
        capture: () => Promise.resolve({ dataUrl: 'data:image/png;base64,2', jobId: 'job-2' }),
        captureTarget: 'full',
        resolvedTabId: 43,
        scenarioCapture: undefined,
        scenarioSessionService: createScenarioSessionServiceStub(),
      },
      ports
    )
  ).rejects.toThrow('gallery unavailable');

  expect(ports.transitionCaptureJob).toHaveBeenCalledWith('job-2', 'failed', {
    error: 'gallery unavailable',
  });
});
