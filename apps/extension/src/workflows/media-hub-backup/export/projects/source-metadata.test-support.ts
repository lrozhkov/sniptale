import { vi } from 'vitest';
import {
  DEFAULT_BROWSER_FRAME_STATE,
  DEFAULT_EDITOR_FRAME_SETTINGS,
} from '../../../../features/editor/document/constants';
import {
  createScenarioImageElement,
  createScenarioProjectV3,
  createScenarioSlide,
} from '../../../../features/scenario/project/v3';
import type { ScenarioSlideSource } from '@sniptale/runtime-contracts/scenario/types/v3';
import { createScenarioAssetRecord, readProjectBundleRecord } from './test-support';

const EDITOR_SOURCE_IMAGE_DATA_URL = 'data:image/png;base64,AA==';

export function createSourceMetadataProjectBundleDb() {
  return {
    get: vi.fn(readProjectBundleRecord),
    getAll: vi.fn(async (storeName: string) =>
      storeName === 'scenario_projects' ? [createScenarioProjectEntryWithSourceMetadata()] : []
    ),
    getAllFromIndex: vi.fn(async (storeName: string) => {
      if (storeName === 'scenario_assets') {
        return [createScenarioAssetRecord()];
      }
      if (storeName === 'scenario_step_editor_documents') {
        return [createScenarioStepDocumentRecordWithSourceMetadata()];
      }
      return [];
    }),
  };
}

function createScenarioProjectEntryWithSourceMetadata() {
  const project = {
    ...createScenarioProjectV3('Scenario'),
    createdAt: 1,
    id: 'scenario-1',
    slides: [
      createScenarioSlide({
        elements: [
          createScenarioImageElement({
            assetRef: { assetId: 'scenario-asset-1', galleryAssetId: null },
            captureContext: {
              captureMetadata: { pointerRange: null, scroll: null, trigger: 'pointer-up' },
              cursorPoint: null,
              interactionPoint: null,
              page: {
                title: 'Private image context page',
                url: 'https://image.example/reset?token=secret',
                viewport: { x: 0, y: 0, width: 1280, height: 720 },
                scrollX: 0,
                scrollY: 0,
                devicePixelRatio: 1,
              },
              target: null,
            },
            editDocumentId: 'step-1',
          }),
        ],
        id: 'slide-1',
        source: createCaptureSourceWithSourceMetadata(),
      }),
    ],
    updatedAt: 2,
  };
  return { createdAt: 1, id: project.id, project, updatedAt: 2 };
}

function createCaptureSourceWithSourceMetadata(): ScenarioSlideSource {
  return {
    assetId: 'scenario-asset-1',
    captureMetadata: { pointerRange: null, scroll: null, trigger: 'pointer-up' },
    captureSurface: null,
    cursorPoint: null,
    galleryAssetId: null,
    interactionPoint: null,
    kind: 'capture',
    page: {
      title: 'Private reset page',
      url: 'https://workspace.example/reset?token=secret#access_token=value',
      viewport: { x: 0, y: 0, width: 1280, height: 720 },
      scrollX: 0,
      scrollY: 0,
      devicePixelRatio: 1,
    },
    sourceKind: null,
    target: null,
  };
}

function createScenarioStepDocumentRecordWithSourceMetadata() {
  return {
    createdAt: 5,
    document: {
      version: 1,
      sourceImageData: EDITOR_SOURCE_IMAGE_DATA_URL,
      sourceName: null,
      sourceWidth: 100,
      sourceHeight: 100,
      canvasWidth: 100,
      canvasHeight: 100,
      sourceLeft: 0,
      sourceTop: 0,
      sourceDisplayWidth: 100,
      sourceDisplayHeight: 100,
      frame: {
        ...DEFAULT_EDITOR_FRAME_SETTINGS,
        browserTitle: 'Private editor page',
        browserUrl: 'https://editor.example/invite?code=secret',
      },
      browserFrame: {
        ...DEFAULT_BROWSER_FRAME_STATE,
        title: 'Private browser frame',
        url: 'https://editor.example/reset?token=secret',
        faviconDataUrl: 'data:image/png;base64,favicon',
      },
      canvasJson: '{}',
    },
    projectId: 'scenario-1',
    stepId: 'step-1',
    updatedAt: 6,
  };
}
