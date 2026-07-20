import { expect, it } from 'vitest';

import {
  renderArrowOverlay,
  renderBlurRectOverlay,
  renderEllipseOverlay,
  renderFocusRectOverlay,
  renderPointOverlay,
  renderRectangleOverlay,
  renderTextOverlay,
} from '.';

it('re-exports the canonical overlay renderer roles', () => {
  expect(renderFocusRectOverlay).toBeTypeOf('function');
  expect(renderPointOverlay).toBeTypeOf('function');
  expect(renderArrowOverlay).toBeTypeOf('function');
  expect(renderRectangleOverlay).toBeTypeOf('function');
  expect(renderEllipseOverlay).toBeTypeOf('function');
  expect(renderTextOverlay).toBeTypeOf('function');
  expect(renderBlurRectOverlay).toBeTypeOf('function');
});
