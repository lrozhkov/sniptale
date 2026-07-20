import { expect, it } from 'vitest';
import type { ScenarioProjectEntry } from '../../../composition/persistence/scenario/contracts';
import {
  DEFAULT_BROWSER_FRAME_STATE,
  DEFAULT_EDITOR_FRAME_SETTINGS,
} from '../../../features/editor/document/constants';
import { type ScenarioPageDescriptor } from '@sniptale/runtime-contracts/scenario/types/geometry';
import {
  type ScenarioProject,
  type ScenarioStep,
} from '../../../features/scenario/contracts/types/project';
import type { ScenarioSlideSource } from '@sniptale/runtime-contracts/scenario/types/v3';
import {
  createScenarioImageElement,
  createScenarioProjectV3,
  createScenarioSlide,
  createScenarioTextElement,
} from '../../../features/scenario/project/v3';
import {
  applyMediaEntryPrivacyOptions,
  applyScenarioProjectPrivacyOptions,
  applyScenarioStepDocumentPrivacyOptions,
  countScenarioProjectEntrySourceMetadata,
} from './privacy';

function createPage(url: string): ScenarioPageDescriptor {
  return {
    title: 'Private page',
    url,
    viewport: { x: 0, y: 0, width: 1280, height: 720 },
    scrollX: 0,
    scrollY: 0,
    devicePixelRatio: 1,
  };
}

function createCaptureSource(page: ScenarioPageDescriptor): ScenarioSlideSource {
  return {
    assetId: 'asset-1',
    captureMetadata: { pointerRange: null, scroll: null, trigger: 'pointer-up' },
    captureSurface: 'visible',
    cursorPoint: null,
    galleryAssetId: null,
    interactionPoint: null,
    kind: 'capture',
    page,
    sourceKind: 'manual',
    target: null,
  };
}

function createScenarioProjectEntry(): ScenarioProjectEntry {
  const slidePage = createPage('https://example.com/reset?token=secret#hash');
  const imagePage = createPage('https://example.com/invite?code=secret');
  const image = createScenarioImageElement({
    captureContext: {
      captureMetadata: { pointerRange: null, scroll: null, trigger: 'pointer-up' },
      cursorPoint: null,
      interactionPoint: null,
      page: imagePage,
      target: null,
    },
    editDocumentId: 'doc-1',
  });
  const slide = createScenarioSlide({
    elements: [image],
    source: createCaptureSource(slidePage),
  });
  const project = {
    ...createScenarioProjectV3('Privacy'),
    id: 'scenario-1',
    slides: [slide],
    trash: [{ deletedAt: 3, originalIndex: 0, slide }],
  };

  return { createdAt: 1, id: project.id, project, updatedAt: 2 };
}

function createLegacyCaptureStep(id: string, page: ScenarioPageDescriptor): ScenarioStep {
  return {
    assetId: 'asset-1',
    body: '',
    captureMetadata: { pointerRange: null, scroll: null, trigger: 'pointer-up' },
    captureSurface: 'visible',
    createdAt: 1,
    cursorPoint: null,
    galleryAssetId: null,
    id,
    imageTransform: { scale: 1, x: 0, y: 0 },
    interactionPoint: null,
    kind: 'capture',
    overlays: [],
    page,
    sourceKind: 'manual',
    target: null,
    title: 'Step',
    updatedAt: 2,
    viewportTransform: { height: 720, width: 1280, x: 0, y: 0 },
  };
}

function createLegacyScenarioProject(): ScenarioProject {
  const step = createLegacyCaptureStep(
    'step-1',
    createPage('https://example.com/reset?token=secret#hash')
  );

  return {
    createdAt: 1,
    id: 'scenario-legacy',
    name: 'Legacy',
    steps: [step],
    suggestedEvents: [],
    trash: [{ deletedAt: 3, originalIndex: 0, step }],
    updatedAt: 2,
    version: 2,
  };
}

it('strips source metadata from scenario v3 slide and image capture contexts', () => {
  const entry = createScenarioProjectEntry();

  const result = applyScenarioProjectPrivacyOptions(entry, {
    includeEditorDrafts: true,
    includeSourceMetadata: false,
    includeTelemetry: true,
    includeWebSnapshots: true,
    scope: 'all',
  });

  expect(countScenarioProjectEntrySourceMetadata(entry)).toBe(4);
  expect(countScenarioProjectEntrySourceMetadata(result)).toBe(0);
  expect(JSON.stringify(result)).not.toContain('token=secret');
  expect(JSON.stringify(result)).not.toContain('code=secret');
});

