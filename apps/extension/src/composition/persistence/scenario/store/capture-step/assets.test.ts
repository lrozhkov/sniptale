import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createScenarioStoreProjectFixture } from '../test.helpers.ts';
const {
  createScenarioAssetEntryFromBlobMock,
  createScenarioAssetEntryMock,
  persistScenarioCaptureArtifactsMock,
} = vi.hoisted(() => ({
  createScenarioAssetEntryFromBlobMock: vi.fn(),
  createScenarioAssetEntryMock: vi.fn(),
  persistScenarioCaptureArtifactsMock: vi.fn(),
}));

vi.mock('./asset-entry', () => ({
  createScenarioAssetEntryFromBlob: createScenarioAssetEntryFromBlobMock,
  createScenarioAssetEntry: createScenarioAssetEntryMock,
}));

vi.mock('./artifact-persistence', () => ({
  persistScenarioCaptureArtifacts: persistScenarioCaptureArtifactsMock,
}));

import {
  createScenarioAssetEntry,
  createScenarioAssetEntryFromBlob,
  persistScenarioCaptureArtifacts,
} from './assets';

beforeEach(() => {
  vi.clearAllMocks();
  createScenarioAssetEntryMock.mockResolvedValue({
    assetEntry: {
      id: 'asset-1',
      projectId: 'project-1',
      galleryAssetId: null,
      blob: new Blob(['pixel'], { type: 'image/png' }),
      mimeType: 'image/png',
      width: 1440,
      height: 900,
      createdAt: 123,
      size: 5,
    },
    now: 123,
  });
  createScenarioAssetEntryFromBlobMock.mockResolvedValue({
    assetEntry: {
      id: 'asset-blob-1',
      projectId: 'project-1',
      galleryAssetId: 'gallery-1',
      blob: new Blob(['pixel'], { type: 'image/webp' }),
      mimeType: 'image/webp',
      width: 1280,
      height: 720,
      createdAt: 456,
      size: 5,
    },
    now: 456,
  });
  persistScenarioCaptureArtifactsMock.mockImplementation(async (args) => args.project);
});

async function verifyAssetEntryDelegation() {
  const args = {
    dataUrl: 'data:image/png;base64,asset',
    galleryAssetId: null,
    projectId: 'project-1',
  };

  await expect(createScenarioAssetEntry(args)).resolves.toEqual({
    assetEntry: expect.objectContaining({
      id: 'asset-1',
      projectId: 'project-1',
    }),
    now: 123,
  });
  expect(createScenarioAssetEntryMock).toHaveBeenCalledWith(args);
}

async function verifyPersistenceDelegation() {
  const args: Parameters<typeof persistScenarioCaptureArtifacts>[0] = {
    assetEntry: {
      id: 'asset-1',
      projectId: 'project-1',
      galleryAssetId: null,
      blob: new Blob(['pixel'], { type: 'image/png' }),
      mimeType: 'image/png',
      width: 1440,
      height: 900,
      createdAt: 123,
      size: 5,
    },
    baseUpdatedAt: 10,
    project: createScenarioStoreProjectFixture(),
    projectId: 'project-1',
    stepId: 'step-1',
    stepDocument: null,
  };

  await expect(persistScenarioCaptureArtifacts(args)).resolves.toBe(args.project);
  expect(persistScenarioCaptureArtifactsMock).toHaveBeenCalledWith(args);
}

describe('capture-step assets', () => {
  it('delegates asset entry creation to the canonical owner seam', verifyAssetEntryDelegation);
  it('delegates blob-based asset entry creation to the canonical owner seam', async () => {
    const blob = new Blob(['pixel'], { type: 'image/webp' });
    const args = {
      blob,
      galleryAssetId: 'gallery-1',
      projectId: 'project-1',
    };

    await expect(createScenarioAssetEntryFromBlob(args)).resolves.toEqual({
      assetEntry: expect.objectContaining({
        id: 'asset-blob-1',
        projectId: 'project-1',
      }),
      now: 456,
    });
    expect(createScenarioAssetEntryFromBlobMock).toHaveBeenCalledWith(args);
  });
  it('delegates artifact persistence to the canonical owner seam', verifyPersistenceDelegation);
});
