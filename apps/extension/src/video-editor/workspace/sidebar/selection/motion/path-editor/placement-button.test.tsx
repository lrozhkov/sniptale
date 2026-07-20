import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { MotionPathPlacementButton } from './placement-button';

it('uses the shared compact toggle action for active path placement', () => {
  const markup = renderToStaticMarkup(
    <MotionPathPlacementButton active label="Pick point" onClick={vi.fn()} />
  );

  expect(markup).toContain('aria-pressed="true"');
  expect(markup).toContain('shadow-[inset_0_0_0_1px_color-mix');
  expect(markup).toContain('Pick point');
});
