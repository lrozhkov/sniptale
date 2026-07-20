// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  DEFAULT_BROWSER_FRAME_STATE,
  DEFAULT_EDITOR_FRAME_SETTINGS,
} from '../../../features/editor/document/constants';
import { createScenarioCaptureStep } from '../../../features/scenario/project/public';
import { getEmbeddedEditorUrlMocks } from './editor-url.test-support';

const {
  blobToDataUrlMock,
  getScenarioAssetBlobMock,
  getScenarioStepEditorDocumentRecordMock,
  persistPendingEditorBootstrapPayloadMock,
} = vi.hoisted(() => ({
  blobToDataUrlMock: vi.fn(),
  getScenarioAssetBlobMock: vi.fn(),
  getScenarioStepEditorDocumentRecordMock: vi.fn(),
  persistPendingEditorBootstrapPayloadMock: vi.fn(),
}));

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

vi.mock('../../../platform/media-utils/data-url', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/media-utils/data-url')>()),
  blobToDataUrl: blobToDataUrlMock,
}));

vi.mock('../../../composition/persistence/scenario/store/public', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../composition/persistence/scenario/store/public')
  >()),
  getScenarioAssetBlob: getScenarioAssetBlobMock,
  getScenarioStepEditorDocumentRecord: getScenarioStepEditorDocumentRecordMock,
}));

vi.mock('../../../workflows/editor/bootstrap', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../workflows/editor/bootstrap')>()),
  persistPendingEditorBootstrapPayload: persistPendingEditorBootstrapPayloadMock,
}));

import { ScenarioEmbeddedEditorHost } from './ScenarioEmbeddedEditorHost';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createEditorDocument() {
  return {
    version: 1 as const,
    sourceImageData: 'data:image/png;base64,doc',
    sourceName: null,
    sourceWidth: 320,
    sourceHeight: 180,
    canvasWidth: 320,
    canvasHeight: 180,
    sourceLeft: 0,
    sourceTop: 0,
    sourceDisplayWidth: 320,
    sourceDisplayHeight: 180,
    frame: DEFAULT_EDITOR_FRAME_SETTINGS,
    browserFrame: DEFAULT_BROWSER_FRAME_STATE,
    canvasJson: '{"version":"7.2.0","objects":[]}',
  };
}

function createStep() {
  return createScenarioCaptureStep({
    assetId: 'asset-1',
    title: 'Capture title',
    page: {
      title: 'Page title',
      url: 'https://example.com/page',
      viewport: { x: 0, y: 0, width: 1280, height: 720 },
      scrollX: 0,
      scrollY: 0,
      devicePixelRatio: 1,
    },
  });
}

async function flushEffects() {
  await Promise.resolve();
  await Promise.resolve();
}

async function renderHost() {
  const onApplyEditedCapture = vi.fn().mockResolvedValue(undefined);
  const onClose = vi.fn();

  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(
      <ScenarioEmbeddedEditorHost
        onApplyEditedCapture={onApplyEditedCapture}
        onClose={onClose}
        step={createStep()}
      />
    );
    await flushEffects();
  });

  return { onClose };
}

function createCompatOverlayDocument() {
  return {
    ...createEditorDocument(),
    canvasJson: JSON.stringify({
      version: '7.2.0',
      objects: [
        {
          sniptaleId: 'frame-1',
          sniptaleMetaKind: 'scenario-focus-rect',
          left: 10,
          top: 20,
          width: 100,
          height: 40,
        },
        {
          sniptaleId: 'text-1',
          type: 'Textbox',
          text: 'Keep me',
        },
      ],
    }),
  };
}

async function renderHostWithStep(step = createStep()) {
  const onApplyEditedCapture = vi.fn().mockResolvedValue(undefined);
  const onClose = vi.fn();

  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(
      <ScenarioEmbeddedEditorHost
        onApplyEditedCapture={onApplyEditedCapture}
        onClose={onClose}
        step={step}
      />
    );
    await flushEffects();
  });
}

