// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { ScenarioStageLayout } from '../../../features/scenario/stage/layout';

import { BlurRectOverlay } from './preview-overlays.blur';

const layout: ScenarioStageLayout = {
  canvas: { height: 200, width: 300 },
  imageRect: { height: 90, width: 160, x: 10, y: 12 },
  sourceViewport: { height: 90, width: 160 },
  viewport: { height: 200, width: 300, x: 0, y: 0 },
};

function renderOverlay(blurType: 'gaussian' | 'distortion' | 'solid', showBorder: boolean) {
  return renderToStaticMarkup(
    <svg>
      <BlurRectOverlay
        assetDataUrl="data:image/png;base64,asset"
        imageRect={layout.imageRect}
        layout={layout}
        overlay={{
          id: 'blur-1',
          kind: 'blur-rect',
          rect: { height: 30, width: 40, x: 2, y: 4 },
          blurSettings: { amount: 12, blurType, showBorder },
        }}
        overlayIdPrefix="case"
      />
    </svg>
  );
}

describe('preview overlay blur rect', () => {
  it('renders gaussian and distortion filters with the projected image layer', () => {
    const gaussian = renderOverlay('gaussian', false);
    const distortion = renderOverlay('distortion', false);

    expect(gaussian).toContain('feGaussianBlur');
    expect(gaussian).toContain('clip-path="url(#case-clip)"');
    expect(gaussian).toContain('filter="url(#case-blur)"');
    expect(distortion).toContain('feTurbulence');
    expect(distortion).toContain('feDisplacementMap');
  });

  it('renders the solid fill branch without the image layer and with optional border', () => {
    const solid = renderOverlay('solid', true);

    expect(solid).not.toContain('<image');
    expect(solid).not.toContain('<filter');
    expect(solid).toContain('fill="rgb(0 0 0 / 0.400)"');
    expect(solid).toContain('stroke="#475569"');
  });
});
