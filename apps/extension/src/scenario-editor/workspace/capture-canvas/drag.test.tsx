// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createScenarioCaptureStep } from '../../../features/scenario/project/public';
import { ScenarioWorkspaceCaptureCanvas } from './view';

const { clearCanvasDragPreviewMock } = vi.hoisted(() => ({
  clearCanvasDragPreviewMock: vi.fn(),
}));

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

vi.mock('./drag-session', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./drag-session')>();
  return {
    ...actual,
    clearCanvasDragPreview(onDragPreview: (patch: unknown) => void) {
      clearCanvasDragPreviewMock();
      actual.clearCanvasDragPreview(onDragPreview);
    },
  };
});

vi.mock('./preview', () => ({
  ScenarioWorkspacePreview: () => <div data-testid="scenario-workspace-preview" />,
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createStep() {
  return createScenarioCaptureStep({
    assetId: 'asset-1',
    title: 'Capture',
    page: {
      title: 'Page',
      url: 'https://example.com',
      viewport: { x: 0, y: 0, width: 1200, height: 800 },
      scrollX: 0,
      scrollY: 0,
      devicePixelRatio: 1,
    },
  });
}

function renderCanvas(props?: Partial<Parameters<typeof ScenarioWorkspaceCaptureCanvas>[0]>) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => {
    root?.render(
      <ScenarioWorkspaceCaptureCanvas
        onOpenQuickEdit={vi.fn()}
        onUpdateStep={vi.fn()}
        step={createStep()}
        {...props}
      />
    );
  });
}

function defineStageRect(stage: HTMLDivElement) {
  Object.defineProperty(stage, 'getBoundingClientRect', {
    value: () => ({
      left: 0,
      top: 0,
      width: 720,
      height: 420,
      right: 720,
      bottom: 420,
      x: 0,
      y: 0,
      toJSON: () => null,
    }),
  });
}

function expectStage(): HTMLDivElement {
  const stage = container?.querySelector<HTMLDivElement>('.touch-none');
  expect(stage).not.toBeNull();
  if (!stage) {
    throw new Error('Expected workspace stage');
  }

  return stage;
}

function dispatchPointerDown(stage: HTMLDivElement) {
  stage.dispatchEvent(
    new PointerEvent('pointerdown', {
      bubbles: true,
      cancelable: true,
      clientX: 100,
      clientY: 100,
    })
  );
}

function rerenderCanvas(
  step: ReturnType<typeof createStep>,
  onUpdateStep: Parameters<typeof ScenarioWorkspaceCaptureCanvas>[0]['onUpdateStep']
) {
  root?.render(
    <ScenarioWorkspaceCaptureCanvas
      onOpenQuickEdit={vi.fn()}
      onUpdateStep={onUpdateStep}
      step={step}
    />
  );
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('PointerEvent', MouseEvent);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {});
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    }
  );
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  clearCanvasDragPreviewMock.mockReset();
  vi.unstubAllGlobals();
});

it('keeps the active drag session alive across parent rerenders and commits through the latest callback', () => {
  const step = createStep();
  const firstOnUpdateStep = vi.fn();

  renderCanvas({
    onUpdateStep: firstOnUpdateStep,
    step,
  });
  const stage = expectStage();
  defineStageRect(stage);

  act(() => {
    dispatchPointerDown(stage);
  });

  const secondOnUpdateStep = vi.fn();
  act(() => {
    rerenderCanvas(step, secondOnUpdateStep);
  });

  expect(clearCanvasDragPreviewMock).not.toHaveBeenCalled();

  act(() => {
    window.dispatchEvent(
      new PointerEvent('pointerup', {
        bubbles: true,
        cancelable: true,
        clientX: 140,
        clientY: 120,
      })
    );
  });

  expect(firstOnUpdateStep).not.toHaveBeenCalled();
  expect(secondOnUpdateStep).toHaveBeenCalledTimes(1);
  expect(secondOnUpdateStep).toHaveBeenCalledWith({
    imageTransform: expect.objectContaining({ x: 40, y: 20 }),
  });
});
