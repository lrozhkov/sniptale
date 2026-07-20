// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createScenarioCaptureStep } from '../../../features/scenario/project/public';
import { ScenarioQuickEditStage } from './ScenarioQuickEditStage';

const stageMocks = vi.hoisted(() => ({
  getScenarioAssetBlob: vi.fn(),
  measureImageBlob: vi.fn(),
}));

vi.mock('../../../composition/persistence/scenario/store/public', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../composition/persistence/scenario/store/public')
  >()),
  getScenarioAssetBlob: stageMocks.getScenarioAssetBlob,
}));

vi.mock('@sniptale/platform/browser/media/image-dimensions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/media/image-dimensions')>()),
  measureImageBlob: stageMocks.measureImageBlob,
}));

vi.mock('./stage.surface', () => ({
  ScenarioQuickEditStageSurface: (props: {
    layout: unknown;
    setDragState: (value: unknown) => void;
    step: { imageTransform: { x: number; y: number } };
  }) => (
    <div data-testid="stage-surface">
      <span data-testid="layout-ready">{props.layout ? 'ready' : 'loading'}</span>
      <span data-testid="draft-x">{props.step.imageTransform.x}</span>
      <button
        type="button"
        data-testid="start-drag"
        onClick={() =>
          props.setDragState({
            kind: 'pan',
            origin: { x: 0, y: 0 },
            snapshot: props.step,
          })
        }
      >
        drag
      </button>
    </div>
  ),
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createStep() {
  return createScenarioCaptureStep({
    assetId: 'asset-1',
    title: 'Step',
  });
}

async function renderStage(props: Parameters<typeof ScenarioQuickEditStage>[0]) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<ScenarioQuickEditStage {...props} />);
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('PointerEvent', MouseEvent);
  stageMocks.getScenarioAssetBlob.mockResolvedValue(new Blob(['asset']));
  stageMocks.measureImageBlob.mockResolvedValue({ width: 1280, height: 720 });
});

afterEach(async () => {
  await act(async () => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function runAssetDimensionsAndDraftTest() {
  it('loads asset dimensions and forwards draft step state into the surface seam', async () => {
    const onStepChange = vi.fn();
    await renderStage({
      activeTool: 'select',
      onActiveToolChange: vi.fn(),
      onSelectOverlay: vi.fn(),
      onStepChange,
      selectedOverlayId: null,
      step: createStep(),
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(stageMocks.getScenarioAssetBlob).toHaveBeenCalledWith('asset-1');
    expect(stageMocks.measureImageBlob).toHaveBeenCalled();
    expect(container?.querySelector('[data-testid="layout-ready"]')?.textContent).toBe('ready');
    expect(container?.querySelector('[data-testid="draft-x"]')?.textContent).toBe('0');
    expect(onStepChange).not.toHaveBeenCalled();
  });
}

function runDragSessionTest() {
  it('commits pan drag patches through the drag-session effect', async () => {
    const onStepChange = vi.fn();
    await renderStage({
      activeTool: 'select',
      onActiveToolChange: vi.fn(),
      onSelectOverlay: vi.fn(),
      onStepChange,
      selectedOverlayId: null,
      step: createStep(),
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const dragButton = container?.querySelector('[data-testid="start-drag"]');
    expect(dragButton).not.toBeNull();

    await act(async () => {
      dragButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    await act(async () => {
      window.dispatchEvent(new PointerEvent('pointermove', { clientX: 8, clientY: 12 }));
      window.dispatchEvent(new PointerEvent('pointerup', { clientX: 8, clientY: 12 }));
    });

    expect(onStepChange).toHaveBeenCalledWith(
      expect.objectContaining({
        imageTransform: expect.objectContaining({ x: 8, y: 12 }),
      })
    );
  });
}

function runAssetFailureFallbackTest() {
  it('keeps the stage in loading mode when asset dimensions cannot be resolved', async () => {
    stageMocks.measureImageBlob.mockRejectedValue(new Error('measure failed'));
    const onStepChange = vi.fn();

    await renderStage({
      activeTool: 'select',
      onActiveToolChange: vi.fn(),
      onSelectOverlay: vi.fn(),
      onStepChange,
      selectedOverlayId: null,
      step: createStep(),
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(stageMocks.measureImageBlob).toHaveBeenCalled();
    expect(container?.querySelector('[data-testid="layout-ready"]')?.textContent).toBe('loading');
    expect(onStepChange).not.toHaveBeenCalled();
  });
}

function runScenarioQuickEditStageSuite() {
  runAssetDimensionsAndDraftTest();
  runAssetFailureFallbackTest();
  runDragSessionTest();
}

describe('ScenarioQuickEditStage', runScenarioQuickEditStageSuite);
