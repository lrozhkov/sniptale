// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createScenarioCaptureStep } from '../../../features/scenario/project/public';
import { SCENARIO_ARROW_HEAD_MARKER } from '../../project/stage-render/arrow-head';
import { WorkspacePreviewSvg } from './preview-svg';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createStepWithArrow(overrides?: {
  end?: { x: number; y: number };
  start?: { x: number; y: number };
}) {
  return createScenarioCaptureStep({
    assetId: 'asset-1',
    body: 'Body',
    overlays: [
      {
        id: 'arrow-1',
        kind: 'arrow',
        start: overrides?.start ?? { x: 40, y: 40 },
        end: overrides?.end ?? { x: 360, y: 220 },
        color: '#00a78e',
        strokeWidth: 6,
      },
    ],
    title: 'Step',
  });
}

function renderPreviewSvg(step = createStepWithArrow()) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  act(() => {
    root?.render(
      <WorkspacePreviewSvg
        assetDataUrl="data:image/png;base64,asset"
        assetDimensions={{ width: 1280, height: 720 }}
        step={step}
      />
    );
  });

  return step;
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

describe('WorkspacePreviewSvg', () => {
  it('renders shared arrow marker defs and wires normal arrows to the preview marker', () => {
    const step = renderPreviewSvg();
    const marker = container?.querySelector('marker');
    const line = container?.querySelector('line');

    expect(marker?.getAttribute('markerWidth')).toBe(String(SCENARIO_ARROW_HEAD_MARKER.width));
    expect(marker?.getAttribute('refX')).toBe(String(SCENARIO_ARROW_HEAD_MARKER.refX));
    expect(marker?.querySelector('path')?.getAttribute('d')).toBe(SCENARIO_ARROW_HEAD_MARKER.path);
    expect(line?.getAttribute('marker-end')).toBe(`url(#${step.id}-workspace-arrow-head)`);
  });

  it('omits marker-end for short arrows in the full workspace preview svg', () => {
    renderPreviewSvg(createStepWithArrow({ end: { x: 42, y: 41 } }));

    expect(container?.querySelector('line')?.getAttribute('marker-end')).toBeNull();
  });
});
