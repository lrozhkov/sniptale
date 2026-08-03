import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { getDynamicTailState } from './dynamic-tail';
import { renderDynamicCalloutTail } from './views';
import { createDefaultCalloutSettings } from './model';

it('renders a wide transparent hover corridor around the visible callout connector', () => {
  const tail = getDynamicTailState({
    frameRect: { x: 100, y: 100, width: 160, height: 120 },
    bubbleRect: { x: 120, y: 20, width: 160, height: 48 },
    preferredSide: 'top',
    tailSize: 8,
  });
  const style = createDefaultCalloutSettings().style;
  style.surface.backgroundColor = '#252830';
  const markup = renderToStaticMarkup(renderDynamicCalloutTail(tail, style));

  expect(markup.match(/<path/g)).toHaveLength(2);
  expect(markup).toContain('stroke="transparent"');
  expect(markup).toContain('stroke-width="18"');
  expect(markup).toContain('pointer-events="stroke"');
  expect(markup).toContain('preserveAspectRatio="xMinYMin meet"');
});
