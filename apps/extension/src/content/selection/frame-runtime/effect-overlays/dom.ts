import { appendToContentOverlayRoot } from '../../../platform/dom-host';
import { createLogger } from '@sniptale/platform/observability/logger';
import type { OverlayRefs } from './types';
export type { OverlayRefs } from './types';
export { registerImmediateBlurOverlayUpdates, updateBlurOverlayNodes } from './blur';
export { registerImmediateFocusOverlayUpdates, updateFocusOverlayMask } from './focus';

const logger = createLogger({ namespace: 'ContentFrameOverlays' });

export function ensureBlurFiltersSvgContainer({
  blurFiltersSvgRef,
  blurFiltersIdRef,
}: OverlayRefs) {
  if (blurFiltersSvgRef.current) {
    return;
  }

  const filterId = blurFiltersIdRef.current;
  const svg = createBlurFiltersSvg(filterId);
  appendToContentOverlayRoot(svg);
  blurFiltersSvgRef.current = svg;

  logger.log('Created blur filters SVG container', filterId);
}

function createBlurFiltersSvg(filterId: string) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('id', filterId);
  svg.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 1px;
    height: 1px;
    opacity: 0;
    pointer-events: none;
    z-index: -2147483648;
  `;

  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  defs.appendChild(createDistortionFilterNode());
  svg.appendChild(defs);
  return svg;
}

function createDistortionFilterNode() {
  const distortionFilter = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
  distortionFilter.setAttribute('id', 'sniptale-distortion-filter');
  distortionFilter.setAttribute('x', '-20%');
  distortionFilter.setAttribute('y', '-20%');
  distortionFilter.setAttribute('width', '140%');
  distortionFilter.setAttribute('height', '140%');
  const turbulence = document.createElementNS('http://www.w3.org/2000/svg', 'feTurbulence');
  turbulence.setAttribute('type', 'fractalNoise');
  turbulence.setAttribute('baseFrequency', '0.02');
  turbulence.setAttribute('numOctaves', '3');
  turbulence.setAttribute('result', 'noise');
  turbulence.setAttribute('seed', '5');

  const displacementMap = document.createElementNS(
    'http://www.w3.org/2000/svg',
    'feDisplacementMap'
  );
  displacementMap.setAttribute('in', 'SourceGraphic');
  displacementMap.setAttribute('in2', 'noise');
  displacementMap.setAttribute('scale', '10');
  displacementMap.setAttribute('xChannelSelector', 'R');
  displacementMap.setAttribute('yChannelSelector', 'G');

  distortionFilter.append(turbulence, displacementMap);
  return distortionFilter;
}
