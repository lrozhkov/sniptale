// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ScenarioStageLayout } from '../../../features/scenario/stage/layout';
import type { ScenarioOverlay } from '../../../features/scenario/contracts/types/overlays';
import { WorkspacePreviewOverlays } from './preview-overlays';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

const layout: ScenarioStageLayout = {
  canvas: { width: 720, height: 420 },
  viewport: { x: 24, y: 18, width: 640, height: 360 },
  imageRect: { x: 42, y: 36, width: 560, height: 315 },
  sourceViewport: { width: 1200, height: 800 },
};

const overlays: ScenarioOverlay[] = [
  {
    id: 'focus',
    kind: 'focus-rect',
    rect: { x: 120, y: 80, width: 180, height: 96 },
  },
  {
    id: 'ring',
    kind: 'click-ring',
    point: { x: 220, y: 140 },
  },
  {
    id: 'cursor',
    kind: 'cursor',
    point: { x: 260, y: 160 },
  },
  {
    id: 'arrow',
    kind: 'arrow',
    start: { x: 40, y: 40 },
    end: { x: 360, y: 220 },
    color: '#00a78e',
    strokeWidth: 6,
  },
  {
    id: 'rectangle',
    kind: 'rectangle',
    rect: { x: 320, y: 160, width: 140, height: 84 },
    strokeColor: '#0f766e',
    fillColor: 'rgba(15,118,110,0.15)',
    strokeWidth: 4,
  },
  {
    id: 'ellipse',
    kind: 'ellipse',
    rect: { x: 480, y: 120, width: 180, height: 110 },
    strokeColor: '#2563eb',
    fillColor: 'rgba(37,99,235,0.18)',
    strokeWidth: 3,
  },
  {
    id: 'text',
    kind: 'text',
    point: { x: 360, y: 260 },
    text: 'Overlay text',
    color: '#7c3aed',
    fontSize: 24,
    fontFamily: 'Manrope',
    fontWeight: 700,
  },
  {
    id: 'blur',
    kind: 'blur-rect',
    rect: { x: 540, y: 260, width: 120, height: 80 },
    blurSettings: { amount: 12, blurType: 'gaussian', showBorder: false },
  },
];

function renderOverlays(args?: { annotationRenderMode?: 'asset'; overlays?: ScenarioOverlay[] }) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  act(() => {
    root?.render(
      <svg>
        <WorkspacePreviewOverlays
          {...(args?.annotationRenderMode === undefined
            ? {}
            : { annotationRenderMode: args.annotationRenderMode })}
          assetDataUrl="data:image/png;base64,asset"
          layout={layout}
          markerId="marker-id"
          overlays={args?.overlays ?? overlays}
          stepId="step-id"
        />
      </svg>
    );
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
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

describe('WorkspacePreviewOverlays', () => {
  it('renders supported overlay kinds, including blur overlays, into the preview svg', () => {
    renderOverlays();

    expect(container?.querySelectorAll('circle')).toHaveLength(1);
    const clickOverlay = container?.querySelector('ellipse');
    expect(clickOverlay?.getAttribute('stroke')).toBe('transparent');
    expect(clickOverlay?.getAttribute('fill')).toBe('rgba(249, 115, 22, 0.3)');
    expect(container?.querySelector('line')?.getAttribute('marker-end')).toBe('url(#marker-id)');
    expect(container?.querySelectorAll('ellipse').length).toBeGreaterThanOrEqual(2);
    expect(container?.querySelector('text')?.textContent).toBe('Overlay text');
    expect(container?.querySelector('#step-id-blur-blur')).not.toBeNull();
    expect(container?.querySelector('#step-id-blur-clip')).not.toBeNull();
    expect(container?.querySelectorAll('image')).toHaveLength(1);
  });

  it('hides the arrow marker when the rendered arrow segment is near zero length', () => {
    renderOverlays({
      overlays: [
        {
          id: 'arrow-short',
          kind: 'arrow',
          start: { x: 40, y: 40 },
          end: { x: 42, y: 41 },
          color: '#00a78e',
          strokeWidth: 6,
        },
      ],
    });

    expect(container?.querySelector('line')?.getAttribute('marker-end')).toBeNull();
  });

  it('skips overlay rendering when the step requests asset-only annotation mode', () => {
    renderOverlays({ annotationRenderMode: 'asset' });

    expect(container?.querySelector('circle')).toBeNull();
    expect(container?.querySelector('line')).toBeNull();
    expect(container?.querySelector('text')).toBeNull();
  });
});
