// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { createScenarioCaptureStep } from '../../../features/scenario/project/public';

const nodeSpies = vi.hoisted(() => ({
  arrow: vi.fn(),
  point: vi.fn(),
  rect: vi.fn(),
}));

vi.mock('./ScenarioQuickEditOverlayLayer.nodes', () => ({
  ArrowOverlayNode: (props: object) => {
    nodeSpies.arrow(props);
    return <div data-testid="arrow-node" />;
  },
  PointOverlayNode: (props: object) => {
    nodeSpies.point(props);
    return <div data-testid="point-node" />;
  },
  RectOverlayNode: (props: object) => {
    nodeSpies.rect(props);
    return <div data-testid="rect-node" />;
  },
  isRectNavigatorOverlay: (overlay: { kind: string }) =>
    overlay.kind === 'rectangle' || overlay.kind === 'blur-rect',
}));

import { ScenarioQuickEditStageOverlayLayer } from './ScenarioQuickEditOverlayLayer';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createOverlayStep() {
  return {
    ...createScenarioCaptureStep({ assetId: 'asset-1', title: 'Step' }),
    overlays: [
      {
        id: 'arrow-1',
        kind: 'arrow',
        start: { x: 20, y: 40 },
        end: { x: 120, y: 160 },
        color: '#f97316',
        strokeWidth: 4,
      },
      {
        id: 'rect-1',
        kind: 'rectangle',
        rect: { x: 100, y: 140, width: 90, height: 60 },
        strokeColor: '#000',
        fillColor: 'transparent',
        strokeWidth: 2,
      },
      {
        id: 'text-1',
        kind: 'text',
        point: { x: 120, y: 90 },
        text: 'Text',
        color: '#111827',
        fontFamily: 'system-ui',
        fontSize: 24,
        fontWeight: 600,
      },
    ],
  };
}

async function renderOverlayLayer(step: ReturnType<typeof createOverlayStep>) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(
      <ScenarioQuickEditStageOverlayLayer
        beginDrag={vi.fn()}
        layout={
          {
            imageRect: { x: 0, y: 0, width: 100, height: 100 },
            sourceViewport: { width: 100, height: 100 },
          } as never
        }
        onSelectOverlay={vi.fn()}
        selectedOverlayId="rect-1"
        step={step as never}
      />
    );
  });
}

function expectOverlayLayerRouting(step: ReturnType<typeof createOverlayStep>) {
  expect(container?.querySelectorAll('[data-testid$="-node"]')).toHaveLength(3);
  expect(nodeSpies.arrow).toHaveBeenCalledWith(
    expect.objectContaining({ overlay: step.overlays[0] })
  );
  expect(nodeSpies.rect).toHaveBeenCalledWith(
    expect.objectContaining({ overlay: step.overlays[1], selected: true })
  );
  expect(nodeSpies.point).toHaveBeenCalledWith(
    expect.objectContaining({ overlay: step.overlays[2] })
  );
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  nodeSpies.arrow.mockReset();
  nodeSpies.point.mockReset();
  nodeSpies.rect.mockReset();
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

it('routes arrow, rect, and point overlays through the owner-local node family', async () => {
  const step = createOverlayStep();
  await renderOverlayLayer(step);
  expectOverlayLayerRouting(step);
});
