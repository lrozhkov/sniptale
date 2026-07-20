// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createScenarioCaptureStep } from '../../../features/scenario/project/public';
import { ScenarioWorkspaceCaptureCanvas } from './view';

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

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
  const onOpenQuickEdit = vi.fn();
  const onUpdateStep = vi.fn();

  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => {
    root?.render(
      <ScenarioWorkspaceCaptureCanvas
        onOpenQuickEdit={onOpenQuickEdit}
        onUpdateStep={onUpdateStep}
        step={createStep()}
        {...props}
      />
    );
  });

  return { onOpenQuickEdit, onUpdateStep };
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('PointerEvent', MouseEvent);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {});
  vi.useFakeTimers();
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
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

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

function verifiesWheelBatching() {
  const { onUpdateStep } = renderCanvas();
  const stage = expectStage();

  const firstWheel = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -10 });
  const secondWheel = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -10 });

  act(() => {
    stage.dispatchEvent(firstWheel);
    stage.dispatchEvent(secondWheel);
  });

  expect(firstWheel.defaultPrevented).toBe(true);
  expect(secondWheel.defaultPrevented).toBe(true);
  expect(onUpdateStep).not.toHaveBeenCalled();

  act(() => {
    vi.advanceTimersByTime(300);
  });

  expect(onUpdateStep).toHaveBeenCalledTimes(1);
}

function verifiesButtonCommits() {
  const { onUpdateStep, onOpenQuickEdit } = renderCanvas();
  const stage = expectStage();

  act(() => {
    container?.querySelector<HTMLButtonElement>('[aria-label="scenario.editor.zoomOut"]')?.click();
    container?.querySelector<HTMLButtonElement>('[aria-label="scenario.editor.zoomIn"]')?.click();
    container
      ?.querySelector<HTMLButtonElement>('[aria-label="scenario.editor.resetView"]')
      ?.click();
    container
      ?.querySelector<HTMLButtonElement>('[aria-label="scenario.editor.quickEdit"]')
      ?.click();
    stage.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
  });

  expect(onUpdateStep).toHaveBeenCalledTimes(3);
  expect(onOpenQuickEdit).toHaveBeenCalledTimes(2);
}

function dispatchWorkspacePanGesture(stage: HTMLDivElement) {
  act(() => {
    stage.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        clientX: 100,
        clientY: 100,
      })
    );
  });

  act(() => {
    window.dispatchEvent(
      new PointerEvent('pointermove', {
        bubbles: true,
        cancelable: true,
        clientX: 140,
        clientY: 120,
      })
    );
    window.dispatchEvent(
      new PointerEvent('pointerup', {
        bubbles: true,
        cancelable: true,
        clientX: 140,
        clientY: 120,
      })
    );
  });
}

function dispatchWorkspaceClickOnlyGesture(stage: HTMLDivElement) {
  act(() => {
    stage.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        clientX: 100,
        clientY: 100,
      })
    );
  });

  act(() => {
    window.dispatchEvent(
      new PointerEvent('pointerup', {
        bubbles: true,
        cancelable: true,
        clientX: 100,
        clientY: 100,
      })
    );
  });
}

function verifiesPanCommitAndClickOnlyGuard() {
  const { onUpdateStep } = renderCanvas();
  const stage = expectStage();
  defineStageRect(stage);

  dispatchWorkspacePanGesture(stage);

  expect(onUpdateStep).toHaveBeenCalledTimes(1);
  expect(onUpdateStep).toHaveBeenCalledWith({
    imageTransform: expect.objectContaining({ x: 40, y: 20 }),
  });

  onUpdateStep.mockClear();
  dispatchWorkspaceClickOnlyGesture(stage);
  expect(onUpdateStep).not.toHaveBeenCalled();
}

function verifiesPendingWheelFlushOnOpen() {
  const { onOpenQuickEdit, onUpdateStep } = renderCanvas();
  expectStage();

  act(() => {
    container
      ?.querySelector('.touch-none')
      ?.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -10 }));
    container
      ?.querySelector<HTMLButtonElement>('[aria-label="scenario.editor.quickEdit"]')
      ?.click();
  });

  expect(onUpdateStep).toHaveBeenCalledTimes(1);
  expect(onOpenQuickEdit).toHaveBeenCalledTimes(1);
}

function verifiesPendingWheelFlushOnUnmount() {
  const { onUpdateStep } = renderCanvas();
  const stage = expectStage();

  act(() => {
    stage.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -10 }));
  });

  expect(onUpdateStep).not.toHaveBeenCalled();

  act(() => {
    root?.unmount();
  });

  expect(onUpdateStep).toHaveBeenCalledTimes(1);
}

function runScenarioWorkspaceCaptureCanvasSuite() {
  it(
    'batches wheel zoom into one final commit and prevents default scrolling',
    verifiesWheelBatching
  );
  it('commits one change per zoom button and reset button click', verifiesButtonCommits);
  it(
    'commits a single pan change when the user drags inside the canvas and ignores click-only gestures',
    verifiesPanCommitAndClickOnlyGuard
  );
  it(
    'flushes a pending wheel gesture before opening the embedded editor',
    verifiesPendingWheelFlushOnOpen
  );
  it(
    'flushes a pending wheel gesture when the canvas unmounts',
    verifiesPendingWheelFlushOnUnmount
  );
}

describe('ScenarioWorkspaceCaptureCanvas', runScenarioWorkspaceCaptureCanvasSuite);
