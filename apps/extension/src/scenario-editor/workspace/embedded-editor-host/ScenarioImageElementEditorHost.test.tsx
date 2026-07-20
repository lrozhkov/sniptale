// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { EditorDocument } from '../../../features/editor/document/types';
import { translate } from '../../../platform/i18n';
import { createScenarioImageElement } from '../../../features/scenario/project/v3';
import { ScenarioImageElementEditorHost } from './ScenarioImageElementEditorHost';

const bootstrapMock = vi.hoisted(() => ({
  buildEditorUrl: vi.fn(),
  getScenarioAssetBlob: vi.fn(),
  getScenarioStepEditorDocumentRecord: vi.fn(),
  persistPendingEditorBootstrapPayload: vi.fn(),
}));

vi.mock('../../../workflows/editor/bootstrap', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../workflows/editor/bootstrap')>()),
  persistPendingEditorBootstrapPayload: bootstrapMock.persistPendingEditorBootstrapPayload,
}));
vi.mock('../../../features/editor/contracts/embed', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../features/editor/contracts/embed')>()),
  isEditorEmbedMessage: (value: unknown) =>
    !!value && typeof value === 'object' && 'type' in value && 'source' in value,
}));
vi.mock('@sniptale/platform/security/secure-random-id', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/security/secure-random-id')>()),
  createSecureRandomUuid: () => 'session-1',
}));
vi.mock('../../../platform/navigation/extension-pages/editor', () => ({
  buildEditorUrl: bootstrapMock.buildEditorUrl,
}));
vi.mock('../../../platform/media-utils/data-url', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/media-utils/data-url')>()),
  blobToDataUrl: () => Promise.resolve('data:image/png;base64,blob'),
}));
vi.mock('../../../composition/persistence/scenario/store/public', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../composition/persistence/scenario/store/public')
  >()),
  getScenarioAssetBlob: bootstrapMock.getScenarioAssetBlob,
  getScenarioStepEditorDocumentRecord: bootstrapMock.getScenarioStepEditorDocumentRecord,
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderHost() {
  const onApply = vi.fn().mockResolvedValue(undefined);
  const onClose = vi.fn();
  const element = {
    ...createScenarioImageElement({
      assetRef: { assetId: 'asset-1', galleryAssetId: null },
      captureContext: {
        captureMetadata: { pointerRange: null, scroll: null, trigger: 'pointer-up' },
        cursorPoint: null,
        interactionPoint: null,
        page: {
          devicePixelRatio: 1,
          scrollX: 0,
          scrollY: 0,
          title: 'Capture',
          url: 'https://example.test',
          viewport: { height: 900, width: 1440, x: 0, y: 0 },
        },
        target: null,
      },
      name: 'Screenshot',
    }),
    id: 'image-1',
  };

  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => {
    root?.render(
      <ScenarioImageElementEditorHost
        documentId="doc-1"
        element={element}
        onApply={onApply}
        onClose={onClose}
      />
    );
  });

  return { onApply, onClose };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  bootstrapMock.buildEditorUrl.mockReturnValue('https://app.test/editor?embed=scenario');
  bootstrapMock.getScenarioAssetBlob.mockResolvedValue(new Blob(['pixel']));
  bootstrapMock.getScenarioStepEditorDocumentRecord.mockResolvedValue(null);
  bootstrapMock.persistPendingEditorBootstrapPayload.mockResolvedValue('bootstrap-1');
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

it('bootstraps the image element editor from the asset and capture context', async () => {
  renderHost();
  await flushEffects();

  expect(bootstrapMock.getScenarioAssetBlob).toHaveBeenCalledWith('asset-1');
  expect(bootstrapMock.persistPendingEditorBootstrapPayload).toHaveBeenCalledWith(
    expect.objectContaining({ title: 'Screenshot', url: 'https://example.test' })
  );
  expect(container?.querySelector('iframe')?.getAttribute('src')).toContain('embed=scenario');
});

it('keeps the embedded editor dialog labelled without rendering a separate visible header', async () => {
  renderHost();
  await flushEffects();

  expect(container?.querySelector('.sniptale-modal-header')).toBeNull();
  expect(container?.querySelector('#scenario-image-element-editor-title')?.className).toContain(
    'sr-only'
  );
});

it('applies and closes only for owned embedded editor messages', async () => {
  const { onApply, onClose } = renderHost();
  await flushEffects();

  const iframe = container?.querySelector<HTMLIFrameElement>('iframe');
  dispatchEditorMessage(iframe, {
    dataUrl: 'data:image/png;base64,edited',
    document: createEditorDocument(),
    source: 'sniptale-editor-embed',
    type: 'scenario-apply',
  });
  await flushEffects();

  expect(onApply).toHaveBeenCalledWith({
    dataUrl: 'data:image/png;base64,edited',
    document: createEditorDocument(),
  });
  expect(onClose).toHaveBeenCalledTimes(1);
});

it('closes when the embedded editor sends an owned close message', async () => {
  const { onClose } = renderHost();
  await flushEffects();

  dispatchEditorMessage(container?.querySelector('iframe'), {
    source: 'sniptale-editor-embed',
    type: 'scenario-close',
  });

  expect(onClose).toHaveBeenCalledTimes(1);
});

it('surfaces bootstrap failures without mounting a partial editor frame', async () => {
  bootstrapMock.getScenarioAssetBlob.mockResolvedValue(null);

  renderHost();
  await flushEffects();

  expect(container?.querySelector('iframe')).toBeNull();
  expect(container?.textContent).toContain(translate('shared.runtime.readBlobFailed'));
});

async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function dispatchEditorMessage(iframe: HTMLIFrameElement | null | undefined, data: unknown) {
  window.dispatchEvent(
    new MessageEvent('message', {
      data,
      origin: window.location.origin,
      source: iframe?.contentWindow ?? window,
    })
  );
}

function createEditorDocument(): EditorDocument {
  return {
    browserFrame: { canvasMode: 'resize', contentMode: 'fit-content', title: '', url: '' },
    canvasHeight: 1,
    canvasJson: '{}',
    canvasWidth: 1,
    frame: {
      backgroundColor: '#fff',
      backgroundGradientAngle: 90,
      backgroundGradientFrom: '#fff',
      backgroundGradientTo: '#000',
      backgroundImageData: null,
      backgroundImageFit: 'cover',
      backgroundMode: 'color',
      browserMode: false,
      browserTitle: '',
      browserUrl: '',
      layoutMode: 'fit-image',
      paddingBottom: 0,
      paddingLeft: 0,
      paddingRight: 0,
      paddingTop: 0,
    },
    sourceDisplayHeight: 1,
    sourceDisplayWidth: 1,
    sourceHeight: 1,
    sourceImageData: 'data:image/png;base64,source',
    sourceLeft: 0,
    sourceName: null,
    sourceTop: 0,
    sourceWidth: 1,
    version: 1,
  };
}
