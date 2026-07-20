// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createScenarioCaptureStep } from '../../../features/scenario/project/public';

const { blobToDataUrlMock, getScenarioAssetBlobMock, measureImageBlobMock } = vi.hoisted(() => ({
  blobToDataUrlMock: vi.fn(),
  getScenarioAssetBlobMock: vi.fn(),
  measureImageBlobMock: vi.fn(),
}));

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({
    child: () => ({
      debug() {},
      error() {},
      info() {},
      log() {},
      warn() {},
    }),
    debug() {},
    error() {},
    info() {},
    log() {},
    warn() {},
  }),
}));

vi.mock('../../../platform/media-utils/data-url', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/media-utils/data-url')>()),
  blobToDataUrl: blobToDataUrlMock,
}));

vi.mock('@sniptale/platform/browser/media/image-dimensions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/media/image-dimensions')>()),
  measureImageBlob: measureImageBlobMock,
}));

vi.mock('../../../composition/persistence/scenario/store/public', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../composition/persistence/scenario/store/public')
  >()),
  getScenarioAssetBlob: getScenarioAssetBlobMock,
}));

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

import { ScenarioWorkspacePreview } from './preview';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

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

function renderPreview(step = createStep()) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  act(() => {
    root?.render(<ScenarioWorkspacePreview step={step} />);
  });
}

async function flushEffects() {
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  getScenarioAssetBlobMock.mockResolvedValue(new Blob(['image'], { type: 'image/png' }));
  measureImageBlobMock.mockResolvedValue({ width: 1280, height: 720 });
  blobToDataUrlMock.mockResolvedValue('data:image/png;base64,asset');
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

function verifiesAssetReuseAcrossTransformOnlyUpdates() {
  const baseStep = createStep();

  renderPreview(baseStep);

  return act(async () => {
    await flushEffects();

    renderPreview({
      ...baseStep,
      imageTransform: {
        ...baseStep.imageTransform,
        scale: 1.2,
        x: 24,
      },
    });
    await flushEffects();

    expect(getScenarioAssetBlobMock).toHaveBeenCalledTimes(1);
    expect(measureImageBlobMock).toHaveBeenCalledTimes(1);
    expect(blobToDataUrlMock).toHaveBeenCalledTimes(1);
    expect(container?.querySelector('svg')).not.toBeNull();
  });
}

describe('ScenarioWorkspacePreview', () => {
  it(
    'reuses the loaded asset when only the image transform changes during preview updates',
    verifiesAssetReuseAcrossTransformOnlyUpdates
  );

  it('keeps the empty preview state when the step has no stored asset blob', async () => {
    getScenarioAssetBlobMock.mockResolvedValueOnce(null);

    renderPreview();
    await act(async () => {
      await flushEffects();
    });

    expect(container?.querySelector('svg')).not.toBeNull();
    expect(container?.querySelector('[role="alert"]')).toBeNull();
    expect(container?.querySelector('image')).toBeNull();
  });

  it('surfaces asset loading failures separately from the empty preview state', async () => {
    getScenarioAssetBlobMock.mockRejectedValueOnce(new Error('asset read failed'));

    renderPreview();
    await act(async () => {
      await flushEffects();
    });

    expect(container?.querySelector('svg')).toBeNull();
    expect(container?.querySelector('[role="alert"]')?.textContent).toBe(
      'scenario.editor.workspacePreviewLoadError'
    );
  });

  it('renders the loaded capture asset inside the preview viewport when the blob resolves', async () => {
    renderPreview();

    await act(async () => {
      await flushEffects();
    });

    expect(container?.querySelector('svg')).not.toBeNull();
    expect(container?.querySelector('image')?.getAttribute('href')).toBe(
      'data:image/png;base64,asset'
    );
    expect(container?.querySelector('clipPath')).not.toBeNull();
  });
});
