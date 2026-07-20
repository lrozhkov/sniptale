// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  DEFAULT_BROWSER_FRAME_STATE,
  DEFAULT_EDITOR_FRAME_SETTINGS,
} from '../../../features/editor/document/constants';
import {
  createScenarioEditorEmbedApplyMessage,
  createScenarioEditorEmbedCloseMessage,
} from '../../../features/editor/contracts/embed';
import { createScenarioCaptureStep } from '../../../features/scenario/project/public';

const {
  blobToDataUrlMock,
  buildEditorUrlMock,
  createEditorSessionIdMock,
  getScenarioAssetBlobMock,
  getScenarioStepEditorDocumentRecordMock,
  persistPendingEditorBootstrapPayloadMock,
} = vi.hoisted(() => ({
  blobToDataUrlMock: vi.fn(),
  buildEditorUrlMock: vi.fn(),
  createEditorSessionIdMock: vi.fn(),
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

vi.mock('@sniptale/platform/security/secure-random-id', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/security/secure-random-id')>()),
  createSecureRandomUuid: createEditorSessionIdMock,
}));

vi.mock('../../../platform/navigation/extension-pages/editor', () => ({
  buildEditorUrl: buildEditorUrlMock,
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

async function renderHost(props: Partial<Parameters<typeof ScenarioEmbeddedEditorHost>[0]> = {}) {
  const onApplyEditedCapture = vi.fn().mockResolvedValue(undefined);
  const onClose = vi.fn();
  const step = createStep();

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
        {...props}
      />
    );
    await flushEffects();
  });

  return { onApplyEditedCapture, onClose, step };
}

function dispatchFrameMessage(
  iframe: HTMLIFrameElement,
  data: unknown,
  overrides: { origin?: string; source?: MessageEventSource | null } = {}
) {
  const event = new MessageEvent('message', {
    data,
    origin: overrides.origin ?? window.location.origin,
  });

  Object.defineProperty(event, 'source', {
    configurable: true,
    value: overrides.source ?? iframe.contentWindow,
  });

  window.dispatchEvent(event);
}

function expectHostIframe(): HTMLIFrameElement {
  const iframe = container?.querySelector('iframe');

  expect(iframe).not.toBeNull();
  if (!iframe) {
    throw new Error('Expected embedded editor iframe');
  }

  return iframe;
}

function dispatchApplyMessageVariants(
  iframe: HTMLIFrameElement,
  document: ReturnType<typeof createEditorDocument>
) {
  dispatchFrameMessage(
    iframe,
    createScenarioEditorEmbedApplyMessage('data:image/png;base64,next', document)
  );
  dispatchFrameMessage(
    iframe,
    createScenarioEditorEmbedApplyMessage('data:image/png;base64,ignored', document),
    { origin: 'https://example.com' }
  );
  dispatchFrameMessage(
    iframe,
    createScenarioEditorEmbedApplyMessage('data:image/png;base64,ignored', document),
    { source: window }
  );
  dispatchFrameMessage(iframe, { source: 'sniptale-editor-embed', type: 'unknown' });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.clearAllMocks();
  getScenarioAssetBlobMock.mockResolvedValue(new Blob(['image'], { type: 'image/png' }));
  getScenarioStepEditorDocumentRecordMock.mockResolvedValue(undefined);
  blobToDataUrlMock.mockResolvedValue('data:image/png;base64,abc');
  persistPendingEditorBootstrapPayloadMock.mockResolvedValue('bootstrap-1');
  createEditorSessionIdMock.mockReturnValue('session-1');
  buildEditorUrlMock.mockReturnValue('/editor/index.html?sessionId=session-1&embed=scenario');
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

it('applies edits only from the owned iframe and shows saving state until the host resolves', async () => {
  let resolveSave: (() => void) | null = null;
  const onApplyEditedCapture = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        resolveSave = resolve;
      })
  );
  const rendered = await renderHost({ onApplyEditedCapture });
  const { step } = rendered;
  const iframe = expectHostIframe();

  expect(container?.querySelector('[role="dialog"]')).not.toBeNull();

  const document = createEditorDocument();
  act(() => {
    dispatchApplyMessageVariants(iframe, document);
  });

  await act(async () => {
    await flushEffects();
  });

  expect(onApplyEditedCapture).toHaveBeenCalledTimes(1);
  expect(onApplyEditedCapture).toHaveBeenCalledWith(step.id, {
    dataUrl: 'data:image/png;base64,next',
    document,
  });
  expect(container?.textContent).toContain('common.states.saving');

  await act(async () => {
    resolveSave?.();
    await flushEffects();
  });

  expect(container?.textContent).not.toContain('common.states.saving');
  expect(rendered.onClose).toHaveBeenCalledTimes(1);
});

it('shows host save failures and handles explicit close messages from the iframe', async () => {
  const onApplyEditedCapture = vi.fn().mockRejectedValue(new Error('save failed'));
  const failedHost = await renderHost({ onApplyEditedCapture });
  const iframe = expectHostIframe();

  await act(async () => {
    dispatchFrameMessage(
      iframe,
      createScenarioEditorEmbedApplyMessage('data:image/png;base64,next', createEditorDocument())
    );
    await flushEffects();
  });

  expect(container?.textContent).toContain('save failed');
  expect(failedHost.onClose).not.toHaveBeenCalled();

  const { onClose } = await renderHost();
  const freshIframe = expectHostIframe();

  act(() => {
    dispatchFrameMessage(freshIframe, createScenarioEditorEmbedCloseMessage());
  });

  expect(onClose).toHaveBeenCalledTimes(1);
});
