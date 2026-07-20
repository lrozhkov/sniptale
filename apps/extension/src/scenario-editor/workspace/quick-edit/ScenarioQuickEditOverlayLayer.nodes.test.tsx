// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, type Mock, vi } from 'vitest';

import { createScenarioCaptureStep } from '../../../features/scenario/project/public';
import type { ScenarioQuickEditDragState } from './stage.types';

const handleSpies = vi.hoisted(() => ({
  arrowEndpoint: vi.fn(),
  arrowMove: vi.fn(),
  rectResize: vi.fn(),
}));

vi.mock('./ScenarioQuickEditOverlayLayer.handles', () => ({
  ArrowEndpointHandles: (props: object) => {
    handleSpies.arrowEndpoint(props);
    return <div data-testid="arrow-endpoints" />;
  },
  ArrowMoveHandle: (props: object) => {
    handleSpies.arrowMove(props);
    return <div data-testid="arrow-move" />;
  },
  RectResizeHandles: (props: object) => {
    handleSpies.rectResize(props);
    return <div data-testid="rect-resize" />;
  },
}));

import {
  ArrowOverlayNode,
  isRectNavigatorOverlay,
  PointOverlayNode,
  RectOverlayNode,
} from './ScenarioQuickEditOverlayLayer.nodes';

type BeginDrag = (state: ScenarioQuickEditDragState) => void;
type OnSelectOverlay = (overlayId: string | null) => void;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

const layout = {
  imageRect: { x: 10, y: 20, width: 360, height: 180 },
  sourceViewport: { width: 720, height: 360 },
} as never;

function createStep() {
  return createScenarioCaptureStep({
    assetId: 'asset-1',
    overlays: [],
    title: 'Step',
  });
}

function createRectAndPointNodes(args: {
  beginDrag: Mock<BeginDrag>;
  onSelectOverlay: Mock<OnSelectOverlay>;
  step: ReturnType<typeof createStep>;
}) {
  return (
    <>
      <RectOverlayNode
        beginDrag={args.beginDrag}
        layout={layout}
        onSelectOverlay={args.onSelectOverlay}
        overlay={{
          id: 'rect-1',
          kind: 'rectangle',
          rect: { x: 100, y: 120, width: 140, height: 60 },
          strokeColor: '#000',
          fillColor: 'transparent',
          strokeWidth: 2,
        }}
        selected
        step={args.step}
      />
      <PointOverlayNode
        beginDrag={args.beginDrag}
        layout={layout}
        onSelectOverlay={args.onSelectOverlay}
        overlay={{
          id: 'text-1',
          kind: 'text',
          point: { x: 160, y: 120 },
          text: 'Text',
          color: '#111827',
          fontFamily: 'system-ui',
          fontSize: 24,
          fontWeight: 600,
        }}
        selected={false}
        step={args.step}
      />
    </>
  );
}

async function dispatchOverlayPointerDowns() {
  await act(async () => {
    container
      ?.querySelector<HTMLDivElement>('.rounded-\\[12px\\]')
      ?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 50, clientY: 60 }));
    container
      ?.querySelector<HTMLButtonElement>('button')
      ?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 70, clientY: 80 }));
  });
}

function expectOverlayDragCalls(args: {
  beginDrag: Mock<BeginDrag>;
  onSelectOverlay: Mock<OnSelectOverlay>;
}) {
  expect(handleSpies.rectResize).toHaveBeenCalledTimes(1);
  expect(args.onSelectOverlay).toHaveBeenNthCalledWith(1, 'rect-1');
  expect(args.onSelectOverlay).toHaveBeenNthCalledWith(2, 'text-1');
  expect(args.beginDrag).toHaveBeenNthCalledWith(
    1,
    expect.objectContaining({ kind: 'move-overlay', overlayId: 'rect-1' })
  );
  expect(args.beginDrag).toHaveBeenNthCalledWith(
    2,
    expect.objectContaining({ kind: 'move-overlay', overlayId: 'text-1' })
  );
}

function expectRectOverlayHelpers() {
  expect(
    isRectNavigatorOverlay({
      kind: 'blur-rect',
      rect: { x: 0, y: 0, width: 10, height: 10 },
      blurSettings: { amount: 10, blurType: 'gaussian', showBorder: false },
    } as never)
  ).toBe(true);
  expect(isRectNavigatorOverlay({ kind: 'text', point: { x: 0, y: 0 } } as never)).toBe(false);
}

async function renderNode(node: React.ReactNode) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<div>{node}</div>);
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('PointerEvent', MouseEvent);
  handleSpies.arrowEndpoint.mockReset();
  handleSpies.arrowMove.mockReset();
  handleSpies.rectResize.mockReset();
});

afterEach(async () => {
  await act(async () => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

it('renders arrow handles only for selected arrows', async () => {
  const step = createStep();

  await renderNode(
    <ArrowOverlayNode
      beginDrag={vi.fn()}
      layout={layout}
      onSelectOverlay={vi.fn()}
      overlay={{
        id: 'arrow-1',
        kind: 'arrow',
        start: { x: 20, y: 40 },
        end: { x: 120, y: 160 },
        color: '#f97316',
        strokeWidth: 4,
      }}
      selected
      step={step}
    />
  );

  expect(container?.querySelector('[data-testid="arrow-move"]')).not.toBeNull();
  expect(container?.querySelector('[data-testid="arrow-endpoints"]')).not.toBeNull();

  await renderNode(
    <ArrowOverlayNode
      beginDrag={vi.fn()}
      layout={layout}
      onSelectOverlay={vi.fn()}
      overlay={{
        id: 'arrow-1',
        kind: 'arrow',
        start: { x: 20, y: 40 },
        end: { x: 120, y: 160 },
        color: '#f97316',
        strokeWidth: 4,
      }}
      selected={false}
      step={step}
    />
  );

  expect(container?.querySelector('[data-testid="arrow-endpoints"]')).toBeNull();
});

it('starts rect and point overlay drags through pointerdown handlers', async () => {
  const beginDrag: Mock<BeginDrag> = vi.fn();
  const onSelectOverlay: Mock<OnSelectOverlay> = vi.fn();
  const step = createStep();

  await renderNode(createRectAndPointNodes({ beginDrag, onSelectOverlay, step }));
  await dispatchOverlayPointerDowns();

  expectOverlayDragCalls({ beginDrag, onSelectOverlay });
  expectRectOverlayHelpers();
});

it('renders unselected rect nodes and non-text point nodes without selected handles', async () => {
  const step = createStep();

  await renderNode(
    <>
      <RectOverlayNode
        beginDrag={vi.fn<BeginDrag>()}
        layout={layout}
        onSelectOverlay={vi.fn<OnSelectOverlay>()}
        overlay={{
          id: 'rect-2',
          kind: 'blur-rect',
          rect: { x: 40, y: 50, width: 120, height: 70 },
          blurSettings: { amount: 12, blurType: 'gaussian', showBorder: false },
        }}
        selected={false}
        step={step}
      />
      <PointOverlayNode
        beginDrag={vi.fn<BeginDrag>()}
        layout={layout}
        onSelectOverlay={vi.fn<OnSelectOverlay>()}
        overlay={{ id: 'cursor-1', kind: 'cursor', point: { x: 80, y: 100 } }}
        selected
        step={step}
      />
    </>
  );

  const pointNode = container?.querySelector<HTMLButtonElement>('button');

  expect(container?.querySelector('[data-testid="rect-resize"]')).toBeNull();
  expect(pointNode?.style.width).toBe('20px');
  expect(pointNode?.style.height).toBe('20px');
});