it('strips media library source metadata when source metadata export is disabled', () => {
  expect(
    applyMediaEntryPrivacyOptions(
      {
        createdAt: 1,
        duration: null,
        filename: 'asset.png',
        height: 100,
        id: 'asset-1',
        kind: 'screenshot',
        mimeType: 'image/png',
        originalFilename: 'asset.png',
        size: 10,
        source: { kind: 'screenshot' },
        sourceFavicon: 'https://example.com/favicon.ico',
        sourceTitle: 'Private page',
        sourceUrl: 'https://example.com/reset?token=secret',
        tags: [],
        updatedAt: 2,
        width: 100,
      },
      {
        includeEditorDrafts: true,
        includeSourceMetadata: false,
        includeTelemetry: true,
        includeWebSnapshots: true,
        scope: 'all',
      }
    )
  ).toEqual(expect.objectContaining({ sourceFavicon: null, sourceTitle: null, sourceUrl: null }));
});

it('drops scenario v3 image edit document references when editor drafts are excluded', () => {
  const entry = createScenarioProjectEntry();

  const result = applyScenarioProjectPrivacyOptions(entry, {
    includeEditorDrafts: false,
    includeSourceMetadata: false,
    includeTelemetry: true,
    includeWebSnapshots: true,
    scope: 'all',
  });

  if (result.project.version !== 3) {
    throw new Error('Expected scenario v3 fixture');
  }

  expect(result.project.slides[0]?.elements[0]).toMatchObject({
    captureContext: { page: { title: null, url: null } },
    editDocumentId: null,
  });
});

it('sanitizes scenario v3 page URLs when source metadata is retained', () => {
  const entry = createScenarioProjectEntry();

  const result = applyScenarioProjectPrivacyOptions(entry, {
    includeEditorDrafts: true,
    includeSourceMetadata: true,
    includeTelemetry: true,
    includeWebSnapshots: true,
    scope: 'all',
  });

  if (result.project.version !== 3) {
    throw new Error('Expected scenario v3 fixture');
  }

  const image = result.project.slides[0]?.elements[0];
  expect(result.project.slides[0]?.source).toMatchObject({
    page: { title: 'Private page', url: 'https://example.com/' },
  });
  expect(image?.kind === 'image' ? image.captureContext?.page : null).toMatchObject({
    title: 'Private page',
    url: 'https://example.com/',
  });
});

it('counts source metadata in legacy scenario steps and trash', () => {
  expect(
    countScenarioProjectEntrySourceMetadata({
      createdAt: 1,
      id: 'scenario-legacy',
      project: createLegacyScenarioProject(),
      updatedAt: 2,
    })
  ).toBe(2);
});

it('leaves non-image scenario v3 elements unchanged while stripping slide source metadata', () => {
  const text = createScenarioTextElement({ text: 'Keep me' });
  const project = {
    ...createScenarioProjectV3('Privacy'),
    id: 'scenario-1',
    slides: [
      createScenarioSlide({
        elements: [text],
        source: createCaptureSource(createPage('https://example.com/reset?token=secret#hash')),
      }),
    ],
  };
  const entry: ScenarioProjectEntry = { createdAt: 1, id: project.id, project, updatedAt: 2 };

  const result = applyScenarioProjectPrivacyOptions(entry, {
    includeEditorDrafts: false,
    includeSourceMetadata: false,
    includeTelemetry: true,
    includeWebSnapshots: true,
    scope: 'all',
  });

  if (result.project.version !== 3) {
    throw new Error('Expected scenario v3 fixture');
  }

  expect(result.project.slides[0]?.elements[0]).toBe(text);
  expect(result.project.slides[0]?.source).toMatchObject({
    page: { title: null, url: null },
  });
});

it('sanitizes editor document browser URLs when source metadata is included', () => {
  const entry = {
    createdAt: 1,
    document: {
      version: 1 as const,
      sourceImageData: '',
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
        browserUrl: 'https://example.com/reset?token=secret#hash',
      },
      browserFrame: {
        ...DEFAULT_BROWSER_FRAME_STATE,
        url: 'https://example.com/invite?code=secret',
      },
      canvasJson: '{}',
    },
    projectId: 'scenario-1',
    stepId: 'step-1',
    updatedAt: 2,
  };

  const result = applyScenarioStepDocumentPrivacyOptions(entry, {
    includeEditorDrafts: true,
    includeSourceMetadata: true,
    includeTelemetry: true,
    includeWebSnapshots: true,
    scope: 'all',
  });

  expect(result.document.frame.browserUrl).toBe('https://example.com/');
  expect(result.document.browserFrame?.url).toBe('https://example.com/');
});
