// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createScenarioCaptureStep } from '../../../features/scenario/project/public';
import { ScenarioWorkspaceStageShell } from './surface';

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
    title: 'Capture title',
  });
}

function registerWorkspaceStageShellScope() {
  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('PointerEvent', MouseEvent);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
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
}

function createStageShellCallbacks() {
  return {
    onDecreaseZoom: vi.fn(),
    onIncreaseZoom: vi.fn(),
    onOpenEditor: vi.fn(),
    onResetView: vi.fn(),
    setDragState: vi.fn(),
  };
}

function renderStageShell() {
  const callbacks = {
    ...createStageShellCallbacks(),
  };
  const containerRef = { current: null as HTMLDivElement | null };
  const stageRef = { current: null as HTMLDivElement | null };

  act(() => {
    root?.render(
      <ScenarioWorkspaceStageShell
        containerRef={containerRef}
        dragging={false}
        onDecreaseZoom={callbacks.onDecreaseZoom}
        onIncreaseZoom={callbacks.onIncreaseZoom}
        onOpenEditor={callbacks.onOpenEditor}
        onResetView={callbacks.onResetView}
        onToggleClickPreview={vi.fn()}
        onToggleFramePreview={vi.fn()}
        scale={1}
        setDragState={callbacks.setDragState}
        stageRef={stageRef}
        step={createStep()}
        clickPreviewActive={false}
        clickPreviewVisible={false}
        framePreviewActive={false}
        framePreviewVisible={false}
      />
    );
  });

  return { callbacks, stageRef };
}

function expectRenderedStage() {
  const stage = container?.querySelector<HTMLDivElement>('.touch-none');
  expect(stage).not.toBeNull();
  expect(container?.querySelector('[data-testid="scenario-workspace-preview"]')).not.toBeNull();

  if (!stage) {
    throw new Error('Expected workspace stage');
  }

  return stage;
}

function defineStageRect(stage: HTMLDivElement) {
  Object.defineProperty(stage, 'getBoundingClientRect', {
    value: () => ({
      left: 10,
      top: 20,
      width: 720,
      height: 420,
      right: 730,
      bottom: 440,
      x: 10,
      y: 20,
      toJSON: () => null,
    }),
  });
}

function triggerStageShellActions(stage: HTMLDivElement) {
  act(() => {
    container
      ?.querySelector<HTMLButtonElement>('[aria-label="scenario.editor.zoomOut"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    container
      ?.querySelector<HTMLButtonElement>('[aria-label="scenario.editor.resetView"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    container
      ?.querySelector<HTMLButtonElement>('[aria-label="scenario.editor.zoomIn"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    container
      ?.querySelector<HTMLButtonElement>('[aria-label="scenario.editor.quickEdit"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    stage.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    stage.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        clientX: 110,
        clientY: 160,
      })
    );
  });
}

function verifiesPreviewArtworkAndPanEntry() {
  const { callbacks, stageRef } = renderStageShell();
  const stage = expectRenderedStage();
  defineStageRect(stage);
  expect(stageRef.current).toBe(stage);
  expect(
    Array.from(container?.querySelectorAll<HTMLButtonElement>('button[aria-label]') ?? []).map(
      (button) => button.getAttribute('aria-label')
    )
  ).toEqual([
    'scenario.editor.zoomIn',
    'scenario.editor.zoomOut',
    'scenario.editor.resetView',
    'scenario.editor.quickEdit',
  ]);
  triggerStageShellActions(stage);

  expect(callbacks.onDecreaseZoom).toHaveBeenCalledTimes(1);
  expect(callbacks.onResetView).toHaveBeenCalledTimes(1);
  expect(callbacks.onIncreaseZoom).toHaveBeenCalledTimes(1);
  expect(callbacks.onOpenEditor).toHaveBeenCalledTimes(2);
  expect(callbacks.setDragState).toHaveBeenCalledWith(
    expect.objectContaining({
      origin: { x: 110, y: 160 },
      snapshot: expect.objectContaining({ id: expect.any(String), kind: 'capture' }),
    })
  );
}

function verifiesPointerDownGuardWithoutStageBounds() {
  const { callbacks, stageRef } = renderStageShell();
  const stage = expectRenderedStage();
  stageRef.current = null;

  act(() => {
    stage.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        clientX: 20,
        clientY: 30,
      })
    );
  });

  expect(callbacks.setDragState).not.toHaveBeenCalled();
}

function renderPreviewActionStageShell() {
  const callbacks = {
    ...createStageShellCallbacks(),
    onToggleClickPreview: vi.fn(),
    onToggleFramePreview: vi.fn(),
  };
  const containerRef = { current: null as HTMLDivElement | null };
  const stageRef = { current: null as HTMLDivElement | null };
  const step = createScenarioCaptureStep({
    assetId: 'asset-1',
    target: {
      selector: '#submit',
      iframeSelector: null,
      tagName: 'button',
      role: 'button',
      text: 'Submit',
      ariaLabel: null,
      title: null,
      rect: { x: 10, y: 20, width: 100, height: 40 },
      framePadding: { top: 3, left: 3, right: 3, bottom: 3 },
    },
    cursorPoint: { x: 40, y: 50 },
  });

  act(() => {
    root?.render(
      <ScenarioWorkspaceStageShell
        clickPreviewActive={false}
        clickPreviewVisible
        containerRef={containerRef}
        dragging={false}
        framePreviewActive
        framePreviewVisible
        onDecreaseZoom={callbacks.onDecreaseZoom}
        onIncreaseZoom={callbacks.onIncreaseZoom}
        onOpenEditor={callbacks.onOpenEditor}
        onResetView={callbacks.onResetView}
        onToggleClickPreview={callbacks.onToggleClickPreview}
        onToggleFramePreview={callbacks.onToggleFramePreview}
        scale={1}
        setDragState={callbacks.setDragState}
        stageRef={stageRef}
        step={step}
      />
    );
  });

  return callbacks;
}

function verifiesPreviewActionPointerOwnership() {
  const callbacks = renderPreviewActionStageShell();
  const previewActions = container?.querySelector<HTMLElement>(
    '[data-ui="scenario.editor.workspace.preview-actions"]'
  );
  expect(previewActions?.className).toContain('bottom-4');
  expect(previewActions?.className).toContain('right-4');
  expect(previewActions?.className).toContain('group-hover:opacity-100');
  expect(previewActions?.className).toContain('group-focus-within:opacity-100');

  act(() => {
    container
      ?.querySelector<HTMLButtonElement>('[aria-label="scenario.editor.autoFrame"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });

  expect(callbacks.onToggleFramePreview).toHaveBeenCalledTimes(1);
  expect(callbacks.setDragState).not.toHaveBeenCalled();
}

function runScenarioWorkspaceStageShellSuite() {
  registerWorkspaceStageShellScope();

  it(
    'renders preview artwork, wires action buttons, and captures pan drags inside the stage',
    verifiesPreviewArtworkAndPanEntry
  );
  it(
    'ignores pointerdown gestures when the stage bounds are unavailable',
    verifiesPointerDownGuardWithoutStageBounds
  );
  it(
    'renders hover-gated preview actions and keeps their clicks from starting a stage drag',
    verifiesPreviewActionPointerOwnership
  );
}

describe('ScenarioWorkspaceStageShell', runScenarioWorkspaceStageShellSuite);
