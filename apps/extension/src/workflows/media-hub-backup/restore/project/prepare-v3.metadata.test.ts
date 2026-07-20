import { describe, expect, it } from 'vitest';
import { createScenarioSlide } from '../../../../features/scenario/project/v3';
import type { ScenarioSlideSource } from '@sniptale/runtime-contracts/scenario/types/v3';
import { parseBackupMetadata } from '../../metadata';
import {
  createCaptureSlideSource,
  createV3ScenarioMetadata,
  createV3ScenarioMetadataWithImageAsset,
  createV3ScenarioMetadataWithImageEditDocument,
  createV3ScenarioMetadataWithProjectId,
  createV3ScenarioMetadataWithUnsafeAssetId,
  createV3ScenarioMetadataWithUnsafeExportId,
  createV3ScenarioMetadataWithUnsafeStepDocumentId,
  readFirstV3Project,
} from './prepare-v3.test-support.ts';

describe('backup v3 scenario project metadata shape boundary', () => {
  it('rejects malformed v3 scenario project descriptors before restore preparation', () => {
    expect(() => parseBackupMetadata(createV3ScenarioMetadata({ slides: [{}] }))).toThrow(
      'Invalid scenario project backup metadata.'
    );
  });

  it('rejects malformed v3 trash at the backup metadata boundary', () => {
    const metadata = createV3ScenarioMetadata({
      trash: [{ deletedAt: 1, originalIndex: 0, slide: { id: 'broken' } }],
    });

    expect(() => parseBackupMetadata(metadata)).toThrow(
      'Invalid scenario project backup metadata.'
    );
  });

  it('rejects malformed v3 capture slide sources at the backup metadata boundary', () => {
    const malformedSource = { ...createCaptureSlideSource() };
    Reflect.deleteProperty(malformedSource, 'page');

    expect(() =>
      parseBackupMetadata({
        ...createV3ScenarioMetadata({
          slides: [{ ...createScenarioSlide(), source: malformedSource }],
        }),
      })
    ).toThrow('Invalid scenario project backup metadata.');
  });
});

describe('backup v3 scenario project metadata id boundary', () => {
  it.each([
    ['project id', () => createV3ScenarioMetadataWithProjectId('../scenario')],
    ['asset id', createV3ScenarioMetadataWithUnsafeAssetId],
    ['export id', createV3ScenarioMetadataWithUnsafeExportId],
    ['step document id', createV3ScenarioMetadataWithUnsafeStepDocumentId],
  ])('rejects unsafe v3 scenario %s at the backup metadata boundary', (_label, createMetadata) => {
    expect(() => parseBackupMetadata(createMetadata())).toThrow();
  });

  it('rejects v3 capture slide sources with empty asset ids', () => {
    const metadata = createV3ScenarioMetadataWithImageAsset();
    const project = readFirstV3Project(metadata);
    const slide = project.slides[0]!;
    const source = { ...createCaptureSlideSource(), assetId: '' } as ScenarioSlideSource;
    metadata.scenarioProjects![0]!.entry.project = {
      ...project,
      slides: [{ ...slide, source }],
    };
    metadata.scenarioProjects![0]!.assets = [];

    expect(() => parseBackupMetadata(metadata)).toThrow(
      'Invalid scenario project backup metadata.'
    );
  });
});

describe('backup v3 scenario project metadata reference boundary', () => {
  it('rejects v3 asset references without matching asset descriptors', () => {
    const metadata = createV3ScenarioMetadataWithImageAsset();
    metadata.scenarioProjects![0]!.assets = [];

    expect(() => parseBackupMetadata(metadata)).toThrow(
      'Invalid scenario project backup metadata.'
    );
  });

  it('rejects v3 image edit document references without matching step documents', () => {
    const metadata = createV3ScenarioMetadataWithImageEditDocument();
    metadata.scenarioProjects![0]!.stepDocuments = [];

    expect(() => parseBackupMetadata(metadata)).toThrow(
      'Invalid scenario project backup metadata.'
    );
  });
});
