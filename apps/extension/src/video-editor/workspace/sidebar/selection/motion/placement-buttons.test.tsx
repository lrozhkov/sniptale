import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { MotionPlacementButtonGroup } from './placement-buttons';

it('marks the active stage placement button and keeps reset secondary', () => {
  const markup = renderToStaticMarkup(
    <MotionPlacementButtonGroup
      isPickingOnStage
      onPick={vi.fn()}
      onReset={vi.fn()}
      pickLabel="Pick"
      resetLabel="Reset"
    />
  );

  expect(markup).toContain('aria-pressed="true"');
  expect(markup).toContain('shadow-[inset_0_0_0_1px_color-mix');
  expect(markup).toContain('Pick');
  expect(markup).toContain('Reset');
});
