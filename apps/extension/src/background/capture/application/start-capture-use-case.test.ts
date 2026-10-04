import { beforeEach, expect, it, vi } from 'vitest';

import type { ScenarioRuntimeCapturePayload } from '../../../contracts/messaging/contracts/types';
import type { Settings } from '../../../contracts/settings';
import { createScenarioSessionServiceStub } from '../../../../../../tooling/test/support/scenario-session-service.stub';
import {
  createVisibleCapturePromise,
  maybePersistScreenshotInMediaHub,
  runStartCaptureUseCase,
} from './start-capture-use-case';
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

it('uses the native visible-tab crop path for a window-sized capture', async () => {
  const cropCapture = vi.fn().mockResolvedValue('data:image/png;base64,crop');

  await expect(createVisibleCapturePromise(cropCapture, 7)).resolves.toBe(
    'data:image/png;base64,crop'
  );

  expect(cropCapture).toHaveBeenCalledWith(7);
});

it('stores an explicit save-to-library action in the library', async () => {
  const saveScreenshotToMediaHubFromDataUrl = vi.fn(async () => 'asset-1');

  await expect(
    maybePersistScreenshotInMediaHub(
      {},
      'data:image/png;base64,library',
      'visible.png',
      42,
      'save_to_library',
      { saveScreenshotToMediaHubFromDataUrl }
    )
  ).resolves.toBe('asset-1');

  expect(saveScreenshotToMediaHubFromDataUrl).toHaveBeenCalledWith(
    'data:image/png;base64,library',
    'visible.png',
    42,
    'library'
  );
});

it('persists gallery and scenario outputs before returning the capture payload', async () => {
  const ports = createPorts(
    createSettings({
      captureAction: 'scenario',
      localStoragePolicy: {
        cleanupEnabled: true,
        defaultDestination: 'library',
        draftRetentionDays: 7,
        videoDraftRetentionDays: 7,
      },
    })
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

  expect(ports.generateFilename).toHaveBeenCalledWith(
    'visible',
    'png',
    expect.objectContaining({ imageFormat: 'png' })
  );
  expect(ports.saveScreenshotToMediaHubFromDataUrl).toHaveBeenCalledWith(
    'data:image/png;base64,1',
    'visible.png',
    42,
    'library'
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
  const ports = createPorts(
    createSettings({
      localStoragePolicy: {
        cleanupEnabled: true,
        defaultDestination: 'library',
        draftRetentionDays: 7,
        videoDraftRetentionDays: 7,
      },
    })
  );
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

it('carries custom image rules into an edited capture and preserves its publication identity', async () => {
  const { createScreenshotFilename } = await import('../../../workflows/file-naming');
  const ports = createPorts(
    createSettings({ filenameRules: { template: 'Project', images: 'Image' } })
  );
  ports.generateFilename = createScreenshotFilename;
  const result = await runStartCaptureUseCase(
    {
      actionType: 'edit',
      capture: async () => 'data:image/png;base64,image',
      captureTarget: 'visible',
      resolvedTabId: 1,
      scenarioCapture: undefined,
      scenarioSessionService: createScenarioSessionServiceStub(),
    },
    ports
  );
  expect(result.filename).toBe('Image_visible.png');
  expect(result.payload).toEqual({ assetId: 'asset-1', dataUrl: 'data:image/png;base64,image' });
  expect(ports.saveScreenshotToMediaHubFromDataUrl).toHaveBeenCalledWith(
    'data:image/png;base64,image',
    'Image_visible.png',
    1,
    'temporary'
  );
});

it('propagates a persistence failure even when the job cannot be marked failed', async () => {
  const ports = createPorts();
  vi.mocked(ports.saveScreenshotToMediaHubFromDataUrl).mockRejectedValueOnce('unavailable');
  vi.mocked(ports.transitionCaptureJob).mockRejectedValueOnce(new Error('job gone'));
  await expect(
    runStartCaptureUseCase(
      {
        capture: async () => ({ dataUrl: 'data:image/png;base64,image', jobId: 'gone' }),
        captureTarget: 'visible',
        resolvedTabId: 1,
        scenarioCapture: undefined,
        scenarioSessionService: createScenarioSessionServiceStub(),
      },
      ports
    )
  ).rejects.toBe('unavailable');
});
