// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';

import { translate } from '../../../../platform/i18n';
import { RichShapeMetricField } from './metric-field';

it('maps semantic rich-shape metrics to their range contracts', () => {
  const container = document.createElement('div');
  const root = createRoot(container);

  act(() => {
    root.render(
      <>
        <RichShapeMetricField metric="shadowAngle" value={45} onChange={vi.fn()} />
        <RichShapeMetricField metric="fillWeight" value={1.25} onChange={vi.fn()} />
      </>
    );
  });

  const angle = container.querySelector(
    `input[aria-label="${translate('editor.compact.richShapeGradientAngle')} range"]`
  );
  const weight = container.querySelector(
    `input[aria-label="${translate('editor.compact.richShapeFillWeight')} range"]`
  );
  expect(angle?.getAttribute('min')).toBe('0');
  expect(angle?.getAttribute('max')).toBe('360');
  expect(weight?.getAttribute('min')).toBe('0.1');
  expect(weight?.getAttribute('step')).toBe('0.1');
  expect(
    container
      .querySelector(`input[aria-label="${translate('editor.compact.richShapeFillWeight')}"]`)
      ?.getAttribute('value')
  ).toBe('1.25');
  expect(container.textContent).toContain('px');

  act(() => root.unmount());
});
