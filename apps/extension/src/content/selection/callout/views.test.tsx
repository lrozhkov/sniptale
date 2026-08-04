import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { getDynamicTailState } from './dynamic-tail';
import { getLineConnectorState } from './line-connector';
import { renderDynamicCalloutTail } from './views';
import { createDefaultCalloutSettings } from './model';

it('renders a wide transparent hover corridor around the visible callout connector', () => {
  const tail = getDynamicTailState({
    borderRadius: 10,
    borderWidth: 3,
    frameRect: { x: 100, y: 100, width: 160, height: 120 },
    bubbleRect: { x: 120, y: 20, width: 160, height: 48 },
    preferredSide: 'top',
    tailSize: 8,
  });
  const style = createDefaultCalloutSettings().style;
  style.surface.backgroundColor = '#252830';
  style.surface.borderColor = '#ff7a00';
  style.surface.borderWidth = 3;
  const markup = renderToStaticMarkup(renderDynamicCalloutTail(tail, style));

  expect(markup.match(/<path/g)).toHaveLength(2);
  expect(markup).toContain('stroke="transparent"');
  expect(markup).toContain('stroke-width="18"');
  expect(markup).toContain('pointer-events="stroke"');
  expect(markup).toContain('preserveAspectRatio="xMinYMin meet"');
  expect(markup).toContain('data-ui="content.callout.tail-outline"');
  expect(markup).toContain('fill="#252830"');
  expect(markup).toContain('stroke="#ff7a00"');
  expect(markup).toContain('stroke-width="3"');
});

it('renders independently sized endpoint markers including a boundary-centered ring-dot', () => {
  const style = createDefaultCalloutSettings().style;
  style.connector = {
    ...style.connector,
    blockMarker: 'square',
    blockMarkerSize: 12,
    frameMarker: 'ring-dot',
    frameMarkerSize: 18,
    kind: 'line',
  };
  const tail = getLineConnectorState({
    anchorPoint: { x: 180, y: 100 },
    blockBoundaryWidth: style.surface.borderWidth,
    blockMarker: style.connector.blockMarker,
    blockMarkerSize: style.connector.blockMarkerSize,
    bubbleRect: { x: 120, y: 20, width: 120, height: 48 },
    frameBoundaryWidth: 4,
    frameMarker: style.connector.frameMarker,
    frameMarkerSize: style.connector.frameMarkerSize,
    frameRect: { x: 100, y: 100, width: 160, height: 120 },
    lineWidth: style.connector.width,
    placement: { anchor: 'top-center', side: 'top' },
    preferredSide: 'top',
    routing: 'straight',
    wedgeSize: style.connector.wedgeSize,
  });
  const markup = renderToStaticMarkup(renderDynamicCalloutTail(tail, style));

  expect(markup).toContain('width="12"');
  expect(markup).toContain('height="12"');
  expect(markup).toContain('r="9"');
  expect(markup).toContain('r="2.52"');
  expect(markup).not.toContain('transform="rotate(');

  style.connector.frameMarker = 'diamond';
  const diamondMarkup = renderToStaticMarkup(renderDynamicCalloutTail(tail, style));
  expect(diamondMarkup).toContain('<polygon');
  expect(diamondMarkup).not.toContain('transform="rotate(');
});
