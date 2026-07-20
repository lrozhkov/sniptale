import { beforeEach, expect, it, vi } from 'vitest';
import {
  type ScenarioCaptureMetadata,
  type ScenarioPageDescriptor,
} from '@sniptale/runtime-contracts/scenario/types/geometry';

const {
  createScenarioAssetEntryMock,
  getScenarioProjectMock,
  persistScenarioCaptureArtifactsMock,
} = vi.hoisted(() => ({
  createScenarioAssetEntryMock: vi.fn(),
  getScenarioProjectMock: vi.fn(),
  persistScenarioCaptureArtifactsMock: vi.fn(),
}));

vi.mock('../../projects', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../projects')>()),
  getScenarioProject: getScenarioProjectMock,
}));

vi.mock('./assets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./assets')>()),
  createScenarioAssetEntry: createScenarioAssetEntryMock,
  persistScenarioCaptureArtifacts: persistScenarioCaptureArtifactsMock,
}));

import { saveScenarioCaptureStepToProject } from './index';
import { createScenarioStoreProjectFixture } from '../test.helpers.ts';

function createPageDescriptor(): ScenarioPageDescriptor {
  return {
    title: 'Page title',
    url: 'https://example.test/page',
    viewport: { x: 0, y: 0, width: 1280, height: 720 },
    scrollX: 0,
    scrollY: 120,
    devicePixelRatio: 2,
  };
}

function createCaptureMetadata(): ScenarioCaptureMetadata {
  return {
    pointerRange: null,
    scroll: null,
    trigger: 'keyboard-enter',
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getScenarioProjectMock.mockResolvedValue(createScenarioStoreProjectFixture());
  createScenarioAssetEntryMock.mockResolvedValue({
    assetEntry: {
      id: 'asset-1',
      projectId: 'project-1',
      galleryAssetId: 'gallery-1',
      blob: new Blob(['pixel'], { type: 'image/png' }),
      mimeType: 'image/png',
      width: 1280,
      height: 720,
      createdAt: 123,
      size: 5,
    },
    now: 456,
  });
  persistScenarioCaptureArtifactsMock.mockImplementation(async (args) => args.project);
});

it('preserves optional capture fields and creates an editor document for target overlays', async () => {
  const result = await saveScenarioCaptureStepToProject({
    projectId: 'project-1',
    dataUrl: 'data:image/png;base64,asset',
    galleryAssetId: 'gallery-1',
    captureSurface: 'selection',
    sourceKind: 'manual',
    page: createPageDescriptor(),
    target: {
      selector: '#buy',
      iframeSelector: null,
      tagName: 'button',
      role: 'button',
      text: 'Buy',
      ariaLabel: null,
      title: null,
      rect: { x: 10, y: 20, width: 110, height: 40 },
      framePadding: null,
    },
    interactionPoint: { x: 25, y: 35 },
    cursorPoint: { x: 30, y: 40 },
    captureMetadata: createCaptureMetadata(),
    title: 'Captured button',
    body: 'Step body',
  });

  expect(result.project.updatedAt).toBe(456);
  expect(result.step).toEqual(
    expect.objectContaining({
      body: 'Step body',
      galleryAssetId: 'gallery-1',
      title: 'Captured button',
    })
  );
  expect(result.step.overlays.map((overlay) => overlay.kind)).toEqual(['focus-rect']);
  expect(persistScenarioCaptureArtifactsMock).toHaveBeenCalledWith(
    expect.objectContaining({
      baseUpdatedAt: expect.any(Number),
      stepDocument: expect.any(Object),
    })
  );
});

it('skips editor document persistence when capture data produces no auto overlays', async () => {
  const result = await saveScenarioCaptureStepToProject({
    projectId: 'project-1',
    dataUrl: 'data:image/png;base64,asset',
    captureSurface: 'visible',
    sourceKind: 'manual',
    page: createPageDescriptor(),
  });

  expect(result.step.overlays).toEqual([]);
  expect(persistScenarioCaptureArtifactsMock).toHaveBeenCalledWith(
    expect.objectContaining({
      baseUpdatedAt: expect.any(Number),
      stepDocument: null,
    })
  );
});

it('returns the project revision persisted by the artifact owner', async () => {
  persistScenarioCaptureArtifactsMock.mockImplementationOnce(async (args) => ({
    ...args.project,
    updatedAt: 999,
  }));

  const result = await saveScenarioCaptureStepToProject({
    projectId: 'project-1',
    dataUrl: 'data:image/png;base64,asset',
    captureSurface: 'visible',
    sourceKind: 'manual',
    page: createPageDescriptor(),
  });

  expect(result.project.updatedAt).toBe(999);
});

it('surfaces a missing project before writing artifacts', async () => {
  getScenarioProjectMock.mockResolvedValueOnce(null);

  await expect(
    saveScenarioCaptureStepToProject({
      projectId: 'missing-project',
      dataUrl: 'data:image/png;base64,asset',
      captureSurface: 'visible',
      sourceKind: 'manual',
      page: createPageDescriptor(),
    })
  ).rejects.toThrow('Scenario project not found: missing-project');
  expect(persistScenarioCaptureArtifactsMock).not.toHaveBeenCalled();
});
