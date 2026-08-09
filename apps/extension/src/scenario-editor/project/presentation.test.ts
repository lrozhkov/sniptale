import { beforeEach, expect, it, vi } from 'vitest';
import type { ScenarioProjectEntry } from '../../composition/persistence/scenario/contracts';
import { createScenarioProject } from '../../features/scenario/project/factories/project';
import { createScenarioProjectV3 } from '../../features/scenario/project/v3';
import { createScenarioCaptureStep } from '../../features/scenario/project/public';

const mocks = vi.hoisted(() => ({
  commitPresentation: vi.fn(),
  createThumbnail: vi.fn(),
  getAssetBlob: vi.fn(),
  getPresentation: vi.fn(),
}));

vi.mock('../../composition/persistence/scenario/store/public', () => ({
  createScenarioProjectRecord: vi.fn(),
  deleteScenarioProjectRecord: vi.fn(),
  getScenarioAssetBlob: mocks.getAssetBlob,
  getScenarioAssetEntry: vi.fn(),
  getScenarioProjectRecord: vi.fn(),
  getScenarioStepEditorDocumentRecord: vi.fn(),
  listScenarioProjectSummaries: vi.fn(),
  renameScenarioProjectRecord: vi.fn(),
  saveScenarioExportRecord: vi.fn(),
  saveScenarioProjectRecord: vi.fn(),
  updateScenarioProjectRecordMetadata: vi.fn(),
}));

vi.mock('../../composition/persistence/aggregate-presentations', () => ({
  commitProjectAggregatePresentation: mocks.commitPresentation,
  createAggregatePresentationKey: vi.fn(),
  deleteAggregatePresentation: vi.fn(),
  getAggregatePresentation: mocks.getPresentation,
  getAggregatePreviewBlob: vi.fn(),
  listAggregatePresentations: vi.fn(),
}));

vi.mock('../../platform/media-utils/image-thumbnail', () => ({
  createImageThumbnailBlob: mocks.createThumbnail,
}));

import { refreshScenarioAggregatePresentation } from './presentation';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getPresentation.mockResolvedValue(undefined);
  mocks.getAssetBlob.mockResolvedValue(new Blob(['source'], { type: 'image/png' }));
  mocks.createThumbnail.mockResolvedValue(new Blob(['thumbnail'], { type: 'image/webp' }));
  mocks.commitPresentation.mockResolvedValue(undefined);
});

function createEntry(): ScenarioProjectEntry {
  const project = createScenarioProject('Scenario');
  project.steps = [
    { assetId: 'asset-old', kind: 'capture' },
    { kind: 'note' },
    { assetId: 'asset-latest', kind: 'capture' },
  ] as typeof project.steps;
  return {
    createdAt: 1,
    id: project.id,
    project,
    updatedAt: 2,
    workspaceRevision: 6,
  };
}

it('renders the latest meaningful capture into a revision-matched presentation', async () => {
  const { refreshScenarioAggregatePresentation } = await import('./presentation');
  const entry = createEntry();

  await refreshScenarioAggregatePresentation(entry);

  expect(mocks.getAssetBlob).toHaveBeenCalledWith('asset-latest');
  expect(mocks.createThumbnail).toHaveBeenCalledWith(expect.any(Blob), 320, 180);
  expect(mocks.commitPresentation).toHaveBeenCalledWith({
    expectedWorkspaceRevision: 6,
    ref: { id: entry.id, kind: 'scenario' },
    thumbnailBlob: expect.any(Blob),
  });
});

it('does not regenerate a presentation that already matches the workspace revision', async () => {
  mocks.getPresentation.mockResolvedValueOnce({ presentationRevision: 6 });
  const { refreshScenarioAggregatePresentation } = await import('./presentation');

  await refreshScenarioAggregatePresentation(createEntry());

  expect(mocks.getAssetBlob).not.toHaveBeenCalled();
  expect(mocks.commitPresentation).not.toHaveBeenCalled();
});

it('uses the latest v3 capture source and defaults missing legacy revisions to zero', async () => {
  const project = createScenarioProjectV3('V3');
  const capture = createScenarioCaptureStep({ assetId: 'v3-asset' });
  project.slides = [
    project.slides[0]!,
    {
      ...project.slides[0]!,
      source: {
        assetId: capture.assetId,
        captureMetadata: capture.captureMetadata,
        captureSurface: capture.captureSurface,
        cursorPoint: capture.cursorPoint,
        galleryAssetId: capture.galleryAssetId,
        interactionPoint: capture.interactionPoint,
        kind: 'capture',
        page: capture.page,
        sourceKind: capture.sourceKind,
        target: capture.target,
      },
    },
  ];
  await refreshScenarioAggregatePresentation({
    createdAt: 1,
    id: project.id,
    project,
    updatedAt: 2,
  });
  expect(mocks.getAssetBlob).toHaveBeenCalledWith('v3-asset');
  expect(mocks.commitPresentation).toHaveBeenCalledWith(
    expect.objectContaining({ expectedWorkspaceRevision: 0 })
  );
});

it('rejects projects without a visual source and missing source blobs', async () => {
  const noVisual = createScenarioProject('Text only');
  noVisual.steps = [];
  await expect(
    refreshScenarioAggregatePresentation({
      createdAt: 1,
      id: noVisual.id,
      project: noVisual,
      updatedAt: 2,
      workspaceRevision: 1,
    })
  ).rejects.toThrow('no visual step');

  mocks.getAssetBlob.mockResolvedValueOnce(undefined);
  await expect(refreshScenarioAggregatePresentation(createEntry())).rejects.toThrow(
    'cover source is unavailable'
  );
  expect(mocks.createThumbnail).not.toHaveBeenCalled();
});
