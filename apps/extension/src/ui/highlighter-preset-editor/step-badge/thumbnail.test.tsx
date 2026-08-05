import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { DEFAULT_STEP_BADGE_TEMPLATE } from '../../../features/highlighter/step-badge-presets/catalog';
import { StepBadgePresetPreview } from './thumbnail';

it('renders compact numeric and letter template previews', () => {
  expect(
    renderToStaticMarkup(<StepBadgePresetPreview compact settings={DEFAULT_STEP_BADGE_TEMPLATE} />)
  ).toContain('>1</span>');
  expect(
    renderToStaticMarkup(
      <StepBadgePresetPreview settings={{ ...DEFAULT_STEP_BADGE_TEMPLATE, type: 'letter' }} />
    )
  ).toContain('>A</span>');
});
