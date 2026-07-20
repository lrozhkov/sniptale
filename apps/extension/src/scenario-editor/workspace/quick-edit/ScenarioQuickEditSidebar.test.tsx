// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createScenarioCaptureStep } from '../../../features/scenario/project/public';
import { ScenarioQuickEditSidebar } from './ScenarioQuickEditSidebar';

vi.mock('./sidebar.sections', () => ({
  QuickEditStepFields: (props: { onStepChange: (patch: { title: string }) => void }) => (
    <button
      type="button"
      data-testid="step-fields"
      onClick={() => props.onStepChange({ title: 'Updated title' })}
    >
      fields
    </button>
  ),
}));

vi.mock('./ScenarioQuickEditTransformSections', () => ({
  ScenarioQuickEditTransformSections: (props: {
    onStepChange: (patch: { imageTransform: { scale: number; x: number; y: number } }) => void;
  }) => (
    <button
      type="button"
      data-testid="transform-sections"
      onClick={() => props.onStepChange({ imageTransform: { scale: 2, x: 4, y: 6 } })}
    >
      transform
    </button>
  ),
}));

vi.mock('./sidebar.overlays', () => ({
  QuickEditOverlayList: (props: {
    overlays: Array<{ id: string }>;
    onOverlayChange: (overlayId: string, overlays: Array<{ id: string }>) => void;
    onOverlayRemove: (overlayId: string) => void;
  }) => (
    <>
      <button
        type="button"
        data-testid="overlay-change"
        onClick={() => props.onOverlayChange('overlay-2', [{ id: 'overlay-2' }])}
      >
        change
      </button>
      <button
        type="button"
        data-testid="overlay-remove"
        onClick={() => props.onOverlayRemove(props.overlays[0]?.id ?? 'overlay-1')}
      >
        remove
      </button>
    </>
  ),
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createStep() {
  return createScenarioCaptureStep({
    assetId: 'asset-1',
    title: 'Capture',
    overlays: [
      { id: 'overlay-1', kind: 'click-ring', point: { x: 10, y: 20 } },
      { id: 'overlay-2', kind: 'cursor', point: { x: 30, y: 40 } },
    ],
  });
}

async function renderSidebar(props: Parameters<typeof ScenarioQuickEditSidebar>[0]) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<ScenarioQuickEditSidebar {...props} />);
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
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

function runStepAndTransformPassThroughTest() {
  it('passes step fields and transform changes through the sidebar owner seam', async () => {
    const onStepChange = vi.fn();
    await renderSidebar({
      canRedo: true,
      canUndo: true,
      onSelectOverlay: vi.fn(),
      onRedo: vi.fn(),
      onStepChange,
      onUndo: vi.fn(),
      selectedOverlayId: null,
      step: createStep(),
    });

    expect(
      container?.querySelector('[data-ui="scenario.editor.quick-edit.sidebar"]')
    ).not.toBeNull();

    await act(async () => {
      container
        ?.querySelector('[data-testid="step-fields"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      container
        ?.querySelector('[data-testid="transform-sections"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onStepChange).toHaveBeenCalledWith({ title: 'Updated title' });
    expect(onStepChange).toHaveBeenCalledWith({
      imageTransform: { scale: 2, x: 4, y: 6 },
    });
  });
}

function runOverlayPassThroughTest() {
  it('rewires overlay change and removal through step and selection callbacks', async () => {
    const step = createStep();
    const onStepChange = vi.fn();
    const onSelectOverlay = vi.fn();
    await renderSidebar({
      canRedo: true,
      canUndo: true,
      onSelectOverlay,
      onRedo: vi.fn(),
      onStepChange,
      onUndo: vi.fn(),
      selectedOverlayId: 'overlay-1',
      step,
    });

    await act(async () => {
      container
        ?.querySelector('[data-testid="overlay-change"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      container
        ?.querySelector('[data-testid="overlay-remove"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onStepChange).toHaveBeenCalledWith({ overlays: [{ id: 'overlay-2' }] });
    expect(onSelectOverlay).toHaveBeenCalledWith('overlay-2');
    expect(onStepChange).toHaveBeenCalledWith({
      overlays: [expect.objectContaining({ id: 'overlay-2' })],
    });
    expect(onSelectOverlay).toHaveBeenCalledWith('overlay-2');
  });
}

function runLastOverlayRemovalFallbackTest() {
  it('clears selection when the last overlay is removed', async () => {
    const step = createScenarioCaptureStep({
      assetId: 'asset-1',
      title: 'Capture',
      overlays: [{ id: 'overlay-1', kind: 'click-ring', point: { x: 10, y: 20 } }],
    });
    const onStepChange = vi.fn();
    const onSelectOverlay = vi.fn();
    await renderSidebar({
      canRedo: true,
      canUndo: true,
      onSelectOverlay,
      onRedo: vi.fn(),
      onStepChange,
      onUndo: vi.fn(),
      selectedOverlayId: 'overlay-1',
      step,
    });

    await act(async () => {
      container
        ?.querySelector('[data-testid="overlay-remove"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onStepChange).toHaveBeenCalledWith({ overlays: [] });
    expect(onSelectOverlay).toHaveBeenCalledWith(null);
  });
}

function runScenarioQuickEditSidebarSuite() {
  runStepAndTransformPassThroughTest();
  runOverlayPassThroughTest();
  runLastOverlayRemovalFallbackTest();
}

describe('ScenarioQuickEditSidebar', runScenarioQuickEditSidebarSuite);