function expectSyncedCompatBootstrapDocument(canvasJson: string) {
  expect(JSON.parse(canvasJson)).toEqual({
    version: '7.2.0',
    objects: [
      {
        sniptaleId: 'text-1',
        text: 'Keep me',
        type: 'Textbox',
      },
    ],
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.clearAllMocks();
  getScenarioAssetBlobMock.mockResolvedValue(new Blob(['image'], { type: 'image/png' }));
  getScenarioStepEditorDocumentRecordMock.mockResolvedValue(undefined);
  blobToDataUrlMock.mockResolvedValue('data:image/png;base64,abc');
  persistPendingEditorBootstrapPayloadMock.mockResolvedValue('bootstrap-1');
  getEmbeddedEditorUrlMocks().createEditorSessionIdMock.mockReturnValue('session-1');
  getEmbeddedEditorUrlMocks().buildEditorUrlMock.mockReturnValue(
    '/editor/index.html?sessionId=session-1&embed=scenario'
  );
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

it('resolves the iframe bootstrap payload inside the scenario modal host', async () => {
  await renderHost();

  const dialog = container?.querySelector<HTMLDivElement>('[role="dialog"]');

  expect(dialog).not.toBeNull();
  expect(dialog?.className).toContain('h-[calc(100vh-24px)]');
  expect(dialog?.style.width).toBe('calc(100vw - 24px)');
  expect(dialog?.style.maxWidth).toBe('');
  expect(container?.textContent).toContain('Capture title');
  expect(getScenarioAssetBlobMock).toHaveBeenCalledWith('asset-1');
  expect(persistPendingEditorBootstrapPayloadMock).toHaveBeenCalledWith({
    dataUrl: 'data:image/png;base64,abc',
    document: null,
    title: 'Page title',
    url: 'https://example.com/page',
  });
  expect(getEmbeddedEditorUrlMocks().buildEditorUrlMock).toHaveBeenCalledWith({
    bootstrapId: 'bootstrap-1',
    embedMode: 'scenario',
    sessionId: 'session-1',
  });
  expect(container?.querySelector('iframe')?.getAttribute('src')).toBe(
    '/editor/index.html?sessionId=session-1&embed=scenario'
  );
});

it('renders a translated runtime error when the scenario asset cannot be loaded', async () => {
  getScenarioAssetBlobMock.mockResolvedValue(null);

  await renderHost();

  expect(container?.textContent).toContain('shared.runtime.readBlobFailed');
  expect(container?.querySelector('iframe')).toBeNull();
});

it('prefers the persisted step document when reopening the embedded editor', async () => {
  const stepDocument = createEditorDocument();
  getScenarioStepEditorDocumentRecordMock.mockResolvedValue({
    createdAt: 1,
    document: stepDocument,
    projectId: 'project-1',
    stepId: 'step-1',
    updatedAt: 2,
  });

  await renderHost();

  expect(blobToDataUrlMock).not.toHaveBeenCalled();
  expect(persistPendingEditorBootstrapPayloadMock).toHaveBeenCalledWith({
    dataUrl: stepDocument.sourceImageData,
    document: stepDocument,
    title: 'Page title',
    url: 'https://example.com/page',
  });
});

it('syncs compat overlays from the current step before reopening the embedded editor', async () => {
  const stepDocument = createCompatOverlayDocument();
  getScenarioStepEditorDocumentRecordMock.mockResolvedValue({
    createdAt: 1,
    document: stepDocument,
    projectId: 'project-1',
    stepId: 'step-1',
    updatedAt: 2,
  });
  await renderHostWithStep(
    createScenarioCaptureStep({
      assetId: 'asset-1',
      title: 'Capture title',
      overlays: [],
      page: {
        title: 'Page title',
        url: 'https://example.com/page',
        viewport: { x: 0, y: 0, width: 1280, height: 720 },
        scrollX: 0,
        scrollY: 0,
        devicePixelRatio: 1,
      },
    })
  );

  const persistedPayload = persistPendingEditorBootstrapPayloadMock.mock.calls[0]?.[0];
  expect(persistedPayload).toEqual(
    expect.objectContaining({
      dataUrl: stepDocument.sourceImageData,
      document: expect.objectContaining({
        canvasJson: expect.any(String),
      }),
      title: 'Page title',
      url: 'https://example.com/page',
    })
  );
  expectSyncedCompatBootstrapDocument(persistedPayload.document.canvasJson);
});
