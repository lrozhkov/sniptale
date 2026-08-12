import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { getDynamicTailState } from './dynamic-tail';
import { getLineConnectorState } from './line-connector';
import { renderCalloutAccentEdge, renderDynamicCalloutTail } from './views';
import { createDefaultCalloutSettings } from './model';
import { applySurfaceStyleToCallout } from '../../surface-style/operations';
import { getSystemSurfaceStylePresets } from '../../surface-style/system-presets';
import { resolveCalloutCustomCss } from '../../callout-custom-css';

it('clips a double-width accent against the rounded card contour', () => {
  const style = createDefaultCalloutSettings().style;
  style.accentEdge = {
    color: '#f97316',
    enabled: true,
    lineStyle: 'dashed',
    side: 'top',
    width: 4,
  };
  style.surface.radius = 16;

  const markup = renderToStaticMarkup(renderCalloutAccentEdge(style, { width: 120, height: 60 }));

  expect(markup).toContain('data-ui="content.callout.accent-edge"');
  expect(markup).toContain('<clipPath');
  expect(markup).toContain('rx="16"');
  expect(markup).toContain('d="M 0 0 H 120"');
  expect(markup).toContain('stroke="#f97316"');
  expect(markup).toContain('stroke-dasharray="16 10"');
  expect(markup).toContain('stroke-linecap="butt"');
  expect(markup).toContain('stroke-width="8"');
});

it('covers a square card side from corner to corner without rounded caps', () => {
  const style = createDefaultCalloutSettings().style;
  style.accentEdge = {
    color: '#f97316',
    enabled: true,
    lineStyle: 'solid',
    side: 'left',
    width: 6,
  };
  style.surface.radius = 0;

  const markup = renderToStaticMarkup(renderCalloutAccentEdge(style, { width: 120, height: 60 }));

  expect(markup).toContain('d="M 0 60 V 0"');
  expect(markup).toContain('rx="0"');
  expect(markup).toContain('stroke-linecap="butt"');
  expect(markup).toContain('stroke-width="12"');
});

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
  style.surface.fillPaint = { kind: 'solid', color: '#252830ff' };
  style.surface.borderColor = '#ff7a00';
  style.surface.borderStyle = 'dashed';
  style.surface.borderWidth = 3;
  const markup = renderToStaticMarkup(
    renderDynamicCalloutTail(tail, style, resolveCalloutCustomCss(style.customCss).styles)
  );

  expect(markup.match(/<path/g)).toHaveLength(2);
  expect(markup).toContain('stroke="transparent"');
  expect(markup).toContain('stroke-width="18"');
  expect(markup).toContain('pointer-events="stroke"');
  expect(markup).toContain('style="position:absolute');
  expect(markup).toContain('pointer-events:none');
  expect(markup).not.toContain('pointer-events:auto');
  expect(markup).toContain('preserveAspectRatio="xMinYMin meet"');
  expect(markup).toContain('data-ui="content.callout.tail-outline"');
  expect(markup).not.toContain('data-ui="content.callout.unified-surface"');
  expect(markup).toContain('fill="#252830ff"');
  expect(markup).toContain('stroke="#ff7a00"');
  expect(markup).toContain('stroke-dasharray="12 7.5"');
  expect(markup).toContain('stroke-width="3"');
});

it('renders a borderless wedge and bubble as one translucent contour', () => {
  const tail = getDynamicTailState({
    borderRadius: 10,
    borderWidth: 0,
    frameRect: { x: 100, y: 100, width: 160, height: 120 },
    bubbleRect: { x: 120, y: 20, width: 160, height: 48 },
    preferredSide: 'top',
    tailSize: 8,
  });
  const style = createDefaultCalloutSettings().style;
  style.surface.borderWidth = 0;
  style.surface.fillPaint = { kind: 'solid', color: '#ffffff80' };

  const markup = renderToStaticMarkup(
    renderDynamicCalloutTail(tail, style, resolveCalloutCustomCss(style.customCss).styles)
  );

  expect(markup).toContain('data-ui="content.callout.tail-outline"');
  expect(markup).toContain(`d="${tail.outlinePath}"`);
  expect(markup).not.toContain('data-ui="content.callout.unified-surface"');
  expect(markup).toContain('fill="#ffffff80"');
  expect(markup).toContain('stroke="none"');
});

it('clips gradient paint and backdrop behavior on one HTML wedge-and-bubble surface', () => {
  const tail = getDynamicTailState({
    borderRadius: 10,
    borderWidth: 0,
    frameRect: { x: 100, y: 100, width: 160, height: 120 },
    bubbleRect: { x: 120, y: 20, width: 160, height: 48 },
    preferredSide: 'top',
    tailSize: 8,
  });
  const clearTint = getSystemSurfaceStylePresets().find(
    (preset) => preset.id === 'system-surface-clear-tint'
  )!;
  const style = applySurfaceStyleToCallout(createDefaultCalloutSettings().style, clearTint.style);

  const markup = renderToStaticMarkup(
    renderDynamicCalloutTail(tail, style, resolveCalloutCustomCss(style.customCss).styles)
  );

  expect(markup).toContain('data-ui="content.callout.unified-surface"');
  expect(markup).toContain('background:linear-gradient(');
  expect(markup).toContain('backdrop-filter:blur(10px) saturate(1.25)');
  expect(markup).toContain('box-shadow:inset 0 1px 0 rgba(255, 255, 255, 0.35)');
  expect(markup).toContain('clip-path:path(&quot;');
  expect(markup).not.toContain('<foreignObject');
  expect(markup).toContain(`d="${tail.outlinePath}"`);
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
    lineStyle: 'dotted',
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

  expect(markup).toContain('pointer-events:none');
  expect(markup).not.toContain('pointer-events:auto');
  expect(markup).toContain('pointer-events="stroke"');
  expect(markup).toContain('width="12"');
  expect(markup).toContain('height="12"');
  expect(markup).toContain('r="9"');
  expect(markup).toContain('r="2.52"');
  expect(markup).not.toContain('transform="rotate(');
  expect(markup).toContain('stroke-dasharray="0 5"');

  const customMarkup = renderToStaticMarkup(
    renderDynamicCalloutTail(tail, style, {
      accent: {},
      body: {},
      card: {},
      connector: { stroke: '#ff0000', strokeDasharray: '6 3' },
      title: {},
    })
  );
  expect(customMarkup).toContain('data-ui="content.callout.connector-line"');
  expect(customMarkup).toContain('style="stroke:#ff0000;stroke-dasharray:6 3"');

  style.connector.frameMarker = 'diamond';
  const diamondMarkup = renderToStaticMarkup(renderDynamicCalloutTail(tail, style));
  expect(diamondMarkup).toContain('<polygon');
  expect(diamondMarkup).not.toContain('transform="rotate(');

  style.connector.frameMarker = 'circle';
  expect(renderToStaticMarkup(renderDynamicCalloutTail(tail, style))).toContain('<circle');
  style.connector.frameMarker = 'arrow';
  expect(renderToStaticMarkup(renderDynamicCalloutTail(tail, style))).toContain(
    'transform="rotate('
  );
});
